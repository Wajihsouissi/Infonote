import React, { useState, useCallback, useEffect } from 'react';
import { Folder, FolderOpen, FolderCheck, FolderX, FolderSync, HardDrive, Cloud, CloudCheck, CloudAlert, CloudSync, CloudUpload, Users } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import { connectBackend, disconnectBackend, getActiveBackendKind } from '../../services/StorageManager';
import { fileSystemStorage } from '../../services/FileSystemStorage';
import { useAuth } from '../auth/useAuth';
import { CloudLoadModal } from '../canvas/CloudLoadModal';
import { LocalSyncModal } from '../canvas/LocalSyncModal';
import { CloudSyncModal } from '../canvas/CloudSyncModal';
import { NotionImportModal } from '../canvas/NotionImportModal';
import { ShareWorkspaceModal } from '../canvas/ShareWorkspaceModal';
import { FEATURES } from '../../config/featureFlags';
import { requestWorkspaceSync } from '../../services/syncController';
import {
    readStorageMode,
    subscribeStorageMode,
    writeStorageMode,
} from '../../services/storage/storagePreference';
import {
    deleteRestoreBackup,
    loadRestoreBackup,
    resolveLocalWorkspaceKey,
    type LocalRestoreBackup,
} from '../../services/storage/LocalWorkspaceStore';
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
    const setCurrentView = useStore(s => s.setCurrentView);

    // Store setters for dynamic status
    const setLocalError = useStore(s => s.setLocalError);
    const setFolderError = useStore(s => s.setFolderError);
    const setCloudError = useStore(s => s.setCloudError);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    
    const [cloudModalOpen, setCloudModalOpen] = useState(false);
    const [loadModalOpen, setLoadModalOpen] = useState(false);
    const [localModalOpen, setLocalModalOpen] = useState(false);
    const [notionModalOpen, setNotionModalOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    // The device makes this choice once. Local persistence remains active in
    // both modes; this flag only controls the cloud coordinator.
    const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(
        () => readStorageMode(user?.id) === 'sync'
    );

    useEffect(() => {
        setIsAutoSyncEnabled(readStorageMode(user?.id) === 'sync');
        return subscribeStorageMode((next) => setIsAutoSyncEnabled(next === 'sync'));
    }, [user?.id]);

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

    const activeKind = storage.isConnected ? getActiveBackendKind() : null;

    const runConnect = useCallback(async (kind: 'filesystem', forceNew = false, mode: 'load' | 'save' = 'load') => {
        setIsConnecting(true);
        setFolderError(null);
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
                setFolderError(result.error || 'Connection failed');
            }
        } catch (err) {
            setFolderError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsConnecting(false);
        }
    }, [activeKind, loadGraph, setStorageStatus, storage.isConnected, setFolderError]);

    const handleLocalClick = useCallback(() => {
        if (storage.localError) {
            void requestWorkspaceSync({ localOnly: true }).then((result) => {
                if (!result.ok) setLocalError(result.error);
            });
            return;
        }
        setLocalModalOpen(true);
    }, [storage.localError, setLocalError]);

    const handleLocalLoad = useCallback(() => {
        setLocalModalOpen(false);
        void runConnect('filesystem', true, 'load');
    }, [runConnect]);

    const handleLocalSave = useCallback(() => {
        setLocalModalOpen(false);
        void runConnect('filesystem', true, 'save');
    }, [runConnect]);

    const performCloudSave = useCallback(async (forceFullSync = false, createManualVersion = false) => {
        if (!isOnline) {
            if (setCloudError) setCloudError("You're offline. Connect to the internet to sync.");
            return;
        }
        if (!configured) {
            if (setCloudError) setCloudError('Supabase is not configured. Check environmental variables.');
            return;
        }
        if (!user || !workspaceId) return;

        setIsSavingCloud(true);
        if (setCloudError) setCloudError(null);
        try {
            const result = await requestWorkspaceSync({
                forceFull: forceFullSync,
                createManualVersion,
            });
            if (!result.ok) {
                if (setCloudError) setCloudError(result.error || 'Cloud save failed');
            }
        } catch (err) {
            const errStr = err instanceof Error ? err.message : String(err);
            if (setCloudError) setCloudError(errStr);
        } finally {
            setIsSavingCloud(false);
        }
    }, [isOnline, configured, user, workspaceId, setCloudError]);

    const handleCloudClick = useCallback(() => {
        if (!configured) {
            if (setCloudError) setCloudError('Supabase is not configured. Check environmental variables.');
            return;
        }
        if (!user) {
            setCurrentView('login');
            return;
        }
        setCloudModalOpen(true);
    }, [configured, user, setCloudError, setCurrentView]);

    const handleRestoreBackup = useCallback(async () => {
        try {
            const raw = localStorage.getItem('chnk-it-cloud-reload-backup');
            if (!raw) return;
            const marker = JSON.parse(raw) as Partial<LocalRestoreBackup>;
            const backupKey = marker.key || resolveLocalWorkspaceKey(workspaceId);
            // Backwards compatibility for backups written before the IndexedDB
            // store existed.
            const durable = await loadRestoreBackup(backupKey);
            const backup: LocalRestoreBackup | null = durable ?? (
                Array.isArray(marker.nodes) && Array.isArray(marker.edges)
                    ? { key: backupKey, nodes: marker.nodes, edges: marker.edges, timestamp: marker.timestamp ?? Date.now() }
                    : null
            );
            if (!backup || !backup.nodes || !backup.edges) return;
            const confirmed = window.confirm(
                `Restore canvas from backup saved at ${new Date(backup.timestamp).toLocaleString()}?`
            );
            if (!confirmed) return;
            const before = useStore.getState();
            loadGraph(backup.nodes, backup.edges);
            const restoredNodeIds = new Set(backup.nodes.map((node) => node.id));
            const restoredEdgeIds = new Set(backup.edges.map((edge) => edge.id));
            before.replaceSyncTracking({
                dirtyNodeIds: backup.nodes.map((node) => node.id),
                dirtyEdgeIds: backup.edges.map((edge) => edge.id),
                deletedNodeIds: before.nodes.filter((node) => !restoredNodeIds.has(node.id)).map((node) => node.id),
                deletedEdgeIds: before.edges.filter((edge) => !restoredEdgeIds.has(edge.id)).map((edge) => edge.id),
            });
            before.setCloudDirty(true);
            await deleteRestoreBackup(backupKey);
            localStorage.removeItem('chnk-it-cloud-reload-backup');
            setHasCloudBackup(false);
            setCloudModalOpen(false);
        } catch {
            if (setCloudError) setCloudError('The local restore backup could not be opened.');
        }
    }, [loadGraph, setCloudError, workspaceId]);

    /* Local durability state.

       This reports whether the work is saved on THIS DEVICE, which since the
       local-first coordinator means IndexedDB — not whether a folder is
       attached. It used to key off `storage.isConnected`, which is true only
       for the optional File System Access mirror that most people never set up
       and that Firefox and Safari cannot offer at all. The result was a button
       reading "Never saved locally" while IndexedDB was being written every
       350ms: the product's central promise, contradicted by its own indicator.
       The folder, when there is one, is reported in the tooltip instead. */
    const localStatus =
        storage.localError || storage.folderError ? 'error' :
        !storage.localLastSaved ? 'never-saved' :
        storage.isLocalDirty ? 'not-synced' : 'synced';

    /* A folder glyph would claim a folder mirror that most devices don't have.
       Show the drive when the save is this device's own, the folder only once
       one is genuinely attached. */
    const localIcon = isConnecting ? <FolderSync size={18} className="animate-spin" />
        : localStatus === 'error' ? <DuotoneIcon icon={FolderX} size={18} />
        : localStatus === 'synced' ? <DuotoneIcon icon={storage.isConnected ? FolderCheck : HardDrive} size={18} />
        : localStatus === 'not-synced' ? <DuotoneIcon icon={storage.isConnected ? FolderOpen : HardDrive} size={18} />
        : <DuotoneIcon icon={Folder} size={18} />;

    const localTitle = isConnecting ? 'Connecting...'
        : storage.localError ? `Local save failed: ${storage.localError}. Click to retry.`
        : storage.folderError ? `Folder copy failed: ${storage.folderError}. Click to reconnect the folder.`
        : localStatus === 'not-synced' ? `Saving to this device… (last saved ${storage.localLastSaved || 'never'})`
        : localStatus === 'synced' ? (storage.isConnected
            ? `Saved on this device at ${storage.localLastSaved}. Folder "${storage.directoryName}" last saved at ${storage.lastSaved || 'not yet'}.`
            : `Saved on this device at ${storage.localLastSaved}. Click to also keep a copy in a folder.`)
        : 'Nothing saved on this device yet. Click to also keep a copy in a folder.';

    // Cloud button state.
    /* A load in flight counts as busy exactly like a save does. Without this
       the icon settles on "Synced" while the canvas is still coming down —
       the status and the loader telling the user two different things. */
    const isLoadingCloud = storage.cloudLoad.phase !== 'idle';
    const cloudBusy = isAutoSyncEnabled && configured && (
        authLoading || isSavingCloud || isLoadingCloud || storage.isCloudSyncing
    );

    /* A load and a save both establish that the canvas matches the cloud, so
       either one is enough to leave "never saved". They are tracked separately
       because only one of them can honestly be called a save. */
    const cloudKnown = Boolean(storage.cloudLastSaved || storage.cloudLastLoaded);
    const cloudStatus =
        !isAutoSyncEnabled ? 'off' :
        !configured ? 'error' :
        cloudBusy ? 'working' :
        storage.cloudError ? 'error' :
        !isOnline ? 'not-synced' :
        (!user || !cloudKnown) ? 'never-saved' :
        storage.isCloudDirty ? 'not-synced' : 'synced';

    const cloudIcon = cloudStatus === 'working' ? <CloudSync size={18} className="animate-spin" />
        : cloudStatus === 'error' ? <CloudAlert size={18} />
        : cloudStatus === 'synced' ? <CloudCheck size={18} />
        : cloudStatus === 'not-synced' ? <CloudUpload size={18} />
        : <Cloud size={18} />;

    const cloudProgress = storage.cloudLoad.progress?.value;
    const cloudLabel = !isAutoSyncEnabled ? 'Cloud off'
        : !configured ? 'Cloud unavailable'
        : authLoading ? 'Checking cloud'
        : !user ? 'Sign in to sync'
        : isLoadingCloud ? `Loading cloud${typeof cloudProgress === 'number' ? ` ${Math.round(cloudProgress * 100)}%` : ''}`
        : isSavingCloud || (storage.isCloudSyncing && storage.isCloudDirty) ? 'Saving to cloud'
        : storage.isCloudSyncing ? 'Checking cloud'
        : !isOnline && storage.isCloudDirty ? 'Saved locally'
        : !isOnline ? 'Cloud offline'
        : cloudStatus === 'error' ? 'Sync needs attention'
        : cloudStatus === 'not-synced' ? 'Waiting to sync'
        : cloudStatus === 'synced' ? 'Cloud up to date'
        : 'Cloud starting';

    const cloudTitle = !isAutoSyncEnabled ? 'Cloud sync is off. Your canvas is saved on this device.'
        : !configured ? 'Cloud disabled (env not configured)'
        : !user ? 'Sign in to connect & save to cloud'
        : isLoadingCloud ? 'Loading your canvas from the cloud...'
        : isSavingCloud || (storage.isCloudSyncing && storage.isCloudDirty) ? 'Saving your local changes to the cloud...'
        : storage.isCloudSyncing ? 'Checking whether the cloud copy changed...'
        : cloudStatus === 'error' ? `Cloud Sync Error: ${storage.cloudError}`
        : cloudStatus === 'not-synced' ? `Cloud Save: Unsynced changes exist! (Last saved: ${storage.cloudLastSaved || 'Never'})`
        // Clean, but nothing has been written this session — say so rather than
        // reporting a save that never happened.
        : cloudStatus === 'synced' && !storage.cloudLastSaved ? `Cloud Save: Up to date — loaded from cloud at ${storage.cloudLastLoaded}. Nothing new to save.`
        : cloudStatus === 'synced' ? `Cloud Save: Synced to cloud (Last saved: ${storage.cloudLastSaved})`
        : 'Cloud Sync Menu';

    const localClassName = `${styles.iconBtn} ` + (
        isConnecting ? styles.saving :
        localStatus === 'error' ? styles.error :
        localStatus === 'not-synced' ? styles.notSynced :
        localStatus === 'synced' ? styles.synced :
        styles.neverSaved
    );

    const cloudClassName = `${styles.iconBtn} ${styles.cloudStatusButton} ` + (
        cloudStatus === 'working' ? styles.saving :
        cloudStatus === 'error' ? styles.error :
        cloudStatus === 'not-synced' ? styles.notSynced :
        cloudStatus === 'synced' ? styles.synced :
        styles.neverSaved
    );

    return (
        <div className={styles.controls}>
            <button
                className={`${localClassName} ${styles.localButton}`}
                onClick={handleLocalClick}
                disabled={isConnecting}
                data-tooltip={localTitle}
                aria-label={localTitle}
            >
                {localIcon}
            </button>
            {storage.localError && (
                <div className={styles.saveError} role="alert">
                    <span>Device save failed.</span>
                    <button type="button" onClick={handleLocalClick}>Retry save</button>
                </div>
            )}

            <div className={styles.cloudStatusWrap}>
                <button
                    className={cloudClassName}
                    onClick={handleCloudClick}
                    disabled={isConnecting || !configured || isSavingCloud}
                    data-tooltip={cloudTitle}
                    aria-label={cloudTitle}
                >
                    <span className={styles.cloudStatusIcon} aria-hidden="true">{cloudIcon}</span>
                    <span className={styles.cloudStatusText} aria-hidden="true">{cloudLabel}</span>
                </button>
                <span className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
                    {cloudLabel}
                </span>
            </div>

            {user && FEATURES.notionImport && (
                <button
                    className={`${styles.iconBtn} ${styles.neverSaved}`}
                    onClick={() => setNotionModalOpen(true)}
                    disabled={isConnecting}
                    data-tooltip="Import from Notion"
                    aria-label="Import from Notion"
                >
                    <NotionIcon size={18} />
                </button>
            )}

            {user && FEATURES.collaboration && (
                <button
                    className={`${styles.iconBtn} ${styles.synced}`}
                    onClick={() => setShareModalOpen(true)}
                    disabled={isConnecting || !configured}
                    data-tooltip="Share canvas"
                    aria-label="Share canvas"
                >
                    <Users size={18} />
                </button>
            )}

            <CloudSyncModal 
                open={cloudModalOpen}
                onClose={() => setCloudModalOpen(false)}
                onSave={() => { void performCloudSave(false, true); setCloudModalOpen(false); }}
                onReload={() => { setLoadModalOpen(true); setCloudModalOpen(false); }}
                onRestoreBackup={handleRestoreBackup}
                hasCloudBackup={hasCloudBackup}
                isAutoSyncEnabled={isAutoSyncEnabled}
                onAutoSyncChange={(enabled) => {
                    setIsAutoSyncEnabled(enabled);
                    writeStorageMode(enabled ? 'sync' : 'local');
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

            {FEATURES.notionImport && (
                <NotionImportModal
                    open={notionModalOpen}
                    onClose={() => setNotionModalOpen(false)}
                />
            )}

            {FEATURES.collaboration && (
                <ShareWorkspaceModal
                    open={shareModalOpen}
                    onClose={() => setShareModalOpen(false)}
                />
            )}
        </div>
    );
};
