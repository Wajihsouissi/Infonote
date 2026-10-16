import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import { type AppNode, getNodeBlocks, getNodeLabel } from '../../../types';
import { isCanvasHydratableBlock } from '../../../store/hydration/blockText';
import { MIN_CANVAS_ZOOM } from '../canvasConstants';

/** One beat for React Flow to measure freshly mounted cards before framing them. */
const FRAME_NEW_MAP_DELAY_MS = 180;
const REFRAME_ON_RESIZE_DELAY_MS = 120;

interface UseNestedCanvasMapOptions {
    currentParentId: string | null;
    activeParentNode: AppNode | null | undefined;
    visibleNodes: AppNode[];
    canvasAreaRef: React.RefObject<HTMLDivElement | null>;
    announce: (message: string) => void;
}

/**
 * The auto mind map, from the canvas side.
 *
 * Opening a written card reveals its writing as a map on the card's own canvas
 * (built by `hydrateCanvasFromContent`), then frames it. It runs once, for an
 * untouched canvas: a deliberately empty map or a hand-made canvas is never
 * rebuilt behind its owner's back. Maps saved in the old centre-topic layout
 * are migrated to the document tree, and generated maps are reframed when the
 * window changes shape.
 */
export function useNestedCanvasMap({
    currentParentId,
    activeParentNode,
    visibleNodes,
    canvasAreaRef,
    announce,
}: UseNestedCanvasMapOptions) {
    const { fitView } = useReactFlow();
    const hydrateCanvasFromContent = useStore(s => s.hydrateCanvasFromContent);
    const migrateTopicMapToDocumentTree = useStore(s => s.migrateTopicMapToDocumentTree);
    const autoMappedParentIdsRef = useRef(new Set<string>());
    /* Which canvas has a map waiting to be framed. `null` means none — which is
       also the home canvas's parent id, so this must never be compared to the
       current parent without checking it is set. A ref, not state: the map's
       own arrival (visibleNodes) is what re-runs the framing effect. */
    const pendingFrameParentRef = useRef<string | null>(null);

    const hasLegacyTopicRoot = visibleNodes.some((node) =>
        node.type === 'fused-note' && node.data.mapRole === 'topic-root');
    const hasGeneratedDocumentTree = visibleNodes.some((node) =>
        node.type === 'fused-note' && (node.data.mapRole === 'chapter' || node.data.mapRole === 'section'));

    // Old maps had a synthetic centre title that owns no content: remove it and
    // reflow only those generated maps.
    useEffect(() => {
        if (!currentParentId || !hasLegacyTopicRoot) return;
        if (migrateTopicMapToDocumentTree(currentParentId)) {
            pendingFrameParentRef.current = currentParentId;
            announce('Arranged this note as a top-to-bottom document tree.');
        }
    }, [announce, currentParentId, hasLegacyTopicRoot, migrateTopicMapToDocumentTree]);

    // Build the map for a written card's untouched canvas.
    useEffect(() => {
        if (
            !currentParentId
            || activeParentNode?.type !== 'note'
            || activeParentNode.data.hasNestedCanvasSync
            || visibleNodes.length > 0
            || autoMappedParentIdsRef.current.has(currentParentId)
        ) return;
        if (!(getNodeBlocks(activeParentNode.data) ?? []).some(isCanvasHydratableBlock)) return;

        autoMappedParentIdsRef.current.add(currentParentId);
        pendingFrameParentRef.current = currentParentId;
        hydrateCanvasFromContent(currentParentId);
        announce(`Created a mind map for ${getNodeLabel(activeParentNode.data) || 'this note'}.`);
    }, [activeParentNode, announce, currentParentId, hydrateCanvasFromContent, visibleNodes.length]);

    // The first fit on entering an empty canvas happens before the map exists;
    // frame the whole map once its cards are there.
    useEffect(() => {
        const pending = pendingFrameParentRef.current;
        if (pending === null || pending !== currentParentId || visibleNodes.length === 0) return;
        const timer = window.setTimeout(() => {
            fitView({ duration: 420, padding: 0.24, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
            pendingFrameParentRef.current = null;
        }, FRAME_NEW_MAP_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [currentParentId, fitView, visibleNodes.length]);

    // A map is spatial: a rotation or a narrower window reframes it. Hand-built
    // canvases keep their camera on resize.
    useEffect(() => {
        const canvasArea = canvasAreaRef.current;
        if (!canvasArea || !hasGeneratedDocumentTree) return;
        let timer: number | undefined;
        const observer = new ResizeObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                fitView({ duration: 260, padding: 0.22, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
            }, REFRAME_ON_RESIZE_DELAY_MS);
        });
        observer.observe(canvasArea);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [canvasAreaRef, fitView, hasGeneratedDocumentTree]);
}
