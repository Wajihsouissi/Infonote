/**
 * Supabase implementation of the GraphBackend contract.
 *
 * v1 model: one row per workspace in `graph_snapshots` holding the entire
 * nodes/edges blob. This mirrors the current File System layout so the app
 * can treat both backends symmetrically. See supabase/migrations/0001_init.sql.
 */
import type { GraphBackend, GraphData } from './types';
import { supabase, isSupabaseConfigured } from '../supabase/client';

const ACTIVE_WORKSPACE_KEY = 'infonote.activeWorkspaceId';

export class SupabaseBackend implements GraphBackend {
    readonly kind = 'supabase' as const;

    private _workspaceId: string | null = null;
    private _workspaceName: string | null = null;

    get isConnected(): boolean {
        return Boolean(this._workspaceId);
    }

    get displayName(): string | null {
        if (!this._workspaceId) return null;
        return this._workspaceName ? `Cloud: ${this._workspaceName}` : 'Cloud';
    }

    get workspaceId(): string | null {
        return this._workspaceId;
    }

    /**
     * Connect by locating or creating the user's default workspace. Requires
     * an authenticated session - call this after the auth flow resolves.
     */
    async connect(): Promise<boolean> {
        if (!isSupabaseConfigured) {
            console.warn('[SupabaseBackend] Supabase env not configured');
            return false;
        }

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes.user) {
            console.warn('[SupabaseBackend] No authenticated user');
            return false;
        }
        const userId = userRes.user.id;

        // Prefer an explicitly selected workspace from localStorage.
        const stored = typeof localStorage !== 'undefined'
            ? localStorage.getItem(ACTIVE_WORKSPACE_KEY)
            : null;

        if (stored) {
            const { data } = await supabase
                .from('workspaces')
                .select('id, name')
                .eq('id', stored)
                .maybeSingle();
            if (data) {
                this._workspaceId = data.id;
                this._workspaceName = data.name;
                return true;
            }
        }

        // Fall back to any workspace the user is a member of.
        const { data: member } = await supabase
            .from('workspace_members')
            .select('workspace_id, workspaces:workspace_id (id, name)')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        // Supabase types the joined field as any[] | any depending on select.
        const existing = (member as any)?.workspaces as { id: string; name: string } | undefined;
        if (existing?.id) {
            this._workspaceId = existing.id;
            this._workspaceName = existing.name;
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, existing.id);
            return true;
        }

        // Nothing yet - create a default workspace.
        const { data: created, error: insertErr } = await supabase
            .from('workspaces')
            .insert({ owner_id: userId, name: 'My Workspace' })
            .select('id, name')
            .single();

        if (insertErr || !created) {
            console.error('[SupabaseBackend] Failed to create workspace:', insertErr);
            return false;
        }

        this._workspaceId = created.id;
        this._workspaceName = created.name;
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, created.id);
        return true;
    }

    async disconnect(): Promise<void> {
        this._workspaceId = null;
        this._workspaceName = null;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        }
    }

    async load(): Promise<GraphData | null> {
        if (!this._workspaceId) return null;

        const { data, error } = await supabase
            .from('graph_snapshots')
            .select('nodes, edges')
            .eq('workspace_id', this._workspaceId)
            .maybeSingle();

        if (error) {
            console.error('[SupabaseBackend] load failed:', error);
            return null;
        }
        if (!data) return null;

        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        const edges = Array.isArray(data.edges) ? data.edges : [];
        return { nodes, edges };
    }

    async save(data: GraphData): Promise<void> {
        if (!this._workspaceId) {
            throw new Error('SupabaseBackend.save called without active workspace');
        }

        const { error } = await supabase
            .from('graph_snapshots')
            .upsert(
                {
                    workspace_id: this._workspaceId,
                    nodes: data.nodes,
                    edges: data.edges,
                },
                { onConflict: 'workspace_id' }
            );

        if (error) {
            console.error('[SupabaseBackend] save failed:', error);
            throw error;
        }
    }
}

export const supabaseBackend = new SupabaseBackend();
