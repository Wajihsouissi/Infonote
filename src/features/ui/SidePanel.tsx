import { useStore } from '../../store/useStore';
import { BlockEditor } from '../editor/BlockEditor';
import styles from './SidePanel.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';

export function SidePanel() {
    const { nodes, sidePanelId, setSidePanelId, updateNodeData } = useStore();

    if (!sidePanelId) return null;

    const activeNode = nodes.find(n => n.id === sidePanelId);
    if (!activeNode) return null;

    return (
        <div className={styles.panel}>
            <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                {activeNode.type === 'note' ? (
                    <NoteExpandedContent
                        id={sidePanelId}
                        data={activeNode.data as any}
                        onUpdate={updateNodeData}
                        onClose={() => setSidePanelId(null)}
                    />
                ) : (
                    <div className={styles.content}>
                        <BlockEditor
                            key={sidePanelId}
                            initialContent={activeNode.data.content}
                            onUpdate={(blocks) => updateNodeData(sidePanelId, { content: blocks })}
                            autoFocus={true}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
