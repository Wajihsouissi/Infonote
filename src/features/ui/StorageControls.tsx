import React, { useState, useCallback } from 'react';
import { FolderOpen, Check, Loader2, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectBackend } from '../../services/StorageManager';
import styles from './BottomMenu.module.css';

/**
 * Local-folder storage button. Cloud sync is now handled explicitly by the
 * Save Cloud / Reload Saved Data buttons in the canvas overlay (after sign-in).
 */
export const StorageControls: React.FC = () => {
    const storage = useStore(s => s.storage);
    const setStorageStatus = useStore(s => s.setStorageStatus);
    const loadGraph = useStore(s => s.loadGraph);

    const [isConnecting, setIsConnecting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleClick = useCallback(async () => {
        setIsConnecting(true);
        setErrorMessage(null);
        try {
            const result = await connectBackend('filesystem', {
                getState: () => ({
                    nodes: useStore.getState().nodes,
                    edges: useStore.getState().edges,
                }),
                loadGraph,
                setStorageStatus,
            });
            if (!result.success) {
                setErrorMessage(result.error || 'Connection failed');
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIsConnecting(false);
        }
    }, [loadGraph, setStorageStatus]);

    const connected = storage.isConnected;
    const icon = isConnecting ? <Loader2 size={20} className="animate-spin" />
        : errorMessage && !connected ? <AlertCircle size={20} />
        : connected ? <Check size={20} />
        : <FolderOpen size={20} />;
    const title = isConnecting ? 'Connecting...'
        : connected ? `Connected: ${storage.directoryName}${storage.lastSaved ? ' - Last saved: ' + storage.lastSaved : ''}`
        : 'Connect local folder';

    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
                className={`${styles.iconBtn} ${storage.isSaving && connected ? styles.saving : ''} ${errorMessage && !connected ? styles.error : ''}`}
                onClick={handleClick}
                disabled={isConnecting}
                title={title}
                style={{
                    borderColor: connected ? 'var(--color-primary)' : undefined,
                    background: connected ? 'rgba(16, 185, 129, 0.05)' : undefined,
                    opacity: isConnecting ? 0.7 : 1,
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                }}
            >
                {icon}
            </button>

            {errorMessage && (
                <div
                    title={errorMessage}
                    style={{ color: 'var(--color-error, #dc2626)', display: 'flex', alignItems: 'center' }}
                >
                    <AlertCircle size={16} />
                </div>
            )}
        </div>
    );
};
