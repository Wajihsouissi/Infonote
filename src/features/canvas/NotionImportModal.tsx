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

    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [manualTarget, setManualTarget] = useState('');
    const [manualKind, setManualKind] = useState<NotionSourceKind>('page');
    const [items, setItems] = useState<NotionSearchItem[]>([]);
    const [selected, setSelected] = useState<NotionSearchItem | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [prevOpen, setPrevOpen] = useState(false);

    if (open && !prevOpen) {
        setPrevOpen(true);
        setItems([]);
        setSelected(null);
        setStatus({ kind: 'idle' });
    }
    if (!open && prevOpen) {
        setPrevOpen(false);
    }

    const busy = status.kind === 'connecting' || status.kind === 'searching' || status.kind === 'importing';
    const selectedKind = selected?.kind ?? manualKind;
    const selectedId = selected?.id ?? extractNotionId(manualTarget);

    const canImport = Boolean(accessToken && userId && workspaceId && selectedId && !busy);

    const statusText = useMemo(() => {
        if (status.kind === 'connecting') return 'Connecting Notion...';
        if (status.kind === 'searching') return 'Searching Notion workspace...';
        if (status.kind === 'importing') return 'Importing into canvas...';
        return null;
    }, [status]);

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
            setSelected((current) =>
                current && result.items.some((item) => item.id === current.id) ? current : result.items[0] ?? null,
            );
            setStatus({ kind: 'idle' });
        } else {
            setStatus({ kind: 'error', message: result.error });
        }
    }, [accessToken, query]);

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
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onClose]);

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
            message: `Imported ${result.imported} card${result.imported === 1 ? '' : 's'} from Notion${
                result.skipped ? `; skipped ${result.skipped} unsupported block${result.skipped === 1 ? '' : 's'}` : ''
            }.`,
        });
    }, [accessToken, currentParentId, selectedId, selectedKind, setNodes, userId, workspaceId]);

    if (!open) return null;

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="Import Notion workspace">
            <div style={modal}>
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={iconBadge}>
                            <UploadCloud size={20} />
                        </div>
                        <div>
                            <h2 style={title}>Import from Notion</h2>
                            <p style={subtitle}>Bring connected pages or databases into this canvas.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={iconButton} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div style={body}>
                    {!accessToken && (
                        <div style={emptyState}>
                            <div style={mutedIcon}>
                                <UploadCloud size={26} />
                            </div>
                            <div>
                                <h3 style={emptyTitle}>Connect Notion first</h3>
                                <p style={emptyCopy}>
                                    Your Notion OAuth token was not found on the active Supabase session. Connect Notion,
                                    choose the pages to share, then return here to import.
                                </p>
                            </div>
                            <button type="button" onClick={handleConnect} disabled={busy} style={primaryButton}>
                                {status.kind === 'connecting' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                                <span>Connect Notion</span>
                            </button>
                        </div>
                    )}

                    {accessToken && (
                        <>
                            <form onSubmit={handleSearchSubmit} style={searchRow}>
                                <div style={searchBox}>
                                    <Search size={15} />
                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Search shared Notion pages and databases"
                                        disabled={busy}
                                        style={searchInput}
                                    />
                                </div>
                                <button type="submit" disabled={busy} style={secondaryButton}>
                                    {status.kind === 'searching' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                                    <span>Search</span>
                                </button>
                            </form>

                            <div style={list}>
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
                                        <div style={itemIcon}>
                                            {item.kind === 'database' ? <Database size={17} /> : <FileText size={17} />}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={itemTitle}>{item.title}</div>
                                            <div style={itemMeta}>
                                                {item.kind === 'database' ? 'Database' : 'Page'}
                                                {item.lastEditedTime ? ` · edited ${new Date(item.lastEditedTime).toLocaleDateString()}` : ''}
                                            </div>
                                        </div>
                                        {item.url && <ExternalLink size={14} style={{ opacity: 0.45 }} />}
                                    </button>
                                ))}

                                {items.length === 0 && status.kind !== 'searching' && (
                                    <div style={compactEmpty}>No shared Notion pages found. Paste a Notion URL below.</div>
                                )}
                            </div>

                            <div style={manualPanel}>
                                <div style={manualHeader}>Import by URL or ID</div>
                                <div style={modeRow}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setManualKind('page');
                                            setSelected(null);
                                        }}
                                        style={{ ...modeButton, ...(manualKind === 'page' && !selected ? modeButtonActive : {}) }}
                                    >
                                        <FileText size={14} />
                                        <span>Page</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setManualKind('database');
                                            setSelected(null);
                                        }}
                                        style={{ ...modeButton, ...(manualKind === 'database' && !selected ? modeButtonActive : {}) }}
                                    >
                                        <Database size={14} />
                                        <span>Database</span>
                                    </button>
                                </div>
                                <input
                                    value={manualTarget}
                                    onChange={(event) => {
                                        setManualTarget(event.target.value);
                                        setSelected(null);
                                    }}
                                    placeholder="Paste Notion page or database URL"
                                    disabled={busy}
                                    style={manualInput}
                                />
                            </div>

                            {statusText && (
                                <div style={inlineState}>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>{statusText}</span>
                                </div>
                            )}
                        </>
                    )}

                    {status.kind === 'error' && (
                        <div style={errorBox}>
                            <AlertCircle size={16} />
                            <span>{status.message}</span>
                        </div>
                    )}

                    {status.kind === 'success' && (
                        <div style={successBox}>
                            <CheckCircle2 size={16} />
                            <span>{status.message}</span>
                        </div>
                    )}
                </div>

                <div style={footer}>
                    <button type="button" onClick={onClose} style={ghostButton}>
                        Close
                    </button>
                    <button type="button" onClick={handleImport} disabled={!canImport} style={primaryButton}>
                        {status.kind === 'importing' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                        <span>{status.kind === 'importing' ? 'Importing...' : 'Import to canvas'}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(5, 6, 12, 0.68)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
};

const modal: React.CSSProperties = {
    width: 'min(720px, 100%)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(18, 20, 29, 0.98)',
    color: '#fff',
    boxShadow: '0 32px 90px rgba(0,0,0,0.45)',
    fontFamily: '"Poppins", system-ui, sans-serif',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const iconBadge: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #111827, #22c55e)',
    color: '#fff',
};

const title: React.CSSProperties = {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
};

const subtitle: React.CSSProperties = {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'rgba(255,255,255,0.56)',
};

const iconButton: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.68)',
    cursor: 'pointer',
};

const body: React.CSSProperties = {
    padding: 20,
    overflowY: 'auto',
    flex: 1,
};

const searchRow: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginBottom: 14,
};

const searchBox: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.52)',
};

const searchInput: React.CSSProperties = {
    width: '100%',
    height: 40,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#fff',
    fontSize: 13,
};

const list: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 250,
    overflowY: 'auto',
    paddingRight: 2,
};

const resultRow: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.035)',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
};

const resultRowActive: React.CSSProperties = {
    borderColor: 'rgba(34,197,94,0.6)',
    background: 'rgba(34,197,94,0.12)',
};

const itemIcon: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    color: '#d1fae5',
    flexShrink: 0,
};

const itemTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const itemMeta: React.CSSProperties = {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(255,255,255,0.48)',
};

const compactEmpty: React.CSSProperties = {
    padding: '18px 12px',
    borderRadius: 10,
    border: '1px dashed rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    textAlign: 'center',
};

const manualPanel: React.CSSProperties = {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.18)',
};

const manualHeader: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 10,
    color: 'rgba(255,255,255,0.68)',
};

const modeRow: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
};

const modeButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
};

const modeButtonActive: React.CSSProperties = {
    borderColor: 'rgba(34,197,94,0.6)',
    color: '#bbf7d0',
    background: 'rgba(34,197,94,0.12)',
};

const manualInput: React.CSSProperties = {
    width: '100%',
    height: 40,
    boxSizing: 'border-box',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    padding: '0 11px',
    outline: 'none',
    fontSize: 13,
};

const inlineState: React.CSSProperties = {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(255,255,255,0.64)',
    fontSize: 13,
};

const emptyState: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '42px 1fr',
    gap: 14,
    alignItems: 'start',
    padding: 16,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
};

const mutedIcon: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    color: '#d1fae5',
};

const emptyTitle: React.CSSProperties = {
    margin: 0,
    fontSize: 15,
};

const emptyCopy: React.CSSProperties = {
    margin: '4px 0 14px',
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    lineHeight: 1.5,
};

const errorBox: React.CSSProperties = {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 9,
    background: 'rgba(239,68,68,0.11)',
    color: '#fca5a5',
    fontSize: 13,
};

const successBox: React.CSSProperties = {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 9,
    background: 'rgba(34,197,94,0.12)',
    color: '#86efac',
    fontSize: 13,
};

const footer: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '15px 20px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.18)',
};

const ghostButton: React.CSSProperties = {
    padding: '8px 13px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.72)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
};

const secondaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.055)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
};

const primaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '9px 14px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #16a34a, #0ea5e9)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
};

export default NotionImportModal;
