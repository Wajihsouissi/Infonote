import { getViewportForBounds } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { MIN_CANVAS_ZOOM } from '../canvasConstants';

/** Start a restored canvas at its destination before mounting card bodies. */
export function canvasEntryViewport(nodes: readonly AppNode[], parentId: string | null, width: number, height: number) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const node of nodes) {
        if ((node.parentId || null) !== parentId || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) continue;
        const w = typeof node.style?.width === 'number' && node.style.width > 0 ? node.style.width : 432;
        const h = typeof node.style?.height === 'number' && node.style.height > 0 ? node.style.height : 432;
        left = Math.min(left, node.position.x); top = Math.min(top, node.position.y);
        right = Math.max(right, node.position.x + w); bottom = Math.max(bottom, node.position.y + h);
    }
    if (!Number.isFinite(left) || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 };
    return getViewportForBounds({ x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) },
        width, height, MIN_CANVAS_ZOOM, 1, 0.2);
}
