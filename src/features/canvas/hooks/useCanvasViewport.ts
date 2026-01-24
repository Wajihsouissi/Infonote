import { useMemo, useState, useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';

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
    
    // Viewport tracking for culling
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    const lastViewportUpdate = useRef(0);

    // Memoize root nodes for the current parent level
    const rootNodes = useMemo(() => {
        if (DEBUG) console.log("[rootNodes] Computing for currentParentId:", currentParentId);

        return nodes.filter(n =>
            (n.parentId === undefined && currentParentId === null) ||
            n.parentId === currentParentId
        );
    }, [nodes, currentParentId]);

    // Filter nodes for the current view using viewport culling
    const visibleNodes = useMemo(() => {
        let culledNodes = rootNodes;
        
        // Performance: For large graphs (>100 nodes), apply viewport culling
        if (rootNodes.length > 100 && viewport) {
            const MARGIN = 500;
            const minX = viewport.x - MARGIN;
            const maxX = viewport.x + (window.innerWidth / viewport.zoom) + MARGIN;
            const minY = viewport.y - MARGIN;
            const maxY = viewport.y + (window.innerHeight / viewport.zoom) + MARGIN;

            culledNodes = rootNodes.filter(n => {
                const nodeWidth = (n.style?.width as number) || 432;
                const nodeHeight = (n.style?.height as number) || 432;
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

        // Strip parentId for ReactFlow rendering (root level nodes)
        return culledNodes.map(n => {
            if (n.parentId === currentParentId) {
                return { ...n, parentId: undefined };
            }
            return n;
        });
    }, [rootNodes, currentParentId, viewport]);

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
