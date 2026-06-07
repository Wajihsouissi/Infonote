import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
    connectNotion,
    extractNotionId,
    getConnectedNotionAccessToken,
    importNotionDatabase,
    importNotionPage,
    searchNotionWorkspace,
    type NotionSearchItem,
    type NotionSourceKind,
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
    const [prevOpen, setPrevOpen] = useState(false);
    const [progress, setProgress] = useState(0);

    if (open && !prevOpen) {
        setPrevOpen(true);
        setItems([]);
        setSelected(null);
        setStatus({ kind: 'idle' });
        setProgress(0);
        setManualTarget('');
        setQuery('');
    }
    if (!open && prevOpen) {
        setPrevOpen(false);
    }

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
        setProgress(0);

        const progressInterval = setInterval(() => {
            setProgress((p) => {
                if (p >= 95) return p;
                return p + Math.floor(Math.random() * 5) + 1;
            });
        }, 250);

        try {
            const importFn = selectedKind === 'database' ? importNotionDatabase : importNotionPage;
            const result = await importFn(selectedId, {
                accessToken,
                userId,
                workspaceId,
                parentId: currentParentId,
            });

            clearInterval(progressInterval);
            setProgress(100);

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

        } catch (err) {
            clearInterval(progressInterval);
            setStatus({ kind: 'error', message: 'An unexpected error occurred during import.' });
        }
    }, [accessToken, currentParentId, selectedId, selectedKind, setNodes, userId, workspaceId, navigateToNode, onClose]);

    if (!open) return null;

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="Import Notion workspace">
            <div style={modal}>
                {/* Ambient glows */}
                <div style={ambientGlowLeft} />
                <div style={ambientGlowRight} />

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
                                    Importing...
                                </div>
                                <div style={progressValue}>{progress}%</div>
                            </div>
                            <div style={progressBarBg}>
                                <div style={{...progressBarFill, width: `${progress}%`}} />
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

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(5, 6, 12, 0.75)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
};

const modal: React.CSSProperties = {
    width: 'min(640px, 100%)',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(12, 14, 21, 0.85)', // Deep dark, highly translucent
    backdropFilter: 'blur(40px)',
    color: '#fff',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 32px 90px rgba(0,0,0,0.6)',
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
    position: 'relative',
};

// Ambient subtle glows to give that premium glassmorphism feel
const ambientGlowLeft: React.CSSProperties = {
    position: 'absolute',
    top: '-20%',
    left: '-10%',
    width: '60%',
    height: '60%',
    background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, rgba(0,0,0,0) 70%)',
    pointerEvents: 'none',
    zIndex: -1,
};

const ambientGlowRight: React.CSSProperties = {
    position: 'absolute',
    bottom: '-10%',
    right: '-10%',
    width: '60%',
    height: '50%',
    background: 'radial-gradient(circle, rgba(14, 165, 233, 0.1) 0%, rgba(0,0,0,0) 70%)',
    pointerEvents: 'none',
    zIndex: -1,
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 28px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    zIndex: 1,
};

const iconBadge: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(14, 165, 233, 0.1))',
    color: '#4ade80',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
};

const title: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#ffffff',
};

const subtitle: React.CSSProperties = {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 400,
};

const iconButton: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    transition: 'all 0.2s ease',
};

const searchIcon: React.CSSProperties = {
    position: 'absolute',
    left: 16,
    color: 'rgba(255,255,255,0.4)',
    pointerEvents: 'none',
};

const searchInput: React.CSSProperties = {
    width: '100%',
    height: 52,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '0 48px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 500,
};

const searchActionBtn: React.CSSProperties = {
    position: 'absolute',
    right: 12,
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 6,
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    transition: 'background 0.2s',
};

const searchActionSpinner: React.CSSProperties = {
    position: 'absolute',
    right: 18,
    color: 'rgba(255,255,255,0.5)',
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
    borderRadius: 12,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
};

const resultRowActive: React.CSSProperties = {
    background: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    boxShadow: 'inset 0 0 0 1px rgba(34, 197, 94, 0.1)',
};

const itemIcon: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    flexShrink: 0,
    transition: 'all 0.2s',
};

const itemIconActive: React.CSSProperties = {
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
};

const itemDetails: React.CSSProperties = {
    minWidth: 0,
    flex: 1,
};

const itemTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const itemMeta: React.CSSProperties = {
    marginTop: 3,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 500,
};

const itemLinkIcon: React.CSSProperties = {
    opacity: 0.3,
    color: '#fff',
};

const selectedIndicator: React.CSSProperties = {
    color: '#4ade80',
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
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    background: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    border: '1px dashed rgba(255,255,255,0.08)',
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
    color: 'rgba(255,255,255,0.3)',
    pointerEvents: 'none',
};

const manualInput: React.CSSProperties = {
    width: '100%',
    height: 44,
    boxSizing: 'border-box',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: '#fff',
    padding: '0 100px 0 42px',
    outline: 'none',
    fontSize: 13,
    transition: 'all 0.2s',
};

const manualValidBadge: React.CSSProperties = {
    position: 'absolute',
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: '#4ade80',
    background: 'rgba(34, 197, 94, 0.15)',
    padding: '4px 8px',
    borderRadius: 6,
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
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 20,
    border: '1px solid rgba(255,255,255,0.05)',
};

const emptyTitle: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
};

const emptyCopy: React.CSSProperties = {
    margin: '8px 0 24px',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: 320,
};

const errorBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    fontSize: 14,
    fontWeight: 500,
};

const successBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    color: '#4ade80',
    fontSize: 14,
    fontWeight: 500,
};

const footer: React.CSSProperties = {
    padding: '20px 28px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.2)',
    zIndex: 1,
};

const footerActions: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
};

const ghostButton: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
};

const primaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#22c55e',
    color: '#000',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.3)',
    transition: 'all 0.2s',
};

const primaryButtonDisabled: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.3)',
    boxShadow: 'none',
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
    color: '#4ade80',
};

const progressValue: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
};

const progressBarBg: React.CSSProperties = {
    width: '100%',
    height: 6,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
};

const progressBarFill: React.CSSProperties = {
    height: '100%',
    background: '#22c55e',
    borderRadius: 3,
    transition: 'width 0.3s ease-out',
    boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)',
};

export default NotionImportModal;
