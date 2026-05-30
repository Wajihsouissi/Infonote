/**
 * notionImport — orchestrates the Notion → infinite-canvas pipeline.
 *
 * Three stages, exactly as the spec describes:
 *   1. Authenticate the user with Notion (OAuth handshake delegated to
 *      Supabase Auth via `connectNotion()`).
 *   2. Fetch the page or database from the live Notion REST API using the
 *      caller-supplied integration token.
 *   3. Translate the response with notionConverter, then push the result
 *      into Supabase canvas_nodes via `appendCanvasNodesToCloud` — which
 *      already deduplicates and uses `upsert(..., { ignoreDuplicates:false })`,
 *      so HTTP 409 ON CONFLICT errors cannot occur.
 *
 * No mock data — every call here either signs into Notion via Supabase
 * (real OAuth) or hits api.notion.com (real REST) with a real token.
 */
import {
    convertNotionPageToCanvasNodes,
    convertNotionDatabaseToCanvasNodes,
    type NotionBlock,
    type NotionPage,
    type NotionConvertOptions,
} from './notionConverter';
import { appendCanvasNodesToCloud } from '../cloudSync';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import type { AppNode } from '../../types';

export type NotionImportResult =
    | {
          ok: true;
          imported: number;
          skipped: number;
          nodes: AppNode[];
      }
    | { ok: false; error: string };

export interface NotionImportOptions extends NotionConvertOptions {
    /** Notion integration token (`secret_xxx` or OAuth bearer). */
    accessToken: string;
    /** Authenticated Supabase user id. */
    userId: string | null;
    /** Active workspace id that scopes canvas_nodes rows. */
    workspaceId: string | null;
    /** Notion-Version header. Defaults to the latest stable release. */
    notionVersion?: string;
}

const NOTION_API = 'https://api.notion.com/v1';
const DEFAULT_NOTION_VERSION = '2022-06-28';

// ───── 1. OAuth handshake (Supabase third-party provider) ────────────────

/**
 * Kick off the Supabase OAuth handshake against the Notion provider. The
 * browser is navigated away to Notion; on return, AuthProvider's
 * onAuthStateChange listener picks up the session and Zustand hydrates.
 *
 * `redirectTo` uses `window.location.origin` directly so the user always
 * returns to the active browser window regardless of environment.
 */
export async function connectNotion(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isSupabaseConfigured || !supabase) {
        return {
            ok: false,
            error: 'Supabase not configured',
        };
    }
    try {
        const redirectTo = window.location.origin;
        console.info('[NotionOAuth] requesting redirectTo =', redirectTo);
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
                    'The Notion provider is not enabled in Supabase. Open Authentication → Providers and enable Notion (https://www.notion.so/my-integrations to create the OAuth app).',
            };
        }
        return { ok: false, error: raw };
    }
}

// ───── 2. Notion REST fetchers ───────────────────────────────────────────

/** Read every block child of a Notion page, paging until exhausted. */
export async function fetchNotionPageBlocks(
    pageId: string,
    options: NotionImportOptions,
): Promise<NotionBlock[]> {
    const headers = buildHeaders(options);
    const all: NotionBlock[] = [];
    let cursor: string | null = null;

    do {
        const url =
            `${NOTION_API}/blocks/${encodeURIComponent(pageId)}/children?page_size=100` +
            (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '');
        const resp = await fetch(url, { method: 'GET', headers });
        if (!resp.ok) {
            const body = await safeReadBody(resp);
            throw new Error(`Notion API ${resp.status} ${resp.statusText}${body ? `: ${body}` : ''}`);
        }
        const json = (await resp.json()) as {
            results?: NotionBlock[];
            has_more?: boolean;
            next_cursor?: string | null;
        };
        if (Array.isArray(json.results)) all.push(...json.results);
        cursor = json.has_more && json.next_cursor ? json.next_cursor : null;
    } while (cursor);

    return all;
}

/** Query every page in a Notion database, paging until exhausted. */
export async function queryNotionDatabase(
    databaseId: string,
    options: NotionImportOptions,
): Promise<NotionPage[]> {
    const headers = buildHeaders(options);
    const all: NotionPage[] = [];
    let cursor: string | null = null;

    do {
        const resp = await fetch(
            `${NOTION_API}/databases/${encodeURIComponent(databaseId)}/query`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    page_size: 100,
                    ...(cursor ? { start_cursor: cursor } : {}),
                }),
            },
        );
        if (!resp.ok) {
            const body = await safeReadBody(resp);
            throw new Error(`Notion API ${resp.status} ${resp.statusText}${body ? `: ${body}` : ''}`);
        }
        const json = (await resp.json()) as {
            results?: NotionPage[];
            has_more?: boolean;
            next_cursor?: string | null;
        };
        if (Array.isArray(json.results)) all.push(...json.results);
        cursor = json.has_more && json.next_cursor ? json.next_cursor : null;
    } while (cursor);

    return all;
}

// ───── 3. End-to-end import (fetch + convert + save) ─────────────────────

/**
 * Pull a Notion page, convert its blocks into grouped text cards, and
 * additively upsert them into canvas_nodes.
 */
export async function importNotionPage(
    pageId: string,
    options: NotionImportOptions,
): Promise<NotionImportResult> {
    if (!options.accessToken) {
        return { ok: false, error: 'A Notion integration token is required.' };
    }
    if (!pageId) {
        return { ok: false, error: 'Missing Notion page id.' };
    }
    try {
        const blocks = await fetchNotionPageBlocks(pageId, options);
        const offset = options.offset ?? computeFreshOffset();
        const { nodes, skipped } = convertNotionPageToCanvasNodes(blocks, {
            offset,
            keepSourceIds: options.keepSourceIds,
        });
        return persist(nodes, skipped, options.userId, options.workspaceId);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Pull a Notion database, bucket pages into status columns, and additively
 * upsert the resulting kanban layout into canvas_nodes.
 */
export async function importNotionDatabase(
    databaseId: string,
    options: NotionImportOptions,
): Promise<NotionImportResult> {
    if (!options.accessToken) {
        return { ok: false, error: 'A Notion integration token is required.' };
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
        return persist(nodes, skipped, options.userId, options.workspaceId);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Resolve a Notion page or database URL/UUID into the bare 32-character
 * id Notion's REST API expects (dashes optional in URLs).
 */
export function extractNotionId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    // Bare 32-hex id with optional dashes.
    const direct = trimmed.replace(/-/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(direct)) return formatNotionId(direct);
    // URLs end with `...-<32hex>` or contain a query/path segment with the id.
    const m = trimmed.match(/([0-9a-fA-F]{32})/);
    return m ? formatNotionId(m[1]) : null;
}

function formatNotionId(raw32: string): string {
    return (
        raw32.slice(0, 8) +
        '-' +
        raw32.slice(8, 12) +
        '-' +
        raw32.slice(12, 16) +
        '-' +
        raw32.slice(16, 20) +
        '-' +
        raw32.slice(20)
    );
}

// ───── helpers ────────────────────────────────────────────────────────────

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

function buildHeaders(options: NotionImportOptions): Record<string, string> {
    return {
        Authorization: `Bearer ${options.accessToken}`,
        'Notion-Version': options.notionVersion ?? DEFAULT_NOTION_VERSION,
        'Content-Type': 'application/json',
    };
}

/**
 * Compute a small offset that drifts on every call so successive imports
 * don't slam on top of each other when the caller doesn't pin a location.
 *
 * Uses (date-of-month × 17) and (minute-of-day × 7) as cheap pseudo-random
 * but stable-within-a-second values. No randomness in tests is desirable
 * but this is for first-run ergonomics.
 */
function computeFreshOffset(): { x: number; y: number } {
    const now = new Date();
    const x = 80 + ((now.getMinutes() * 7) % 240);
    const y = 80 + ((now.getSeconds() * 11) % 200);
    return { x, y };
}

async function safeReadBody(resp: Response): Promise<string | null> {
    try {
        const text = await resp.text();
        return text ? text.slice(0, 300) : null;
    } catch {
        return null;
    }
}
