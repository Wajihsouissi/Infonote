import { useMemo, useState, useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { useStore } from '../../../store/useStore';

const DEBUG = import.meta.env.DEV;

interface UseCanvasViewportOptions {
    nodes: AppNode[];
    currentParentId: string | null;
}

/**
 * Hook that handles viewport culling and node visibility calculations.
 * Filters nodes based on current parent and viewport bounds for performance.
 */
export function useCanvasViewport({ nodes, currentParentId }: UseCanvasViewportOptions) {
    const { getViewport } = useReactFlow();
    const selectedCanvasNodeIds = useStore(state => state.selectedCanvasNodeIds);
    
    // Viewport tracking for culling
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    const lastViewportUpdate = useRef(0);

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

    // Filter nodes for the current view using viewport culling
    const visibleNodes = useMemo(() => {
        let culledNodes = rootNodes;
        
        // Performance: For large graphs (>100 nodes), apply viewport culling
        if (rootNodes.length > 100 && viewport) {
            const MARGIN = 500;
            const minX = (-viewport.x - MARGIN) / viewport.zoom;
            const maxX = (-viewport.x + window.innerWidth + MARGIN) / viewport.zoom;
            const minY = (-viewport.y - MARGIN) / viewport.zoom;
            const maxY = (-viewport.y + window.innerHeight + MARGIN) / viewport.zoom;

            culledNodes = rootNodes.filter(n => {
                // Never cull selected nodes so they remain in the render tree and can be focused successfully
                if (selectedCanvasNodeIds.has(n.id)) return true;

                const nodeWidth = typeof n.style?.width === 'number' ? n.style.width : 432;
                const nodeHeight = typeof n.style?.height === 'number' ? n.style.height : 432;
                const nodeX = n.position.x;
                const nodeY = n.position.y;

                return (
                    nodeX + nodeWidth >= minX &&
                    nodeX <= maxX &&
                    nodeY + nodeHeight >= minY &&
                    nodeY <= maxY
                );
            });

            if (DEBUG) console.log("[visibleNodes] Culled:", rootNodes.length, "->", culledNodes.length);
        }

        // Strip parentId for ReactFlow rendering (root level nodes) and dynamically apply custom drag handle
        return culledNodes.map(n => {
            const hasDragHandle = n.type === 'note' || n.type === 'fused-note';
            return {
                ...n,
                ...(n.parentId === currentParentId ? { parentId: undefined } : {}),
                ...(hasDragHandle ? { dragHandle: '.custom-drag-handle' } : {})
            };
        });
    }, [rootNodes, currentParentId, viewport, selectedCanvasNodeIds]);

    // Track viewport changes (throttled to 200ms)
    const handleViewportChange = useCallback(() => {
        const now = Date.now();
        if (now - lastViewportUpdate.current < 200) return;

        lastViewportUpdate.current = now;
        const currentViewport = getViewport();
        setViewport(currentViewport);
    }, [getViewport]);

    return {
        visibleNodes,
        rootNodes,
        viewport,
        handleViewportChange,
    };
}
