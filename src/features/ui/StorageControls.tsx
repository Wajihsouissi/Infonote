import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FolderOpen, Check, Loader2, AlertCircle, Cloud } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { connectBackend, disconnectBackend, getActiveBackendKind } from '../../services/StorageManager';
import { useAuth } from '../auth/AuthProvider';
import { SignInPanel } from '../auth/SignInPanel';
import styles from './StorageControls.module.css';

/**
 * Storage controls: two buttons now - local folder (existing) and cloud
 * (Supabase). Cloud requires a signed-in user; if not signed in, the button
 * opens a small sign-in popover.
 */
export const StorageControls: React.FC = () => {
    const storage = useStore(s => s.storage);
    const setStorageStatus = useStore(s => s.setStorageStatus);
    const loadGraph = useStore(s => s.loadGraph);
    const { user, configured, loading: authLoading } = useAuth();

    const [isConnecting, setIsConnecting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    const runConnect = useCallback(async (kind: 'filesystem' | 'supabase') => {
        setIsConnecting(true);
        setErrorMessage(null);
        try {
            // If currently connected to the other backend, disconnect first.
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
                setErrorMessage(result.error || 'Connection failed');
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIsConnecting(false);
        }
    }, [activeKind, loadGraph, setStorageStatus, storage.isConnected]);

    const handleLocalClick = useCallback(() => {
        void runConnect('filesystem');
    }, [runConnect]);

    const handleCloudClick = useCallback(() => {
        if (!configured) {
            setErrorMessage('Supabase is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
            return;
        }
        if (!user) {
            setShowAuthPopover(v => !v);
            return;
        }
        void runConnect('supabase');
    }, [configured, user, runConnect]);

    // Local folder button
    const localConnected = storage.isConnected && activeKind === 'filesystem';
    const localIcon = isConnecting && !showAuthPopover ? <Loader2 size={18} className="animate-spin" />
        : errorMessage && !localConnected ? <AlertCircle size={18} />
        : localConnected ? <Check size={18} />
        : <FolderOpen size={18} />;
    const localTitle = isConnecting ? 'Connecting...'
        : localConnected ? `Connected: ${storage.directoryName}${storage.lastSaved ? ' - Last saved: ' + storage.lastSaved : ''}`
        : 'Connect local folder';

    // Cloud button
    const cloudConnected = storage.isConnected && activeKind === 'supabase';
    const cloudIcon = authLoading ? <Loader2 size={18} className="animate-spin" />
        : cloudConnected ? <Check size={18} />
        : <Cloud size={18} />;
    const cloudTitle = !configured ? 'Cloud disabled (env not configured)'
        : !user ? 'Sign in to connect cloud'
        : cloudConnected ? `Connected: ${storage.directoryName}${storage.lastSaved ? ' - Last saved: ' + storage.lastSaved : ''}`
        : 'Connect cloud (Supabase)';

    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
            <button
                className={`${styles.iconBtn} ${storage.isSaving && localConnected ? styles.saving : ''} ${errorMessage && !localConnected ? styles.error : ''}`}
                onClick={handleLocalClick}
                disabled={isConnecting}
                title={localTitle}
                style={{
                    borderColor: localConnected ? 'var(--color-primary)' : undefined,
                    background: localConnected ? 'rgba(16, 185, 129, 0.05)' : undefined,
                    opacity: isConnecting ? 0.7 : 1,
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                }}
            >
                {localIcon}
            </button>

            <button
                className={`${styles.iconBtn} ${storage.isSaving && cloudConnected ? styles.saving : ''}`}
                onClick={handleCloudClick}
                disabled={isConnecting || !configured}
                title={cloudTitle}
                style={{
                    borderColor: cloudConnected ? 'var(--color-primary)' : undefined,
                    background: cloudConnected ? 'rgba(59, 130, 246, 0.05)' : undefined,
                    opacity: !configured ? 0.5 : 1,
                    cursor: !configured ? 'not-allowed' : 'pointer',
                }}
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
                            // Keep the popover open so the user sees the "check your email" message.
                        }}
                    />
                </div>
            )}

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
