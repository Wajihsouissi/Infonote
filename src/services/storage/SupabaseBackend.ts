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

        try {
            // Fetch nodes and edges in parallel for speed.
            const [nodesRes, edgesRes] = await Promise.all([
                supabase.from('nodes').select('*').eq('workspace_id', this._workspaceId),
                supabase.from('connections').select('*').eq('workspace_id', this._workspaceId)
            ]);

            if (nodesRes.error) throw nodesRes.error;
            if (edgesRes.error) throw edgesRes.error;

            const nodes = (nodesRes.data || []).map((row: any) => ({
                id: row.id,
                type: row.type,
                position: { x: row.x_pos, y: row.y_pos },
                data: row.data
            }));

            const edges = (edgesRes.data || []).map((row: any) => ({
                id: row.id,
                source: row.source_id,
                target: row.target_id,
                data: row.data
            }));

            return { nodes, edges };
        } catch (error) {
            console.error('[SupabaseBackend] load failed:', error);
            return null;
        }
    }

    async save(data: GraphData): Promise<void> {
        if (!this._workspaceId) {
            throw new Error('SupabaseBackend.save called without active workspace');
        }

        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) throw new Error('No authenticated user');

        const workspaceId = this._workspaceId;

        try {
            // 1. Map React Flow data to our normalized schema
            const dbNodes = data.nodes.map(n => ({
                id: n.id,
                workspace_id: workspaceId,
                user_id: userId,
                type: n.type || 'block',
                x_pos: n.position.x,
                y_pos: n.position.y,
                data: n.data || {}
            }));

            const dbEdges = data.edges.map(e => ({
                id: e.id,
                workspace_id: workspaceId,
                user_id: userId,
                source_id: e.source,
                target_id: e.target,
                data: e.data || {}
            }));

            // 2. Perform bulk upserts
            const [nodesUpsert, edgesUpsert] = await Promise.all([
                supabase.from('nodes').upsert(dbNodes, { onConflict: 'workspace_id,id' }),
                supabase.from('connections').upsert(dbEdges, { onConflict: 'workspace_id,id' })
            ]);

            if (nodesUpsert.error) throw nodesUpsert.error;
            if (edgesUpsert.error) throw edgesUpsert.error;

            // 3. Handle deletions (remove items in DB that are no longer in the frontend state)
            const nodeIds = data.nodes.map(n => n.id);
            const edgeIds = data.edges.map(e => e.id);

            // Using .not('id', 'in', array) is correct for v2
            if (nodeIds.length > 0) {
                await supabase.from('nodes')
                    .delete()
                    .eq('workspace_id', workspaceId)
                    .not('id', 'in', nodeIds);
            } else {
                await supabase.from('nodes').delete().eq('workspace_id', workspaceId);
            }

            if (edgeIds.length > 0) {
                await supabase.from('connections')
                    .delete()
                    .eq('workspace_id', workspaceId)
                    .not('id', 'in', edgeIds);
            } else {
                await supabase.from('connections').delete().eq('workspace_id', workspaceId);
            }

        } catch (error) {
            console.error('[SupabaseBackend] save failed:', error);
            throw error;
        }
    }
}

export const supabaseBackend = new SupabaseBackend();
