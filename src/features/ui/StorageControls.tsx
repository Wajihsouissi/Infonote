import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderCheck, FolderX, FolderSync, Cloud, CloudCheck, CloudAlert, CloudSync, CloudUpload, Users } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectBackend, disconnectBackend, getActiveBackendKind } from '../../services/StorageManager';
import { fileSystemStorage } from '../../services/FileSystemStorage';
import { saveCanvasToCloud } from '../../services/cloudSync';
import { useAuth } from '../auth/useAuth';
import { CloudLoadModal } from '../canvas/CloudLoadModal';
import { LocalSyncModal } from '../canvas/LocalSyncModal';
import { CloudSyncModal } from '../canvas/CloudSyncModal';
import { NotionImportModal } from '../canvas/NotionImportModal';
import { ShareWorkspaceModal } from '../canvas/ShareWorkspaceModal';
import styles from './StorageControls.module.css';

const NotionIcon = ({ size = 18, className }: { size?: number, className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="var(--bg-primary, transparent)" />
        <path fillRule="evenodd" clipRule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z" fill="currentColor" />
    </svg>
);

/**
 * Storage controls: Folder Save (Local) and Cloud Save (Supabase).
 * Dynamically switches states and styles for never saved, unsynced (dirty), 
 * and saving errors.
 */
export const StorageControls: React.FC = () => {
    const storage = useStore(s => s.storage);
    const setStorageStatus = useStore(s => s.setStorageStatus);
    const loadGraph = useStore(s => s.loadGraph);
    const { user, configured, loading: authLoading } = useAuth();
    const workspaceId = useStore(s => s.auth.activeWorkspaceId);

    // Store setters for dynamic status
    const setCloudLastSaved = useStore(s => s.setCloudLastSaved);
    const setCloudDirty = useStore(s => s.setCloudDirty);
    const setLocalError = useStore(s => s.setLocalError);
    const setCloudError = useStore(s => s.setCloudError);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    
    const [showAuthPopover, setShowAuthPopover] = useState(false);
    const authPopoverRef = useRef<HTMLDivElement>(null);

    const [cloudModalOpen, setCloudModalOpen] = useState(false);
    const [loadModalOpen, setLoadModalOpen] = useState(false);
    const [localModalOpen, setLocalModalOpen] = useState(false);
    const [notionModalOpen, setNotionModalOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [hasAutoLoadedCloud, setHasAutoLoadedCloud] = useState(false);
    
    // Autosync logic
    const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(
        () => localStorage.getItem(`chnk-it-cloud-autosync-${workspaceId || 'default'}`) === 'true'
    );
    const autoSaveTimerRef = useRef<number | null>(null);

    // Backup restore logic
    const [hasCloudBackup, setHasCloudBackup] = useState(
        () => localStorage.getItem('chnk-it-cloud-reload-backup') !== null
    );

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        setIsAutoSyncEnabled(localStorage.getItem(`chnk-it-cloud-autosync-${workspaceId || 'default'}`) === 'true');
        setHasAutoLoadedCloud(false);
    }, [workspaceId]);

    // Close the auth popover when clicking outside.
    useEffect(() => {
        if (!showAuthPopover) return;
        const onDocClick = (e: MouseEvent) => {
            if (authPopoverRef.current && !authPopoverRef.current.contains(e.target as Node)) {
                setShowAuthPopover(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [showAuthPopover]);

    // Auto-load cloud data on login/reload if local storage is not connected
    useEffect(() => {
        if (hasAutoLoadedCloud || authLoading || !configured || !user || !workspaceId) {
            return;
        }

        let cancelled = false;

        const attemptAutoLoad = async () => {
            try {
                const { getAutoReconnectPromise } = await import('../../services/StorageManager');
                await getAutoReconnectPromise();
                
                if (cancelled) return;

                // If local folder successfully connected, prioritize it over auto-loading cloud
                if (useStore.getState().storage.isConnected) {
                    setHasAutoLoadedCloud(true);
                    return;
                }

                const { loadCanvasFromCloud } = await import('../../services/cloudSync');
                
                const loadRes = await loadCanvasFromCloud(user.id, workspaceId);
                if (cancelled) return;
                
                if (loadRes.ok && loadRes.nodes.length > 0) {
                    loadGraph(loadRes.nodes, loadRes.edges);
                    const timeStr = new Date().toLocaleTimeString();
                    if (setCloudLastSaved) setCloudLastSaved(timeStr);
                }
            } catch (err) {
                console.warn('[StorageControls] Auto-load from cloud failed:', err);
            } finally {
                if (!cancelled) setHasAutoLoadedCloud(true);
            }
        };

        void attemptAutoLoad();

        return () => {
            cancelled = true;
        };
    }, [hasAutoLoadedCloud, authLoading, configured, user, workspaceId, loadGraph, setCloudLastSaved]);


    const activeKind = storage.isConnected ? getActiveBackendKind() : null;

    const runConnect = useCallback(async (kind: 'filesystem', forceNew = false, mode: 'load' | 'save' = 'load') => {
        setIsConnecting(true);
        if (setLocalError) setLocalError(null);
        try {
            if (forceNew) {
                await fileSystemStorage.clearStoredHandle();
                await disconnectBackend(setStorageStatus);
            }

            if (storage.isConnected && activeKind && activeKind !== kind) {
                await disconnectBackend(setStorageStatus);
            }

            const result = await connectBackend(kind, {
                getState: () => ({
                    nodes: useStore.getState().nodes,
                    edges: useStore.getState().edges,
                }),
                loadGraph,
                setStorageStatus,
                mode,
            });

            if (!result.success) {
                if (setLocalError) setLocalError(result.error || 'Connection failed');
            }
        } catch (err) {
            if (setLocalError) setLocalError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsConnecting(false);
        }
    }, [activeKind, loadGraph, setStorageStatus, storage.isConnected, setLocalError]);

    const handleLocalClick = useCallback(() => {
        setLocalModalOpen(true);
    }, []);

    const handleLocalLoad = useCallback(() => {
        setLocalModalOpen(false);
        void runConnect('filesystem', true, 'load');
    }, [runConnect]);

    const handleLocalSave = useCallback(() => {
        setLocalModalOpen(false);
        void runConnect('filesystem', true, 'save');
    }, [runConnect]);

    const performCloudSave = useCallback(async (forceFullSync = false) => {
        if (!isOnline) {
            if (setCloudError) setCloudError("You're offline. Connect to the internet to sync.");
            return;
        }
        if (!configured) {
            if (setCloudError) setCloudError('Supabase is not configured. Check environmental variables.');
            return;
        }
        if (!user || !workspaceId) return;

        if (!isAutoSyncEnabled) {
            setIsAutoSyncEnabled(true);
            localStorage.setItem(`chnk-it-cloud-autosync-${workspaceId}`, 'true');
        }

        setIsSavingCloud(true);
        if (setCloudError) setCloudError(null);
        try {
            const state = useStore.getState();
            const { nodes, edges } = state;
            
            // Capture a snapshot of the dirty sets
            const dirtyNodeIds = new Set(state.storage.dirtyNodeIds);
            const dirtyEdgeIds = new Set(state.storage.dirtyEdgeIds);
            const deletedNodeIds = new Set(state.storage.deletedNodeIds);
            const deletedEdgeIds = new Set(state.storage.deletedEdgeIds);

            // If it's a full sync (manual click) OR if we've never synced to cloud in this session, upsert all nodes.
            // But we ALWAYS pass the deleted sets so we never accidentally delete the entire cloud canvas!
            const forceUpsertAll = forceFullSync || !state.storage.cloudLastSaved;

            const delta = {
                dirtyNodeIds,
                dirtyEdgeIds,
                deletedNodeIds,
                deletedEdgeIds,
                forceUpsertAll,
            };

            const result = await saveCanvasToCloud(user.id, workspaceId, nodes, edges, delta);
            if (result.ok) {
                // Clear ONLY the tracking sets we captured at the start of the save
                state.clearSyncTracking(dirtyNodeIds, dirtyEdgeIds, deletedNodeIds, deletedEdgeIds);
                
                const timeStr = new Date().toLocaleTimeString();
                if (setCloudLastSaved) setCloudLastSaved(timeStr);
                if (setCloudDirty) setCloudDirty(false);
                if (setCloudError) setCloudError(null);
            } else {
                if (setCloudError) setCloudError(result.error || 'Cloud save failed');
            }
        } catch (err) {
            const errStr = err instanceof Error ? err.message : String(err);
            if (setCloudError) setCloudError(errStr);
        } finally {
            setIsSavingCloud(false);
        }
    }, [isOnline, configured, user, workspaceId, isAutoSyncEnabled, setCloudLastSaved, setCloudDirty, setCloudError]);

    const handleCloudClick = useCallback(() => {
        if (!configured) {
            if (setCloudError) setCloudError('Supabase is not configured. Check environmental variables.');
            return;
        }
        if (!user) {
            setShowAuthPopover(v => !v);
            return;
        }
        setCloudModalOpen(true);
    }, [configured, user, setCloudError]);

    const handleRestoreBackup = useCallback(() => {
        try {
            const raw = localStorage.getItem('chnk-it-cloud-reload-backup');
            if (!raw) return;
            const backup = JSON.parse(raw);
            if (!backup.nodes || !backup.edges) return;
            const confirmed = window.confirm(
                `Restore canvas from backup saved at ${new Date(backup.timestamp).toLocaleString()}?`
            );
            if (!confirmed) return;
            loadGraph(backup.nodes, backup.edges);
            localStorage.removeItem('chnk-it-cloud-reload-backup');
            setHasCloudBackup(false);
            setCloudModalOpen(false);
        } catch {
            localStorage.removeItem('chnk-it-cloud-reload-backup');
            setHasCloudBackup(false);
        }
    }, [loadGraph]);

    useEffect(() => {
        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        if (!isAutoSyncEnabled || !storage.isCloudDirty || !isOnline || !configured || !user || !workspaceId) {
            return;
        }

        autoSaveTimerRef.current = window.setTimeout(() => {
            void performCloudSave();
        }, 1200);

        return () => {
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
    }, [isAutoSyncEnabled, storage.isCloudDirty, isOnline, configured, user, workspaceId, performCloudSave]);

    // Local folder button state
    const localStatus = 
        storage.localError ? 'error' :
        (!storage.isConnected || !storage.localLastSaved) ? 'never-saved' :
        storage.isLocalDirty ? 'not-synced' : 'synced';

    const localIcon = isConnecting ? <FolderSync size={18} className="animate-spin" />
        : localStatus === 'error' ? <FolderX size={18} />
        : localStatus === 'synced' ? <FolderCheck size={18} />
        : localStatus === 'not-synced' ? <FolderOpen size={18} />
        : <Folder size={18} />;

    const localTitle = isConnecting ? 'Connecting...'
        : localStatus === 'error' ? `Local Save Error: ${storage.localError}`
        : localStatus === 'not-synced' ? `Local Save: Unsaved changes exist! (Last saved: ${storage.localLastSaved || 'Never'})`
        : localStatus === 'synced' ? `Local Save: Synced to folder "${storage.directoryName}" (Last saved: ${storage.localLastSaved})`
        : 'Never saved locally. Click to select folder.';

    // Cloud button state
    const cloudStatus = 
        storage.cloudError ? 'error' :
        (!user || !storage.cloudLastSaved) ? 'never-saved' :
        storage.isCloudDirty ? 'not-synced' : 'synced';

    const cloudIcon = (authLoading || isSavingCloud) ? <CloudSync size={18} className="animate-spin" />
        : cloudStatus === 'error' ? <CloudAlert size={18} />
        : cloudStatus === 'synced' ? <CloudCheck size={18} />
        : cloudStatus === 'not-synced' ? <CloudUpload size={18} />
        : <Cloud size={18} />;

    const cloudTitle = !configured ? 'Cloud disabled (env not configured)'
        : !user ? 'Sign in to connect & save to cloud'
        : isSavingCloud ? 'Saving to cloud...'
        : cloudStatus === 'error' ? `Cloud Sync Error: ${storage.cloudError}`
        : cloudStatus === 'not-synced' ? `Cloud Save: Unsynced changes exist! (Last synced: ${storage.cloudLastSaved || 'Never'})`
        : cloudStatus === 'synced' ? `Cloud Save: Synced to cloud (Last synced: ${storage.cloudLastSaved})`
        : 'Cloud Sync Menu';

    const localClassName = `${styles.iconBtn} ` + (
        isConnecting ? styles.saving :
        localStatus === 'error' ? styles.error :
        localStatus === 'not-synced' ? styles.notSynced :
        localStatus === 'synced' ? styles.synced :
        styles.neverSaved
    );

    const cloudClassName = `${styles.iconBtn} ` + (
        (authLoading || isSavingCloud) ? styles.saving :
        cloudStatus === 'error' ? styles.error :
        cloudStatus === 'not-synced' ? styles.notSynced :
        cloudStatus === 'synced' ? styles.synced :
        styles.neverSaved
    );

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
            <button
                className={localClassName}
                onClick={handleLocalClick}
                disabled={isConnecting}
                data-tooltip={localTitle}
            >
                {localIcon}
            </button>

            {user && (
                <button
                    className={cloudClassName}
                    onClick={handleCloudClick}
                    disabled={isConnecting || !configured || isSavingCloud}
                    data-tooltip={cloudTitle}
                >
                    {cloudIcon}
                </button>
            )}

            {user && (
                <button
                    className={`${styles.iconBtn} ${styles.neverSaved}`}
                    onClick={() => setNotionModalOpen(true)}
                    disabled={isConnecting}
                    data-tooltip="Import from Notion"
                >
                    <NotionIcon size={18} />
                </button>
            )}

            {user && (
                <button
                    className={`${styles.iconBtn} ${styles.synced}`}
                    onClick={() => setShareModalOpen(true)}
                    disabled={isConnecting || !configured}
                    data-tooltip="Share canvas"
                >
                    <Users size={18} />
                </button>
            )}

            <CloudSyncModal 
                open={cloudModalOpen}
                onClose={() => setCloudModalOpen(false)}
                onSave={() => { performCloudSave(true); setCloudModalOpen(false); }}
                onReload={() => { setLoadModalOpen(true); setCloudModalOpen(false); }}
                onRestoreBackup={handleRestoreBackup}
                hasCloudBackup={hasCloudBackup}
                isAutoSyncEnabled={isAutoSyncEnabled}
                onAutoSyncChange={(enabled) => {
                    setIsAutoSyncEnabled(enabled);
                    if (workspaceId) {
                        localStorage.setItem(`chnk-it-cloud-autosync-${workspaceId}`, enabled ? 'true' : 'false');
                    }
                }}
            />

            <CloudLoadModal
                open={loadModalOpen}
                onClose={() => setLoadModalOpen(false)}
                onLoaded={() => {
                    setHasCloudBackup(localStorage.getItem('chnk-it-cloud-reload-backup') !== null);
                }}
            />

            <LocalSyncModal
                open={localModalOpen}
                onClose={() => setLocalModalOpen(false)}
                onLoad={handleLocalLoad}
                onSave={handleLocalSave}
            />

            <NotionImportModal
                open={notionModalOpen}
                onClose={() => setNotionModalOpen(false)}
            />

            <ShareWorkspaceModal
                open={shareModalOpen}
                onClose={() => setShareModalOpen(false)}
            />
        </div>
    );
};
