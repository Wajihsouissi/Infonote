/**
 * ProfilePage — authenticated user's account screen.
 *
 * Reads identity from the live Zustand auth slice (hydrated by AuthProvider
 * via supabase.auth.getSession + onAuthStateChange). Provides a "Back to
 * canvas" shortcut and a real sign-out action that clears Supabase + the
 * local store. No mock data — every value here comes from auth.users /
 * user_metadata that Supabase returned on sign-in.
 */
import React, { useMemo, useState } from 'react';
import {
    ArrowLeft,
    LogOut,
    Mail,
    User as UserIcon,
    Shield,
    Layout,
    BadgeCheck,
    Database,
    FileText,
    Loader2,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from './useAuth';
import {
    connectNotion,
    importNotionPage,
    importNotionDatabase,
    extractNotionId,
} from '../../services/notion/notionImport';

function deriveInitials(name: string | null, email: string | null): string {
    const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
    if (!source) return 'U';
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return source.slice(0, 1).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const ProfilePage: React.FC = () => {
    const auth = useStore((s) => s.auth);
    const setCurrentView = useStore((s) => s.setCurrentView);
    const { signOut } = useAuth();

    const initials = useMemo(
        () => deriveInitials(auth.displayName, auth.email),
        [auth.displayName, auth.email],
    );

    // Notion integration state — lives only on this screen, no need to
    // pollute the global store. The token is held in component memory only;
    // we never persist it client-side.
    const [notionToken, setNotionToken] = useState('');
    const [notionTarget, setNotionTarget] = useState('');
    const [notionMode, setNotionMode] = useState<'page' | 'database'>('page');
    const [notionBusy, setNotionBusy] = useState<'connect' | 'import' | null>(null);
    const [notionFeedback, setNotionFeedback] = useState<
        | { kind: 'success'; text: string }
        | { kind: 'error'; text: string }
        | null
    >(null);

    const handleConnectNotion = async () => {
        setNotionFeedback(null);
        setNotionBusy('connect');
        const result = await connectNotion();
        if (!result.ok) {
            setNotionBusy(null);
            setNotionFeedback({ kind: 'error', text: result.error });
        }
        // On success the browser is navigating away to Notion's OAuth page;
        // no need to clear the busy flag.
    };

    const handleImportFromNotion = async () => {
        setNotionFeedback(null);
        const id = extractNotionId(notionTarget);
        if (!id) {
            setNotionFeedback({
                kind: 'error',
                text: 'Paste a Notion page or database URL (or its 32-character id).',
            });
            return;
        }
        if (!notionToken.trim()) {
            setNotionFeedback({
                kind: 'error',
                text: 'Paste your Notion integration token (starts with "secret_" or "ntn_").',
            });
            return;
        }
        setNotionBusy('import');
        try {
            const fn = notionMode === 'database' ? importNotionDatabase : importNotionPage;
            const result = await fn(id, {
                accessToken: notionToken.trim(),
                userId: auth.userId,
            });
            if (!result.ok) {
                setNotionFeedback({ kind: 'error', text: result.error });
            } else {
                setNotionFeedback({
                    kind: 'success',
                    text: `Imported ${result.imported} card${result.imported === 1 ? '' : 's'} from Notion${
                        result.skipped ? ` (${result.skipped} unsupported block${result.skipped === 1 ? '' : 's'} skipped)` : ''
                    }. Open the canvas to see them.`,
                });
            }
        } finally {
            setNotionBusy(null);
        }
    };

    if (!auth.isAuthenticated) {
        // Defensive guard — if a logged-out user somehow lands here, send
        // them back to the public homepage instead of rendering empty UI.
        setCurrentView('landing');
        return null;
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background:
                    'radial-gradient(circle at 20% 0%, rgba(139,92,246,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(6,182,212,0.16), transparent 50%), #090a0f',
                color: '#fff',
                padding: '32px 20px 80px',
                fontFamily:
                    '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            }}
        >
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {/* Header bar with back-to-canvas */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 32,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setCurrentView('landing')}
                        style={btnGhost}
                    >
                        <ArrowLeft size={16} />
                        <span>Back</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentView('canvas')}
                        style={btnPrimary}
                    >
                        <Layout size={16} />
                        <span>Open Canvas</span>
                    </button>
                </div>

                {/* Avatar + identity card */}
                <div style={card}>
                    <div
                        style={{
                            display: 'flex',
                            gap: 20,
                            alignItems: 'center',
                            marginBottom: 24,
                        }}
                    >
                        <div style={avatarBig}>{initials}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <h1
                                style={{
                                    fontSize: 26,
                                    fontWeight: 700,
                                    margin: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {auth.displayName || 'Welcome'}
                            </h1>
                            <p
                                style={{
                                    margin: '6px 0 0',
                                    color: 'rgba(255,255,255,0.62)',
                                    fontSize: 14,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {auth.email}
                            </p>
                        </div>
                    </div>

                    <div style={fieldGrid}>
                        <Field icon={<UserIcon size={15} />} label="Display name" value={auth.displayName || '—'} />
                        <Field icon={<Mail size={15} />} label="Email" value={auth.email || '—'} />
                        <Field
                            icon={<BadgeCheck size={15} />}
                            label="User ID"
                            value={auth.userId ? auth.userId.slice(0, 8) + '…' + auth.userId.slice(-4) : '—'}
                            mono
                        />
                        <Field
                            icon={<Shield size={15} />}
                            label="Authentication"
                            value="Verified via Supabase"
                        />
                    </div>
                </div>

                {/* Account actions */}
                <div style={card}>
                    <h2 style={sectionTitle}>Account actions</h2>
                    <button
                        type="button"
                        onClick={() => setCurrentView('admin')}
                        style={{ ...btnRow }}
                    >
                        <Shield size={16} />
                        <span style={{ flex: 1, textAlign: 'left' }}>Open Admin Dashboard</span>
                        <span style={{ opacity: 0.5, fontSize: 12 }}>›</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentView('marketplace')}
                        style={btnRow}
                    >
                        <Layout size={16} />
                        <span style={{ flex: 1, textAlign: 'left' }}>Browse Marketplace</span>
                        <span style={{ opacity: 0.5, fontSize: 12 }}>›</span>
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            await signOut();
                        }}
                        style={{ ...btnRow, color: '#fca5a5' }}
                    >
                        <LogOut size={16} />
                        <span style={{ flex: 1, textAlign: 'left' }}>Sign out (Deconnexion)</span>
                        <span style={{ opacity: 0.5, fontSize: 12 }}>›</span>
                    </button>
                </div>

                {/* Notion integration */}
                <div style={card}>
                    <h2 style={sectionTitle}>Notion integration</h2>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                        Connect your Notion workspace, then drop a page or database URL below to bring its
                        content onto the canvas as editable cards.
                    </p>

                    <button
                        type="button"
                        onClick={handleConnectNotion}
                        disabled={notionBusy !== null}
                        style={btnRow}
                    >
                        {notionBusy === 'connect' ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <NotionGlyph />
                        )}
                        <span style={{ flex: 1, textAlign: 'left' }}>Connect Notion</span>
                        <span style={{ opacity: 0.5, fontSize: 12 }}>›</span>
                    </button>

                    <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 8 }}>
                        <button
                            type="button"
                            onClick={() => setNotionMode('page')}
                            style={{
                                ...modeButton,
                                ...(notionMode === 'page' ? modeButtonActive : {}),
                            }}
                        >
                            <FileText size={14} /> Page
                        </button>
                        <button
                            type="button"
                            onClick={() => setNotionMode('database')}
                            style={{
                                ...modeButton,
                                ...(notionMode === 'database' ? modeButtonActive : {}),
                            }}
                        >
                            <Database size={14} /> Database / Kanban
                        </button>
                    </div>

                    <input
                        type="text"
                        placeholder="Notion page or database URL"
                        value={notionTarget}
                        onChange={(e) => setNotionTarget(e.target.value)}
                        disabled={notionBusy !== null}
                        style={inputStyle}
                    />
                    <input
                        type="password"
                        placeholder="Notion integration token (secret_… / ntn_…)"
                        value={notionToken}
                        onChange={(e) => setNotionToken(e.target.value)}
                        disabled={notionBusy !== null}
                        style={{ ...inputStyle, marginTop: 8 }}
                        autoComplete="off"
                    />

                    <button
                        type="button"
                        onClick={handleImportFromNotion}
                        disabled={notionBusy !== null || !notionTarget || !notionToken}
                        style={{
                            ...btnRow,
                            marginTop: 12,
                            background: 'var(--color-accent, #6366f1)',
                            color: '#fff',
                            justifyContent: 'center',
                            opacity: notionBusy !== null || !notionTarget || !notionToken ? 0.6 : 1,
                        }}
                    >
                        {notionBusy === 'import' ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : notionMode === 'database' ? (
                            <Database size={16} />
                        ) : (
                            <FileText size={16} />
                        )}
                        <span>{notionBusy === 'import' ? 'Importing…' : 'Import from Notion'}</span>
                    </button>

                    {notionFeedback && (
                        <div
                            style={{
                                marginTop: 12,
                                padding: '10px 12px',
                                borderRadius: 8,
                                fontSize: 13,
                                background:
                                    notionFeedback.kind === 'success'
                                        ? 'rgba(34,197,94,0.1)'
                                        : 'rgba(239,68,68,0.1)',
                                color: notionFeedback.kind === 'success' ? '#22c55e' : '#ef4444',
                            }}
                        >
                            {notionFeedback.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/** Small typed helper component for label/value rows. */
const Field: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
}> = ({ icon, label, value, mono }) => (
    <div style={fieldBox}>
        <div style={fieldLabel}>
            {icon}
            <span>{label}</span>
        </div>
        <div
            style={{
                ...fieldValue,
                fontFamily: mono
                    ? '"JetBrains Mono", "Courier New", monospace'
                    : 'inherit',
            }}
        >
            {value}
        </div>
    </div>
);

// ───── Inline styles (kept self-contained so we don't add a new CSS module) ─────
const card: React.CSSProperties = {
    background: 'rgba(20, 22, 32, 0.72)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 28,
    marginBottom: 20,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.32)',
};

const avatarBig: React.CSSProperties = {
    width: 72,
    height: 72,
    flexShrink: 0,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff',
    fontSize: 26,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
};

const fieldGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
};

const fieldBox: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '12px 14px',
};

const fieldLabel: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const fieldValue: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.72)',
    margin: '0 0 14px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
};

const btnRow: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: 8,
    transition: 'background 0.15s ease, transform 0.1s ease',
};

const btnGhost: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    boxShadow: '0 6px 16px rgba(99,102,241,0.35)',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.25)',
    color: '#fff',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
};

const modeButton: React.CSSProperties = {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
};

const modeButtonActive: React.CSSProperties = {
    background: 'rgba(99,102,241,0.18)',
    border: '1px solid rgba(99,102,241,0.45)',
    color: '#fff',
};

/** Inline Notion glyph — stays scoped to ProfilePage to avoid icon-set bloat. */
const NotionGlyph: React.FC = () => (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.139v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19l-4.064.234L8.146 8.95c-.279-.42-.466-.42-1.027-.466zm-9.146 4.997L8.519 11.51l-.187-1.215v.794l1.121 4.94zM12.21 7.92l-3.737.187 4.577 7.186v-6.952z" />
    </svg>
);

export default ProfilePage;
