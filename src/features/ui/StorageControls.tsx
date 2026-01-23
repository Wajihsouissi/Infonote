import React, { useState, useCallback } from 'react';
import { FolderOpen, Check, Loader2, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectStorage } from '../../services/StorageManager';
import styles from './BottomMenu.module.css';

export const StorageControls: React.FC = () => {
    const storage = useStore(s => s.storage);
    const setStorageStatus = useStore(s => s.setStorageStatus);
    const loadGraph = useStore(s => s.loadGraph);

    const [isConnecting, setIsConnecting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleConnect = useCallback(async () => {
        setIsConnecting(true);
        setErrorMessage(null);
        
        try {
            const result = await connectStorage(
                () => ({ 
                    nodes: useStore.getState().nodes, 
                    edges: useStore.getState().edges 
                }),
                loadGraph,
                setStorageStatus
            );
            
            if (result.success) {
                console.log('[StorageControls] Connected successfully');
            } else {
                setErrorMessage(result.error || 'Connection failed');
                console.error('[StorageControls] Connection failed:', result.error);
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            setErrorMessage(errMsg);
            console.error('[StorageControls] Unexpected error:', err);
        } finally {
            setIsConnecting(false);
        }
    }, [loadGraph, setStorageStatus]);

    const getIcon = () => {
        if (isConnecting || storage.isSaving) {
            return <Loader2 size={20} className="animate-spin" />;
        }
        if (errorMessage) {
            return <AlertCircle size={20} className="text-red-500" />;
        }
        if (storage.isConnected) {
            return <Check size={20} className="text-emerald-500" />;
        }
        return <FolderOpen size={20} />;
    };

    const getTitle = () => {
        if (isConnecting) return 'Connecting...';
        if (errorMessage) return 'Error: ' + errorMessage + ' (Click to retry)';
        if (storage.isSaving) return 'Saving...';
        if (storage.isConnected) {
            const lastSaved = storage.lastSaved ? ' - Last saved: ' + storage.lastSaved : '';
            return 'Connected: ' + storage.directoryName + lastSaved;
        }
        return 'Click to connect local directory for persistence';
    };

    const buttonStyle: React.CSSProperties = {
        borderColor: errorMessage 
            ? 'var(--color-error, #ef4444)' 
            : storage.isConnected 
                ? 'var(--color-primary)' 
                : undefined,
        background: errorMessage 
            ? 'rgba(239, 68, 68, 0.05)' 
            : storage.isConnected 
                ? 'rgba(16, 185, 129, 0.05)' 
                : undefined,
        opacity: isConnecting ? 0.7 : 1,
        cursor: isConnecting ? 'not-allowed' : 'pointer'
    };

    return (
        <button
            className={`${styles.iconBtn} ${storage.isSaving ? styles.saving : ''} ${errorMessage ? styles.error : ''}`}
            onClick={handleConnect}
            disabled={isConnecting}
            title={getTitle()}
            style={buttonStyle}
        >
            {getIcon()}
        </button>
    );
};
