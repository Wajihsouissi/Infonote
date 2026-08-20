import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { BlockEditor } from '../editor/BlockEditor';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { getNodeBlocks } from '../../types';

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
        <AnimatePresence>
            {centerPanelId && activeNode && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    transition={{ duration: 0.2 }}
                    onClick={(event) => {
                        // The cover picker is portalled to body but still
                        // bubbles through React's tree. It is a child dialog,
                        // not a click on this modal's dismiss backdrop.
                        if ((event.target as HTMLElement).closest('[data-cover-picker]')) return;
                        setCenterPanelId(null);
                    }}
                    onDragOver={(e: any) => {
                        if (onCanvasDragOver) {
                            onCanvasDragOver(e);
                        } else {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                    onDrop={(e: any) => {
                        if (onCanvasDrop) {
                            onCanvasDrop(e);
                        } else {
                            e.stopPropagation();
                        }
                    }}
                >
                    <motion.div 
                        className={`${styles.modal} ${styles.centerModalOverride}`} 
                        onClick={(e: any) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    >
                        <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                            {activeNode.type === 'note' ? (
                                <NoteExpandedContent
                                    id={centerPanelId}
                                    nodeId={centerPanelId}
                                    data={activeNode.data}
                                    onUpdate={updateNodeData}
                                    onClose={() => setCenterPanelId(null)}
                                    onNavigate={handleNavigate}
                                />
                            ) : (
                                <div className={styles.editorContainer}>
                                    <BlockEditor
                                        key={centerPanelId}
                                        nodeId={centerPanelId}
                                        initialContent={getNodeBlocks(activeNode.data)}
                                        onUpdate={(blocks) => updateNodeData(centerPanelId, { content: blocks })}
                                        autoFocus={true}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
