import { memo } from 'react';
import { useViewport } from '@xyflow/react';
import { BASE_UNIT, GRID_GAP } from '../../config/layout';

/**
 * CustomGrid that renders a professional layout grid.
 * Instead of a single dot, it renders a 4-dot cluster at every gutter intersection,
 * perfectly framing the exact visual boundaries of the nodes (which are BASE_UNIT - GRID_GAP wide).
 */
export const CustomGrid = memo(() => {
    const { x, y, zoom } = useViewport();
    
    const scaledGap = BASE_UNIT * zoom;
    const scaledSize = 2 * zoom; // Slightly larger dots for better visibility

    // Calculate precise modulo offset
    const offsetX = x % scaledGap;
    const offsetY = y % scaledGap;

    // Node block size is 40px (56 - 16). The gutter is 16px.
    // We want points exactly at the boundaries: 0 and 40 in flow space.
    // To avoid SVG clipping at the edges, we shift the pattern origin by 20.
    const blockWidth = BASE_UNIT - GRID_GAP;
    const shift = (blockWidth / 2) * zoom; // 20 * zoom

    // Pattern origin
    const patternX = offsetX + shift;
    const patternY = offsetY + shift;

    // Points inside the pattern cell (relative to the shifted origin)
    // p1 maps to flow coordinate 40. p2 maps to flow coordinate 56 (which is 0).
    const p1 = shift;
    const p2 = shift + GRID_GAP * zoom;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: -1,
                opacity: 0.8 // Premium subtle opacity
            }}
        >
            <pattern
                id="pro-modular-grid"
                x={patternX}
                y={patternY}
                width={scaledGap}
                height={scaledGap}
                patternUnits="userSpaceOnUse"
            >
                {/* Top-Left of gutter (Bottom-Right of previous node) */}
                <rect x={p1 - scaledSize / 2} y={p1 - scaledSize / 2} width={scaledSize} height={scaledSize} fill="rgba(255, 255, 255, 0.15)" rx="0.5" />
                {/* Top-Right of gutter (Bottom-Left of next node) */}
                <rect x={p2 - scaledSize / 2} y={p1 - scaledSize / 2} width={scaledSize} height={scaledSize} fill="rgba(255, 255, 255, 0.15)" rx="0.5" />
                {/* Bottom-Left of gutter (Top-Right of node below) */}
                <rect x={p1 - scaledSize / 2} y={p2 - scaledSize / 2} width={scaledSize} height={scaledSize} fill="rgba(255, 255, 255, 0.15)" rx="0.5" />
                {/* Bottom-Right of gutter (Top-Left of next node below) */}
                <rect x={p2 - scaledSize / 2} y={p2 - scaledSize / 2} width={scaledSize} height={scaledSize} fill="rgba(255, 255, 255, 0.15)" rx="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#pro-modular-grid)" />
        </svg>
    );
});
