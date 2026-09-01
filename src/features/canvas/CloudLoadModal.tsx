/**
 * CloudLoadModal — popup that lets the user inspect and load saved cloud
 * versions before it overwrites the canvas.
 *
 * On open it fetches the current cloud-copy metadata and lightweight version
 * history. Version bodies are downloaded only after the user chooses one.
 *
 * Confirm → calls `loadCanvasFromCloud` and pipes the result into
 * `loadGraph(nodes, edges)`. All data comes from real Supabase queries —
 * no mock, no fake delays.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    CloudDownload,
    Loader2,
    AlertCircle,
    RefreshCw,
} from '../../components/icons';
import {
    fetchCloudMetadata,
    fetchCloudVersions,
    loadCanvasFromCloud,
    loadCloudVersion,
    type CloudSnapshotMetadata,
    type CloudVersionSummary,
} from '../../services/cloudSync';
import { useStore } from '../../store/useStore';
import { History } from '../../components/icons';

type Status =
    | { kind: 'idle' }
    | { kind: 'fetching' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string };

interface CloudLoadModalProps {
    open: boolean;
    onClose: () => void;
    /** Called on successful load with counts so caller can flash a toast. */
    onLoaded?: (counts: { nodes: number; edges: number }) => void;
    hasCloudBackup?: boolean;
    onRestoreBackup?: () => void;
}

function formatTimestamp(iso: string | null): string {
    if (!iso) return 'Never saved';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleString();
}

export const CloudLoadModal: React.FC<CloudLoadModalProps> = ({
    open,
    onClose,
    onLoaded,
    hasCloudBackup,
    onRestoreBackup,
}) => {
    const userId = useStore((s) => s.auth.userId);
    const workspaceId = useStore((s) => s.auth.activeWorkspaceId);
    const loadGraph = useStore((s) => s.loadGraph);

    const [metadata, setMetadata] = useState<CloudSnapshotMetadata | null>(null);
    const [versions, setVersions] = useState<CloudVersionSummary[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    // Track open transitions for render-time state reset (avoids setState in effect)
    const [prevOpen, setPrevOpen] = useState(false);
    if (open && !prevOpen) {
        setPrevOpen(true);
        setMetadata(null);
        setVersions([]);
        setSelectedVersionId('current');
        setStatus({ kind: 'fetching' });
    }
    if (!open && prevOpen) {
        setPrevOpen(false);
    }

    const refresh = useCallback(async () => {
        setStatus({ kind: 'fetching' });
        const [metadataResult, versionsResult] = await Promise.all([
            fetchCloudMetadata(userId, workspaceId),
            fetchCloudVersions(userId, workspaceId),
        ]);
        if (!metadataResult.ok) {
            setStatus({ kind: 'error', message: metadataResult.error });
        } else if (!versionsResult.ok) {
            setStatus({ kind: 'error', message: versionsResult.error });
        } else {
            setMetadata(metadataResult.metadata);
            setVersions(versionsResult.versions);
            setStatus({ kind: 'idle' });
        }
    }, [userId, workspaceId]);

    // Fetch metadata each time the modal opens so the user always sees the
    // latest state of their cloud data.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void Promise.all([
            fetchCloudMetadata(userId, workspaceId),
            fetchCloudVersions(userId, workspaceId),
        ]).then(([metadataResult, versionsResult]) => {
            if (cancelled) return;
            if (!metadataResult.ok) {
                setStatus({ kind: 'error', message: metadataResult.error });
            } else if (!versionsResult.ok) {
                setStatus({ kind: 'error', message: versionsResult.error });
            } else {
                setMetadata(metadataResult.metadata);
                setVersions(versionsResult.versions);
                setStatus({ kind: 'idle' });
            }
        });
        return () => { cancelled = true; };
    }, [open, userId, workspaceId]);

    // Close on Escape — standard modal UX.
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onClose]);

    const handleRestore = useCallback(async () => {
        // Backup current canvas so the user can undo via the existing
        // "Restore Backup" button in CloudSyncControls.
        try {
            const current = useStore.getState();
            const backup = {
                nodes: current.nodes,
                edges: current.edges,
                timestamp: Date.now(),
            };
            localStorage.setItem(
                'chnk-it-cloud-reload-backup',
                JSON.stringify(backup),
            );
        } catch {
            // best-effort
        }

        setStatus({ kind: 'loading' });
        const res = selectedVersionId === 'current'
            ? await loadCanvasFromCloud(userId, workspaceId)
            : await loadCloudVersion(userId, workspaceId, selectedVersionId);
        if (res.ok) {
            // Validate returned nodes: must have id (non-empty string),
            // position with numeric x and y, and type (string).
            const validNodes = res.nodes.filter((n) => {
                if (!n || typeof n !== 'object') return false;
                if (!n.id || typeof n.id !== 'string' || n.id.trim() === '') {
                    console.warn('[CloudLoad] Filtering out node with invalid id');
                    return false;
                }
                if (
                    !n.position ||
                    typeof n.position.x !== 'number' ||
                    typeof n.position.y !== 'number' ||
                    Number.isNaN(n.position.x) ||
                    Number.isNaN(n.position.y)
                ) {
                    console.warn(`[CloudLoad] Filtering out node ${n.id}: invalid position`);
                    return false;
                }
                if (!n.type || typeof n.type !== 'string') {
                    console.warn('[CloudLoad] Filtering out node: invalid type');
                    return false;
                }
                return true;
            });

            // Validate edges: must have id, source, target — all non-empty strings.
            const validEdges = res.edges.filter((e) => {
                if (!e || typeof e !== 'object') return false;
                if (!e.id || typeof e.id !== 'string' || e.id.trim() === '') {
                    console.warn('[CloudLoad] Filtering out edge with invalid id');
                    return false;
                }
                if (!e.source || typeof e.source !== 'string' || e.source.trim() === '') {
                    console.warn(`[CloudLoad] Filtering out edge ${e.id}: invalid source`);
                    return false;
                }
                if (!e.target || typeof e.target !== 'string' || e.target.trim() === '') {
                    console.warn(`[CloudLoad] Filtering out edge ${e.id}: invalid target`);
                    return false;
                }
                return true;
            });

            if (validNodes.length === 0) {
                setStatus({
                    kind: 'error',
                    message: 'No valid saved data found.',
                });
                return;
            }
            loadGraph(validNodes, validEdges);
            onLoaded?.({ nodes: validNodes.length, edges: validEdges.length });
            setStatus({ kind: 'idle' });
            onClose();
        } else {
            setStatus({ kind: 'error', message: res.error });
        }
    }, [userId, workspaceId, selectedVersionId, loadGraph, onLoaded, onClose]);

    if (!open) return null;

    const fetching = status.kind === 'fetching';
    const loadingFromCloud = status.kind === 'loading';
    const busy = fetching || loadingFromCloud;
    const currentIsEmpty = Boolean(metadata && metadata.nodeCount === 0 && metadata.edgeCount === 0);
    const selectedVersion = versions.find((version) => version.id === selectedVersionId);

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="Restore a cloud version">
            <div style={modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={iconBadge}>
                            <CloudDownload size={20} />
                        </div>
                        <div>
                            <h2 style={title}>Restore a version</h2>
                            <p style={subtitle}>
                                Choose a restore point. Your current canvas is backed up first.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={closeBtn}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={body}>
                    {fetching && (
                        <div style={centerState}>
                            <Loader2 size={28} className="animate-spin" />
                            <span style={muted}>Fetching your saved data…</span>
                        </div>
                    )}

                    {status.kind === 'error' && (
                        <div style={{ ...centerState, color: 'var(--danger)' }}>
                            <AlertCircle size={24} />
                            <span>{status.message}</span>
                            <button type="button" onClick={refresh} style={btnSecondary}>
                                <RefreshCw size={14} />
                                <span>Try again</span>
                            </button>
                        </div>
                    )}

                    {!fetching && status.kind !== 'error' && metadata && (
                        <>
                            <div style={restoreNotice}>
                                <History size={16} aria-hidden="true" />
                                <span>Restore only changes this device. You can undo it with the local backup.</span>
                            </div>

                            <h3 style={listHeader}>Current cloud copy</h3>
                            <button
                                type="button"
                                onClick={() => setSelectedVersionId('current')}
                                style={{ ...versionRow, ...(selectedVersionId === 'current' ? versionRowSelected : {}) }}
                                aria-pressed={selectedVersionId === 'current'}
                            >
                                <div style={versionIcon}><CloudDownload size={17} /></div>
                                <div style={versionContent}>
                                    <div style={versionTitle}>Current cloud copy <span style={versionBadge}>Latest</span></div>
                                    <div style={versionMeta}>
                                        {currentIsEmpty ? 'Empty canvas' : `${metadata.nodeCount} notes · ${metadata.edgeCount} connections`} · {formatTimestamp(metadata.lastUpdated)}
                                    </div>
                                </div>
                            </button>

                            <h3 style={listHeader}>Version history</h3>
                            {versions.length === 0 ? (
                                <div style={emptyState}>
                                    <History size={28} style={{ opacity: 0.55 }} />
                                    <p style={muted}>
                                        No restore points yet. Use “Save version” to mark a milestone; a daily safety copy is also kept while you work.
                                    </p>
                                </div>
                            ) : (
                                <div style={versionList}>
                                    {versions.map((version) => (
                                        <button
                                            key={version.id}
                                            type="button"
                                            onClick={() => setSelectedVersionId(version.id)}
                                            style={{ ...versionRow, ...(selectedVersionId === version.id ? versionRowSelected : {}) }}
                                            aria-pressed={selectedVersionId === version.id}
                                        >
                                            <div style={versionIcon}><History size={17} /></div>
                                            <div style={versionContent}>
                                                <div style={versionTitle}>
                                                    {version.label || (version.kind === 'manual' ? 'Saved version' : 'Daily safety copy')}
                                                    <span style={versionBadge}>{version.kind === 'manual' ? 'Manual' : 'Daily'}</span>
                                                </div>
                                                <div style={versionMeta}>
                                                    {version.nodeCount} notes · {version.edgeCount} connections · {formatTimestamp(version.createdAt)}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer actions */}
                <div style={footer}>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={busy}
                        style={btnSecondary}
                    >
                        <RefreshCw size={14} />
                        <span>Refresh</span>
                    </button>
                    <div style={{ flex: 1 }} />
                    
                    {hasCloudBackup && onRestoreBackup && (
                        <button 
                            type="button" 
                            onClick={onRestoreBackup} 
                            style={{ ...btnGhost, color: 'var(--warn)', border: '1px solid rgba(var(--warn-rgb), 0.25)', marginRight: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <History size={14} />
                            <span>Restore Backup</span>
                        </button>
                    )}

                    <button type="button" onClick={onClose} style={btnGhost}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleRestore}
                        disabled={busy || !metadata || (selectedVersionId === 'current' && currentIsEmpty)}
                        style={btnPrimary}
                    >
                        {loadingFromCloud ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <CloudDownload size={14} />
                        )}
                        <span>{loadingFromCloud ? 'Restoring…' : selectedVersion ? 'Restore version' : 'Restore current copy'}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

// ───── Inline styles (Paper & Ink tokens — theme-aware, no glass) ─────
const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    // plain scrim, no blur
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
    fontFamily: 'var(--font-sans)',
};

const modal: React.CSSProperties = {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    background: 'var(--bg-rail)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-panel)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--text-main)',
    overflow: 'hidden',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid var(--line)',
};

const title: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: 'var(--text-main)',
};

const subtitle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-faint)',
    margin: '2px 0 0',
};

const iconBadge: React.CSSProperties = {
    width: 38,
    height: 38,
    background: 'var(--accent)',
    borderRadius: 'var(--r-control)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--on-accent)',
};

const closeBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--btn-ghost-fg)',
    width: 32,
    height: 32,
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const body: React.CSSProperties = {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
};

const centerState: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '40px 0',
    textAlign: 'center',
};

const muted: React.CSSProperties = {
    color: 'var(--text-soft)',
    fontSize: 13,
    maxWidth: 360,
};

const listHeader: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-faint)',
    margin: '8px 0 12px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
};

const restoreNotice: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 12px',
    marginBottom: 20,
    background: 'var(--bg-inset)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-control)',
    color: 'var(--text-soft)',
    fontSize: 12,
    lineHeight: 1.45,
};

const versionList: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const versionRow: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-control)',
    color: 'var(--text-main)',
    cursor: 'pointer',
    textAlign: 'left',
};

const versionRowSelected: React.CSSProperties = {
    borderColor: 'var(--accent)',
    background: 'var(--accent-dim)',
};

const versionIcon: React.CSSProperties = {
    width: 32,
    height: 32,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-inset)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--btn-radius)',
    color: 'var(--accent-ink)',
};

const versionContent: React.CSSProperties = {
    minWidth: 0,
    flex: 1,
};

const versionTitle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 650,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const versionBadge: React.CSSProperties = {
    padding: '2px 6px',
    border: '1px solid var(--line)',
    borderRadius: 6,
    color: 'var(--text-soft)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
};

const versionMeta: React.CSSProperties = {
    marginTop: 3,
    color: 'var(--text-faint)',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const emptyState: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '32px 20px',
    textAlign: 'center',
    background: 'var(--bg-inset)',
    border: '1px dashed var(--line)',
    borderRadius: 'var(--r-md)',
};

const footer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 20px',
    borderTop: '1px solid var(--line)',
    background: 'var(--bg-rail)',
};

const btnGhost: React.CSSProperties = {
    padding: '8px 14px',
    background: 'transparent',
    color: 'var(--btn-ghost-fg)',
    border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
};

const btnSecondary: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'var(--btn-secondary-bg)',
    color: 'var(--btn-secondary-fg)',
    border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 16px',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-fg)',
    border: 'none',
    borderRadius: 'var(--btn-radius)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
};
