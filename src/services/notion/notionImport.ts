/**
 * Real Notion to canvas import pipeline.
 *
 * OAuth is delegated to Supabase, Notion REST calls are proxied through our
 * same-origin app API, and converted nodes are persisted through cloudSync.
 */
import {
    convertNotionDatabaseToCanvasNodes,
    convertNotionPageToCanvasNodes,
    type NotionBlock,
    type NotionConvertOptions,
    type NotionPage,
} from './notionConverter';
import { appendCanvasNodesToCloud } from '../cloudSync';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import type { AppNode } from '../../types';

export type NotionSourceKind = 'page' | 'database';

export interface NotionSearchItem {
    id: string;
    kind: NotionSourceKind;
    title: string;
    url: string | null;
    lastEditedTime: string | null;
}

export type NotionSearchResult =
    | { ok: true; items: NotionSearchItem[]; hasMore: boolean }
    | { ok: false; error: string };

export type NotionImportResult =
    | {
          ok: true;
          imported: number;
          skipped: number;
          nodes: AppNode[];
      }
    | { ok: false; error: string };

export interface NotionImportOptions extends NotionConvertOptions {
    accessToken: string;
    userId: string | null;
    workspaceId: string | null;
    parentId?: string | null;
    notionVersion?: string;
}

const DEFAULT_NOTION_VERSION = '2022-06-28';

export async function connectNotion(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isSupabaseConfigured || !supabase) {
        return { ok: false, error: 'Supabase not configured' };
    }

    try {
        const redirectTo = window.location.origin;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'notion',
            options: { redirectTo },
        });
        if (error) throw error;
        return { ok: true };
    } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (/provider.*not enabled|unsupported.*provider/i.test(raw)) {
            return {
                ok: false,
                error:
                    'The Notion provider is not enabled in Supabase. Enable Notion in Authentication -> Providers.',
            };
        }
        return { ok: false, error: raw };
    }
}

export async function getConnectedNotionAccessToken(): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error) return null;

    const session = data.session as unknown as {
        provider_token?: string | null;
        provider_refresh_token?: string | null;
    } | null;

    return session?.provider_token?.trim() || null;
}

export async function searchNotionWorkspace(options: {
    accessToken: string;
    query?: string;
    notionVersion?: string;
}): Promise<NotionSearchResult> {
    if (!options.accessToken.trim()) {
        return { ok: false, error: 'Connect Notion before importing workspace content.' };
    }

    try {
        const data = await postAppApi<{
            items?: NotionSearchItem[];
            hasMore?: boolean;
        }>('/api/notion/search', {
            accessToken: options.accessToken,
            query: options.query ?? '',
            notionVersion: options.notionVersion ?? DEFAULT_NOTION_VERSION,
        });

        return {
            ok: true,
            items: Array.isArray(data.items) ? data.items : [],
            hasMore: Boolean(data.hasMore),
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function fetchNotionPageData(
    pageId: string,
    options: NotionImportOptions,
): Promise<{ blocks: NotionBlock[]; page?: NotionPage }> {
    const data = await postAppApi<{ results?: NotionBlock[]; page?: NotionPage }>('/api/notion/fetch', {
        accessToken: options.accessToken,
        id: pageId,
        kind: 'page',
        notionVersion: options.notionVersion ?? DEFAULT_NOTION_VERSION,
    });
    return {
        blocks: Array.isArray(data.results) ? data.results : [],
        page: data.page,
    };
}

export async function queryNotionDatabase(
    databaseId: string,
    options: NotionImportOptions,
): Promise<NotionPage[]> {
    const data = await postAppApi<{ results?: NotionPage[] }>('/api/notion/fetch', {
        accessToken: options.accessToken,
        id: databaseId,
        kind: 'database',
        notionVersion: options.notionVersion ?? DEFAULT_NOTION_VERSION,
    });
    return Array.isArray(data.results) ? data.results : [];
}

export async function importNotionPage(
    pageId: string,
    options: NotionImportOptions,
): Promise<NotionImportResult> {
    if (!options.accessToken) {
        return { ok: false, error: 'A Notion access token is required.' };
    }
    if (!pageId) {
        return { ok: false, error: 'Missing Notion page id.' };
    }

    try {
        const { blocks, page } = await fetchNotionPageData(pageId, options);
        const offset = options.offset ?? computeFreshOffset();
        const { nodes, skipped, childPages } = convertNotionPageToCanvasNodes(blocks, {
            offset,
            keepSourceIds: options.keepSourceIds,
            pageMeta: page,
            forcedNodeId: options.forcedNodeId,
        });
        
        const finalNodes = applyParentId(nodes, options.parentId);
        const result = await persist(finalNodes, skipped, options.userId, options.workspaceId);
        
        if (result.ok && childPages && childPages.length > 0) {
            // Import child pages sequentially to avoid overloading Notion/Supabase
            const parentNodeId = finalNodes[0]?.id;
            for (const child of childPages) {
                if (child.kind === 'database') {
                    await importNotionDatabase(child.notionId, {
                        ...options,
                        parentId: parentNodeId,
                        forcedNodeId: child.canvasNodeId,
                    });
                } else {
                    await importNotionPage(child.notionId, {
                        ...options,
                        parentId: parentNodeId,
                        forcedNodeId: child.canvasNodeId,
                    });
                }
            }
        }
        
        return result;
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function importNotionDatabase(
    databaseId: string,
    options: NotionImportOptions,
): Promise<NotionImportResult> {
    if (!options.accessToken) {
        return { ok: false, error: 'A Notion access token is required.' };
    }
    if (!databaseId) {
        return { ok: false, error: 'Missing Notion database id.' };
    }

    try {
        const pages = await queryNotionDatabase(databaseId, options);
        const offset = options.offset ?? computeFreshOffset();
        const { nodes, skipped } = convertNotionDatabaseToCanvasNodes(pages, {
            offset,
            keepSourceIds: options.keepSourceIds,
        });
        return persist(applyParentId(nodes, options.parentId), skipped, options.userId, options.workspaceId);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export function extractNotionId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    const direct = trimmed.replace(/-/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(direct)) return formatNotionId(direct);

    const match = trimmed.match(/([0-9a-fA-F]{32})/);
    return match ? formatNotionId(match[1]) : null;
}

function formatNotionId(raw32: string): string {
    return `${raw32.slice(0, 8)}-${raw32.slice(8, 12)}-${raw32.slice(12, 16)}-${raw32.slice(16, 20)}-${raw32.slice(20)}`;
}

function applyParentId(nodes: AppNode[], parentId: string | null | undefined): AppNode[] {
    if (!parentId) return nodes;
    return nodes.map((node) => ({ ...node, parentId }));
}

async function postAppApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            `Request failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    return data as T;
}

async function persist(
    nodes: AppNode[],
    skipped: number,
    userId: string | null,
    workspaceId: string | null,
): Promise<NotionImportResult> {
    if (nodes.length === 0) {
        return {
            ok: false,
            error: 'No supported Notion content was found in the response.',
        };
    }

    const saveResult = await appendCanvasNodesToCloud(userId, workspaceId, nodes);
    if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
    }

    return {
        ok: true,
        imported: saveResult.counts.nodes,
        skipped,
        nodes,
    };
}

function computeFreshOffset(): { x: number; y: number } {
    const now = new Date();
    const x = 80 + ((now.getMinutes() * 7) % 240);
    const y = 80 + ((now.getSeconds() * 11) % 200);
    return { x, y };
}
