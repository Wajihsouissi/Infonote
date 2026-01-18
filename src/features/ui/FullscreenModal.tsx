import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import styles from './FullscreenModal.module.css';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { BlockEditor } from '../editor/BlockEditor';

export function FullscreenModal() {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const fullscreenId = useStore(s => s.fullscreenId);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const updateNodeData = useStore(s => s.updateNodeData);
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

    if (!fullscreenId) return null;

    const activeNode = nodes.find(n => n.id === fullscreenId);
    if (!activeNode) return null;

    const handleClose = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        setFullscreenId(null);
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
                    {activeNode.type === 'note' ? (
                        <NoteExpandedContent
                            id={fullscreenId}
                            data={activeNode.data as any}
                            onUpdate={updateNodeData}
                            onClose={handleClose}
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
