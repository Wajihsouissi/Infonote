import {
    memo,
    useCallback,
    useMemo,
    useRef,
    type KeyboardEvent,
    type PointerEvent,
    type WheelEvent,
} from 'react';
import {
    useReactFlow,
    useStore as useReactFlowStore,
    useViewport,
} from '@xyflow/react';
import type { AppNode } from '../../types';

const MAP_WIDTH = 160;
const MAP_HEIGHT = 116;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

type Bounds = { x: number; y: number; width: number; height: number };

interface CanvasMiniMapProps {
    className?: string;
    nodes: AppNode[];
}

function numericSize(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nodeSize(node: AppNode) {
    const fallbackWidth = node.type === 'block' ? 300 : 432;
    const fallbackHeight = node.type === 'block' ? 100 : node.type === 'fused-note' ? 120 : 432;
    return {
        width: numericSize(node.measured?.width, numericSize(node.style?.width, fallbackWidth)),
        height: numericSize(node.measured?.height, numericSize(node.style?.height, fallbackHeight)),
    };
}

function boundsForNodes(nodes: AppNode[]): Bounds | null {
    if (!nodes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
        const { width, height } = nodeSize(node);
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
    }

    return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1),
    };
}

function paddedBounds(bounds: Bounds): Bounds {
    const padding = Math.max(bounds.width, bounds.height) * 0.05;
    return {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
    };
}

/**
 * A minimap whose node geometry is independent from viewport animation.
 *
 * React Flow's stock minimap walks the complete node lookup to recompute its
 * bounds on every transform frame. That is correct but unnecessarily costly
 * for this canvas: node bounds usually stay fixed while only the viewport
 * moves. Here the rectangles and their bounds are memoized by the controlled
 * node list, leaving each pan frame with only constant-time mask arithmetic.
 */
export const CanvasMiniMap = memo(function CanvasMiniMap({ className, nodes }: CanvasMiniMapProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const { setCenter, zoomTo } = useReactFlow();
    const viewport = useViewport();
    const flowWidth = useReactFlowStore(state => state.width);
    const flowHeight = useReactFlowStore(state => state.height);

    const nodeBounds = useMemo(() => boundsForNodes(nodes), [nodes]);
    const nodeShapes = useMemo(() => nodes.map(node => {
        const { width, height } = nodeSize(node);
        return (
            <rect
                key={node.id}
                className={`react-flow__minimap-node${node.selected ? ' selected' : ''}`}
                x={node.position.x}
                y={node.position.y}
                width={width}
                height={height}
                rx={5}
                ry={5}
                shapeRendering="crispEdges"
            />
        );
    }), [nodes]);

    const visibleWorld = useMemo<Bounds>(() => ({
        x: -viewport.x / viewport.zoom,
        y: -viewport.y / viewport.zoom,
        width: Math.max(flowWidth, 1) / viewport.zoom,
        height: Math.max(flowHeight, 1) / viewport.zoom,
    }), [flowHeight, flowWidth, viewport.x, viewport.y, viewport.zoom]);

    /* Keep the minimap coordinate system fixed while the camera moves. A
       viewBox that expands on every pan/zoom frame forces the browser to
       rescale and restyle every node rectangle in the overview. The viewport
       mask may travel beyond this padded board when users explore empty space;
       that is both truthful and dramatically cheaper than moving the map. */
    const contentDrawingBounds = useMemo(
        () => nodeBounds ? paddedBounds(nodeBounds) : null,
        [nodeBounds],
    );
    const drawingBounds = contentDrawingBounds ?? paddedBounds(visibleWorld);

    const centerAt = useCallback((clientX: number, clientY: number) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = drawingBounds.x + ((clientX - rect.left) / rect.width) * drawingBounds.width;
        const y = drawingBounds.y + ((clientY - rect.top) / rect.height) * drawingBounds.height;
        void setCenter(x, y, { zoom: viewport.zoom, duration: 0 });
    }, [drawingBounds, setCenter, viewport.zoom]);

    const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        centerAt(event.clientX, event.clientY);
    }, [centerAt]);

    const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        event.stopPropagation();
        centerAt(event.clientX, event.clientY);
    }, [centerAt]);

    const handlePointerEnd = useCallback((event: PointerEvent<SVGSVGElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const handleWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * Math.exp(-event.deltaY * 0.002)));
        void zoomTo(nextZoom, { duration: 0 });
    }, [viewport.zoom, zoomTo]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
        const panStep = 80 / viewport.zoom;
        const centerX = visibleWorld.x + visibleWorld.width / 2;
        const centerY = visibleWorld.y + visibleWorld.height / 2;
        let nextCenter: { x: number; y: number } | null = null;

        if (event.key === 'ArrowLeft') nextCenter = { x: centerX - panStep, y: centerY };
        if (event.key === 'ArrowRight') nextCenter = { x: centerX + panStep, y: centerY };
        if (event.key === 'ArrowUp') nextCenter = { x: centerX, y: centerY - panStep };
        if (event.key === 'ArrowDown') nextCenter = { x: centerX, y: centerY + panStep };

        if (nextCenter) {
            event.preventDefault();
            void setCenter(nextCenter.x, nextCenter.y, { zoom: viewport.zoom, duration: 0 });
            return;
        }
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            void zoomTo(Math.min(MAX_ZOOM, viewport.zoom * 1.15), { duration: 0 });
        } else if (event.key === '-') {
            event.preventDefault();
            void zoomTo(Math.max(MIN_ZOOM, viewport.zoom / 1.15), { duration: 0 });
        }
    }, [setCenter, viewport.zoom, visibleWorld, zoomTo]);

    const outerPath = `M${drawingBounds.x},${drawingBounds.y}h${drawingBounds.width}v${drawingBounds.height}h${-drawingBounds.width}z`;
    const viewportPath = `M${visibleWorld.x},${visibleWorld.y}h${visibleWorld.width}v${visibleWorld.height}h${-visibleWorld.width}z`;

    return (
        <div
            className={`react-flow__minimap ${className ?? ''}`}
            data-testid="rf__minimap"
            role="group"
            aria-label="Canvas overview. Drag to pan, scroll to zoom."
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <svg
                ref={svgRef}
                className="react-flow__minimap-svg"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                viewBox={`${drawingBounds.x} ${drawingBounds.y} ${drawingBounds.width} ${drawingBounds.height}`}
                role="img"
                aria-label="Canvas content and current viewport"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onWheel={handleWheel}
            >
                <g>{nodeShapes}</g>
                <path
                    className="react-flow__minimap-mask"
                    d={`${outerPath} ${viewportPath}`}
                    fillRule="evenodd"
                    pointerEvents="none"
                />
            </svg>
        </div>
    );
});
