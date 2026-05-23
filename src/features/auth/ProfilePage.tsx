/**
 * ProfilePage — authenticated user's account screen.
 *
 * Reads identity from the live Zustand auth slice (hydrated by AuthProvider
 * via supabase.auth.getSession + onAuthStateChange). Provides a "Back to
 * canvas" shortcut and a real sign-out action that clears Supabase + the
 * local store. No mock data — every value here comes from auth.users /
 * user_metadata that Supabase returned on sign-in.
 */
import React, { useMemo } from 'react';
import {
    ArrowLeft,
    LogOut,
    Mail,
    User as UserIcon,
    Shield,
    Layout,
    BadgeCheck,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from './AuthProvider';

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

export default ProfilePage;
