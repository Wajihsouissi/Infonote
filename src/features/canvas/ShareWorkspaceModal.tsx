import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    CheckCircle2,
    Clipboard,
    Loader2,
    MailPlus,
    Link as LinkIcon,
    UserCheck,
    Users,
    X,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
    acceptWorkspaceInvitation,
    activateWorkspace,
    inviteWorkspaceMember,
    listAccessibleWorkspaces,
    listPendingInvitationsForCurrentUser,
    listWorkspaceInvitations,
    listWorkspaceMembers,
    type WorkspaceInvitation,
    type WorkspaceMember,
    type WorkspaceSummary,
} from '../../services/collaboration';
import { saveCanvasToCloud } from '../../services/cloudSync';

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

    const [inviteEmail, setInviteEmail] = useState('');
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvitation[]>([]);
    const [myInvites, setMyInvites] = useState<WorkspaceInvitation[]>([]);
    const [manualInvite, setManualInvite] = useState('');
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
    const [inviteDeliveryError, setInviteDeliveryError] = useState<string | null>(null);
    const [inviteSender, setInviteSender] = useState<string | null>(null);
    const [inviteProvider, setInviteProvider] = useState<string | null>(null);
    const [copiedInviteLink, setCopiedInviteLink] = useState(false);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            setInviteEmail('');
            setManualInvite('');
            setLastInviteLink(null);
            setInviteDeliveryError(null);
            setInviteSender(null);
            setInviteProvider(null);
            setCopiedInviteLink(false);
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
        if (!auth.userId || !auth.activeWorkspaceId) {
            setStatus({ kind: 'error', message: 'Open a signed-in workspace before inviting collaborators.' });
            return;
        }

        setStatus({ kind: 'inviting' });
        setLastInviteLink(null);
        setInviteDeliveryError(null);
        setInviteSender(null);
        setInviteProvider(null);
        setCopiedInviteLink(false);

        const state = useStore.getState();
        const syncResult = await saveCanvasToCloud(
            auth.userId,
            auth.activeWorkspaceId,
            state.nodes,
            state.edges,
        );
        if (!syncResult.ok) {
            setStatus({
                kind: 'error',
                message: `The canvas could not be synced before inviting: ${syncResult.error}`,
            });
            return;
        }
        state.setCloudDirty(false);
        state.setCloudError(null);
        state.setCloudLastSaved(new Date().toLocaleTimeString());

        const result = await inviteWorkspaceMember(auth.activeWorkspaceId, email, 'editor');
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
            return;
        }

        setInviteEmail('');
        setLastInviteLink(result.data.acceptUrl ?? null);
        setInviteSender(result.data.emailFrom ?? null);
        const formattedProvider = formatInviteProvider(result.data.emailProvider);
        setInviteProvider(formattedProvider);
        if (result.data.emailDelivery === 'failed') {
            setInviteDeliveryError(result.data.emailError || 'Email provider did not accept the invitation email.');
            setStatus({ kind: 'error', message: 'Invitation was created, but email delivery failed. Copy the invite link below.' });
        } else {
            setInviteDeliveryError(null);
            setStatus({ kind: 'success', message: `Invitation email queued for ${result.data.invitedEmail}${formattedProvider ? ` via ${formattedProvider}` : ''}.` });
        }
        void refresh({ preserveStatus: true });
    }, [auth.activeWorkspaceId, auth.userId, inviteEmail, refresh]);

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
        if (!auth.userId) {
            setStatus({ kind: 'error', message: 'Sign in before accepting an invitation.' });
            return;
        }
        setStatus({ kind: 'accepting' });
        const result = await acceptWorkspaceInvitation(invite.id);
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
            return;
        }

        const activation = await activateWorkspace(auth.userId, result.data.workspaceId);
        if (!activation.ok) {
            setStatus({ kind: 'error', message: `Invitation accepted, but the shared canvas could not be loaded: ${activation.error}` });
            return;
        }
        setStatus({ kind: 'success', message: `Joined ${invite.workspaceName}.` });
        void refresh({ preserveStatus: true });
    }, [auth.userId, refresh]);

    const handleAcceptManualInvite = useCallback(async () => {
        if (!auth.userId) {
            setStatus({ kind: 'error', message: 'Sign in before accepting an invitation.' });
            return;
        }

        const invitationId = extractInvitationId(manualInvite);
        if (!invitationId) {
            setStatus({ kind: 'error', message: 'Paste a valid workspace invite link or invitation id.' });
            return;
        }

        setStatus({ kind: 'accepting' });
        const result = await acceptWorkspaceInvitation(invitationId);
        if (!result.ok) {
            setStatus({ kind: 'error', message: result.error });
            return;
        }

        setManualInvite('');
        const activation = await activateWorkspace(auth.userId, result.data.workspaceId);
        if (!activation.ok) {
            setStatus({ kind: 'error', message: `Invitation accepted, but the shared canvas could not be loaded: ${activation.error}` });
            return;
        }
        setStatus({ kind: 'success', message: 'Invitation accepted. Opening shared canvas.' });
        void refresh({ preserveStatus: true });
    }, [auth.userId, manualInvite, refresh]);

    const handleSwitchWorkspace = useCallback(async (workspace: WorkspaceSummary) => {
        if (!auth.userId) return;
        setStatus({ kind: 'loading' });
        const activation = await activateWorkspace(auth.userId, workspace.id);
        if (!activation.ok) {
            setStatus({ kind: 'error', message: `Workspace could not be loaded: ${activation.error}` });
            return;
        }
        setStatus({ kind: 'success', message: `Opened ${workspace.name}.` });
    }, [auth.userId]);

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
                        {lastInviteLink && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                padding: '14px 16px',
                                borderRadius: 'var(--r-control)',
                                backgroundColor: inviteDeliveryError ? 'rgba(var(--warn-rgb), 0.10)' : 'rgba(var(--ok-rgb), 0.08)',
                                border: inviteDeliveryError ? '1px solid rgba(var(--warn-rgb), 0.24)' : '1px solid rgba(var(--ok-rgb), 0.20)',
                                marginTop: 12,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    {inviteDeliveryError ? (
                                        <AlertCircle size={16} style={{ color: 'var(--warn)' }} />
                                    ) : (
                                        <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                                    )}
                                    <span style={{
                                        fontWeight: 600,
                                        color: inviteDeliveryError ? 'var(--warn)' : 'var(--ok)',
                                        fontSize: 13,
                                    }}>
                                        {inviteDeliveryError ? 'Invitation created, email not delivered' : 'Invitation email queued'}
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 10px 0', fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.4 }}>
                                    {inviteDeliveryError
                                        ? `Delivery error: ${inviteDeliveryError} Copy and share this accept link directly while the email configuration is fixed.`
                                        : `The email has been accepted${inviteProvider ? ` by ${inviteProvider}` : ' by the provider'}${inviteSender ? ` from ${inviteSender}` : ''}. You can also copy the accept link directly.`}
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
                                            borderRadius: 'var(--input-radius)',
                                            border: '1px solid var(--input-border)',
                                            backgroundColor: 'var(--input-bg)',
                                            color: 'var(--text-main)',
                                            padding: '0 10px',
                                            outline: 'none',
                                            fontFamily: 'var(--font-mono)',
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
                                            borderRadius: 'var(--btn-radius)',
                                            border: 'none',
                                            background: 'var(--btn-primary-bg)',
                                            color: 'var(--btn-primary-fg)',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
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
                        <div style={sectionHeader}>
                            <div>
                                <h3 style={sectionTitle}>Accept invite link</h3>
                                <p style={sectionCopy}>
                                    Paste a workspace invitation link or id to join from this account.
                                </p>
                            </div>
                        </div>
                        <div style={inviteRow}>
                            <input
                                type="text"
                                value={manualInvite}
                                onChange={(event) => setManualInvite(event.target.value)}
                                placeholder="https://chnkit.com/invite/..."
                                disabled={busy}
                                style={input}
                            />
                            <button type="button" onClick={handleAcceptManualInvite} disabled={busy || !manualInvite.trim()} style={primaryButton}>
                                {status.kind === 'accepting' ? <Loader2 size={15} className="animate-spin" /> : <LinkIcon size={15} />}
                                <span>Accept</span>
                            </button>
                        </div>
                    </section>

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

function formatInviteProvider(provider: WorkspaceInvitation['emailProvider']): string | null {
    if (provider === 'resend') return 'Resend';
    if (provider === 'supabase-auth') return 'Supabase Auth';
    return null;
}

const INVITATION_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function extractInvitationId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const url = new URL(trimmed);
        const queryInvite = url.searchParams.get('workspaceInvite') || url.searchParams.get('invite');
        if (queryInvite && INVITATION_ID_RE.test(queryInvite)) {
            return queryInvite.match(INVITATION_ID_RE)?.[0] ?? null;
        }
    } catch {
        // Plain invitation ids are accepted below.
    }

    return trimmed.match(INVITATION_ID_RE)?.[0] ?? null;
}

/* Paper & Ink. Inline styles read tokens fine, so nothing here is theme-specific —
   this modal was previously dark-only (white-alpha text on a fixed dark panel),
   which meant white-on-white in Paper. */

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
    width: 'min(760px, 100%)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 'var(--r-panel)',
    border: '1px solid var(--line)',
    background: 'var(--bg-rail)',
    color: 'var(--text-main)',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: 'var(--font-sans)',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px',
    borderBottom: '1px solid var(--line)',
};

const iconBadge: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: 'var(--r-control)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
    color: 'var(--on-accent)',
};

const title: React.CSSProperties = {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-main)',
};

const subtitle: React.CSSProperties = {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'var(--text-faint)',
};

const iconButton: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--btn-radius)',
    border: '1px solid var(--line)',
    background: 'transparent',
    color: 'var(--btn-ghost-fg)',
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
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)',
    background: 'var(--bg-card)',
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
    color: 'var(--text-main)',
};

const sectionCopy: React.CSSProperties = {
    margin: '3px 0 0',
    color: 'var(--text-soft)',
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
    borderRadius: 'var(--input-radius)',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-main)',
    padding: '0 11px',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: 13,
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
    borderRadius: 'var(--r-control)',
    border: '1px solid var(--line)',
    background: 'var(--bg-inset)',
};

const rowButton: React.CSSProperties = {
    ...row,
    width: '100%',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
};

const rowButtonActive: React.CSSProperties = {
    borderColor: 'var(--accent)',
    background: 'var(--accent-dim)',
};

const avatar: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 'var(--r-control)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
    color: 'var(--on-accent)',
    fontSize: 12,
    fontWeight: 800,
};

const rowTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-main)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const rowMeta: React.CSSProperties = {
    marginTop: 2,
    fontSize: 11,
    color: 'var(--text-faint)',
};

const pill: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 'var(--chip-radius)',
    background: 'var(--chip-bg)',
    color: 'var(--chip-fg)',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
};

const empty: React.CSSProperties = {
    padding: 12,
    color: 'var(--text-faint)',
    fontSize: 13,
    textAlign: 'center',
};

const inlineState: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-soft)',
    fontSize: 13,
};

const errorBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 'var(--r-control)',
    background: 'rgba(var(--danger-rgb), 0.11)',
    color: 'var(--danger)',
    fontSize: 13,
};

const successBox: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 'var(--r-control)',
    background: 'rgba(var(--ok-rgb), 0.12)',
    color: 'var(--ok)',
    fontSize: 13,
};

const footer: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '15px 20px',
    borderTop: '1px solid var(--line)',
    background: 'var(--bg-rail)',
};

const ghostButton: React.CSSProperties = {
    padding: '8px 13px',
    borderRadius: 'var(--btn-radius)',
    border: '1px solid var(--btn-secondary-border)',
    background: 'transparent',
    color: 'var(--btn-ghost-fg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
};

const smallButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 'var(--btn-radius)',
    border: '1px solid var(--btn-secondary-border)',
    background: 'var(--btn-secondary-bg)',
    color: 'var(--btn-secondary-fg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
};

const primaryButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '9px 14px',
    borderRadius: 'var(--btn-radius)',
    border: 'none',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-fg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
};

export default ShareWorkspaceModal;
