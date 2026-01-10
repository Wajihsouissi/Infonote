import { useStore } from '../../store/useStore';
import { BlockEditor } from '../editor/BlockEditor';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';

export function CenterModal() {
    const { nodes, centerPanelId, setCenterPanelId, updateNodeData } = useStore();

    if (!centerPanelId) return null;

    const activeNode = nodes.find(n => n.id === centerPanelId);
    if (!activeNode) return null;

    return (
        <div className={styles.overlay}>
            <div className={`${styles.modal} ${styles.centerModalOverride}`}>
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    {activeNode.type === 'note' ? (
                        <NoteExpandedContent
                            id={centerPanelId}
                            data={activeNode.data as any}
                            onUpdate={updateNodeData}
                            onClose={() => setCenterPanelId(null)}
                        />
                    ) : (
                        <div className={styles.editorContainer}>
                            <BlockEditor
                                key={centerPanelId}
                                initialContent={activeNode.data.content}
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
