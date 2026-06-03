import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FolderCheck, FolderX, FolderSync, Cloud, CloudCheck, CloudAlert, CloudSync, CloudUpload } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectBackend, disconnectBackend, getActiveBackendKind } from '../../services/StorageManager';
import { fileSystemStorage } from '../../services/FileSystemStorage';
import { saveCanvasToCloud } from '../../services/cloudSync';
import { useAuth } from '../auth/useAuth';
import { SignInPanel } from '../auth/SignInPanel';
import { CloudLoadModal } from '../canvas/CloudLoadModal';
import styles from './StorageControls.module.css';

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

    const [showCloudPopover, setShowCloudPopover] = useState(false);
    const cloudPopoverRef = useRef<HTMLDivElement>(null);
    const [loadModalOpen, setLoadModalOpen] = useState(false);

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    
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

    // Close the cloud popover when clicking outside.
    useEffect(() => {
        if (!showCloudPopover) return;
        const onDocClick = (e: MouseEvent) => {
            if (cloudPopoverRef.current && !cloudPopoverRef.current.contains(e.target as Node)) {
                setShowCloudPopover(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [showCloudPopover]);

    const activeKind = storage.isConnected ? getActiveBackendKind() : null;

    const runConnect = useCallback(async (kind: 'filesystem', forceNew = false) => {
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
        const s = useStore.getState().storage;
        const alreadySaved = s.isConnected && !!s.localLastSaved;
        void runConnect('filesystem', alreadySaved);
    }, [runConnect]);

    const performCloudSave = useCallback(async () => {
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
            const { nodes, edges } = useStore.getState();
            const result = await saveCanvasToCloud(user.id, workspaceId, nodes, edges);
            if (result.ok) {
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
        setShowCloudPopover(v => !v);
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
            setShowCloudPopover(false);
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

            <button
                className={cloudClassName}
                onClick={handleCloudClick}
                disabled={isConnecting || !configured || isSavingCloud}
                data-tooltip={cloudTitle}
            >
                {cloudIcon}
            </button>

            {showAuthPopover && (
                <div
                    ref={authPopoverRef}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        background: 'var(--color-surface, #fff)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        zIndex: 1000,
                    }}
                >
                    <SignInPanel
                        compact
                        onSignedIn={() => {
                            setShowAuthPopover(false);
                        }}
                    />
                </div>
            )}

            {showCloudPopover && (
                <div
                    ref={cloudPopoverRef}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        background: 'var(--bg-panel, #1e1e1e)',
                        border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        zIndex: 1000,
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        minWidth: '200px',
                        color: 'var(--color-text, #fff)'
                    }}
                >
                    <button 
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(139, 92, 246, 0.5)', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--color-primary-light, #c4b5fd)', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}
                        onClick={() => { performCloudSave(); setShowCloudPopover(false); }}
                    >
                        Save to Cloud
                    </button>
                    <button 
                        style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))', background: 'transparent', color: 'var(--color-text, #fff)', cursor: 'pointer', textAlign: 'left' }}
                        onClick={() => { setLoadModalOpen(true); setShowCloudPopover(false); }}
                    >
                        Reload Saved Data
                    </button>
                    {hasCloudBackup && (
                        <button 
                            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning-light, #fcd34d)', cursor: 'pointer', textAlign: 'left' }}
                            onClick={handleRestoreBackup}
                        >
                            Restore Backup
                        </button>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 4px', fontSize: '0.9em', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={isAutoSyncEnabled} 
                            onChange={(e) => {
                                setIsAutoSyncEnabled(e.target.checked);
                                if (workspaceId) {
                                    localStorage.setItem(`chnk-it-cloud-autosync-${workspaceId}`, e.target.checked ? 'true' : 'false');
                                }
                            }} 
                        />
                        Auto-sync to cloud
                    </label>
                </div>
            )}

            <CloudLoadModal
                open={loadModalOpen}
                onClose={() => setLoadModalOpen(false)}
                onLoaded={(counts) => {
                    setHasCloudBackup(localStorage.getItem('chnk-it-cloud-reload-backup') !== null);
                }}
            />
        </div>
    );
};
