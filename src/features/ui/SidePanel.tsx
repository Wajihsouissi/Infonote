import { useStore } from '../../store/useStore';
import { BlockEditor } from '../editor/BlockEditor';
import styles from './SidePanel.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';

interface SidePanelProps {
    nodeId: string | null;
    side: 'left' | 'right';
    onClose: () => void;
}

export function SidePanel({ nodeId, side, onClose }: SidePanelProps) {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const updateNodeData = useStore(s => s.updateNodeData);

    if (!nodeId) return null;

    const activeNode = nodes.find(n => n.id === nodeId);
    if (!activeNode) return null;

    return (
        <div className={`${styles.panel} ${side === 'left' ? styles.panelLeft : styles.panelRight}`}>
            <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                {activeNode.type === 'note' ? (
                    <NoteExpandedContent
                        id={nodeId}
                        data={activeNode.data as any}
                        onUpdate={updateNodeData}
                        onClose={onClose}
                    />
                ) : (
                    <div className={styles.content}>
                        <BlockEditor
                            key={nodeId}
                            initialContent={(activeNode.data as any).content}
                            onUpdate={(blocks) => updateNodeData(nodeId, { content: blocks })}
                            autoFocus={true}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
