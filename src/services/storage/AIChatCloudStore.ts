/**
 * Account-backed persistence for AI chat sessions.
 *
 * IndexedDB remains the fast, offline cache. This store is deliberately a
 * second destination: when the same signed-in account opens the app elsewhere,
 * the transcript can be restored from Supabase and seeded back into the local
 * cache. RLS keeps every conversation private to its owner, even in a shared
 * workspace.
 */
import type { AIChatSession } from './AIChatStore';
import type { AIMessage } from '../../features/ai/aiTypes';
import { isSupabaseConfigured, supabase } from '../supabase/client';

type AIChatCloudRow = {
    id: string;
    title: string;
    messages_json: AIMessage[];
    created_at: string;
    updated_at: string;
    board_id: string | null;
};

function fromCloudRow(row: AIChatCloudRow): AIChatSession | null {
    if (!row || !Array.isArray(row.messages_json)) return null;
    const createdAt = Date.parse(row.created_at);
    const updatedAt = Date.parse(row.updated_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
    return {
        id: row.id,
        title: row.title || 'New chat',
        messages: row.messages_json,
        createdAt,
        updatedAt,
        boardId: row.board_id,
    };
}

function ready(userId: string | null): userId is string {
    return Boolean(isSupabaseConfigured && supabase && userId && userId.trim());
}

export async function saveChatToCloud(session: AIChatSession, userId: string | null, workspaceId: string | null): Promise<void> {
    if (!ready(userId)) return;
    const { error } = await supabase
        .from('ai_chats')
        .upsert({
            id: session.id,
            user_id: userId,
            workspace_id: workspaceId,
            board_id: session.boardId ?? null,
            title: session.title,
            messages_json: session.messages,
            created_at: new Date(session.createdAt).toISOString(),
            updated_at: new Date(session.updatedAt).toISOString(),
        }, { onConflict: 'id' });
    if (error) throw error;
}

/** All of the signed-in user's conversations, across their workspaces. */
export async function listCloudChats(userId: string | null): Promise<AIChatSession[]> {
    if (!ready(userId)) return [];
    const { data, error } = await supabase
        .from('ai_chats')
        .select('id, title, messages_json, created_at, updated_at, board_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return (data as AIChatCloudRow[] | null ?? [])
        .map(fromCloudRow)
        .filter((session): session is AIChatSession => session !== null);
}

export async function loadCloudChat(id: string, userId: string | null): Promise<AIChatSession | null> {
    if (!ready(userId)) return null;
    const { data, error } = await supabase
        .from('ai_chats')
        .select('id, title, messages_json, created_at, updated_at, board_id')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data ? fromCloudRow(data as AIChatCloudRow) : null;
}

export async function deleteCloudChat(id: string, userId: string | null): Promise<void> {
    if (!ready(userId)) return;
    const { error } = await supabase.from('ai_chats').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
}
