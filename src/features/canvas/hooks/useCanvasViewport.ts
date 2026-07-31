import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { useStore } from '../../../store/useStore';
import {
    type DetailTier,
    minTier,
    tierForZoom,
    NEAR_BAND,
    MID_BAND,
} from './useCanvasDetail';
import { publishTiers } from './lodStore';

const DEBUG = import.meta.env.DEV;

interface UseCanvasViewportOptions {
    nodes: AppNode[];
    currentParentId: string | null;
}

type Viewport = { x: number; y: number; zoom: number };

/**
 * How far the view must travel before the visible set is recomputed. Well under
 * the overscan margin below, so nothing can scroll into view unrendered, but
 * far enough that an ordinary drag causes no remounting at all.
 */
const RECULL_MOVE_PX = 260;
/** Floor on how often re-culling can happen, whatever the movement. */
const MIN_RECULL_INTERVAL_MS = 120;
/**
 * How far beyond the viewport cards are still drawn at all, as a multiple of
 * the viewport size.
 *
 * Wider than it used to be because far cards are now cheap silhouettes rather
 * than full cards, and keeping them present is what lets edges stay connected
 * and the minimap stay honest. Past this they are dropped entirely.
 */
const CULL_BAND = 3.2;

const nodeW = (n: AppNode) => (typeof n.style?.width === 'number' ? n.style.width : 432);
const nodeH = (n: AppNode) => (typeof n.style?.height === 'number' ? n.style.height : 432);

/**
 * Approximate the transform React Flow's own `fitView` will settle on.
 *
 * Culling runs before that first fitView, so without this the first pass would
 * measure against the default 0/0/1 viewport, cull away everything except the
 * cards near the origin — and then fitView would frame only those survivors
 * instead of the whole canvas. Seeding the state with the fit transform keeps
 * the opening view showing all the user's content.
 */
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

/**
 * Hook that handles viewport culling and node visibility calculations.
 * Filters nodes based on current parent and viewport bounds for performance.
 */
export function useCanvasViewport({ nodes, currentParentId }: UseCanvasViewportOptions) {
    const { getViewport } = useReactFlow();
    const selectedCanvasNodeIds = useStore(state => state.selectedCanvasNodeIds);
    
    const lastViewportUpdate = useRef(0);
    /** Viewport the current visible set was culled against. */
    const lastCullViewport = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });

    // Memoize root nodes for the current parent level
    const rootNodes = useMemo(() => {
        if (DEBUG) console.log("[rootNodes] Computing for currentParentId:", currentParentId);

        return nodes.filter(n => {
            // Treat undefined, null, and empty string as root level
            const nodeParentId = n.parentId || null;
            const activeParentId = currentParentId || null;
            return nodeParentId === activeParentId;
        });
    }, [nodes, currentParentId]);

    /* Seeded from the content bounds rather than 0/0/1 — see estimateFitViewport.
       Only the first render uses the estimate; every later value comes from the
       real viewport via handleViewportChange. */
    const [viewport, setViewport] = useState<Viewport>(() =>
        estimateFitViewport(nodes.filter(n => (n.parentId || null) === (currentParentId || null)))
    );

    const nodeCacheRef = useRef<Map<string, { original: AppNode, stripped: AppNode }>>(new Map());

    /* Culling and level-of-detail are one pass: both need each node's distance
       from the viewport, so they are computed together and returned together
       rather than stashed in a ref. */
    const { visibleNodes, tiers, zoomCeiling } = useMemo(() => {
        /* Cull on every canvas, not just large ones. A card that is off-screen
           still mounts its whole block editor, so the cost of opening a canvas
           used to scale with the number of cards on it rather than with how
           many are actually visible.

           Bounds come from the tracked `viewport` state: it starts as an
           estimate of where fitView will land (so the opening frame culls
           against roughly the right window) and is refreshed from the real
           viewport on move and just after mount. */
        const zoom = viewport.zoom || 1;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        /* The visible rectangle in flow coordinates, and the bands around it.
           Everything is computed once here rather than per card. */
        const view = {
            minX: -viewport.x / zoom,
            maxX: (-viewport.x + vw) / zoom,
            minY: -viewport.y / zoom,
            maxY: (-viewport.y + vh) / zoom,
        };
        const bandW = (vw / zoom);
        const bandH = (vh / zoom);

        /** Distance from the viewport rectangle, in viewport-multiples. */
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

        const culledNodes = rootNodes.filter(n => {
            // Never cull selected nodes so they remain in the render tree and can be focused successfully
            const isSelected = selectedCanvasNodeIds.has(n.id);
            const band = bandOf(n);
            if (!isSelected && band > CULL_BAND) return false;

            /* Two independent ceilings: how close the card is, and how big it
               is on screen. A card can be dead centre and still not worth an
               editor if the canvas is zoomed right out. */
            const byDistance: DetailTier =
                band <= NEAR_BAND ? 'full' : band <= MID_BAND ? 'preview' : 'minimal';
            tiers.set(n.id, isSelected ? zoomCeiling : minTier(byDistance, zoomCeiling));
            return true;
        });

        if (DEBUG) console.log("[visibleNodes] Culled:", rootNodes.length, "->", culledNodes.length);

        const cache = nodeCacheRef.current;
        const newCache = new Map<string, { original: AppNode, stripped: AppNode }>();

        // Strip parentId for ReactFlow rendering (root level nodes) and dynamically apply custom drag handle
        const result = culledNodes.map(n => {
            const hasDragHandle = true; // Apply drag handle universally
            const shouldStripParent = n.parentId === currentParentId;
            const shouldAddDragHandle = hasDragHandle;
            
            // Check if it already matches the target state
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
        return { visibleNodes: result, tiers, zoomCeiling };
    }, [rootNodes, currentParentId, viewport, selectedCanvasNodeIds]);

    /* Push tiers out of render. The store wakes only the cards whose tier
       actually moved, so a pan that changes nobody's band costs no re-renders
       at all — where a context value would have re-rendered every card. */
    useEffect(() => {
        publishTiers(tiers, zoomCeiling);
    }, [tiers, zoomCeiling]);

    /**
     * Re-cull on movement, not on a timer.
     *
     * Culling now runs on every canvas, so each recompute can mount or unmount
     * cards. Firing that every 120ms of a drag meant a pan was continuously
     * building and tearing down card bodies at the screen edge — the pan itself
     * became the expensive thing. Waiting until the view has actually moved a
     * decent fraction of the overscan margin keeps a normal drag entirely free
     * of remounts, while still re-culling long before anything can reach the
     * edge of what was drawn.
     */
    const handleViewportChange = useCallback(() => {
        const now = Date.now();
        if (now - lastViewportUpdate.current < MIN_RECULL_INTERVAL_MS) return;

        const next = getViewport();
        const last = lastCullViewport.current;
        const movedFar =
            Math.abs(next.x - last.x) > RECULL_MOVE_PX ||
            Math.abs(next.y - last.y) > RECULL_MOVE_PX;
        // Zoom must react promptly — it changes which cards are even eligible.
        const zoomChanged = Math.abs(next.zoom - last.zoom) > last.zoom * 0.02;

        if (!movedFar && !zoomChanged) return;

        lastViewportUpdate.current = now;
        lastCullViewport.current = next;
        setViewport(next);
    }, [getViewport]);

    /* The mount-time fitView animation moves the viewport without necessarily
       firing onMove, which would leave the first cull measured against the
       default 0/0/1 viewport. Re-sync once the animation has settled. */
    useEffect(() => {
        const sync = () => {
            lastViewportUpdate.current = 0;
            const v = getViewport();
            lastCullViewport.current = v;
            setViewport(v);
        };
        const raf = requestAnimationFrame(sync);
        const timer = window.setTimeout(sync, 600);
        return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
    }, [getViewport, currentParentId]);

    return {
        visibleNodes,
        rootNodes,
        viewport,
        handleViewportChange,
    };
}
