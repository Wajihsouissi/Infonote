import { useState, useCallback, useRef, useEffect } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { useStore } from '../../../store/useStore';
import { getNodeById } from '../../../store/nodeIndex';
import {
    type DetailTier,
    minTier,
    tierForZoom,
    NEAR_BAND,
} from './useCanvasDetail';
import { isStreaming, publishTiers } from './lodStore';


interface UseCanvasViewportOptions {
    currentParentId: string | null;
}

type Viewport = { x: number; y: number; zoom: number };

const RECULL_MOVE_PX = 260;
const MIN_RECULL_INTERVAL_MS = 120;
const STREAMING_RECULL_MOVE_PX = 520;
const STREAMING_RECULL_INTERVAL_MS = 240;
/* At the 30% overview limit one screen already covers a large part of the
   board. Keeping the old 3.2-screen safety margin there could mount dozens of
   extra cards and their edges beyond what the user can see. Restore the roomy
   margin progressively while zooming in, where it prevents cards popping in
   during a normal pan. */
const OVERVIEW_ZOOM = 0.3;
const DETAIL_ZOOM = 1;
const OVERVIEW_CULL_BAND = 0.6;
const DETAIL_CULL_BAND = 3.2;

function cullBandForZoom(zoom: number) {
    const progress = Math.min(1, Math.max(0, (zoom - OVERVIEW_ZOOM) / (DETAIL_ZOOM - OVERVIEW_ZOOM)));
    return OVERVIEW_CULL_BAND + (DETAIL_CULL_BAND - OVERVIEW_CULL_BAND) * progress;
}

const nodeW = (n: AppNode) => (typeof n.style?.width === 'number' ? n.style.width : 432);
const nodeH = (n: AppNode) => (typeof n.style?.height === 'number' ? n.style.height : 432);

function estimateFitViewport(nodes: AppNode[], padding = 0.1): Viewport {
    if (nodes.length === 0 || typeof window === 'undefined') return { x: 0, y: 0, zoom: 1 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + nodeW(n));
        maxY = Math.max(maxY, n.position.y + nodeH(n));
    }
    if (!isFinite(minX)) return { x: 0, y: 0, zoom: 1 };

    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const zoom = Math.min(vw / w, vh / h) * (1 - padding);

    return {
        x: vw / 2 - (minX + w / 2) * zoom,
        y: vh / 2 - (minY + h / 2) * zoom,
        zoom,
    };
}

export function useCanvasViewport({ currentParentId }: UseCanvasViewportOptions) {
    const { getViewport } = useReactFlow();
    /** React Flow's own measurement of the canvas element. */
    const rfStore = useStoreApi();
    
    const lastViewportUpdate = useRef(0);
    const lastCullViewport = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
    
    const currentParentIdRef = useRef(currentParentId);
    useEffect(() => {
        currentParentIdRef.current = currentParentId;
    }, [currentParentId]);

    const getRootNodes = useCallback(() => {
        const nodes = useStore.getState().nodes;
        return nodes.filter(n => {
            const nodeParentId = n.parentId || null;
            const activeParentId = currentParentIdRef.current || null;
            return nodeParentId === activeParentId;
        });
    }, []);

    const viewportRef = useRef<Viewport>(estimateFitViewport(
        useStore.getState().nodes.filter(n => (n.parentId || null) === (currentParentId || null)),
    ));

    const nodeCacheRef = useRef<Map<string, { original: AppNode, stripped: AppNode }>>(new Map());
    const [visibleNodes, setVisibleNodes] = useState<AppNode[]>([]);

    const recalc = useCallback((viewport: Viewport, forceUpdate: boolean) => {
        const zoom = viewport.zoom || 1;

        /* Measure the CANVAS, not the window.

           `viewport.x/y` are relative to the React Flow container, so pairing
           them with the window's dimensions describes a rectangle that is not
           the one on screen. It happens to be over-generous in a plain desktop
           layout — the canvas is inset by the header, so the window is bigger —
           and that hid the error. It inverts wherever the canvas is TALLER than
           the reported window: a mobile browser whose `innerHeight` excludes
           the URL bar, or a zoomed page. There the cull rect stops short of the
           canvas and cards along the bottom edge are dropped while plainly
           visible. React Flow already measures its own container; use that, and
           fall back to the window only before the first measurement lands. */
        const measured = rfStore.getState();
        const vw = measured.width || window.innerWidth;
        const vh = measured.height || window.innerHeight;

        const view = {
            minX: -viewport.x / zoom,
            maxX: (-viewport.x + vw) / zoom,
            minY: -viewport.y / zoom,
            maxY: (-viewport.y + vh) / zoom,
        };
        const bandW = (vw / zoom);
        const bandH = (vh / zoom);
        const cullBand = cullBandForZoom(zoom);

        const bandOf = (n: AppNode): number => {
            const w = typeof n.style?.width === 'number' ? n.style.width : 432;
            const h = typeof n.style?.height === 'number' ? n.style.height : 432;
            const dx = Math.max(view.minX - (n.position.x + w), n.position.x - view.maxX, 0);
            const dy = Math.max(view.minY - (n.position.y + h), n.position.y - view.maxY, 0);
            if (dx === 0 && dy === 0) return 0;
            return Math.max(dx / bandW, dy / bandH);
        };

        const tiers = new Map<string, DetailTier>();
        const zoomCeiling = tierForZoom(zoom);
        
        const rootNodes = getRootNodes();
        const selectedCanvasNodeIds = useStore.getState().selectedCanvasNodeIds;

        const culledNodes = rootNodes.filter(n => {
            const isSelected = selectedCanvasNodeIds.has(n.id);
            const band = bandOf(n);
            if (!isSelected && band > cullBand) return false;

            const byDistance: DetailTier = band <= NEAR_BAND ? 'full' : 'preview';
            tiers.set(n.id, isSelected ? zoomCeiling : minTier(byDistance, zoomCeiling));
            return true;
        });

        const cache = nodeCacheRef.current;
        const newCache = new Map<string, { original: AppNode, stripped: AppNode }>();

        const result = culledNodes.map(n => {
            const hasDragHandle = true;
            const shouldStripParent = n.parentId === currentParentId;
            const shouldAddDragHandle = hasDragHandle;
            
            const alreadyHasCorrectParent = shouldStripParent ? n.parentId === undefined : true;
            const alreadyHasCorrectDragHandle = shouldAddDragHandle ? n.dragHandle === '.custom-drag-handle' : true;
            
            if (alreadyHasCorrectParent && alreadyHasCorrectDragHandle) {
                return n;
            }
            
            const cached = cache.get(n.id);
            if (cached && cached.original === n) {
                newCache.set(n.id, cached);
                return cached.stripped;
            }

            const stripped = {
                ...n,
                ...(shouldStripParent ? { parentId: undefined } : {}),
                ...(shouldAddDragHandle ? { dragHandle: '.custom-drag-handle' } : {})
            };
            newCache.set(n.id, { original: n, stripped });
            return stripped;
        });

        nodeCacheRef.current = newCache;
        
        // Push tiers to store imperatively.
        publishTiers(tiers, zoomCeiling);

        setVisibleNodes(prev => {
            if (forceUpdate) return result;
            if (prev.length !== result.length) return result;
            
            let changed = false;
            const isDragging = !!useStore.getState().interactionState.draggedNodeId;
            
            for (let i = 0; i < prev.length; i++) {
                const p = prev[i];
                const r = result[i];
                if (p.id !== r.id || p.data !== r.data || p.style !== r.style || p.selected !== r.selected) {
                    changed = true;
                    break;
                }
                if (!isDragging && (p.position.x !== r.position.x || p.position.y !== r.position.y)) {
                    changed = true;
                    break;
                }
            }
            return changed ? result : prev;
        });
    }, [getRootNodes, rfStore]);

    /**
     * Drag-frame fast path: copy the moved nodes' positions onto the cards
     * React Flow is already rendering, leaving every other node object (and so
     * every other card's props) untouched.
     */
    const patchPositions = useCallback(() => {
        const latest = useStore.getState().nodes;
        setVisibleNodes(prev => {
            let moved = false;
            const next = prev.map(n => {
                const source = getNodeById(latest, n.id);
                if (!source || source.position === n.position) return n;
                if (source.position.x === n.position.x && source.position.y === n.position.y) return n;
                moved = true;
                return { ...n, position: source.position };
            });
            return moved ? next : prev;
        });
    }, []);

    // Subscribe to store changes to recalculate when nodes or selection changes
    useEffect(() => {
        /* The graph can be fully hydrated BEFORE this canvas mounts.
           Workspace loading moved out of CanvasBoard and up to the app-level
           sync coordinator, so on a refresh the nodes are usually already in
           the store by the time this subscription is installed — and a
           subscription only ever hears about the NEXT change. `visibleNodes`
           starts empty, so nothing ever populated it: the canvas came back
           from a reload completely blank, with the cards present in the store
           and squarely inside the viewport, until the user happened to pan and
           trigger a cull. Take the first pass unconditionally, against the
           live viewport rather than the ref, which nothing has updated yet. */
        recalc(getViewport(), true);

        return useStore.subscribe((state, prevState) => {
            if (state.nodes === prevState.nodes && state.selectedCanvasNodeIds === prevState.selectedCanvasNodeIds && state.interactionState.draggedNodeId === prevState.interactionState.draggedNodeId) {
                return;
            }

            const wasDragging = !!prevState.interactionState.draggedNodeId;
            const isDragging = !!state.interactionState.draggedNodeId;

            /* A drag emits a position change per moved node per frame, and each
               one has to reach React Flow or the card stops following the
               cursor. What it does NOT need is the culling pass: the viewport
               has not moved, so no card can cross a band and no tier can
               change. Carrying the new positions across on the existing node
               objects is a couple of allocations; a full recalc measured ~40ms
               per frame on a 46-card canvas, which is the drag stuttering. */
            if (isDragging) {
                patchPositions();
                return;
            }

            /* Drag just ended — force the pass that syncs the final positions.
               Read the viewport live: `viewportRef` is only refreshed by
               viewport events, so on a canvas the user has not panned yet it
               still holds the estimate made before any nodes existed. */
            recalc(getViewport(), wasDragging);
        });
    }, [recalc, patchPositions, getViewport]);

    const handleViewportChange = useCallback((force = false) => {
        const now = Date.now();
        const streaming = isStreaming();
        const minInterval = streaming ? STREAMING_RECULL_INTERVAL_MS : MIN_RECULL_INTERVAL_MS;
        if (!force && now - lastViewportUpdate.current < minInterval) return;

        const next = getViewport();
        const last = lastCullViewport.current;
        const moveThreshold = streaming ? STREAMING_RECULL_MOVE_PX : RECULL_MOVE_PX;
        const movedFar =
            Math.abs(next.x - last.x) > moveThreshold ||
            Math.abs(next.y - last.y) > moveThreshold;
        
        const zoomChanged = Math.abs(next.zoom - last.zoom) > last.zoom * 0.02;

        if (!force && !movedFar && !zoomChanged) return;

        lastViewportUpdate.current = now;
        lastCullViewport.current = next;
        viewportRef.current = next;
        
        // Only trigger state updates if the culling actually changes the visible set
        recalc(next, false);
    }, [getViewport, recalc]);

    const flushViewportChange = useCallback(() => {
        handleViewportChange(true);
    }, [handleViewportChange]);

    useEffect(() => {
        const sync = () => {
            lastViewportUpdate.current = 0;
            const v = getViewport();
            lastCullViewport.current = v;
            viewportRef.current = v;
            recalc(v, false);
        };
        const raf = requestAnimationFrame(sync);
        const timer = window.setTimeout(sync, 600);

        /* The culling band is derived from `window.innerWidth/innerHeight`, but
           nothing re-derived it when that changed — the only triggers were a
           pan, a zoom, or a store change. So the band stayed frozen at whatever
           the window measured when the canvas mounted: widen the window and the
           cards that should have come into view stayed culled until the user
           happened to pan, and a canvas that mounted while the window reported
           no size (a background or non-composited render) culled everything and
           stayed blank with the cards sitting in the store, in view. */
        let resizeRaf = 0;
        const onResize = () => {
            cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => recalc(getViewport(), true));
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(raf);
            cancelAnimationFrame(resizeRaf);
            window.clearTimeout(timer);
            window.removeEventListener('resize', onResize);
        };
    }, [getViewport, currentParentId, recalc]);

    return {
        visibleNodes,
        handleViewportChange,
        flushViewportChange,
    };
}
