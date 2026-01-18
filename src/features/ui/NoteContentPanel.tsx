import { BlockEditor } from '../editor/BlockEditor';
import { useStore } from '../../store/useStore';
import styles from './NoteContentPanel.module.css';

interface NoteContentPanelProps {
    nodeId: string;
}

export function NoteContentPanel({ nodeId }: NoteContentPanelProps) {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const updateNodeData = useStore(s => s.updateNodeData);
    const node = nodes.find(n => n.id === nodeId);

    if (!node) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.contentContainer} onMouseDownCapture={(e) => e.stopPropagation()}>
                <BlockEditor
                    key={nodeId} // Reset Key on change
                    initialContent={(node.data as any).content}
                    onUpdate={(blocks) => updateNodeData(nodeId, { content: blocks })}
                />
            </div>
        </div>
    );
}
