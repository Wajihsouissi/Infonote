import styles from './CanvasBoard.module.css';

interface SelectionBoxStyle {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface CanvasOverlayProps {
    isCtrlPressed: boolean;
    selectionBoxStyle: SelectionBoxStyle | null;
    nodesUnderSelectionCount: number;
}

/**
 * Canvas overlay component for selection visuals and mode indicators.
 * Renders outside ReactFlow for accurate positioning.
 */
export function CanvasOverlay({
    isCtrlPressed,
    selectionBoxStyle,
    nodesUnderSelectionCount,
}: CanvasOverlayProps) {
    return (
        <>
            {/* Selection Box Overlay */}
            {selectionBoxStyle && (
                <div
                    className={styles.selectionBox}
                    style={{
                        position: 'absolute',
                        left: selectionBoxStyle.left,
                        top: selectionBoxStyle.top,
                        width: selectionBoxStyle.width,
                        height: selectionBoxStyle.height,
                        pointerEvents: 'none',
                        zIndex: 9999,
                    }}
                />
            )}

            {/* Selection mode indicator */}
            {isCtrlPressed && (
                <div className={styles.selectionModeIndicator}>
                    Ctrl+Drag to select area
                </div>
            )}

            {/* Live selection count during drag */}
            {selectionBoxStyle && nodesUnderSelectionCount > 0 && (
                <div className={styles.selectionCount}>
                    {nodesUnderSelectionCount} node{nodesUnderSelectionCount > 1 ? 's' : ''}
                </div>
            )}
        </>
    );
}
