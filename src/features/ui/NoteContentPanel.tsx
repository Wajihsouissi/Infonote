import { BlockEditor } from '../editor/BlockEditor';
import { useStore } from '../../store/useStore';
import styles from './NoteContentPanel.module.css';

interface NoteContentPanelProps {
    nodeId: string;
}

export function NoteContentPanel({ nodeId }: NoteContentPanelProps) {
    // Targeted selector: only re-render when THIS specific node changes
    const node = useStore(s => s.nodes.find(n => n.id === nodeId));
    const updateNodeData = useStore(s => s.updateNodeData);

    if (!node) return null;

    return (
        <div className={styles.panel}>
            <div 
                className={styles.contentContainer} 
                onMouseDownCapture={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[draggable="true"]')) return;
                    e.stopPropagation();
                }}
            >
                <BlockEditor
                    key={nodeId} // Reset Key on change
                    nodeId={nodeId}
                    initialContent={(node.data as any).content}
                    onUpdate={(blocks) => updateNodeData(nodeId, { content: blocks })}
                />
            </div>
        </div>
    );
}
