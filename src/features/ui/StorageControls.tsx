import React, { useEffect, useState } from 'react';
import { FolderOpen, Check, Save, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { fileSystemStorage } from '../../services/FileSystemStorage';
import styles from './BottomMenu.module.css';

export const StorageControls: React.FC = () => {
    const {
        storage,
        setStorageStatus,
        setLastSaved,
        loadGraph,
        nodes,
        edges
    } = useStore();

    // Local state to track if we found a handle but haven't connected yet (needs permission)
    const [hasStoredHandle, setHasStoredHandle] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Initial check for stored handle
    useEffect(() => {
        const checkStored = async () => {
            const handle = await fileSystemStorage.getStoredHandle();
            if (handle) {
                // Try to reconnect silently (if permission was already granted and persisted)
                const connected = await fileSystemStorage.reconnect();
                if (connected) {
                    const data = await fileSystemStorage.loadData();
                    if (data) {
                        loadGraph(data.nodes, data.edges);
                        setStorageStatus(true, fileSystemStorage.directoryName || 'Local Folder');
                        setHasStoredHandle(false);
                        return;
                    }
                }

                // If silent reconnect failed (needs user gesture), show the warning state
                setHasStoredHandle(true);
            }
        };
        checkStored();
    }, []);

    const handleConnect = async () => {
        setIsLoading(true);
        let success = false;

        // Try to reconnect if we have a stored handle
        if (hasStoredHandle) {
            success = await fileSystemStorage.reconnect();
        }

        // If reconnection failed or no handle, ask user to pick
        if (!success) {
            success = await fileSystemStorage.selectDirectory();
        }

        if (success) {
            const data = await fileSystemStorage.loadData();
            if (data) {
                loadGraph(data.nodes, data.edges);
            } else {
                // Save current state if empty
                await fileSystemStorage.saveData(nodes, edges);
            }

            setStorageStatus(true, fileSystemStorage.directoryName || 'Local Folder');
            setHasStoredHandle(false); // Connected now
        }
        setIsLoading(false);
    };

    // Auto-save effect
    useEffect(() => {
        if (!storage.isConnected) return;

        const save = async () => {
            try {
                await fileSystemStorage.saveData(nodes, edges);
                setLastSaved(new Date().toLocaleTimeString());
            } catch (error) {
                console.error("Auto-save failed", error);
                // setStorageStatus(false, null); // Don't disconnect hard, just warn?
            }
        };

        const timeoutId = setTimeout(save, 2000);
        return () => clearTimeout(timeoutId);
    }, [nodes, edges, storage.isConnected, setLastSaved]);

    // Render logic
    const getIcon = () => {
        if (isLoading) return <Loader2 size={20} className="animate-spin" />;
        if (storage.isConnected) return <Check size={20} className="text-emerald-500" />;
        if (hasStoredHandle) return <AlertTriangle size={20} className="text-amber-500" />; // Needs permission
        return <FolderOpen size={20} />;
    };

    const getTitle = () => {
        if (storage.isConnected) return `Saved to: ${storage.directoryName}`;
        if (hasStoredHandle) return "Click to restore connection (Data locally saved)";
        return "Save to Disk";
    };

    return (
        <button
            className={styles.iconBtn}
            onClick={handleConnect}
            title={getTitle()}
            style={{
                borderColor: storage.isConnected ? 'var(--color-primary)' : hasStoredHandle ? '#f59e0b' : undefined,
                background: storage.isConnected ? 'rgba(16, 185, 129, 0.1)' : undefined
            }}
        >
            {getIcon()}
        </button>
    );
};
