import { BlockEditor } from '../editor/BlockEditor';
import { useStore } from '../../store/useStore';
import styles from './NoteContentPanel.module.css';

interface NoteContentPanelProps {
    nodeId: string;
}

export function NoteContentPanel({ nodeId }: NoteContentPanelProps) {
    const { nodes, updateNodeData } = useStore();
    const node = nodes.find(n => n.id === nodeId);

    if (!node) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.contentContainer} onMouseDownCapture={(e) => e.stopPropagation()}>
                <BlockEditor
                    key={nodeId} // Reset Key on change
                    initialContent={node.data.content}
                    onUpdate={(blocks) => updateNodeData(nodeId, { content: blocks })}
                />
            </div>
        </div>
    );
}
