/**
 * ProfilePage — the app's Settings screen (rail → Settings → this view).
 *
 * Rebuilt as an editorial ledger: a sticky section rail on the left, and
 * sections of hairline-ruled rows on the right — label and hint on the
 * left of each row, the control on the right. Nothing here is decorative:
 * every row either shows a fact the user can act on or is a control that
 * writes somewhere real (Supabase, the storage-mode key StorageControls
 * reads, the theme store, the workspace collaboration service).
 *
 * Editable groups commit through a per-section dirty bar rather than a
 * permanently-primary Save button, so the page reads as settings, not a form.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle,
    Cloud,
    Copy,
    Download,
    FolderCheck,
    Frame,
    HardDrive,
    Lock,
    LogOut,
    Mail,
    Moon,
    RefreshCw,
    Sun,
    Trash2,
    UserPlus,
} from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { useStore } from '../../store/useStore';
import { originFromEvent } from '../../utils/themeTransition';
import { isSupabaseConfigured, supabase } from '../../services/supabase/client';
import {
    activateWorkspace,
    listWorkspaceInvitations,
    listWorkspaceMembers,
    listAccessibleWorkspaces,
    type WorkspaceInvitation,
    type WorkspaceMember,
    type WorkspaceSummary,
} from '../../services/collaboration';
import { connectNotion } from '../../services/notion/notionImport';
import { storageModeKey, type StorageMode } from '../ui/StorageChoiceModal';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { ShareWorkspaceModal } from '../canvas/ShareWorkspaceModal';
import { NotionImportModal } from '../canvas/NotionImportModal';
import { useAuth } from './useAuth';
import styles from './ProfilePage.module.css';

const SUPPORT_MAILTO =
    'mailto:wajih.souissi.ws@gmail.com?subject=chnk%20it%20%E2%80%94%20account%20deletion%20request';

const SECTIONS = [
    { id: 'account', index: 'I', title: 'Account' },
    { id: 'workspace', index: 'II', title: 'Workspace' },
    { id: 'storage', index: 'III', title: 'Storage & sync' },
    { id: 'appearance', index: 'IV', title: 'Appearance' },
    { id: 'integrations', index: 'V', title: 'Integrations' },
    { id: 'danger', index: 'VI', title: 'Data & account' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
type Flash = { kind: 'ok' | 'err'; text: string } | null;

const STORAGE_TABS: TabItem<StorageMode>[] = [
    { id: 'local', label: 'Local', icon: <HardDrive size={14} /> },
    { id: 'cloud', label: 'Cloud', icon: <Cloud size={14} /> },
    { id: 'both', label: 'Local + cloud', icon: <RefreshCw size={14} /> },
];

const THEME_TABS: TabItem<'dark' | 'light'>[] = [
    { id: 'dark', label: 'Ink', icon: <Moon size={14} /> },
    { id: 'light', label: 'Paper', icon: <Sun size={14} /> },
];

const autosyncKey = (workspaceId: string | null) =>
    `chnk-it-cloud-autosync-${workspaceId || 'default'}`;

function readStorageMode(userId: string | null): StorageMode | null {
    if (!userId) return null;
    const stored = localStorage.getItem(storageModeKey(userId));
    return stored === 'local' || stored === 'cloud' || stored === 'both' ? stored : null;
}

function readAutosync(workspaceId: string | null): boolean {
    return localStorage.getItem(autosyncKey(workspaceId)) !== 'false';
}

function deriveInitials(name: string | null, email: string | null): string {
    const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
    if (!source) return 'U';
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return source.slice(0, 1).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return '—';
    return new Date(ms).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/** Label/hint on the left, control on the right. The page's only layout unit. */
const Row: React.FC<{
    label: string;
    hint?: React.ReactNode;
    htmlFor?: string;
    stacked?: boolean;
    danger?: boolean;
    children?: React.ReactNode;
}> = ({ label, hint, htmlFor, stacked, danger, children }) => (
    <div className={`${styles.row} ${stacked ? styles.rowStacked : ''}`}>
        <div className={styles.rowMain}>
            {htmlFor ? (
                <label className={`${styles.rowLabel} ${danger ? styles.dangerLabel : ''}`} htmlFor={htmlFor}>
                    {label}
                </label>
            ) : (
                <span className={`${styles.rowLabel} ${danger ? styles.dangerLabel : ''}`}>{label}</span>
            )}
            {hint && <p className={styles.rowHint}>{hint}</p>}
        </div>
        {children && <div className={styles.rowControl}>{children}</div>}
    </div>
);

const FlashNote: React.FC<{ flash: Flash }> = ({ flash }) =>
    flash ? (
        <div
            className={`${styles.flash} ${flash.kind === 'ok' ? styles.flashOk : styles.flashErr}`}
            role="status"
        >
            {flash.kind === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{flash.text}</span>
        </div>
    ) : null;

const Toggle: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
    >
        <span className={styles.knob} />
    </button>
);

export const ProfilePage: React.FC = () => {
    const auth = useStore((s) => s.auth);
    const setCurrentView = useStore((s) => s.setCurrentView);
    const setAuthUser = useStore((s) => s.setAuthUser);
    const theme = useStore((s) => s.theme);
    const toggleTheme = useStore((s) => s.toggleTheme);
    const storage = useStore((s) => s.storage);
    const { signOut } = useAuth();

    const initials = useMemo(
        () => deriveInitials(auth.displayName, auth.email),
        [auth.displayName, auth.email],
    );

    // ─── Section rail / scroll spy ─────────────────────────────────────
    const [activeSection, setActiveSection] = useState<SectionId>('account');
    const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible?.target.id) setActiveSection(visible.target.id as SectionId);
            },
            { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
        );
        SECTIONS.forEach(({ id }) => {
            const el = sectionRefs.current[id];
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const jumpTo = useCallback((id: SectionId) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // ─── Account ───────────────────────────────────────────────────────
    const [displayName, setDisplayName] = useState(auth.displayName || '');
    const [memberSince, setMemberSince] = useState<string | null>(null);
    const [savingName, setSavingName] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [copied, setCopied] = useState(false);
    const [accountFlash, setAccountFlash] = useState<Flash>(null);

    // Re-seed the field when the store's name changes under us (another tab,
    // a fresh sign-in). Adjusting during render is the sanctioned pattern —
    // an effect here would cost an extra render pass.
    const [nameBaseline, setNameBaseline] = useState(auth.displayName || '');
    if (nameBaseline !== (auth.displayName || '')) {
        setNameBaseline(auth.displayName || '');
        setDisplayName(auth.displayName || '');
    }

    useEffect(() => {
        if (!isSupabaseConfigured || !auth.userId) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('user_profiles')
                .select('created_at')
                .eq('id', auth.userId)
                .single();
            if (!cancelled && data?.created_at) setMemberSince(data.created_at as string);
        })();
        return () => {
            cancelled = true;
        };
    }, [auth.userId]);

    const nameDirty = displayName.trim() !== (auth.displayName || '').trim();

    const saveDisplayName = useCallback(async () => {
        if (!auth.userId || !isSupabaseConfigured) return;
        setSavingName(true);
        setAccountFlash(null);
        const { error } = await supabase
            .from('user_profiles')
            .update({ display_name: displayName.trim() })
            .eq('id', auth.userId);
        if (error) {
            setAccountFlash({ kind: 'err', text: error.message });
        } else {
            setAuthUser({
                id: auth.userId,
                email: auth.email ?? null,
                displayName: displayName.trim(),
            });
            setAccountFlash({ kind: 'ok', text: 'Display name updated.' });
        }
        setSavingName(false);
    }, [auth.userId, auth.email, displayName, setAuthUser]);

    const copyEmail = useCallback(async () => {
        if (!auth.email) return;
        try {
            await navigator.clipboard.writeText(auth.email);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setAccountFlash({ kind: 'err', text: 'Clipboard is blocked in this browser.' });
        }
    }, [auth.email]);

    const sendPasswordReset = useCallback(async () => {
        if (!auth.email || !isSupabaseConfigured) return;
        setSendingReset(true);
        setAccountFlash(null);
        const { error } = await supabase.auth.resetPasswordForEmail(auth.email, {
            redirectTo: `${window.location.origin}/update-password`,
        });
        setAccountFlash(
            error
                ? { kind: 'err', text: error.message }
                : { kind: 'ok', text: `Reset link sent to ${auth.email}.` },
        );
        setSendingReset(false);
    }, [auth.email]);

    // ─── Workspace ─────────────────────────────────────────────────────
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
    const [workspaceName, setWorkspaceName] = useState('');
    const [savedWorkspaceName, setSavedWorkspaceName] = useState('');
    const [savingWorkspace, setSavingWorkspace] = useState(false);
    const [switchingTo, setSwitchingTo] = useState<string | null>(null);
    const [workspaceFlash, setWorkspaceFlash] = useState<Flash>(null);
    const [shareOpen, setShareOpen] = useState(false);

    const activeWorkspaceId =
        auth.activeWorkspaceId || localStorage.getItem('chnk it.activeWorkspaceId');
    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;
    const canRenameWorkspace = activeWorkspace ? activeWorkspace.role !== 'viewer' : false;

    useEffect(() => {
        if (!auth.userId) return;
        let cancelled = false;
        (async () => {
            const result = await listAccessibleWorkspaces(auth.userId);
            if (cancelled) return;
            if (result.ok) {
                setWorkspaces(result.data);
                const current = result.data.find((w) => w.id === activeWorkspaceId);
                setWorkspaceName(current?.name || '');
                setSavedWorkspaceName(current?.name || '');
            } else {
                setWorkspaceFlash({ kind: 'err', text: result.error });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [auth.userId, activeWorkspaceId]);

    useEffect(() => {
        if (!activeWorkspaceId) return;
        let cancelled = false;
        (async () => {
            const [memberResult, inviteResult] = await Promise.all([
                listWorkspaceMembers(activeWorkspaceId),
                listWorkspaceInvitations(activeWorkspaceId),
            ]);
            if (cancelled) return;
            if (memberResult.ok) setMembers(memberResult.data);
            if (inviteResult.ok) {
                setInvitations(inviteResult.data.filter((i) => i.status === 'pending'));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeWorkspaceId, shareOpen]);

    const workspaceDirty = workspaceName.trim() !== savedWorkspaceName.trim();
    // An empty members list still means one person can open the canvas: you.
    const memberCount = members.length || 1;

    const saveWorkspaceName = useCallback(async () => {
        if (!activeWorkspaceId || !isSupabaseConfigured) return;
        setSavingWorkspace(true);
        setWorkspaceFlash(null);
        const { error } = await supabase
            .from('workspaces')
            .update({ name: workspaceName.trim() })
            .eq('id', activeWorkspaceId);
        if (error) {
            setWorkspaceFlash({ kind: 'err', text: error.message });
        } else {
            setSavedWorkspaceName(workspaceName.trim());
            setWorkspaces((prev) =>
                prev.map((w) => (w.id === activeWorkspaceId ? { ...w, name: workspaceName.trim() } : w)),
            );
            setWorkspaceFlash({ kind: 'ok', text: 'Workspace renamed.' });
        }
        setSavingWorkspace(false);
    }, [activeWorkspaceId, workspaceName]);

    const switchWorkspace = useCallback(
        async (id: string) => {
            if (!auth.userId || id === activeWorkspaceId) return;
            setSwitchingTo(id);
            setWorkspaceFlash(null);
            const result = await activateWorkspace(auth.userId, id);
            setSwitchingTo(null);
            if (!result.ok) {
                setWorkspaceFlash({ kind: 'err', text: result.error });
                return;
            }
            const name = workspaces.find((w) => w.id === id)?.name || 'workspace';
            setWorkspaceFlash({
                kind: 'ok',
                text: `Switched to ${name} — ${result.data.nodeCount} cards loaded from the cloud.`,
            });
        },
        [auth.userId, activeWorkspaceId, workspaces],
    );

    // ─── Storage & sync ────────────────────────────────────────────────
    const [storageMode, setStorageMode] = useState<StorageMode | null>(() => readStorageMode(auth.userId));
    const [autosync, setAutosync] = useState(() => readAutosync(auth.activeWorkspaceId));

    // Both values live in localStorage keyed by user + workspace, so re-read
    // them whenever that pair changes (workspace switch, account switch).
    const storageScope = `${auth.userId ?? ''}|${auth.activeWorkspaceId ?? ''}`;
    const [storageScopeBaseline, setStorageScopeBaseline] = useState(storageScope);
    if (storageScopeBaseline !== storageScope) {
        setStorageScopeBaseline(storageScope);
        setStorageMode(readStorageMode(auth.userId));
        setAutosync(readAutosync(auth.activeWorkspaceId));
    }

    // The canvas storage menu writes the same keys — stay in step with it.
    useEffect(() => {
        const onExternalChange = () => {
            setStorageMode(readStorageMode(auth.userId));
            setAutosync(readAutosync(auth.activeWorkspaceId));
        };
        window.addEventListener('chnk-it-storage-mode-changed', onExternalChange);
        return () => window.removeEventListener('chnk-it-storage-mode-changed', onExternalChange);
    }, [auth.userId, auth.activeWorkspaceId]);

    const chooseStorageMode = useCallback(
        (mode: StorageMode) => {
            if (!auth.userId) return;
            localStorage.setItem(storageModeKey(auth.userId), mode);
            const nextAutosync = mode !== 'local';
            localStorage.setItem(autosyncKey(auth.activeWorkspaceId), nextAutosync ? 'true' : 'false');
            setStorageMode(mode);
            setAutosync(nextAutosync);
            // StorageControls listens for this and re-reads both keys.
            window.dispatchEvent(new CustomEvent('chnk-it-storage-mode-changed'));
        },
        [auth.userId, auth.activeWorkspaceId],
    );

    const changeAutosync = useCallback(
        (next: boolean) => {
            localStorage.setItem(autosyncKey(auth.activeWorkspaceId), next ? 'true' : 'false');
            setAutosync(next);
            window.dispatchEvent(new CustomEvent('chnk-it-storage-mode-changed'));
        },
        [auth.activeWorkspaceId],
    );

    // ─── Integrations ──────────────────────────────────────────────────
    const [connectingNotion, setConnectingNotion] = useState(false);
    const [notionOpen, setNotionOpen] = useState(false);
    const [notionFlash, setNotionFlash] = useState<Flash>(null);

    const handleConnectNotion = useCallback(async () => {
        setNotionFlash(null);
        setConnectingNotion(true);
        const result = await connectNotion();
        // On success the browser leaves for Notion's consent screen.
        if (!result.ok) {
            setConnectingNotion(false);
            setNotionFlash({ kind: 'err', text: result.error });
        }
    }, []);

    // ─── Data & account ────────────────────────────────────────────────
    const [dataFlash, setDataFlash] = useState<Flash>(null);

    const exportCanvas = useCallback(() => {
        const { nodes, edges } = useStore.getState();
        const payload = {
            exportedAt: new Date().toISOString(),
            workspaceId: activeWorkspaceId,
            nodes,
            edges,
        };
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `chnk-it-canvas-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setDataFlash({
            kind: 'ok',
            text: `Exported ${nodes.length} cards and ${edges.length} connections.`,
        });
    }, [activeWorkspaceId]);

    const handleSignOut = useCallback(async () => {
        await signOut();
        window.history.replaceState({}, '', '/');
        setCurrentView('marketing');
    }, [signOut, setCurrentView]);

    // Logged-out visitors never see this screen — bounce them after render,
    // not during it (a setState during render would warn).
    useEffect(() => {
        if (!auth.isAuthLoading && !auth.isAuthenticated) setCurrentView('landing');
    }, [auth.isAuthLoading, auth.isAuthenticated, setCurrentView]);

    if (!auth.isAuthenticated) return null;

    const registerSection = (id: SectionId) => (el: HTMLElement | null) => {
        sectionRefs.current[id] = el;
    };

    return (
        <div className={styles.page}>
            <header className={styles.topbar}>
                <div className={styles.topbarInner}>
                    <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={<ArrowLeft size={15} />}
                        onClick={() => {
                            window.history.pushState({}, '', '/');
                            setCurrentView('landing');
                        }}
                    >
                        Home
                    </Button>
                    <span className={styles.crumb}>Settings</span>
                    <div className={styles.topActions}>
                        <Button
                            variant="secondary"
                            size="sm"
                            leadingIcon={<Frame size={15} />}
                            onClick={() => {
                                window.history.pushState({}, '', '/canvas');
                                setCurrentView('canvas');
                            }}
                        >
                            Open canvas
                        </Button>
                    </div>
                </div>
            </header>

            <div className={styles.masthead}>
                <div className={styles.avatar} aria-hidden="true">
                    {initials}
                </div>
                <div className={styles.identity}>
                    <h1 className={styles.name}>{auth.displayName || 'Your account'}</h1>
                    <p className={styles.mail}>{auth.email}</p>
                    <div className={styles.mastheadMeta}>
                        {activeWorkspace && (
                            <span className={`${styles.chip} ${styles.chipAccent}`}>
                                {activeWorkspace.role}
                            </span>
                        )}
                        <span className={styles.chip}>
                            {activeWorkspace ? activeWorkspace.name : 'No workspace'}
                        </span>
                        {memberSince && <span className={styles.chip}>Since {formatDate(memberSince)}</span>}
                    </div>
                </div>
            </div>

            <div className={styles.body}>
                <nav className={styles.rail} aria-label="Settings sections">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`${styles.railLink} ${
                                activeSection === s.id ? styles.railLinkActive : ''
                            }`}
                            aria-current={activeSection === s.id ? 'true' : undefined}
                            onClick={() => jumpTo(s.id)}
                        >
                            <span className={styles.railIndex}>{s.index}</span>
                            <span>{s.title}</span>
                        </button>
                    ))}
                </nav>

                <main className={styles.sections}>
                    {/* ── I · Account ──────────────────────────────── */}
                    <section id="account" ref={registerSection('account')} className={styles.section}>
                        <div className={styles.head}>
                            <span className={styles.index}>I</span>
                            <h2 className={styles.title}>Account</h2>
                            <span className={styles.aside}>
                                {isSupabaseConfigured ? 'Verified via Supabase' : 'Offline mode'}
                            </span>
                        </div>

                        <Row label="Display name" htmlFor="settings-name" hint="Shown on shared canvases and in your workspace.">
                            <input
                                id="settings-name"
                                className={styles.input}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Add a name"
                                autoComplete="name"
                            />
                        </Row>

                        <Row label="Email" hint="Used to sign in. Contact support to change it.">
                            <span className={styles.mono}>{auth.email || '—'}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                leadingIcon={copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                                onClick={copyEmail}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </Row>

                        <Row label="Password" hint="We email a secure link; the new password is set from there.">
                            <Button
                                variant="secondary"
                                size="sm"
                                leadingIcon={<Lock size={14} />}
                                loading={sendingReset}
                                disabled={!auth.email || !isSupabaseConfigured}
                                onClick={sendPasswordReset}
                            >
                                Send reset link
                            </Button>
                        </Row>

                        <Row label="Member since">
                            <span className={styles.mono}>{formatDate(memberSince)}</span>
                        </Row>

                        {nameDirty && (
                            <div className={styles.dirtyBar}>
                                <span className={styles.dirtyNote}>Unsaved name change</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDisplayName(auth.displayName || '')}
                                >
                                    Revert
                                </Button>
                                <Button variant="primary" size="sm" loading={savingName} onClick={saveDisplayName}>
                                    Save
                                </Button>
                            </div>
                        )}
                        <FlashNote flash={accountFlash} />
                    </section>

                    {/* ── II · Workspace ───────────────────────────── */}
                    <section id="workspace" ref={registerSection('workspace')} className={styles.section}>
                        <div className={styles.head}>
                            <span className={styles.index}>II</span>
                            <h2 className={styles.title}>Workspace</h2>
                            <span className={styles.aside}>
                                {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                {invitations.length > 0 && ` · ${invitations.length} invited`}
                            </span>
                        </div>

                        <Row
                            label="Active workspace"
                            hint="Switching loads that workspace's canvas from the cloud and replaces what's on screen."
                            htmlFor="settings-workspace-active"
                        >
                            <select
                                id="settings-workspace-active"
                                className={styles.select}
                                value={activeWorkspaceId || ''}
                                disabled={workspaces.length === 0 || switchingTo !== null}
                                onChange={(e) => switchWorkspace(e.target.value)}
                            >
                                {workspaces.length === 0 && <option value="">No workspace linked</option>}
                                {workspaces.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name} · {w.role}
                                    </option>
                                ))}
                            </select>
                            {switchingTo && <span className={styles.mono}>Loading…</span>}
                        </Row>

                        <Row
                            label="Workspace name"
                            htmlFor="settings-workspace-name"
                            hint={
                                canRenameWorkspace
                                    ? 'Everyone with access sees this name.'
                                    : 'Only owners and editors can rename a workspace.'
                            }
                        >
                            <input
                                id="settings-workspace-name"
                                className={styles.input}
                                value={workspaceName}
                                disabled={!activeWorkspaceId || !canRenameWorkspace}
                                onChange={(e) => setWorkspaceName(e.target.value)}
                                placeholder={activeWorkspaceId ? 'Name this workspace' : 'No workspace linked'}
                            />
                        </Row>

                        <Row label="People" stacked hint="Everyone who can open this workspace's canvas.">
                            <div className={styles.people}>
                                {members.length === 0 && (
                                    <div className={styles.empty}>Just you, for now.</div>
                                )}
                                {members.map((m) => (
                                    <div key={m.userId} className={styles.person}>
                                        <span className={styles.personAvatar} aria-hidden="true">
                                            {deriveInitials(m.displayName, m.email)}
                                        </span>
                                        <span className={styles.personMeta}>
                                            <span className={styles.personName}>
                                                {m.displayName || m.email || 'Member'}
                                            </span>
                                            <span className={styles.personMail}>{m.email || '—'}</span>
                                        </span>
                                        <span className={styles.chip}>{m.role}</span>
                                    </div>
                                ))}
                                {invitations.map((i) => (
                                    <div key={i.id} className={styles.person}>
                                        <span className={styles.personAvatar} aria-hidden="true">
                                            <Mail size={13} />
                                        </span>
                                        <span className={styles.personMeta}>
                                            <span className={styles.personName}>{i.invitedEmail}</span>
                                            <span className={styles.personMail}>
                                                Invited {formatDate(i.createdAt)}
                                            </span>
                                        </span>
                                        <span className={styles.chip}>pending · {i.role}</span>
                                    </div>
                                ))}
                            </div>
                        </Row>

                        <Row label="Invite someone" hint="Send an email invite as editor or viewer.">
                            <Button
                                variant="secondary"
                                size="sm"
                                leadingIcon={<UserPlus size={14} />}
                                disabled={!activeWorkspaceId}
                                onClick={() => setShareOpen(true)}
                            >
                                Invite people
                            </Button>
                        </Row>

                        {workspaceDirty && (
                            <div className={styles.dirtyBar}>
                                <span className={styles.dirtyNote}>Unsaved workspace name</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setWorkspaceName(savedWorkspaceName)}
                                >
                                    Revert
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    loading={savingWorkspace}
                                    onClick={saveWorkspaceName}
                                >
                                    Save
                                </Button>
                            </div>
                        )}
                        <FlashNote flash={workspaceFlash} />
                    </section>

                    {/* ── III · Storage & sync ─────────────────────── */}
                    <section id="storage" ref={registerSection('storage')} className={styles.section}>
                        <div className={styles.head}>
                            <span className={styles.index}>III</span>
                            <h2 className={styles.title}>Storage &amp; sync</h2>
                            <span className={styles.aside}>
                                {storageMode ? `Mode · ${storageMode}` : 'Not chosen yet'}
                            </span>
                        </div>

                        <Row
                            label="How your work is saved"
                            stacked
                            hint="The same choice you made on first sign-in. Changing it here takes effect on the canvas immediately."
                        >
                            <Tabs
                                items={STORAGE_TABS}
                                value={storageMode}
                                onChange={chooseStorageMode}
                                color="accent"
                                semantics="radio"
                                aria-label="Storage mode"
                            />
                        </Row>

                        <Row
                            label="Auto-sync to cloud"
                            hint={
                                storageMode === 'local'
                                    ? 'Off while saving is local-only.'
                                    : 'Pushes canvas changes to your workspace in the background.'
                            }
                        >
                            <Toggle
                                checked={autosync}
                                onChange={changeAutosync}
                                disabled={storageMode === 'local'}
                                label="Auto-sync to cloud"
                            />
                        </Row>

                        <Row
                            label="Connected folder"
                            hint="Optional local folder mirror. Chromium browsers only."
                        >
                            <span className={styles.mono}>
                                {storage.isConnected && storage.directoryName ? (
                                    <>
                                        <FolderCheck size={14} /> {storage.directoryName}
                                    </>
                                ) : (
                                    'Not connected'
                                )}
                            </span>
                        </Row>

                        <Row label="Last cloud save">
                            <span className={styles.mono}>{storage.cloudLastSaved || 'Never'}</span>
                        </Row>

                        <Row label="Last cloud load">
                            <span className={styles.mono}>{storage.cloudLastLoaded || 'Never'}</span>
                        </Row>
                    </section>

                    {/* ── IV · Appearance ──────────────────────────── */}
                    <section id="appearance" ref={registerSection('appearance')} className={styles.section}>
                        <div className={styles.head}>
                            <span className={styles.index}>IV</span>
                            <h2 className={styles.title}>Appearance</h2>
                            <span className={styles.aside}>{theme === 'dark' ? 'Ink' : 'Paper'}</span>
                        </div>

                        <Row label="Theme" hint="Ink is the dark surface, Paper the light one. Applies everywhere.">
                            <Tabs
                                items={THEME_TABS}
                                value={theme === 'dark' ? 'dark' : 'light'}
                                /* `toggleTheme` flips, so only act when the
                                   pick differs from the current theme —
                                   re-selecting the active tab must be inert. */
                                onChange={(next, trigger) => {
                                    if (next !== theme) toggleTheme(originFromEvent(trigger));
                                }}
                                color="accent"
                                semantics="radio"
                                aria-label="Theme"
                            />
                        </Row>
                    </section>

                    {/* ── V · Integrations ─────────────────────────── */}
                    <section
                        id="integrations"
                        ref={registerSection('integrations')}
                        className={styles.section}
                    >
                        <div className={styles.head}>
                            <span className={styles.index}>V</span>
                            <h2 className={styles.title}>Integrations</h2>
                            <span className={styles.aside}>Notion</span>
                        </div>

                        <Row
                            label="Notion"
                            hint="Authorise once, then pull any page or database onto the canvas as editable cards."
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                loading={connectingNotion}
                                onClick={handleConnectNotion}
                            >
                                Connect
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setNotionOpen(true)}>
                                Import…
                            </Button>
                        </Row>
                        <FlashNote flash={notionFlash} />
                    </section>

                    {/* ── VI · Data & account ──────────────────────── */}
                    <section id="danger" ref={registerSection('danger')} className={styles.section}>
                        <div className={styles.head}>
                            <span className={styles.index}>VI</span>
                            <h2 className={styles.title}>Data &amp; account</h2>
                            <span className={styles.aside}>Irreversible below</span>
                        </div>

                        <Row
                            label="Export canvas"
                            hint="Downloads the open canvas — cards and connections — as JSON. Uploaded files stay in this browser."
                        >
                            <Button
                                variant="secondary"
                                size="sm"
                                leadingIcon={<Download size={14} />}
                                onClick={exportCanvas}
                            >
                                Download JSON
                            </Button>
                        </Row>

                        <Row label="Sign out" hint="Ends the session on this device only.">
                            <Button
                                variant="ghost"
                                size="sm"
                                leadingIcon={<LogOut size={14} />}
                                onClick={handleSignOut}
                            >
                                Sign out
                            </Button>
                        </Row>

                        <Row
                            label="Delete account"
                            danger
                            hint="Removes your profile, workspaces and every synced card. We confirm by email first — deletion is handled by a human during the beta."
                        >
                            <Button
                                variant="danger"
                                size="sm"
                                leadingIcon={<Trash2 size={14} />}
                                onClick={() => {
                                    window.location.href = SUPPORT_MAILTO;
                                }}
                            >
                                Request deletion
                            </Button>
                        </Row>
                        <FlashNote flash={dataFlash} />
                    </section>
                </main>
            </div>

            <ShareWorkspaceModal open={shareOpen} onClose={() => setShareOpen(false)} />
            <NotionImportModal open={notionOpen} onClose={() => setNotionOpen(false)} />
        </div>
    );
};

export default ProfilePage;
