import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { BlockEditor } from '../editor/BlockEditor';

export function FullscreenModal() {
    // Atomic Selectors
    const fullscreenId = useStore(s => s.fullscreenId);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const updateNodeData = useStore(s => s.updateNodeData);
    // Only subscribe to the specific node we need, not the entire array
    const activeNode = useStore(s => fullscreenId ? s.nodes.find(n => n.id === fullscreenId) : undefined);
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

    if (!fullscreenId || !activeNode) return null;

    const handleClose = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        setFullscreenId(null);
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
            <div className={styles.modal}>
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    {activeNode.type === 'note' ? (
                        <NoteExpandedContent
                            id={fullscreenId}
                            data={activeNode.data as any}
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
                                initialContent={(activeNode.data as any).content}
                                onUpdate={(blocks) => updateNodeData(fullscreenId, { content: blocks })}
                                autoFocus={true}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
