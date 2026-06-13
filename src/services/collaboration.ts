import { isSupabaseConfigured, supabase } from './supabase/client';
import { loadCanvasFromCloud } from './cloudSync';
import { useStore } from '../store/useStore';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceSummary {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string | null;
    ownerName: string | null;
    role: WorkspaceRole;
    createdAt: string | null;
}

export interface WorkspaceMember {
    userId: string;
    email: string | null;
    displayName: string | null;
    role: WorkspaceRole;
    joinedAt: string | null;
}

export interface WorkspaceInvitation {
    id: string;
    workspaceId: string;
    workspaceName: string;
    invitedEmail: string;
    role: Exclude<WorkspaceRole, 'owner'>;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    invitedBy: string;
    createdAt: string | null;
    expiresAt: string | null;
    acceptUrl?: string | null;
    emailDelivery?: 'sent' | 'failed';
    emailProvider?: 'resend' | 'supabase-auth' | null;
    emailError?: string | null;
    emailFrom?: string | null;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type InvitationRow = {
    id: string;
    workspace_id: string;
    invited_email: string;
    role: string;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    invited_by: string;
    created_at: string | null;
    expires_at: string | null;
    workspaces?: { name?: string | null } | null;
};

function failure(error: unknown): { ok: false; error: string } {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function requireSupabase() {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured.');
    }
    return supabase;
}

export async function listAccessibleWorkspaces(currentUserId: string | null): Promise<Result<WorkspaceSummary[]>> {
    try {
        const client = requireSupabase();
        if (!currentUserId) throw new Error('User not authenticated');

        const { data: workspaces, error } = await client
            .from('workspaces')
            .select('id, name, owner_id, created_at')
            .order('created_at', { ascending: true });
        if (error) throw error;

        const workspaceRows = (workspaces ?? []) as Array<{
            id: string;
            name: string | null;
            owner_id: string;
            created_at: string | null;
        }>;

        if (workspaceRows.length === 0) return { ok: true, data: [] };

        const workspaceIds = workspaceRows.map((workspace) => workspace.id);
        const ownerIds = Array.from(new Set(workspaceRows.map((workspace) => workspace.owner_id)));

        const [{ data: memberships }, { data: owners }] = await Promise.all([
            client
                .from('workspace_members')
                .select('workspace_id, user_id, role, created_at')
                .in('workspace_id', workspaceIds),
            client
                .from('user_profiles')
                .select('id, email, display_name')
                .in('id', ownerIds),
        ]);

        const roleByWorkspace = new Map<string, WorkspaceRole>();
        for (const member of (memberships ?? []) as Array<{ workspace_id: string; user_id: string; role: WorkspaceRole }>) {
            if (member.user_id === currentUserId) {
                roleByWorkspace.set(member.workspace_id, member.role);
            }
        }

        const ownerById = new Map(
            ((owners ?? []) as Array<{ id: string; email: string | null; display_name: string | null }>)
                .map((owner) => [owner.id, owner]),
        );

        return {
            ok: true,
            data: workspaceRows.map((workspace) => {
                const owner = ownerById.get(workspace.owner_id);
                return {
                    id: workspace.id,
                    name: workspace.name || 'Untitled workspace',
                    ownerId: workspace.owner_id,
                    ownerEmail: owner?.email ?? null,
                    ownerName: owner?.display_name ?? null,
                    role: workspace.owner_id === currentUserId ? 'owner' : roleByWorkspace.get(workspace.id) ?? 'editor',
                    createdAt: workspace.created_at,
                };
            }),
        };
    } catch (error) {
        return failure(error);
    }
}

export async function listWorkspaceMembers(workspaceId: string | null): Promise<Result<WorkspaceMember[]>> {
    try {
        const client = requireSupabase();
        if (!workspaceId) throw new Error('No active workspace selected.');

        const { data: members, error } = await client
            .from('workspace_members')
            .select('workspace_id, user_id, role, created_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });
        if (error) throw error;

        const memberRows = (members ?? []) as Array<{
            user_id: string;
            role: WorkspaceRole;
            created_at: string | null;
        }>;
        if (memberRows.length === 0) return { ok: true, data: [] };

        const { data: profiles, error: profileError } = await client
            .from('user_profiles')
            .select('id, email, display_name')
            .in('id', memberRows.map((member) => member.user_id));
        if (profileError) throw profileError;

        const profileById = new Map(
            ((profiles ?? []) as Array<{ id: string; email: string | null; display_name: string | null }>)
                .map((profile) => [profile.id, profile]),
        );

        return {
            ok: true,
            data: memberRows.map((member) => {
                const profile = profileById.get(member.user_id);
                return {
                    userId: member.user_id,
                    email: profile?.email ?? null,
                    displayName: profile?.display_name ?? null,
                    role: member.role,
                    joinedAt: member.created_at,
                };
            }),
        };
    } catch (error) {
        return failure(error);
    }
}

export async function listWorkspaceInvitations(workspaceId: string | null): Promise<Result<WorkspaceInvitation[]>> {
    try {
        const client = requireSupabase();
        if (!workspaceId) throw new Error('No active workspace selected.');

        const { data, error } = await client
            .from('workspace_invitations')
            .select('id, workspace_id, invited_email, role, status, invited_by, created_at, expires_at, workspaces(name)')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        return {
            ok: true,
            data: ((data ?? []) as InvitationRow[]).map((invite) => ({
                id: String(invite.id),
                workspaceId: String(invite.workspace_id),
                workspaceName: invite.workspaces?.name ?? 'Shared workspace',
                invitedEmail: String(invite.invited_email),
                role: invite.role === 'viewer' ? 'viewer' : 'editor',
                status: invite.status,
                invitedBy: String(invite.invited_by),
                createdAt: invite.created_at ?? null,
                expiresAt: invite.expires_at ?? null,
            })),
        };
    } catch (error) {
        return failure(error);
    }
}

export async function listPendingInvitationsForCurrentUser(): Promise<Result<WorkspaceInvitation[]>> {
    try {
        const client = requireSupabase();
        const { data, error } = await client
            .from('workspace_invitations')
            .select('id, workspace_id, invited_email, role, status, invited_by, created_at, expires_at, workspaces(name)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) throw error;

        return {
            ok: true,
            data: ((data ?? []) as InvitationRow[]).map((invite) => ({
                id: String(invite.id),
                workspaceId: String(invite.workspace_id),
                workspaceName: invite.workspaces?.name ?? 'Shared workspace',
                invitedEmail: String(invite.invited_email),
                role: invite.role === 'viewer' ? 'viewer' : 'editor',
                status: invite.status,
                invitedBy: String(invite.invited_by),
                createdAt: invite.created_at ?? null,
                expiresAt: invite.expires_at ?? null,
            })),
        };
    } catch (error) {
        return failure(error);
    }
}

export async function inviteWorkspaceMember(
    workspaceId: string | null,
    email: string,
    role: Exclude<WorkspaceRole, 'owner'> = 'editor',
): Promise<Result<WorkspaceInvitation>> {
    try {
        const client = requireSupabase();
        if (!workspaceId) throw new Error('No active workspace selected.');

        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('You must be signed in to invite collaborators.');

        const response = await fetch('/api/workspace/invite', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                workspaceId,
                email,
                role,
            }),
        });

        const payload = await response.json().catch(() => ({})) as {
            error?: string;
            invitation?: Record<string, unknown>;
            workspaceName?: string;
            acceptUrl?: string;
            emailDelivery?: 'sent' | 'failed';
            emailProvider?: 'resend' | 'supabase-auth' | null;
            emailError?: string | null;
            emailFrom?: string | null;
        };

        if (!response.ok) {
            throw new Error(payload.error || `Invitation failed with HTTP ${response.status}`);
        }
        if (!payload.invitation) {
            throw new Error('Invitation was created without a valid server response.');
        }

        const invite = payload.invitation;
        return {
            ok: true,
            data: {
                id: String(invite.id),
                workspaceId: String(invite.workspace_id),
                workspaceName: payload.workspaceName || 'Shared workspace',
                invitedEmail: String(invite.invited_email),
                role: invite.role === 'viewer' ? 'viewer' : 'editor',
                status: 'pending',
                invitedBy: String(invite.invited_by),
                createdAt: String(invite.created_at ?? ''),
                expiresAt: String(invite.expires_at ?? ''),
                acceptUrl: payload.acceptUrl || null,
                emailDelivery: payload.emailDelivery,
                emailProvider: payload.emailProvider ?? null,
                emailError: payload.emailError ?? null,
                emailFrom: payload.emailFrom ?? null,
            },
        };
    } catch (error) {
        return failure(error);
    }
}

export async function acceptWorkspaceInvitation(invitationId: string): Promise<Result<{ workspaceId: string }>> {
    try {
        const client = requireSupabase();
        const { data, error } = await client.rpc('accept_workspace_invitation', {
            _invitation_id: invitationId,
        });
        if (error) throw error;
        return { ok: true, data: { workspaceId: String(data) } };
    } catch (error) {
        return failure(error);
    }
}

export function persistActiveWorkspace(userId: string, workspaceId: string): void {
    localStorage.setItem(`chnk-it.activeWorkspaceId.${userId}`, workspaceId);
    localStorage.setItem('chnk it.activeWorkspaceId', workspaceId);
}

/**
 * Make a workspace the active canvas and load its authoritative cloud graph.
 * This is used after accepting an invite and when switching workspaces so the
 * previous workspace's local graph can never remain visible by accident.
 */
export async function activateWorkspace(
    userId: string,
    workspaceId: string,
): Promise<Result<{ workspaceId: string; nodeCount: number; edgeCount: number }>> {
    try {
        const result = await loadCanvasFromCloud(userId, workspaceId);
        if (!result.ok) throw new Error(result.error);

        persistActiveWorkspace(userId, workspaceId);

        const state = useStore.getState();
        state.setAuthWorkspace(workspaceId);
        state.loadGraph(result.nodes, result.edges);
        state.navigateToNode(null);
        state.clearSyncTracking(
            new Set(state.storage.dirtyNodeIds),
            new Set(state.storage.dirtyEdgeIds),
            new Set(state.storage.deletedNodeIds),
            new Set(state.storage.deletedEdgeIds),
        );
        state.setCloudDirty(false);
        state.setCloudError(null);
        state.setCloudLastSaved(new Date().toLocaleTimeString());

        return {
            ok: true,
            data: {
                workspaceId,
                nodeCount: result.nodes.length,
                edgeCount: result.edges.length,
            },
        };
    } catch (error) {
        return failure(error);
    }
}
