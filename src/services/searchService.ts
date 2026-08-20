// ============================================================
// Web-grounded answers — talks to /api/ai/grounded, which uses Gemini's native
// `google_search` tool. The model runs the searches and answers in one call, so
// this returns prose plus its sources rather than a list of results.
//
// Requires billing on the Google AI Studio key: grounded calls return a quota
// error on the free tier even while ordinary AI calls on the same key succeed.
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase/client';

export interface GroundingCitation {
    title: string;
    url: string;
    source: string;
}

export interface GroundedAnswer {
    text: string;
    /** Pages the answer leaned on, in citation order. */
    citations: GroundingCitation[];
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
        queries: Array.isArray(data.queries) ? data.queries : [],
    };
}

/** Render citations as a markdown Sources list appended to the answer. */
export function citationsAsMarkdown(citations: GroundingCitation[]): string {
    if (citations.length === 0) return '';
    const lines = citations.map((c, i) => `${i + 1}. [${c.title || c.source}](${c.url})`);
    return `\n\n---\n\n**Sources**\n\n${lines.join('\n')}`;
}
