import { memo, useState } from 'react';
import {
    getBezierPath,
    getSmoothStepPath,
    getStraightPath,
    useInternalNode,
    Position,
    type EdgeProps
} from '@xyflow/react';
import { useStore } from '../../store/useStore';

// Helper to calculate the shortest path between two nodes' border midpoints
function getSmartEdgeParams(
    sourceNode: any, 
    targetNode: any,
    fallbackSx: number,
    fallbackSy: number,
    fallbackTx: number,
    fallbackTy: number,
    fallbackSourcePos: Position,
    fallbackTargetPos: Position
) {
    if (!sourceNode || !targetNode) {
        return {
            sx: fallbackSx,
            sy: fallbackSy,
            tx: fallbackTx,
            ty: fallbackTy,
            sourcePos: fallbackSourcePos,
            targetPos: fallbackTargetPos,
        };
    }

    const srcAbs = sourceNode.internals?.positionAbsolute ?? sourceNode.position;
    const tgtAbs = targetNode.internals?.positionAbsolute ?? targetNode.position;

    // Use measured dimensions if available, fallback to width/height, or default to zero
    const srcW = sourceNode.measured?.width ?? (sourceNode.width ?? 0);
    const srcH = sourceNode.measured?.height ?? (sourceNode.height ?? 0);
    const tgtW = targetNode.measured?.width ?? (targetNode.width ?? 0);
    const tgtH = targetNode.measured?.height ?? (targetNode.height ?? 0);

    // If dimensions are zero, use standard fallback coordinates
    if (srcW === 0 || tgtW === 0) {
        return {
            sx: fallbackSx,
            sy: fallbackSy,
            tx: fallbackTx,
            ty: fallbackTy,
            sourcePos: fallbackSourcePos,
            targetPos: fallbackTargetPos,
        };
    }

    const sourcePoints = [
        { x: srcAbs.x + srcW / 2, y: srcAbs.y, position: Position.Top },
        { x: srcAbs.x + srcW / 2, y: srcAbs.y + srcH, position: Position.Bottom },
        { x: srcAbs.x, y: srcAbs.y + srcH / 2, position: Position.Left },
        { x: srcAbs.x + srcW, y: srcAbs.y + srcH / 2, position: Position.Right },
    ];

    const targetPoints = [
        { x: tgtAbs.x + tgtW / 2, y: tgtAbs.y, position: Position.Top },
        { x: tgtAbs.x + tgtW / 2, y: tgtAbs.y + tgtH, position: Position.Bottom },
        { x: tgtAbs.x, y: tgtAbs.y + tgtH / 2, position: Position.Left },
        { x: tgtAbs.x + tgtW, y: tgtAbs.y + tgtH / 2, position: Position.Right },
    ];

    let minDistance = Infinity;
    let bestSource = sourcePoints[3]; // Fallback to Right
    let bestTarget = targetPoints[2]; // Fallback to Left

    for (const sp of sourcePoints) {
        for (const tp of targetPoints) {
            const dist = Math.hypot(tp.x - sp.x, tp.y - sp.y);
            if (dist < minDistance) {
                minDistance = dist;
                bestSource = sp;
                bestTarget = tp;
            }
        }
    }

    return {
        sx: bestSource.x,
        sy: bestSource.y,
        tx: bestTarget.x,
        ty: bestTarget.y,
        sourcePos: bestSource.position,
        targetPos: bestTarget.position,
    };
}

/**
 * CenteredEdge
 * --------------------------------------------------
 * A premium React Flow edge supporting multiple curve styles (bezier, smoothstep, straight, step),
 * custom stroke widths/colors, animations, and beautiful line styles (solid, dashed, dotted).
 * Includes selected glowing shadows, hover feedback, custom labels, and dynamic SVG marker definitions.
 */
export const CenteredEdge = memo(function CenteredEdge({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    animated,
    style,
    data,
}: EdgeProps) {
    const setSelectedEdgeId = useStore((s) => s.setSelectedEdgeId);
    const selectedEdgeIds = useStore((s) => s.selectedEdgeIds);
    const toggleCanvasEdgeSelection = useStore((s) => s.toggleCanvasEdgeSelection);
    const isSelected = selected || (selectedEdgeIds && selectedEdgeIds.has(id));
    const [isHovered, setIsHovered] = useState(false);

    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    // Calculate smart connection parameters to draw the shortest path between nodes
    const { sx, sy, tx, ty, sourcePos, targetPos } = getSmartEdgeParams(
        sourceNode,
        targetNode,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition
    );

    // Retrieve custom styling configuration from edge data
    const edgeData = (data ?? {}) as any;
    const edgeType = edgeData.edgeType || 'bezier';
    const lineStyle = edgeData.lineStyle || 'solid';
    const markerEndType = edgeData.markerEndType || 'arrow';
    const label = edgeData.label || '';

    // Selected or hovered edge is thicker and glows
    const strokeWidth = edgeData.strokeWidth || (isSelected ? 3 : isHovered ? 2.5 : 1.75);
    const strokeColor = edgeData.color || (isSelected || isHovered ? 'var(--color-primary, #8b5cf6)' : 'var(--glass-border, rgba(148, 163, 184, 0.6))');
    const isAnimated = animated || edgeData.animated || false;

    // Calculate paths based on the requested edge curve style
    let path = '';
    let labelX = 0;
    let labelY = 0;

    if (edgeType === 'bezier') {
        [path, labelX, labelY] = getBezierPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
        });
    } else if (edgeType === 'smoothstep') {
        [path, labelX, labelY] = getSmoothStepPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
            borderRadius: 16,
        });
    } else if (edgeType === 'straight') {
        [path, labelX, labelY] = getStraightPath({
            sourceX: sx,
            sourceY: sy,
            targetX: tx,
            targetY: ty,
        });
    } else if (edgeType === 'step') {
        [path, labelX, labelY] = getSmoothStepPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
            borderRadius: 0,
        });
    } else {
        [path, labelX, labelY] = getBezierPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
        });
    }

    const markerId = `marker-${id}`;

    return (
        <>
            <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
                <defs>
                    <marker
                        id={`${markerId}-arrow`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} style={{ transition: 'fill 0.2s' }} />
                    </marker>
                    <marker
                        id={`${markerId}-circle`}
                        viewBox="0 0 10 10"
                        refX="5"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto"
                    >
                        <circle cx="5" cy="5" r="4" fill={strokeColor} style={{ transition: 'fill 0.2s' }} />
                    </marker>
                </defs>
            </svg>

            <style>{`
                @keyframes customDash {
                    to {
                        stroke-dashoffset: -20;
                    }
                }
                .custom-animated-edge-${id} {
                    stroke-dasharray: 8, 4;
                    animation: customDash 1.2s linear infinite;
                }
                @keyframes selectedEdgeFlow-${id} {
                    from {
                        stroke-dashoffset: 24;
                    }
                    to {
                        stroke-dashoffset: 0;
                    }
                }
                .selected-edge-${id} {
                    stroke-dasharray: 6, 4 !important;
                    animation: selectedEdgeFlow-${id} 0.5s linear infinite !important;
                }
                .edge-label-container-${id} {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--surface-elevated, #1e1e20);
                    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
                    border-radius: 6px;
                    padding: 4px 8px;
                    font-size: 11px;
                    font-family: 'Poppins', sans-serif;
                    color: var(--text-primary, #ffffff);
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    pointer-events: none;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            `}</style>

            {/* Glowing Backlighting Path */}
            <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth + (isSelected ? 8 : 4)}
                opacity={isSelected ? 0.5 : isHovered ? 0.3 : 0}
                style={{
                    filter: `blur(${isSelected ? 6 : 4}px)`,
                    transition: 'opacity 0.2s, stroke 0.2s, stroke-width 0.2s',
                    pointerEvents: 'none',
                }}
            />

            {/* Thicker Invisible Interaction Path for easy clicking */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                        toggleCanvasEdgeSelection(id);
                    } else {
                        setSelectedEdgeId(id);
                    }
                }}
            />

            {/* Visual Stroke Path */}
            <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth + (isSelected ? 0.75 : 0)}
                strokeDasharray={
                    isSelected 
                        ? undefined 
                        : isAnimated 
                        ? undefined 
                        : lineStyle === 'dashed' 
                        ? '6,4' 
                        : lineStyle === 'dotted' 
                        ? '2,4' 
                        : undefined
                }
                className={`${isAnimated ? `custom-animated-edge-${id}` : ''} ${isSelected ? `selected-edge-${id}` : ''}`}
                markerEnd={
                    markerEndType === 'arrow'
                        ? `url(#${markerId}-arrow)`
                        : markerEndType === 'circle'
                        ? `url(#${markerId}-circle)`
                        : undefined
                }
                style={{
                    transition: 'stroke 0.2s, stroke-width 0.2s',
                    pointerEvents: 'none',
                    ...style,
                }}
            />

            {/* Dynamic Label Box */}
            {label && (
                <foreignObject
                    width={140}
                    height={40}
                    x={labelX - 70}
                    y={labelY - 20}
                    requiredExtensions="http://www.w3.org/1999/xhtml"
                    style={{ pointerEvents: 'none' }}
                >
                    <div className={`edge-label-container-${id}`}>
                        {label}
                    </div>
                </foreignObject>
            )}
        </>
    );
});
