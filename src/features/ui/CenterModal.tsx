import { useStore } from '../../store/useStore';
import { BlockEditor } from '../editor/BlockEditor';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';

export function CenterModal() {
    // Atomic Selectors
    const centerPanelId = useStore(s => s.centerPanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const navigateToNode = useStore(s => s.navigateToNode);
    // Only subscribe to the specific node we need, not the entire array
    const activeNode = useStore(s => centerPanelId ? s.nodes.find(n => n.id === centerPanelId) : undefined);

    if (!centerPanelId) return null;
    if (!activeNode) return null;

    const handleNavigate = () => {
        // Close the modal and navigate to the card's nested canvas
        setCenterPanelId(null);
        navigateToNode(centerPanelId);
    };

    return (
        <div
            className={styles.overlay}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onDrop={(e) => {
                // Prevent drops on the overlay itself from propagating to ReactFlow
                // The actual content (NoteExpandedContent/BlockEditor) will handle their own drops
                e.stopPropagation();
            }}
        >
            <div className={`${styles.modal} ${styles.centerModalOverride}`}>
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    {activeNode.type === 'note' ? (
                        <NoteExpandedContent
                            id={centerPanelId}
                            data={activeNode.data as any}
                            onUpdate={updateNodeData}
                            onClose={() => setCenterPanelId(null)}
                            onNavigate={handleNavigate}
                        />
                    ) : (
                        <div className={styles.editorContainer}>
                            <BlockEditor
                                key={centerPanelId}
                                initialContent={(activeNode.data as any).content}
                                onUpdate={(blocks) => updateNodeData(centerPanelId, { content: blocks })}
                                autoFocus={true}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
