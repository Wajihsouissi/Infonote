// ============================================================
// Web-grounded answers — talks to /api/ai/grounded, which uses Gemini's native
// `google_search` tool. The model runs the searches and answers in one call, so
// this returns prose plus its sources rather than a list of results.
//
// Requires billing on the Google AI Studio key: grounded calls return a quota
// error on the free tier even while ordinary AI calls on the same key succeed.
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase/client';
import type { GroundingSpan } from '../features/ai/aiCitations';

export interface GroundingCitation {
    title: string;
    url: string;
    source: string;
}

export interface GroundedAnswer {
    text: string;
    /** Pages the answer leaned on, in citation order. */
    citations: GroundingCitation[];
    /**
     * Which spans of the answer each citation supports — the mapping that makes
     * inline `[1]` markers possible instead of a list stapled to the bottom
     * (ai-Plan.md §2.3 C1). Offsets are UTF-8 BYTES; `insertWebCitations`
     * converts. Empty when the model returned no support mapping.
     */
    supports: GroundingSpan[];
    /** The searches Gemini chose to run. */
    queries: string[];
}

/** Same gate as the other AI routes. */
async function authHeader(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured || !supabase) throw new Error('Sign in to use AI features.');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in to use AI features.');
    return { Authorization: `Bearer ${token}` };
}

export async function groundedAsk(
    prompt: string,
    options: { system?: string; model?: string | null; maxTokens?: number; signal?: AbortSignal } = {}
): Promise<GroundedAnswer> {
    const response = await fetch('/api/ai/grounded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
            prompt,
            ...(options.system ? { system: options.system } : {}),
            ...(options.model ? { model: options.model } : {}),
            ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
        }),
        signal: options.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        // The route sends `{ error: "<message>" }` — reading only `error.message`
        // would drop every server-side explanation for a bare status code, the
        // bug gatewayFetch documents in aiService.
        const message =
            (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
            `Web search failed with HTTP ${response.status}`;
        throw new Error(message);
    }

    return {
        text: typeof data.text === 'string' ? data.text : '',
        citations: Array.isArray(data.citations) ? data.citations : [],
        supports: Array.isArray(data.supports) ? data.supports : [],
        queries: Array.isArray(data.queries) ? data.queries : [],
    };
}
