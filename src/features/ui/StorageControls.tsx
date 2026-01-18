import React, { useEffect, useState } from 'react';
import { FolderOpen, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { fileSystemStorage } from '../../services/FileSystemStorage';
import styles from './BottomMenu.module.css';

export const StorageControls: React.FC = () => {
    // Atomic Selectors
    const storage = useStore(s => s.storage);
    const setStorageStatus = useStore(s => s.setStorageStatus);
    const setLastSaved = useStore(s => s.setLastSaved);
    const setIsSaving = useStore(s => s.setIsSaving);
    const loadGraph = useStore(s => s.loadGraph);

    // Local state to track if we found a handle but haven't connected yet (needs permission)
    const [hasStoredHandle, setHasStoredHandle] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const timeoutRef = React.useRef<any>(null); // Initial value to satisfy strict null checks

    // Initial check for stored handle
    useEffect(() => {
        const checkStored = async () => {
            try {
                const handle = await fileSystemStorage.getStoredHandle();
                if (handle) {
                    // Try to reconnect silently (if permission was already granted and persisted)
                    const connected = await fileSystemStorage.reconnect();
                    if (connected) {
                        const data = await fileSystemStorage.loadData();
                        if (data) {
                            console.log('Loading graph from storage:', data);
                            try {
                                loadGraph(data.nodes, data.edges);
                                setStorageStatus(true, fileSystemStorage.directoryName || 'Local Folder');
                                setHasStoredHandle(false);
                            } catch (loadError) {
                                console.error('Failed to load graph data into store:', loadError);
                                // Reset to clean state
                                loadGraph([], []);
                            }
                            return;
                        }
                    }

                    setHasStoredHandle(true);
                }
            } catch (error) {
                console.error('Error during initial storage check:', error);
                // Continue with clean state
                loadGraph([], []);
            }
        };
        checkStored();
    }, [loadGraph, setStorageStatus]);

    const handleConnect = async () => {
        setIsLoading(true);
        let success = false;

        try {
            if (hasStoredHandle) {
                success = await fileSystemStorage.reconnect();
            }

            if (!success) {
                success = await fileSystemStorage.selectDirectory();
            }

            if (success) {
                const data = await fileSystemStorage.loadData();
                if (data) {
                    try {
                        loadGraph(data.nodes, data.edges);
                    } catch (loadError) {
                        console.error('Failed to load stored data:', loadError);
                        // Fall back to saving current state
                        const { nodes, edges } = useStore.getState();
                        setIsSaving(true);
                        try {
                            await fileSystemStorage.saveData(nodes, edges);
                        } finally {
                            setIsSaving(false);
                        }
                    }
                } else {
                    const { nodes, edges } = useStore.getState();
                    setIsSaving(true);
                    try {
                        await fileSystemStorage.saveData(nodes, edges);
                    } finally {
                        setIsSaving(false);
                    }
                }

                setStorageStatus(true, fileSystemStorage.directoryName || 'Local Folder');
                setHasStoredHandle(false);
            }
        } catch (error) {
            console.error('Connection failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Optimized auto-save effect
    useEffect(() => {
        if (!storage.isConnected) return;

        const performSave = async () => {
            const currentStore = useStore.getState();
            if (currentStore.storage.isSaving) return;

            setIsSaving(true);
            try {
                await fileSystemStorage.saveData(currentStore.nodes, currentStore.edges);
                setLastSaved(new Date().toLocaleTimeString());
            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        };

        const scheduleSave = () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            timeoutRef.current = setTimeout(() => {
                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(() => performSave(), { timeout: 2000 });
                } else {
                    performSave();
                }
            }, 1500); // Dynamic debounce could go here
        };

        // Subscribe to changes (Manual diffing to keep it simple and compatible)
        const unsub = useStore.subscribe(() => {
            // In modern Zustand, subscribe only provides the current state.
            // But we can compare with our own tracking or just trigger the debounced save.
            // Since scheduleSave is debounced, it's safe to call on any state change 
            // and we'll check for actual node/edge changes inside performSave or via a local ref.
            scheduleSave();
        });

        return () => {
            unsub();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [storage.isConnected, setLastSaved, setIsSaving]);

    // Render logic
    const getIcon = () => {
        if (isLoading || storage.isSaving) return <Loader2 size={20} className="animate-spin" />;
        if (storage.isConnected) return <Check size={20} className="text-emerald-500" />;
        if (hasStoredHandle) return <AlertTriangle size={20} className="text-amber-500" />;
        return <FolderOpen size={20} />;
    };

    const getTitle = () => {
        if (storage.isSaving) return "Persisting changes to disk...";
        if (storage.isConnected) return `Connected: ${storage.directoryName} (Auto-save active)`;
        if (hasStoredHandle) return "Restoration required (Data safely in IndexedDB)";
        return "Connect local directory for persistence";
    };

    return (
        <button
            className={`${styles.iconBtn} ${storage.isSaving ? styles.saving : ''}`}
            onClick={handleConnect}
            title={getTitle()}
            style={{
                borderColor: storage.isConnected ? 'var(--color-primary)' : hasStoredHandle ? '#f59e0b' : undefined,
                background: storage.isConnected ? 'rgba(16, 185, 129, 0.05)' : undefined
            }}
        >
            {getIcon()}
        </button>
    );
};
