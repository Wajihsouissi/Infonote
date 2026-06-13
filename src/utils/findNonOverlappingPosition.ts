import type { AppNode } from '../types';
import { snapToGridValue, BASE_UNIT } from '../config/layout';

interface Size {
    width: number;
    height: number;
}

interface Viewport {
    x: number;
    y: number;
    zoom: number;
    screenW: number;
    screenH: number;
}

export function findNonOverlappingPosition(
    center: { x: number; y: number },
    size: Size,
    nodes: AppNode[],
    currentParentId: string | null,
    viewport?: Viewport
): { x: number; y: number } {
    const PADDING = 20;
    const STEP = BASE_UNIT;
    const MAX_RADIUS = 2000;

    const relevantNodes = nodes.filter(n =>
        currentParentId === null || currentParentId === undefined
            ? (n.parentId === undefined || n.parentId === null)
            : n.parentId === currentParentId
    );

    const doesOverlap = (x: number, y: number) => {
        const left   = x - PADDING;
        const top    = y - PADDING;
        const right  = x + size.width  + PADDING;
        const bottom = y + size.height + PADDING;

        return relevantNodes.some(n => {
            // Prefer measured (actual DOM size) over style (intended size)
            const nodeWidth  = (n.measured?.width  ?? (n.style?.width  as number | undefined) ?? 300);
            const nodeHeight = (n.measured?.height ?? (n.style?.height as number | undefined) ?? 120);
            const nx = n.position.x;
            const ny = n.position.y;

            return !(right < nx || left > nx + nodeWidth || bottom < ny || top > ny + nodeHeight);
        });
    };

    // Compute viewport center in flow coords (used as anchor for all phases)
    let vpCenterX: number;
    let vpCenterY: number;

    if (viewport) {
        const { x: vpX, y: vpY, zoom, screenW, screenH } = viewport;
        const flowLeft = -vpX / zoom;
        const flowTop  = -vpY / zoom;
        vpCenterX = snapToGridValue(flowLeft + screenW / zoom / 2 - size.width  / 2);
        vpCenterY = snapToGridValue(flowTop  + screenH / zoom / 2 - size.height / 2);
    } else {
        vpCenterX = snapToGridValue(center.x - size.width  / 2);
        vpCenterY = snapToGridValue(center.y - size.height / 2);
    }

    // Phase 1: try exact viewport center
    if (!doesOverlap(vpCenterX, vpCenterY)) {
        return { x: vpCenterX, y: vpCenterY };
    }

    // Phase 2: spiral outward from viewport center, prefer slots inside viewport
    if (viewport) {
        const { x: vpX, y: vpY, zoom, screenW, screenH } = viewport;
        const flowLeft   = -vpX / zoom;
        const flowTop    = -vpY / zoom;
        const flowRight  = flowLeft + screenW / zoom;
        const flowBottom = flowTop  + screenH / zoom;

        const maxRadius = Math.max(screenW, screenH) / zoom;

        for (let radius = STEP; radius <= maxRadius; radius += STEP) {
            const steps = Math.max(8, Math.round((2 * Math.PI * radius) / STEP));
            for (let i = 0; i < steps; i++) {
                const angle = (i / steps) * 2 * Math.PI;
                const cx = snapToGridValue(vpCenterX + radius * Math.cos(angle));
                const cy = snapToGridValue(vpCenterY + radius * Math.sin(angle));
                // Skip candidates that go outside visible viewport
                if (cx < flowLeft || cy < flowTop || cx + size.width > flowRight || cy + size.height > flowBottom) continue;
                if (!doesOverlap(cx, cy)) {
                    return { x: cx, y: cy };
                }
            }
        }
    }

    // Phase 3: viewport is full — spiral outward without bounds constraint
    for (let radius = STEP; radius <= MAX_RADIUS; radius += STEP) {
        const steps = Math.max(8, Math.round((2 * Math.PI * radius) / STEP));
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const cx = snapToGridValue(vpCenterX + radius * Math.cos(angle));
            const cy = snapToGridValue(vpCenterY + radius * Math.sin(angle));
            if (!doesOverlap(cx, cy)) {
                return { x: cx, y: cy };
            }
        }
    }

    // Phase 4: last resort — offset from center even if overlapping
    return {
        x: snapToGridValue(vpCenterX + MAX_RADIUS),
        y: snapToGridValue(vpCenterY),
    };
}
