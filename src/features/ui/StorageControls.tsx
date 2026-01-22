import React, { useState } from 'react';
import { FolderOpen, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectStorage } from '../../services/StorageManager';
import styles from './BottomMenu.module.css';

export const StorageControls: React.FC = () => {
    // Atomic Selectors
    const storage = useStore(s => s.storage);
    const loadGraph = useStore(s => s.loadGraph);

    // Local loading state for connection button
    const [isConnecting, setIsConnecting] = useState(false);

    const handleConnect = async () => {
        setIsConnecting(true);
        try {
            await connectStorage(
                () => ({ nodes: useStore.getState().nodes, edges: useStore.getState().edges }),
                loadGraph
            );
        } finally {
            setIsConnecting(false);
        }
    };

    // Render logic
    const getIcon = () => {
        if (isConnecting || storage.isSaving) return <Loader2 size={20} className="animate-spin" />;
        if (storage.isConnected) return <Check size={20} className="text-emerald-500" />;
        return <FolderOpen size={20} />;
    };

    const getTitle = () => {
        if (storage.isSaving) return "Saving...";
        if (storage.isConnected) return `Connected: ${storage.directoryName} (Auto-save active)`;
        return "Connect local directory for persistence";
    };

    return (
        <button
            className={`${styles.iconBtn} ${storage.isSaving ? styles.saving : ''}`}
            onClick={handleConnect}
            title={getTitle()}
            style={{
                borderColor: storage.isConnected ? 'var(--color-primary)' : undefined,
                background: storage.isConnected ? 'rgba(16, 185, 129, 0.05)' : undefined
            }}
        >
            {getIcon()}
        </button>
    );
};

