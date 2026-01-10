import { useViewport } from '@xyflow/react';

export function CustomGrid() {
    const { x, y, zoom } = useViewport();

    // Grid configuration must match the snap grid: 56px (40px square + 16px gap)
    const gridSize = 56;
    const squareSize = 40;

    return (
        <svg
            style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: -1,
            }}
            className="react-flow__background"
        >
            <defs>
                <pattern
                    id="soft-grid-pattern"
                    x={x % (gridSize * zoom)}
                    y={y % (gridSize * zoom)}
                    width={gridSize * zoom}
                    height={gridSize * zoom}
                    patternUnits="userSpaceOnUse"
                >
                    <rect
                        x={0}
                        y={0}
                        width={squareSize * zoom}
                        height={squareSize * zoom}
                        rx={12 * zoom}
                        ry={12 * zoom}
                        fill="rgba(69, 43, 129, 0.01)" /* Soft purple tone */
                        stroke="none"
                    />
                </pattern>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#soft-grid-pattern)" />
        </svg>
    );
}
