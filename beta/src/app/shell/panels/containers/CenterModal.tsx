import { useStore } from '../../../../store/useStore';
import { getNodeById } from '../../../../store/nodeIndex';
import styles from '../fullscreen/FullscreenModal.module.css';
import { resolvePeekContent } from '../peek/peekContent';

export function CenterModal({
    onCanvasDragOver,
    onCanvasDrop
}: {
    onCanvasDragOver?: (e: React.DragEvent) => void;
    onCanvasDrop?: (e: React.DragEvent) => void;
}) {
    // Atomic Selectors
    const centerPanelId = useStore(s => s.centerPanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const navigateToNode = useStore(s => s.navigateToNode);
    // Only subscribe to the specific node we need, not the entire array
    const activeNode = useStore(s => getNodeById(s.nodes, centerPanelId ?? undefined));

    const handleNavigate = () => {
        // Close the modal and navigate to the card's nested canvas
        setCenterPanelId(null);
        navigateToNode(centerPanelId);
    };

    return (
        <>
            {centerPanelId && activeNode && (
                <div
                    className={styles.overlay}
                    onClick={(event) => {
                        // The cover picker is portalled to body but still
                        // bubbles through React's tree. It is a child dialog,
                        // not a click on this modal's dismiss backdrop.
                        if ((event.target as HTMLElement).closest('[data-cover-picker]')) return;
                        setCenterPanelId(null);
                    }}
                    onDragOver={(e) => {
                        if (onCanvasDragOver) {
                            onCanvasDragOver(e);
                        } else {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                    onDrop={(e) => {
                        if (onCanvasDrop) {
                            onCanvasDrop(e);
                        } else {
                            e.stopPropagation();
                        }
                    }}
                >
                    <div
                        className={`${styles.modal} ${styles.centerModalOverride}`} 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                            {resolvePeekContent({
                                node: activeNode,
                                nodeId: centerPanelId,
                                onUpdate: updateNodeData,
                                onClose: () => setCenterPanelId(null),
                                onNavigate: handleNavigate,
                                editorClassName: styles.editorContainer,
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
