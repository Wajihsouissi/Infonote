import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    CheckCircle2,
    Clipboard,
    Loader2,
    MailPlus,
    UserCheck,
    Users,
    X,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
    acceptWorkspaceInvitation,
    inviteWorkspaceMember,
    listAccessibleWorkspaces,
    listPendingInvitationsForCurrentUser,
    listWorkspaceInvitations,
    listWorkspaceMembers,
    persistActiveWorkspace,
    type WorkspaceInvitation,
    type WorkspaceMember,
    type WorkspaceSummary,
} from '../../services/collaboration';

type Status =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'inviting' }
    | { kind: 'accepting' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string };

interface ShareWorkspaceModalProps {
    open: boolean;
    onClose: () => void;
}

export const ShareWorkspaceModal: React.FC<ShareWorkspaceModalProps> = ({ open, onClose }) => {
    const auth = useStore((state) => state.auth);
    const setAuthWorkspace = useStore((state) => state.setAuthWorkspace);

    const [inviteEmail, setInviteEmail] = useState('');
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvitation[]>([]);
    const [myInvites, setMyInvites] = useState<WorkspaceInvitation[]>([]);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
    const [copiedInviteLink, setCopiedInviteLink] = useState(false);
    const [showTestingFallback, setShowTestingFallback] = useState(false);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            setInviteEmail('');
            setLastInviteLink(null);
            setCopiedInviteLink(false);
            setShowTestingFallback(false);
            setStatus({ kind: 'loading' });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    const activeWorkspace = workspaces.find((workspace) => workspace.id === auth.activeWorkspaceId);
    const isOwner = activeWorkspace?.role === 'owner';
    const busy = status.kind === 'loading' || status.kind === 'inviting' || status.kind === 'accepting';

    const refresh = useCallback(async (options: { preserveStatus?: boolean } = {}) => {
        const preserveStatus = options.preserveStatus === true;
        if (!auth.userId) return;
        if (!preserveStatus) {
            setStatus({ kind: 'loading' });
        }

        const [workspaceRes, pendingRes, membersRes, invitesRes] = await Promise.all([
            listAccessibleWorkspaces(auth.userId),
            listPendingInvitationsForCurrentUser(),
            listWorkspaceMembers(auth.activeWorkspaceId),
            listWorkspaceInvitations(auth.activeWorkspaceId),
        ]);

        if (!workspaceRes.ok) {
            if (preserveStatus) {
                console.warn('[collaboration] workspace refresh failed:', workspaceRes.error);
            } else {
                setStatus({ kind: 'error', message: workspaceRes.error });
            }
            return;
        }
        setWorkspaces(workspaceRes.data);

        if (pendingRes.ok) setMyInvites(pendingRes.data);
        if (membersRes.ok) setMembers(membersRes.data);
        if (invitesRes.ok) {
            setWorkspaceInvites(invitesRes.data.filter((invite) => invite.status === 'pending'));
        }

        const firstError = [pendingRes, membersRes, invitesRes].find((result) => !result.ok);
        if (firstError && !firstError.ok) {
            if (preserveStatus) {
                console.warn('[collaboration] secondary refresh failed:', firstError.error);
            } else {
                setStatus({ kind: 'error', message: firstError.error });
            }
            return;
        }

        if (!preserveStatus) {
            setStatus({ kind: 'idle' });
        }
    }, [auth.activeWorkspaceId, auth.userId]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            void refresh();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [open, refresh]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onClose]);

    const handleInvite = useCallback(async () => {
        const email = inviteEmail.trim();
        if (!email || !email.includes('@')) {
            setStatus({ kind: 'error', message: 'Enter a valid email address.' });
            return;
        }

        setStatus({ kind: 'inviting' });
        setLastInviteLink(null);
        setCopiedInviteLink(false);
        setShowTestingFallback(false);
        const result = await inviteWorkspaceMember(auth.activeWorkspaceId, email, 'editor');
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
            return;
        }

        setInviteEmail('');
        setLastInviteLink(result.data.acceptUrl ?? null);
        if (result.data.emailDelivery === 'failed') {
            setShowTestingFallback(true);
            setStatus({ kind: 'idle' });
        } else {
            setShowTestingFallback(false);
            setStatus({ kind: 'success', message: `Invitation sent to ${result.data.invitedEmail}.` });
        }
        void refresh({ preserveStatus: true });
    }, [auth.activeWorkspaceId, inviteEmail, refresh]);

    const handleCopyInviteLink = useCallback(async () => {
        if (!lastInviteLink) return;
        try {
            await navigator.clipboard.writeText(lastInviteLink);
            setCopiedInviteLink(true);
            setStatus({ kind: 'success', message: 'Invite link copied.' });
        } catch {
            setCopiedInviteLink(false);
            setStatus({ kind: 'error', message: 'Could not copy automatically. Select and copy the invite link manually.' });
        }
    }, [lastInviteLink]);

    const handleAccept = useCallback(async (invite: WorkspaceInvitation) => {
        if (!auth.userId) return;
        setStatus({ kind: 'accepting' });
        const result = await acceptWorkspaceInvitation(invite.id);
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
            return;
        }

        persistActiveWorkspace(auth.userId, result.data.workspaceId);
        setAuthWorkspace(result.data.workspaceId);
        setStatus({ kind: 'success', message: `Joined ${invite.workspaceName}.` });
        void refresh({ preserveStatus: true });
    }, [auth.userId, refresh, setAuthWorkspace]);

    const handleSwitchWorkspace = useCallback((workspace: WorkspaceSummary) => {
        if (!auth.userId) return;
        persistActiveWorkspace(auth.userId, workspace.id);
        setAuthWorkspace(workspace.id);
        setStatus({ kind: 'success', message: `Opened ${workspace.name}.` });
    }, [auth.userId, setAuthWorkspace]);

    if (!open) return null;

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="Share canvas workspace">
            <div style={modal}>
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={iconBadge}>
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 style={title}>Share canvas</h2>
                            <p style={subtitle}>Invite collaborators and open shared workspaces.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={iconButton} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div style={body}>
                    <section style={panel}>
                        <div style={sectionHeader}>
                            <div>
                                <h3 style={sectionTitle}>Invite by email</h3>
                                <p style={sectionCopy}>
                                    Collaborators can accept from their account and edit this canvas with you.
                                </p>
                            </div>
                            {!isOwner && <span style={pill}>Owner only</span>}
                        </div>
                        <div style={inviteRow}>
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                placeholder="teammate@example.com"
                                disabled={busy || !isOwner}
                                style={input}
                            />
                            <button type="button" onClick={handleInvite} disabled={busy || !isOwner} style={primaryButton}>
                                {status.kind === 'inviting' ? <Loader2 size={15} className="animate-spin" /> : <MailPlus size={15} />}
                                <span>Invite</span>
                            </button>
                        </div>
                        {showTestingFallback && lastInviteLink && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                padding: '14px 16px',
                                borderRadius: 10,
                                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                                border: '1px solid rgba(34, 197, 94, 0.2)',
                                marginTop: 12,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
                                    <span style={{ fontWeight: 600, color: '#86efac', fontSize: 13 }}>Invitation created!</span>
                                </div>
                                <p style={{ margin: '0 0 10px 0', fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                                    Email delivery failed because we are in testing mode, but you can copy and share this link directly:
                                </p>
                                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                                    <input
                                        type="text"
                                        value={lastInviteLink}
                                        readOnly
                                        style={{
                                            flex: 1,
                                            height: 36,
                                            minWidth: 0,
                                            borderRadius: 6,
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            backgroundColor: 'rgba(0,0,0,0.3)',
                                            color: '#fff',
                                            padding: '0 10px',
                                            outline: 'none',
                                            fontSize: 12,
                                        }}
                                        onFocus={(event) => event.currentTarget.select()}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCopyInviteLink}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '0 14px',
                                            height: 36,
                                            borderRadius: 6,
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #2563eb, #22c55e)',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            fontWeight: 700,
                                        }}
                                    >
                                        <Clipboard size={14} />
                                        <span>{copiedInviteLink ? 'Copied' : 'Copy Link'}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                        {lastInviteLink && !showTestingFallback && (
                            <div style={copyLinkBox}>
                                <input
                                    type="text"
                                    value={lastInviteLink}
                                    readOnly
                                    style={copyInput}
                                    aria-label="Workspace invitation link"
                                    onFocus={(event) => event.currentTarget.select()}
                                />
                                <button type="button" onClick={handleCopyInviteLink} style={smallButton}>
                                    <Clipboard size={14} />
                                    <span>{copiedInviteLink ? 'Copied' : 'Copy link'}</span>
                                </button>
                            </div>
                        )}
                    </section>

                    {myInvites.length > 0 && (
                        <section style={panel}>
                            <h3 style={sectionTitle}>Invitations for you</h3>
                            <div style={list}>
                                {myInvites.map((invite) => (
                                    <div key={invite.id} style={row}>
                                        <div style={avatar}>
                                            <MailPlus size={16} />
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={rowTitle}>{invite.workspaceName}</div>
                                            <div style={rowMeta}>Role: {invite.role}</div>
                                        </div>
                                        <button type="button" onClick={() => handleAccept(invite)} disabled={busy} style={smallButton}>
                                            <UserCheck size={14} />
                                            <span>Accept</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section style={panel}>
                        <h3 style={sectionTitle}>People in this canvas</h3>
                        <div style={list}>
                            {members.map((member) => (
                                <div key={member.userId} style={row}>
                                    <div style={avatar}>{initials(member.displayName || member.email || 'U')}</div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={rowTitle}>{member.displayName || member.email || 'Unknown user'}</div>
                                        <div style={rowMeta}>{member.email || 'No email'} · {member.role}</div>
                                    </div>
                                </div>
                            ))}
                            {members.length === 0 && <div style={empty}>No members loaded yet.</div>}
                        </div>
                    </section>

                    {workspaceInvites.length > 0 && (
                        <section style={panel}>
                            <h3 style={sectionTitle}>Pending invites</h3>
                            <div style={list}>
                                {workspaceInvites.map((invite) => (
                                    <div key={invite.id} style={row}>
                                        <div style={avatar}>
                                            <MailPlus size={16} />
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={rowTitle}>{invite.invitedEmail}</div>
                                            <div style={rowMeta}>Waiting · {invite.role}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section style={panel}>
                        <h3 style={sectionTitle}>Your workspaces</h3>
                        <div style={list}>
                            {workspaces.map((workspace) => (
                                <button
                                    key={workspace.id}
                                    type="button"
                                    onClick={() => handleSwitchWorkspace(workspace)}
                                    style={{
                                        ...rowButton,
                                        ...(workspace.id === auth.activeWorkspaceId ? rowButtonActive : {}),
                                    }}
                                >
                                    <div style={avatar}>{initials(workspace.name)}</div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={rowTitle}>{workspace.name}</div>
                                        <div style={rowMeta}>
                                            {workspace.role === 'owner'
                                                ? 'Owned by you'
                                                : `Shared by ${workspace.ownerName || workspace.ownerEmail || 'workspace owner'}`}
                                        </div>
                                    </div>
                                    <span style={pill}>{workspace.role}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {status.kind === 'loading' && (
                        <div style={inlineState}>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Loading collaboration data...</span>
                        </div>
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
                    <button type="button" onClick={() => void refresh()} disabled={busy} style={ghostButton}>
                        Refresh
                    </button>
                    <button type="button" onClick={onClose} style={primaryButton}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

function initials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

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
    width: 'min(760px, 100%)',
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
    background: 'linear-gradient(135deg, #2563eb, #22c55e)',
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
    padding: 18,
    overflowY: 'auto',
    display: 'grid',
    gap: 12,
};

const panel: React.CSSProperties = {
    padding: 13,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
};

const sectionHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
};

const sectionTitle: React.CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
};

const sectionCopy: React.CSSProperties = {
    margin: '3px 0 0',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 1.45,
};

const inviteRow: React.CSSProperties = {
    display: 'flex',
    gap: 9,
};

const input: React.CSSProperties = {
    flex: 1,
    height: 40,
    minWidth: 0,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.22)',
    color: '#fff',
    padding: '0 11px',
    outline: 'none',
    fontSize: 13,
};

const copyLinkBox: React.CSSProperties = {
    display: 'flex',
    gap: 9,
    marginTop: 9,
};

const copyInput: React.CSSProperties = {
    ...input,
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
};

const list: React.CSSProperties = {
    display: 'grid',
    gap: 8,
    marginTop: 10,
};

const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.16)',
};

const rowButton: React.CSSProperties = {
    ...row,
    width: '100%',
    color: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
};

const rowButtonActive: React.CSSProperties = {
    borderColor: 'rgba(34,197,94,0.55)',
    background: 'rgba(34,197,94,0.12)',
};

const avatar: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.07)',
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: 800,
};

const rowTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const rowMeta: React.CSSProperties = {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(255,255,255,0.52)',
};

const pill: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.66)',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
};

const empty: React.CSSProperties = {
    padding: 12,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
};

const inlineState: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(255,255,255,0.64)',
    fontSize: 13,
};

const errorBox: React.CSSProperties = {
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

const smallButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.07)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
};

const primaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '9px 14px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #2563eb, #22c55e)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
};

export default ShareWorkspaceModal;
