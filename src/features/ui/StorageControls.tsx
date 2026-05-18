import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FolderOpen, Check, Loader2, AlertCircle, Cloud } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectBackend, disconnectBackend, getActiveBackendKind } from '../../services/StorageManager';
import { saveCanvasToCloud } from '../../services/cloudSync';
import { useAuth } from '../auth/AuthProvider';
import { SignInPanel } from '../auth/SignInPanel';
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

    // Store setters for dynamic status
    const setLocalLastSaved = useStore(s => s.setLocalLastSaved);
    const setCloudLastSaved = useStore(s => s.setCloudLastSaved);
    const setLocalDirty = useStore(s => s.setLocalDirty);
    const setCloudDirty = useStore(s => s.setCloudDirty);
    const setLocalError = useStore(s => s.setLocalError);
    const setCloudError = useStore(s => s.setCloudError);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    const [showAuthPopover, setShowAuthPopover] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Close the popover when clicking outside.
    useEffect(() => {
        if (!showAuthPopover) return;
        const onDocClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowAuthPopover(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [showAuthPopover]);

    const activeKind = storage.isConnected ? getActiveBackendKind() : null;

    const runConnect = useCallback(async (kind: 'filesystem') => {
        setIsConnecting(true);
        if (setLocalError) setLocalError(null);
        try {
            // If currently connected to supabase (legacy), disconnect first.
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
        void runConnect('filesystem');
    }, [runConnect]);

    const handleCloudClick = useCallback(async () => {
        if (!configured) {
            if (setCloudError) setCloudError('Supabase is not configured. Check environmental variables.');
            return;
        }
        if (!user) {
            setShowAuthPopover(v => !v);
            return;
        }

        setIsSavingCloud(true);
        if (setCloudError) setCloudError(null);
        try {
            const { nodes, edges } = useStore.getState();
            const result = await saveCanvasToCloud(user.id, nodes, edges);
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
    }, [configured, user, setCloudLastSaved, setCloudDirty, setCloudError]);

    // Local folder button state
    const localConnected = storage.isConnected && activeKind === 'filesystem';
    const localStatus = 
        storage.localError ? 'error' :
        (!storage.isConnected || !storage.localLastSaved) ? 'never-saved' :
        storage.isLocalDirty ? 'not-synced' : 'synced';

    const localIcon = isConnecting ? <Loader2 size={18} className="animate-spin" />
        : localStatus === 'error' ? <AlertCircle size={18} />
        : localStatus === 'synced' ? <Check size={18} />
        : <FolderOpen size={18} />;

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

    const cloudIcon = (authLoading || isSavingCloud) ? <Loader2 size={18} className="animate-spin" />
        : cloudStatus === 'error' ? <AlertCircle size={18} />
        : cloudStatus === 'synced' ? <Check size={18} />
        : <Cloud size={18} />;

    const cloudTitle = !configured ? 'Cloud disabled (env not configured)'
        : !user ? 'Sign in to connect & save to cloud'
        : isSavingCloud ? 'Saving to cloud...'
        : cloudStatus === 'error' ? `Cloud Sync Error: ${storage.cloudError}`
        : cloudStatus === 'not-synced' ? `Cloud Save: Unsynced changes exist! Click to save (Last synced: ${storage.cloudLastSaved || 'Never'})`
        : cloudStatus === 'synced' ? `Cloud Save: Synced to cloud (Last synced: ${storage.cloudLastSaved})`
        : 'Never saved to cloud. Click to save snapshot.';

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
                title={localTitle}
            >
                {localIcon}
            </button>

            <button
                className={cloudClassName}
                onClick={handleCloudClick}
                disabled={isConnecting || !configured || isSavingCloud}
                title={cloudTitle}
            >
                {cloudIcon}
            </button>

            {showAuthPopover && (
                <div
                    ref={popoverRef}
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
        </div>
    );
};
