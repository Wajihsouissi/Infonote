import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { BlockEditor } from '../editor/BlockEditor';
import { getNodeBlocks } from '../../types';

export function FullscreenModal({
    onCanvasDragOver,
    onCanvasDrop
}: {
    onCanvasDragOver?: (e: React.DragEvent) => void;
    onCanvasDrop?: (e: React.DragEvent) => void;
}) {
    // Atomic Selectors
    const fullscreenId = useStore(s => s.fullscreenId);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const updateNodeData = useStore(s => s.updateNodeData);
    // Only subscribe to the specific node we need, not the entire array
    const activeNode = useStore(s => getNodeById(s.nodes, fullscreenId ?? undefined));
    const navigateToNode = useStore(s => s.navigateToNode);
    const isLocalFullscreen = useRef(false);

    // Sync React state -> Native Fullscreen (Backup/Redundancy)
    useEffect(() => {
        if (fullscreenId && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                isLocalFullscreen.current = true;
            }).catch((err) => {
                // Often fails if not triggered by event, but worth a try in case of race conditions
                console.warn("Retrying fullscreen request:", err);
            });
        } else if (!fullscreenId && document.fullscreenElement && isLocalFullscreen.current) {
            document.exitFullscreen().catch(() => { });
            isLocalFullscreen.current = false;
        }
    }, [fullscreenId]);

    // Handle "Escape" key or browser exit to sync state
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && fullscreenId) {
                setFullscreenId(null);
                isLocalFullscreen.current = false;
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [fullscreenId, setFullscreenId]);

    const handleClose = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        setFullscreenId(null);
    };

    return (
        <AnimatePresence>
            {fullscreenId && activeNode && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    transition={{ duration: 0.2 }}
                    onClick={handleClose}
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
                        className={styles.modal} 
                        onClick={(e: any) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    >
                        <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                            {activeNode.type === 'note' ? (
                                <NoteExpandedContent
                                    id={fullscreenId}
                                    nodeId={fullscreenId}
                                    data={activeNode.data}
                                    onUpdate={updateNodeData}
                                    onClose={handleClose}
                                    onNavigate={() => {
                                        handleClose();
                                        navigateToNode(fullscreenId);
                                    }}
                                />
                            ) : (
                                <div className={styles.editorContainer}>
                                    <BlockEditor
                                        nodeId={fullscreenId}
                                        initialContent={getNodeBlocks(activeNode.data)}
                                        onUpdate={(blocks) => updateNodeData(fullscreenId, { content: blocks })}
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
