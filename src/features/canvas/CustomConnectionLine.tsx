import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';

/**
 * CustomConnectionLine
 * --------------------------------------------------
 * A premium, real-time connection line preview.
 * Draws a flowing bezier curved path from the top-right source handle
 * to the cursor position, styled with a soft neon glow and a running dash animation.
 */
export function CustomConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
}: ConnectionLineComponentProps) {
    const [path] = getBezierPath({
        sourceX: fromX,
        sourceY: fromY,
        sourcePosition: fromPosition,
        targetX: toX,
        targetY: toY,
        targetPosition: toPosition,
    });

    return (
        <g>
            <style>{`
                @keyframes customConnectionDash {
                    to {
                        stroke-dashoffset: -20;
                    }
                }
                .animated-connection-preview-glow {
                    animation: customConnectionDash 0.8s linear infinite;
                    stroke-dasharray: 6, 4;
                }
            `}</style>
            
            {/* Glowing flowing dash path */}
            <path
                fill="none"
                stroke="var(--color-primary, #8b5cf6)"
                strokeWidth={3}
                className="animated-connection-preview-glow"
                d={path}
            />

            {/* Pulsing endpoint tracker */}
            <circle
                cx={toX}
                cy={toY}
                fill="var(--color-primary, #8b5cf6)"
                r={5}
                stroke="white"
                strokeWidth={2}
                style={{

                }}
            />
        </g>
    );
}
