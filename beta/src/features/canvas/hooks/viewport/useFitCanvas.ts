import { useCallback } from 'react';
import { getViewportForBounds, useReactFlow, useStoreApi } from '@xyflow/react';
import { useStore } from '../../../../store/useStore';
import { MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM } from '../../canvasConstants';

interface FitOptions {
    duration?: number;
    padding?: number;
    minZoom?: number;
    maxZoom?: number;
    nodes?: readonly { id: string }[];
}

/** Frame authoritative canvas bounds, including nodes excluded by DOM culling. */
export function useFitCanvas() {
    const { setViewport } = useReactFlow();
    const flow = useStoreApi();
    return useCallback((options: FitOptions = {}) => {
        const state = useStore.getState();
        const ids = options.nodes ? new Set(options.nodes.map(node => node.id)) : null;
        const nodes = state.nodes.filter(node => (node.parentId || null) === state.currentParentId && (!ids || ids.has(node.id)));
        const { width, height } = flow.getState();
        if (!nodes.length || !width || !height) return Promise.resolve(false);
        // An explicit target supersedes the queued camera return from a
        // nested canvas. Its delayed animation must not steal this focus.
        if (ids && state.lastExitedNodeId) state.clearLastExitedNodeId();
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const node of nodes) {
            const w = node.measured?.width || (typeof node.style?.width === 'number' ? node.style.width : 432);
            const h = node.measured?.height || (typeof node.style?.height === 'number' ? node.style.height : 432);
            left = Math.min(left, node.position.x);
            top = Math.min(top, node.position.y);
            right = Math.max(right, node.position.x + w);
            bottom = Math.max(bottom, node.position.y + h);
        }
        const viewport = getViewportForBounds({ x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) },
            width, height, options.minZoom ?? MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, options.maxZoom ?? 1), options.padding ?? 0.1);
        return setViewport(viewport, { duration: options.duration ?? 400 });
    }, [flow, setViewport]);
}
