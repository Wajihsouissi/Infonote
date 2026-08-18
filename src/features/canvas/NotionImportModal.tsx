import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    CheckCircle2,
    Database,
    ExternalLink,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    UploadCloud,
    X,
    Link as LinkIcon
} from '../../components/icons';
import {
    connectNotion,
    extractNotionId,
    getConnectedNotionAccessToken,
    importNotionDatabase,
    importNotionPage,
    searchNotionWorkspace,
    type NotionSearchItem,
} from '../../services/notion/notionImport';
import { useStore } from '../../store/useStore';

type Status =
    | { kind: 'idle' }
    | { kind: 'connecting' }
    | { kind: 'searching' }
    | { kind: 'importing' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string };

interface NotionImportModalProps {
    open: boolean;
    onClose: () => void;
}

export const NotionImportModal: React.FC<NotionImportModalProps> = ({ open, onClose }) => {
    const userId = useStore((s) => s.auth.userId);
    const workspaceId = useStore((s) => s.auth.activeWorkspaceId);
    const currentParentId = useStore((s) => s.currentParentId);
    const setNodes = useStore((s) => s.setNodes);
    const navigateToNode = useStore((s) => s.navigateToNode);

    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [manualTarget, setManualTarget] = useState('');
    const [items, setItems] = useState<NotionSearchItem[]>([]);
    const [selected, setSelected] = useState<NotionSearchItem | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    const busy = status.kind === 'connecting' || status.kind === 'searching' || status.kind === 'importing';
    const isManualTarget = extractNotionId(manualTarget) !== null;
    const selectedId = selected?.id ?? extractNotionId(manualTarget);
    const selectedKind = selected?.kind ?? 'page';

    const canImport = Boolean(accessToken && userId && workspaceId && selectedId && !busy);

    const refreshToken = useCallback(async () => {
        const token = await getConnectedNotionAccessToken();
        setAccessToken(token);
        return token;
    }, []);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            setItems([]);
            setSelected(null);
            setStatus({ kind: 'idle' });
            setManualTarget('');
            setQuery('');
        }, 0);

        return () => window.clearTimeout(timer);
    }, [open]);

    const runSearch = useCallback(async (tokenOverride?: string | null) => {
        const token = tokenOverride ?? accessToken;
        if (!token) return;

        setStatus({ kind: 'searching' });
        const result = await searchNotionWorkspace({
            accessToken: token,
            query,
        });

        if (result.ok) {
            setItems(result.items);
            if (!manualTarget && !selected) {
                setSelected(result.items[0] ?? null);
            }
            setStatus({ kind: 'idle' });
        } else {
            setStatus({ kind: 'error', message: result.error });
        }
    }, [accessToken, query, manualTarget, selected]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            refreshToken().then((token) => {
                if (cancelled || !token) return;
                void runSearch(token);
            });
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, refreshToken, runSearch]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busy) onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onClose, busy]);

    const handleConnect = useCallback(async () => {
        setStatus({ kind: 'connecting' });
        const result = await connectNotion();
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
        }
    }, []);

    const handleSearchSubmit = useCallback((event: React.FormEvent) => {
        event.preventDefault();
        void runSearch();
    }, [runSearch]);

    const handleImport = useCallback(async () => {
        if (!accessToken) {
            setStatus({ kind: 'error', message: 'Connect Notion before importing workspace content.' });
            return;
        }
        if (!userId || !workspaceId) {
            setStatus({ kind: 'error', message: 'Sign in before importing Notion content into cloud canvas.' });
            return;
        }
        if (!selectedId) {
            setStatus({ kind: 'error', message: 'Select a Notion item or paste a page/database URL.' });
            return;
        }

        setStatus({ kind: 'importing' });

        try {
            const importFn = selectedKind === 'database' ? importNotionDatabase : importNotionPage;
            const result = await importFn(selectedId, {
                accessToken,
                userId,
                workspaceId,
                parentId: currentParentId,
            });

            if (!result.ok) {
                setStatus({ kind: 'error', message: result.error });
                return;
            }

            setNodes((currentNodes) => {
                const ids = new Set(currentNodes.map((node) => node.id));
                const freshNodes = result.nodes.filter((node) => !ids.has(node.id));
                return [...currentNodes, ...freshNodes];
            });

            setStatus({
                kind: 'success',
                message: `Import successful. Opening...`,
            });

            // Brief pause to show 100% success before navigating
            setTimeout(() => {
                onClose();
                if (result.nodes.length > 0) {
                    navigateToNode(result.nodes[0].id);
                }
            }, 600);

        } catch {
            setStatus({ kind: 'error', message: 'An unexpected error occurred during import.' });
        }
    }, [accessToken, currentParentId, selectedId, selectedKind, setNodes, userId, workspaceId, navigateToNode, onClose]);

    if (!open) return null;

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="Import Notion workspace">
            <div style={modal}>
                {/* Ambient glows */}

                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBadge}>
                            <UploadCloud size={22} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 style={title}>Import from Notion</h2>
                            <p style={subtitle}>Bring pages or databases directly into your canvas</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={iconButton} aria-label="Close" disabled={busy}>
                        <X size={18} />
                    </button>
                </div>

                <div style={body}>
                    {!accessToken && (
                        <div style={emptyState}>
                            <div style={mutedIcon}>
                                <UploadCloud size={32} strokeWidth={1.5} />
                            </div>
                            <h3 style={emptyTitle}>Connect your workspace</h3>
                            <p style={emptyCopy}>
                                Link your Notion account to browse and import shared pages instantly.
                            </p>
                            <button type="button" onClick={handleConnect} disabled={busy} style={primaryButton}>
                                {status.kind === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                <span>Connect Notion</span>
                            </button>
                        </div>
                    )}

                    {accessToken && (
                        <>
                            <form onSubmit={handleSearchSubmit} style={searchContainer}>
                                <Search size={18} style={searchIcon} />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search shared Notion pages and databases..."
                                    disabled={busy}
                                    style={searchInput}
                                />
                                {query && status.kind !== 'searching' && (
                                    <button type="submit" style={searchActionBtn} disabled={busy}>
                                        <RefreshCw size={14} />
                                    </button>
                                )}
                                {status.kind === 'searching' && (
                                    <div style={searchActionSpinner}>
                                        <Loader2 size={16} className="animate-spin" />
                                    </div>
                                )}
                            </form>

                            <div style={listContainer}>
                                {items.map((item) => (
                                    <button
                                        type="button"
                                        key={item.id}
                                        onClick={() => {
                                            setSelected(item);
                                            setManualTarget('');
                                        }}
                                        style={{
                                            ...resultRow,
                                            ...(selected?.id === item.id ? resultRowActive : {}),
                                        }}
                                    >
                                        <div style={{...itemIcon, ...(selected?.id === item.id ? itemIconActive : {})}}>
                                            {item.kind === 'database' ? <Database size={18} /> : <FileText size={18} />}
                                        </div>
                                        <div style={itemDetails}>
                                            <div style={itemTitle}>{item.title}</div>
                                            <div style={itemMeta}>
                                                {item.kind === 'database' ? 'Database' : 'Page'}
                                                {item.lastEditedTime ? ` • Edited ${new Date(item.lastEditedTime).toLocaleDateString()}` : ''}
                                            </div>
                                        </div>
                                        {item.url && <ExternalLink size={14} style={itemLinkIcon} />}
                                        {selected?.id === item.id && (
                                            <div style={selectedIndicator}><CheckCircle2 size={16} /></div>
                                        )}
                                    </button>
                                ))}

                                {items.length === 0 && status.kind !== 'searching' && (
                                    <div style={compactEmpty}>
                                        <div style={{opacity: 0.5, marginBottom: 8}}><Search size={24} /></div>
                                        No shared pages found matching your search.
                                    </div>
                                )}
                            </div>

                            <div style={manualEntryContainer}>
                                <div style={manualInputWrapper}>
                                    <LinkIcon size={16} style={manualInputIcon} />
                                    <input
                                        value={manualTarget}
                                        onChange={(event) => {
                                            setManualTarget(event.target.value);
                                            setSelected(null);
                                        }}
                                        placeholder="Or paste a Notion URL to import directly"
                                        disabled={busy}
                                        style={manualInput}
                                    />
                                    {isManualTarget && (
                                        <div style={manualValidBadge}>
                                            <CheckCircle2 size={14} /> Link Valid
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {status.kind === 'error' && (
                        <div style={errorBox}>
                            <AlertCircle size={18} />
                            <span>{status.message}</span>
                        </div>
                    )}

                    {status.kind === 'success' && (
                        <div style={successBox}>
                            <CheckCircle2 size={18} />
                            <span>{status.message}</span>
                        </div>
                    )}
                </div>

                <div style={footer}>
                    {status.kind === 'importing' ? (
                        <div style={progressContainer}>
                            <div style={progressHeader}>
                                <div style={progressLabel}>
                                    <Loader2 size={16} className="animate-spin" /> 
                                    Importing Notion content...
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={footerActions}>
                            <button type="button" onClick={onClose} style={ghostButton} disabled={busy}>
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                onClick={handleImport} 
                                disabled={!canImport} 
                                style={{
                                    ...primaryButton,
                                    ...(!canImport ? primaryButtonDisabled : {})
                                }}
                            >
                                <UploadCloud size={16} />
                                <span>Import into canvas</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

// --- STYLES ---

/* Paper & Ink. This modal was cosmic-glass and used GREEN as a second brand
   hue throughout; persimmon is the single accent, so selection/primary states
   are accent now. Green survives only where it means "success". */

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    // plain scrim, no blur
    background: 'rgba(0, 0, 0, 0.5)',
};

const modal: React.CSSProperties = {
    width: 'min(640px, 100%)',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 'var(--r-panel)',
    border: '1px solid var(--line)',
    background: 'var(--bg-rail)',
    color: 'var(--text-main)',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: 'var(--font-sans)',
    position: 'relative',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 28px',
    borderBottom: '1px solid var(--line)',
    zIndex: 1,
};

const iconBadge: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 'var(--r-md)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-dim)',
    color: 'var(--accent-ink)',
    border: '1px solid rgba(var(--accent-rgb), 0.25)',
};

const title: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--text-main)',
};

const subtitle: React.CSSProperties = {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'var(--text-soft)',
    fontWeight: 400,
};

const iconButton: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--btn-radius)',
    border: 'none',
    background: 'transparent',
    color: 'var(--btn-ghost-fg)',
    cursor: 'pointer',
    transition: 'background var(--transition-fast), color var(--transition-fast)',
};

const body: React.CSSProperties = {
    padding: '24px 28px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    zIndex: 1,
};

const searchContainer: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--r-md)',
    transition: 'border-color var(--transition-fast)',
};

const searchIcon: React.CSSProperties = {
    position: 'absolute',
    left: 16,
    color: 'var(--text-faint)',
    pointerEvents: 'none',
};

const searchInput: React.CSSProperties = {
    width: '100%',
    height: 52,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '0 48px',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 500,
};

const searchActionBtn: React.CSSProperties = {
    position: 'absolute',
    right: 12,
    background: 'var(--hover-wash)',
    border: 'none',
    borderRadius: 'var(--r-xs)',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-soft)',
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
};

const searchActionSpinner: React.CSSProperties = {
    position: 'absolute',
    right: 18,
    color: 'var(--text-faint)',
};

const listContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 280,
    overflowY: 'auto',
    paddingRight: 4,
};

const resultRow: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px',
    borderRadius: 'var(--r-md)',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-main)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background var(--transition-fast), border-color var(--transition-fast)',
};

const resultRowActive: React.CSSProperties = {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
};

const itemIcon: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 'var(--btn-radius)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--hover-wash)',
    color: 'var(--text-soft)',
    flexShrink: 0,
    transition: 'background var(--transition-fast), color var(--transition-fast)',
};

const itemIconActive: React.CSSProperties = {
    background: 'var(--accent-wash)',
    color: 'var(--accent-ink)',
};

const itemDetails: React.CSSProperties = {
    minWidth: 0,
    flex: 1,
};

const itemTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-main)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const itemMeta: React.CSSProperties = {
    marginTop: 3,
    fontSize: 12,
    color: 'var(--text-faint)',
    fontWeight: 500,
};

const itemLinkIcon: React.CSSProperties = {
    color: 'var(--text-faint)',
};

const selectedIndicator: React.CSSProperties = {
    color: 'var(--accent-ink)',
    display: 'flex',
    alignItems: 'center',
    marginLeft: 8,
};

const compactEmpty: React.CSSProperties = {
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-faint)',
    fontSize: 14,
    textAlign: 'center',
    background: 'var(--bg-inset)',
    borderRadius: 'var(--r-md)',
    border: '1px dashed var(--line)',
};

const manualEntryContainer: React.CSSProperties = {
    marginTop: 8,
};

const manualInputWrapper: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
};

const manualInputIcon: React.CSSProperties = {
    position: 'absolute',
    left: 14,
    color: 'var(--text-faint)',
    pointerEvents: 'none',
};

const manualInput: React.CSSProperties = {
    width: '100%',
    height: 44,
    boxSizing: 'border-box',
    borderRadius: 'var(--input-radius)',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-main)',
    padding: '0 100px 0 42px',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: 13,
    transition: 'border-color var(--transition-fast)',
};

const manualValidBadge: React.CSSProperties = {
    position: 'absolute',
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    // genuinely a validity signal — stays green
    color: 'var(--ok)',
    background: 'rgba(var(--ok-rgb), 0.14)',
    padding: '4px 8px',
    borderRadius: 'var(--r-xs)',
};

const emptyState: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
};

const mutedIcon: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 'var(--r-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--hover-wash)',
    color: 'var(--text-faint)',
    marginBottom: 20,
    border: '1px solid var(--line)',
};

const emptyTitle: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-main)',
};

const emptyCopy: React.CSSProperties = {
    margin: '8px 0 24px',
    color: 'var(--text-soft)',
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: 320,
};

const errorBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 'var(--r-control)',
    background: 'rgba(var(--danger-rgb), 0.10)',
    border: '1px solid rgba(var(--danger-rgb), 0.20)',
    color: 'var(--danger)',
    fontSize: 14,
    fontWeight: 500,
};

const successBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 'var(--r-control)',
    background: 'rgba(var(--ok-rgb), 0.10)',
    border: '1px solid rgba(var(--ok-rgb), 0.20)',
    color: 'var(--ok)',
    fontSize: 14,
    fontWeight: 500,
};

const footer: React.CSSProperties = {
    padding: '20px 28px',
    borderTop: '1px solid var(--line)',
    background: 'var(--bg-rail)',
    zIndex: 1,
};

const footerActions: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
};

const ghostButton: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: 'var(--btn-radius)',
    border: 'none',
    background: 'transparent',
    color: 'var(--btn-ghost-fg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    transition: 'background var(--transition-fast), color var(--transition-fast)',
};

const primaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 20px',
    borderRadius: 'var(--btn-radius)',
    border: 'none',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-fg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    transition: 'background var(--transition-fast)',
};

const primaryButtonDisabled: React.CSSProperties = {
    background: 'var(--active-wash)',
    color: 'var(--text-faint)',
    cursor: 'not-allowed',
};

// --- Progress Bar Styles ---

const progressContainer: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '4px 0',
};

const progressHeader: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const progressLabel: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--accent-ink)',
};
