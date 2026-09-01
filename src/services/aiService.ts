// ============================================================
// AI Service - talks to our /api/ai/* routes, which proxy an OpenAI-compatible
// endpoint (Google's Gemini compatibility layer by default; see AI_GATEWAY_BASE_URL).
// Text: OpenAI-compatible chat completions.
// Image: OpenAI-compatible image generations.
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase/client';
import {
    effortBudget,
    effortMaxTokens,
    freeformEffortDirective,
    PLAN_MAX_TOKENS,
    type AIEffort,
} from '../config/aiEffort';
import { AI_CONTEXT_DEFINITIONS, type AIContextType } from '../features/ai/aiTypes';

/** Mirrors STREAM_TRAILER_MARK in api/_lib/aiGuard.js — U+001E RECORD SEPARATOR. */
const STREAM_TRAILER_MARK = '\u001E';

// Hints only — the server owns the final model choice and ignores anything
// that is not on its own allow-list.
const TEXT_MODEL = import.meta.env.VITE_AI_GATEWAY_TEXT_MODEL || 'gemini-3.7-flash';
const IMAGE_MODEL = import.meta.env.VITE_AI_GATEWAY_IMAGE_MODEL || 'gemini-3.1-flash-image';

/**
 * The /api/ai/* routes require a signed-in Supabase user (they proxy a paid
 * gateway). Resolve the current access token or fail fast with a friendly
 * message instead of a bare 401.
 */
async function getAiAuthHeader(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured || !supabase) {
        throw new Error('Sign in to use AI features.');
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
        throw new Error('Sign in to use AI features.');
    }
    return { Authorization: `Bearer ${token}` };
}

/**
 * System prompt for free-form text generation (single notes, inline writing,
 * card editing). Steers the model toward ChatGPT/Claude-quality answers whose
 * LENGTH ADAPTS TO THE ASK — concise for simple questions, richly structured
 * only when the topic warrants it. This is intentionally NOT used for the
 * structured (JSON) generators, whose strict output contracts must stay clean.
 */
export const FREEFORM_SYSTEM_PROMPT = `You are a knowledgeable, careful writing assistant inside Infonote, an infinite-canvas note app. Your answers must be useful as editable, draggable canvas content — never a generic wall of text.

PRIORITY AND RELIABILITY:
- The user's current request is the source of truth. Canvas material is supporting context only; do not let unrelated cards change the subject.
- State assumptions briefly when they materially affect the advice. Do not invent facts, deadlines, card contents, or research.
- If the available context is insufficient, give a practical default and name the one detail that would improve it. Do not refuse a useful answer just because context is incomplete.

CANVAS-READY RESPONSE SHAPE:
- For a plan, workflow, strategy, explanation, comparison, research topic, or decision: produce a compact mini-document, not one paragraph.
- Use a meaningful ## heading, a 1–2 sentence orientation, bullets for key points, numbered steps for sequence, and a - [ ] checklist or a short decision table when it is genuinely useful. Aim for at least 5 distinct blocks and 3 block types.
- Use > for one key principle or caution only when it adds real value. Use ### subsections, tables, code blocks, and dividers when the material warrants them — never as filler.
- For a direct definition, calculation, or yes/no question, stay concise; use a short answer plus bullets only when they improve scanability.

Formatting (clean Markdown that renders into native blocks):
- **Bold** for key terms, *italic* for nuance, \`inline code\` for code, commands, or identifiers.
- Use ##/### headings, "- " bullets, "1." numbered steps, "- [ ]" tasks, "> " quotes, and Markdown tables with exact spacing.
- Preserve ordinary spaces between every word, including on both sides of inline formatting, links, citations, punctuation, and table delimiters. Never join words together to make an answer more compact.
- Use fenced \`\`\` code blocks only for multi-line code or structured data.

Lead with the answer — no preamble, no "Certainly!", no restating the question. Every block must earn its place.`;

/**
 * Rewriting ONE line or section of an answer that already exists.
 *
 * Deliberately NOT the freeform prompt: that one asks for "at least 5 distinct
 * blocks and 3 block types", so a Redo on a single bullet came back as a whole
 * mini-document and replaced one line with a heading, a paragraph and a
 * checklist. A part action promises to touch only the part it was invoked on,
 * so the shape of the fragment is the contract here.
 */
export const PART_REWRITE_SYSTEM_PROMPT = `You rewrite ONE fragment of an answer that already exists inside Infonote, an infinite-canvas note app.

OUTPUT CONTRACT — the fragment is replaced verbatim by what you return:
- Return ONLY the replacement text. No preamble, no commentary, no "Here is", no surrounding code fence.
- Keep the fragment's shape: the same Markdown markers, the same block types, the same number of lines. One line stays one line. A bullet stays a bullet, a task stays a task, a heading stays a heading at the same level, a table stays the same table with the same columns.
- Never add headings, bullets, tables, checklists, quotes or extra blocks that the fragment did not already have. Never expand a fragment into a document.
- Keep every factual detail and the fragment's purpose. Change wording, precision and clarity only.
- When the request names how it should change (shorter, longer, simpler, a different tone, another language), that instruction wins over the defaults above — except the shape rules, which always hold. Otherwise keep the fragment's own language and register.
- Preserve ordinary spaces between every word, including on both sides of **bold**, *italic*, \`code\`, links and punctuation.`;

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
    error?: { message?: string };
};

type ImageGenerationResponse = {
    imageUrl?: string;
    error?: { message?: string };
};

const AI_REQUEST_TIMEOUT_MS = 45_000;
const AI_RETRY_DELAY_MS = 500;

class AIRequestError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'AIRequestError';
        this.status = status;
    }
}

function abortSignalWithTimeout(userSignal?: AbortSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const abortForUser = () => controller.abort(userSignal?.reason);
    if (userSignal?.aborted) abortForUser();
    else userSignal?.addEventListener('abort', abortForUser, { once: true });
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('AI request timed out.', 'TimeoutError'));
    }, AI_REQUEST_TIMEOUT_MS);
    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        dispose: () => {
            window.clearTimeout(timeout);
            userSignal?.removeEventListener('abort', abortForUser);
        },
    };
}

function canRetry(error: unknown, userSignal?: AbortSignal): boolean {
    if (userSignal?.aborted) return false;
    // A provider can package a credit/concurrency rejection as a 5xx. Sending
    // the automatic retry in that case only reserves more capacity and makes a
    // short video summary less likely to start once the current work settles.
    if (error instanceof AIRequestError && /(?:available credits|in-flight requests|insufficient credits|credit limit|quota (?:is )?exceeded|payment required)/i.test(error.message)) return false;
    if (error instanceof AIRequestError) return error.status === 408 || error.status === 425 || (error.status != null && error.status >= 500);
    return error instanceof TypeError;
}

async function requestAI(path: string, init: RequestInit, userSignal?: AbortSignal): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const request = abortSignalWithTimeout(userSignal);
        try {
            const response = await fetch(path, { ...init, signal: request.signal });
            if (!response.ok) {
                const text = await response.text();
                let message = `AI request failed with HTTP ${response.status}`;
                try {
                    const data = text ? JSON.parse(text) : {};
                    message = (typeof data?.error === 'string' ? data.error : data?.error?.message) || data?.message || message;
                } catch {
                    if (text) message = text;
                }
                throw new AIRequestError(message, response.status);
            }
            return response;
        } catch (error) {
            lastError = request.didTimeout()
                ? new AIRequestError('The AI took too long to respond. Please try again.', 408)
                : error;
            if (attempt === 0 && canRetry(lastError, userSignal)) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, AI_RETRY_DELAY_MS));
                continue;
            }
            throw lastError;
        } finally {
            request.dispose();
        }
    }
    throw lastError instanceof Error ? lastError : new Error('AI request failed.');
}

/** The run-stage header the server buckets on. Omitted = strictest bucket. */
const phaseHeader = (phase?: string): Record<string, string> =>
    phase ? { 'X-AI-Phase': phase } : {};

async function gatewayFetch<T>(path: string, body: Record<string, unknown>, phase?: string): Promise<T> {
    const response = await requestAI(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...phaseHeader(phase),
            ...(await getAiAuthHeader()),
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return data as T;
}

/**
 * Generate text using Vercel AI Gateway.
 * Pass `system` for free-form generation to control persona/formatting/length.
 * Omit it for structured (JSON) calls that carry their own strict instructions.
 */
/** Extra request fields both text entry points accept. */
export interface AIRequestOptions {
    system?: string;
    /** Gateway model id. Honoured only if the server allow-lists it. */
    model?: string | null;
    /** Data-URL images sent as multimodal parts. */
    images?: string[];
    /** How deep the answer should go. Widens/narrows the token ceiling too. */
    effort?: AIEffort;
    /** Content types the user explicitly selected (mindmap, cards, image, etc.). */
    contexts?: AIContextType[];
    /**
     * Exact output ceiling, overriding whatever `effort` would imply.
     *
     * The two-pass generator needs to size its calls independently of the
     * user's effort dial: a plan is short at every level, and a board card's
     * body is a fraction of a full card's. Without this they would both inherit
     * the freeform ceiling and either truncate or run away.
     */
    maxTokensOverride?: number;
    /**
     * Prior conversation turns, sent as a real messages array.
     *
     * Kept separate from `prompt` so the gateway sees the user/assistant
     * boundary structurally, and so the cacheable prefix stops changing on
     * every turn. See `buildConversationHistory`.
     */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /**
     * Which stage of a run this call belongs to, for rate limiting.
     *
     * One Create turn is now a plan call plus one body call per artifact plus a
     * verify call. Sent as a header so the server can bucket them without
     * parsing the body (ai-Plan.md §7). Omitting it is safe — the server falls
     * back to the strictest bucket — so only the fan-out paths need to set it.
     */
    phase?: 'plan' | 'body' | 'verify';
}

/**
 * Fold the effort directive into a free-form system prompt.
 *
 * Only applied when there already IS a system prompt: structured (JSON) callers
 * deliberately omit one so their strict output contract isn't diluted, and they
 * carry their own effort wording inside the prompt instead.
 */
function systemWithEffort(system: string | undefined, effort: AIEffort | undefined): string | undefined {
    if (!system || !effort) return system;
    return `${system}\n\n${freeformEffortDirective(effort)}`;
}

export async function generateText(prompt: string, options: string | AIRequestOptions = {}): Promise<string> {
    // Historically the second argument was the system prompt; keep that working.
    const { system, model, images, effort, maxTokensOverride, history, phase } = typeof options === 'string'
        ? { system: options, model: undefined, images: undefined, effort: undefined, maxTokensOverride: undefined, history: undefined, phase: undefined }
        : options;

    const finalSystem = systemWithEffort(system, effort);
    const maxTokens = maxTokensOverride ?? (effort ? effortMaxTokens(effort) : undefined);
    const response = await gatewayFetch<ChatCompletionResponse>('/api/ai/text', {
        model: model || TEXT_MODEL,
        prompt,
        ...(finalSystem ? { system: finalSystem } : {}),
        ...(images && images.length > 0 ? { images } : {}),
        ...(maxTokens ? { maxTokens } : {}),
        ...(history && history.length > 0 ? { history } : {}),
    }, phase);

    const content = (response as ChatCompletionResponse & { text?: string }).text ?? response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => part.text || '').join('');
    }
    throw new Error(response.error?.message || 'AI Gateway returned no text content.');
}

/**
 * Same completion as `generateText`, delivered token by token.
 *
 * /api/ai/stream writes raw text chunks (not SSE frames), so the client just
 * decodes and forwards them. Used by the AI panel so an answer starts arriving
 * immediately instead of after a long silence; `signal` lets the panel stop a
 * run mid-flight and keep whatever had already landed.
 */
export async function streamText(
    prompt: string,
    options: AIRequestOptions & { onDelta: (delta: string) => void; signal?: AbortSignal } = { onDelta: () => {} }
): Promise<{ text: string; model: string | null; durationMs: number; finishReason: string | null; truncated: boolean }> {
    const startedAt = performance.now();
    const { system, model, images, effort, maxTokensOverride, history, onDelta, signal } = options;
    const finalSystem = systemWithEffort(system, effort);
    const response = await requestAI('/api/ai/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await getAiAuthHeader()),
        },
        body: JSON.stringify({
            model: model || TEXT_MODEL,
            prompt,
            ...(finalSystem ? { system: finalSystem } : {}),
            ...(images && images.length > 0 ? { images } : {}),
            ...(maxTokensOverride ?? (effort ? effortMaxTokens(effort) : undefined)
                ? { maxTokens: maxTokensOverride ?? effortMaxTokens(effort as AIEffort) }
                : {}),
            ...(history && history.length > 0 ? { history } : {}),
        }),
    }, signal);

    if (!response.body) throw new Error('AI Gateway returned an empty stream.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    // Fetch resolves as soon as headers arrive; guard each body read too, so a
    // gateway that opens a stream and then stalls cannot leave the composer
    // working forever. Cancelling preserves the user's normal Stop action.
    const cancelStream = () => { void reader.cancel(); };
    signal?.addEventListener('abort', cancelStream, { once: true });
    const readNext = async () => {
        let timeout: number | undefined;
        try {
            return await Promise.race([
                reader.read(),
                new Promise<never>((_, reject) => {
                    timeout = window.setTimeout(() => reject(new AIRequestError('The AI stream stalled. Please try again.', 408)), AI_REQUEST_TIMEOUT_MS);
                }),
            ]);
        } finally {
            if (timeout !== undefined) window.clearTimeout(timeout);
        }
    };

    /* The stream ends with U+001E followed by a JSON trailer (see
       STREAM_TRAILER_MARK in api/_lib/aiGuard.js). Everything before the mark
       is the answer; everything after is metadata that must never reach
       `onDelta`, or the user watches a control character and a JSON blob type
       themselves out at the end of their answer.

       The trailer can arrive split across reads, so once the mark is seen the
       remainder of the stream is accumulated rather than parsed per chunk. */
    let trailerRaw = '';
    let inTrailer = false;

    try {
        for (;;) {
            const { value, done } = await readNext();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (!chunk) continue;

            if (inTrailer) {
                trailerRaw += chunk;
                continue;
            }

            const mark = chunk.indexOf(STREAM_TRAILER_MARK);
            if (mark === -1) {
                full += chunk;
                onDelta(chunk);
                continue;
            }

            const head = chunk.slice(0, mark);
            if (head) {
                full += head;
                onDelta(head);
            }
            trailerRaw = chunk.slice(mark + 1);
            inTrailer = true;
        }
    } finally {
        signal?.removeEventListener('abort', cancelStream);
    }

    /* A missing or unparsable trailer is not an error: a stopped run, an older
       deployment, or a proxy that truncated the tail all land here, and the
       answer above is still perfectly good. `finishReason` is simply unknown.
       Parsed BEFORE the empty check, because when there is no answer at all the
       reason is the only thing that can explain why. */
    let finishReason: string | null = null;
    if (trailerRaw.trim()) {
        try {
            const parsed = JSON.parse(trailerRaw) as { finishReason?: unknown };
            if (typeof parsed.finishReason === 'string') finishReason = parsed.finishReason;
        } catch { /* unknown, and that is a valid answer */ }
    }

    if (!full.trim()) {
        /* "AI Gateway returned no text content" was true and useless. The
           reasoning models behind this gateway spend `max_tokens` on their own
           thinking before any of it reaches the answer, so a high ceiling can
           be consumed entirely and come back empty with `finish_reason:
           "length"` — slow AND blank, which is the worst pair to debug from a
           generic message. Now it names the cause and the two things that fix
           it. */
        throw new AIRequestError(
            finishReason === 'length'
                ? 'The model spent its whole token budget thinking and never got to the answer. Try Efficient effort, or ask something narrower.'
                : 'The AI returned an empty answer. Try again, or switch model.',
        );
    }

    return {
        text: full,
        model: response.headers.get('X-AI-Model'),
        durationMs: Math.round(performance.now() - startedAt),
        /**
         * How the model stopped. `'length'` means it hit the token ceiling —
         * the answer is cut off mid-thought, not finished. Anything else, or
         * `null` when the trailer did not arrive, means do not warn.
         */
        finishReason,
        truncated: finishReason === 'length',
    };
}

export async function generateImage(prompt: string): Promise<string> {
    const response = await gatewayFetch<ImageGenerationResponse>('/api/ai/image', {
        model: IMAGE_MODEL,
        prompt,
    });

    if (response.imageUrl && response.imageUrl.trim() !== '') {
        return response.imageUrl;
    }

    throw new Error(response.error?.message || 'AI Gateway returned no image data.');
}

// ============================================================
// Structured Canvas Card Generation
// ============================================================

/**
 * Pull the JSON payload out of a model reply that may also contain reasoning,
 * markdown fences, or prose.
 *
 * The naive version of this (`/\[[\s\S]*\]/`) matched from the first `[`
 * anywhere in the reply to the last `]`. Since the structured prompt asks the
 * model to think before answering, and planning answers habitually think in
 * lists — "[1] Research, [2] Wireframes" — the match started inside the
 * reasoning and returned garbage. Worse, garbage is not null, so the retry
 * never fired and the caller silently degraded to a single blob card.
 *
 * So: drop the reasoning first, then scan for the first *balanced* bracket span
 * that both parses and looks like the payload we asked for. Anything else
 * returns null, which lets the caller retry.
 */
export function extractJsonFromString(text: string, type: 'array' | 'object' = 'array'): string | null {
    const withoutReasoning = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
    const cleaned = withoutReasoning.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();

    const open = type === 'array' ? '[' : '{';
    const close = type === 'array' ? ']' : '}';

    const looksLikePayload = (value: unknown): boolean => {
        if (type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
        // `[1]` and `["a"]` are valid JSON but are never an action list; require
        // objects so a stray "[1]" in prose can't pass for the payload.
        return Array.isArray(value) && value.length > 0
            && value.every((item) => !!item && typeof item === 'object' && !Array.isArray(item));
    };

    for (let start = cleaned.indexOf(open); start !== -1; start = cleaned.indexOf(open, start + 1)) {
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (ch === open) {
                depth++;
            } else if (ch === close) {
                depth--;
                if (depth === 0) {
                    const candidate = cleaned.slice(start, i + 1);
                    try {
                        if (looksLikePayload(JSON.parse(candidate))) return candidate;
                    } catch {
                        // Unbalanced or truncated — try the next opening bracket.
                    }
                    break;
                }
            }
        }
    }

    return null;
}

export interface AIStructuredAction {
    type: 'note' | 'fused-note' | 'mindmap' | 'board' | 'timeline';
    title: string;
    content?: string;
    color?: string;
    /** mindmap */
    nodes?: Array<{ id: string; label: string; parentId?: string }>;
    /** board — the card field the lanes represent (see kanbanTypes). */
    groupBy?: 'status' | 'priority' | 'category' | 'assignee';
    /** board — lanes, in the order work moves through them. */
    columns?: Array<{ label: string; value?: string; tone?: string }>;
    /** board — the cards that open in those lanes. */
    cards?: Array<{ title: string; content?: string; column?: string; priority?: string }>;
    /** timeline — the steps, in order. */
    milestones?: Array<{ title: string; content?: string; date?: string }>;
}

/**
 * A planned artifact before its bodies exist — ai-Plan.md §5.5.
 *
 * Structurally an `AIStructuredAction` with every `content` field still empty,
 * plus the one-line `brief` the body pass writes against. Keeping it the same
 * shape is deliberate: the runner fills the bodies in and hands the result
 * straight to the existing `placeAction`, so the split changed how content is
 * GENERATED without touching how anything is placed.
 */
export interface AIArtifactPlan extends AIStructuredAction {
    /** What this artifact is for, in one sentence. Never shown to the user. */
    brief?: string;
}

/** The planner's justification for the shapes it chose. Shown in the trace. */
export interface AIPlanResult {
    artifacts: AIArtifactPlan[];
    why?: string;
}

const ACTION_TYPES = new Set<AIStructuredAction['type']>(['note', 'fused-note', 'mindmap', 'board', 'timeline']);

/** A recoverable failure: never turn malformed model JSON into a surprise card. */
export class AIOutputValidationError extends Error {
    constructor(detail = 'The AI returned an incomplete canvas plan.') {
        super(`${detail} Nothing was added to the canvas — try again or make the requested format more specific.`);
        this.name = 'AIOutputValidationError';
    }
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateStructuredActions(
    value: unknown,
    requestedTypes: AIStructuredAction['type'][],
    /**
     * Skeleton passes carry no bodies yet, so the content checks are switched
     * off for them. Everything structural — shapes, connected mindmaps, cards
     * in declared columns — is still enforced, because a malformed skeleton is
     * exactly as unplaceable as a malformed full action.
     */
    requireContent = true,
): AIStructuredAction[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
        throw new AIOutputValidationError();
    }

    const actions = value as AIStructuredAction[];
    actions.forEach((action) => {
        if (!action || !ACTION_TYPES.has(action.type) || !nonEmptyString(action.title)) {
            throw new AIOutputValidationError();
        }

        if (requireContent && (action.type === 'note' || action.type === 'fused-note') && !nonEmptyString(action.content)) {
            throw new AIOutputValidationError('The AI returned a card without content.');
        }

        if (action.type === 'mindmap') {
            const nodes = action.nodes;
            if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 80) {
                throw new AIOutputValidationError('The AI returned an incomplete mindmap.');
            }
            const ids = new Set<string>();
            let roots = 0;
            nodes.forEach((node) => {
                if (!node || !nonEmptyString(node.id) || !nonEmptyString(node.label) || ids.has(node.id)) {
                    throw new AIOutputValidationError('The AI returned an invalid mindmap.');
                }
                ids.add(node.id);
                if (!node.parentId) roots += 1;
            });
            if (roots !== 1 || nodes.some((node) => node.parentId && (!ids.has(node.parentId) || node.parentId === node.id))) {
                throw new AIOutputValidationError('The AI returned a disconnected mindmap.');
            }
        }

        if (action.type === 'board') {
            const columns = action.columns;
            const cards = action.cards;
            if (!Array.isArray(columns) || columns.length < 2 || columns.length > 6 || !Array.isArray(cards) || cards.length === 0) {
                throw new AIOutputValidationError('The AI returned an incomplete board.');
            }
            const values = new Set<string>();
            columns.forEach((column) => {
                if (!column || !nonEmptyString(column.label) || !nonEmptyString(column.value) || values.has(column.value)) {
                    throw new AIOutputValidationError('The AI returned an invalid board.');
                }
                values.add(column.value);
            });
            if (cards.some((card) => !card || !nonEmptyString(card.title) || (requireContent && !nonEmptyString(card.content)) || !nonEmptyString(card.column) || !values.has(card.column))) {
                throw new AIOutputValidationError('The AI returned board cards without usable details.');
            }
        }

        if (action.type === 'timeline' && (!Array.isArray(action.milestones) || action.milestones.length === 0 || action.milestones.some((item) => !item || !nonEmptyString(item.title) || (requireContent && !nonEmptyString(item.content))))) {
            throw new AIOutputValidationError('The AI returned an incomplete timeline.');
        }
    });

    if (requestedTypes.some((type) => !actions.some((action) => action.type === type))) {
        throw new AIOutputValidationError('The AI did not honour every output type you selected.');
    }
    return actions;
}

function parseValidatedStructuredActions(
    responseText: string,
    requestedTypes: AIStructuredAction['type'][],
    requireContent = true,
): AIStructuredAction[] {
    const json = extractJsonFromString(responseText, 'array');
    if (!json) throw new AIOutputValidationError();
    try {
        return validateStructuredActions(JSON.parse(json), requestedTypes, requireContent);
    } catch (error) {
        if (error instanceof AIOutputValidationError) throw error;
        throw new AIOutputValidationError();
    }
}

/* ============================================================
   The two-pass generator — ai-Plan.md §5.5 (W5)

   `parseStructuredAction` below asks one call for every artifact AND every
   body. A Smart request for six rich cards therefore needs several thousand
   tokens of perfectly balanced JSON in a single reply; when it truncates,
   validation throws, the repair retry re-sends the same impossible ask, and the
   user gets nothing after two full round trips. That is the root cause of most
   "the AI is unreliable" reports.

   These two functions replace it:

     planArtifacts()       one small call. Titles, shapes, scaffolding, briefs.
                           No bodies, so the reply is short enough that
                           truncation stops being the common case — and the plan
                           is something the trace can show before the expensive
                           work starts.

     composeArtifactBody() one call per artifact, run with bounded concurrency.
                           Returns MARKDOWN, not JSON — which removes an entire
                           class of escaping failures — and a failure is one
                           artifact rather than the whole turn.
   ============================================================ */

const SHAPE_GUIDE = `CHOOSING THE RIGHT SHAPE — this matters more than the content:
- Work that moves through stages, or anything the user will tick off → ONE "board".
- Anything sequenced in time (weeks, sprints, phases with dates) → ONE "timeline".
- Ideas that branch from a centre → "mindmap". A long written piece → "fused-note".
- Loose, unordered pieces → "note" cards.
A request to "plan" something is almost always ONE board or ONE timeline, not a
pile of loose note cards. Do not emit both a board and separate cards for the
same items — pick the single shape that fits and put everything inside it.`;

/**
 * Pass 1: decide what to build, without writing any of it.
 *
 * Returns the artifacts with their structure fully specified (columns,
 * milestones, mindmap nodes) and every body left empty, plus the model's own
 * one-sentence reason for the shapes it chose — which the trace shows, so the
 * user can disagree with the decision rather than only with the result.
 */
export async function planArtifacts(
    prompt: string,
    context: string | undefined,
    options: AIRequestOptions = {},
): Promise<AIPlanResult> {
    const requestedTypes = (options.contexts ?? [])
        .map((id) => AI_CONTEXT_DEFINITIONS.find((d) => d.id === id)?.actionType)
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

    const budget = effortBudget(options.effort);

    const systemPrompt = `You are the planner for Infonote, an infinite-canvas note app.
Decide WHAT to build for the user's request. Do NOT write any body content — a
second pass writes the bodies. Your job is the shape and the scaffolding.

${SHAPE_GUIDE}

Emit at most ${budget.maxArtifacts} artifacts. Fewer, well-chosen artifacts beat
many thin ones. If one artifact answers the request, emit one.

${requestedTypes.length > 0 ? `The user explicitly selected these output types: [${requestedTypes.join(', ')}]. You MUST include at least one artifact of each.\n` : ''}
${context ? `[CANVAS CONTEXT]\n${context}\n` : ''}
Respond ONLY with a valid JSON array. No markdown, no code fences, no prose.
Each object:
- "type": "note" | "fused-note" | "mindmap" | "board" | "timeline"
- "title": the artifact's title
- "brief": ONE sentence saying what this artifact should cover. This steers the
  writing pass, so be specific about scope and angle — not "about pricing" but
  "the three things the current pricing page gets wrong, and the fix for each".
- "why": (first object only) ONE sentence on why you chose these shapes.
- "color": optional hex, ONLY from: #f95d2e, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #e3a24f, #6366f1
- If "mindmap": "nodes": [{"id","label","parentId"}] — one root with no parentId,
  every other node's parentId must exist. Labels are short; there are no bodies.
- If "board": "groupBy" ("status"|"priority"|"category"|"assignee"),
  "columns": 3-6 lanes [{"label","value","tone"}] where value is lowercase-kebab
  and tone is one of: neutral, rose, amber, citrine, olive, jade, teal, azure,
  indigo, violet, magenta; and "cards": [{"title","column","priority"}] —
  TITLES ONLY, no content, column must match a declared column value.
- If "timeline": "milestones": [{"title","date"}] in order — TITLES ONLY, no
  content. "date" is optional ISO (YYYY-MM-DD).

Example:
[{"type":"board","title":"Beta launch","brief":"Five stages from positioning to post-launch review, with the work that has to happen in each","why":"A board rather than loose cards — this work moves through stages.","groupBy":"status","columns":[{"label":"Positioning","value":"positioning","tone":"azure"},{"label":"Build","value":"build","tone":"violet"},{"label":"Ship","value":"ship","tone":"jade"}],"cards":[{"title":"Pricing page rewrite","column":"positioning","priority":"high"},{"title":"Onboarding emails","column":"build"}]}]`;

    const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n<user>\n${prompt}\n</user>`;

    /* A fixed, effort-independent ceiling: a plan is titles whatever the effort,
       and giving Smart more room here only invites it to start writing bodies.
       History rides along because follow-ups land HERE — "add two more cards"
       is a planning decision. The body passes deliberately get no history: they
       write one artifact against one brief, and prior turns would be cost
       without signal. */
    const planOptions: AIRequestOptions = { model: options.model, images: options.images, history: options.history, phase: 'plan' };

    let responseText = await generateText(fullPrompt, { ...planOptions, maxTokensOverride: PLAN_MAX_TOKENS });
    let actions: AIStructuredAction[];
    try {
        actions = parseValidatedStructuredActions(responseText, requestedTypes, false);
    } catch {
        const retryPrompt = `${fullPrompt}\n\n<assistant>\n${responseText}\n</assistant>\n\n<user>\nRepair this response. Return ONLY a valid JSON array satisfying every required field, with connected mindmaps and every board card in a declared column. Still no body content.\n</user>`;
        responseText = await generateText(retryPrompt, { ...planOptions, maxTokensOverride: PLAN_MAX_TOKENS });
        actions = parseValidatedStructuredActions(responseText, requestedTypes, false);
    }

    const trimmed = actions.slice(0, budget.maxArtifacts) as AIArtifactPlan[];
    const why = (actions[0] as { why?: string } | undefined)?.why;
    return {
        artifacts: trimmed,
        why: typeof why === 'string' && why.trim() ? why.trim() : undefined,
    };
}

/**
 * Send a body-writing request with a compatibility retry.
 *
 * Planning is deliberately one plain prompt, whereas body calls use a system
 * message to keep their formatting contract separate from user/canvas text.
 * Some OpenAI-compatible gateways accept the former but reject `system` for a
 * configured model, which made a perfectly valid plan fail only during its
 * writing pass. Retry non-auth, non-rate-limit failures with the same contract
 * at the top of the prompt so those providers can still produce the body.
 */
async function generateBodyText(
    prompt: string,
    system: string,
    options: AIRequestOptions,
    maxTokensOverride: number,
): Promise<string> {
    const request = {
        model: options.model,
        maxTokensOverride,
        phase: 'body' as const,
    };

    try {
        return await generateText(prompt, { ...request, system });
    } catch (error) {
        const status = typeof error === 'object' && error !== null
            ? (error as { status?: unknown }).status
            : undefined;
        // Retrying cannot repair a missing session, forbidden model, or a
        // deliberate rate limit — it would only spend another request.
        if (status === 401 || status === 403 || status === 429) throw error;

        return generateText(
            `[WRITING INSTRUCTIONS]\n${system}\n\n[REQUEST]\n${prompt}`,
            request,
        );
    }
}

/**
 * Pass 2: write ONE artifact's body against its brief.
 *
 * Markdown out, not JSON. `parsePlainText` turns it into editor blocks, so the
 * block vocabulary asked for here is exactly what the editor renders — and no
 * escaping layer sits between the model and the text, which is where a
 * meaningful share of the old failures came from.
 */
export async function composeArtifactBody(
    request: {
        shape: AIStructuredAction['type'];
        title: string;
        brief?: string;
        /** Board card / timeline milestone this body belongs to, if any. */
        itemTitle?: string;
        /** The original user request, so a body cannot drift off-topic. */
        userRequest: string;
        context?: string;
        /** Names the deficit when this is a re-ask after a thin first body. */
        deficit?: string;
    },
    options: AIRequestOptions = {},
): Promise<string> {
    const budget = effortBudget(options.effort);
    const isItem = Boolean(request.itemTitle);

    /* Board cards and timeline steps are summaries inside a bigger artifact, so
       they get a fraction of the budget. Holding them to a full card's block
       count is how a 14-card board turns into fourteen essays nobody reads. */
    const minBlocks = isItem ? Math.max(2, Math.round(budget.minBlocks / 3)) : budget.minBlocks;
    const targetBlocks = isItem ? Math.max(3, Math.round(budget.targetBlocks / 3)) : budget.targetBlocks;

    const system = `You are writing the body of one item on an infinite canvas in Infonote.
Return MARKDOWN ONLY — no JSON, no code fences around the whole answer, no
preamble, and do not repeat the title as a heading.

Write ${targetBlocks} blocks or so, and never fewer than ${minBlocks}. A "block"
is one line or element: a paragraph, a heading, a bullet, a numbered step, a
checkbox, a table, a quote, a divider, a fenced code block.

Use the vocabulary the editor renders natively:
- "## " and "### " headings to section anything longer than a few paragraphs
- markdown tables (| a | b |) for comparisons, specs, pros/cons, schedules
- "> " quote blocks for definitions, key principles, notable statements
- "- " bullets, "1. " numbered steps, "- [ ] " checkboxes for actions
- fenced \`\`\` code blocks for code, commands or structured data
- "---" dividers between major sections
- **bold** for terms of art, \`inline code\` for identifiers

Use at least ${budget.minBlockTypes} DIFFERENT block types. A wall of paragraphs
is a failure at any effort level. Do not invent facts, dates or figures; where a
real value is missing, say what is needed rather than inventing one.`;

    const prompt = [
        `[THE USER ASKED]\n${request.userRequest}`,
        request.context ? `[CANVAS CONTEXT]\n${request.context}` : '',
        isItem
            ? `[WRITE THIS]\nThe "${request.itemTitle}" item of the ${request.shape} "${request.title}".`
            : `[WRITE THIS]\nThe body of the ${request.shape} "${request.title}".`,
        request.brief ? `[IT SHOULD COVER]\n${request.brief}` : '',
        request.deficit ? `[YOUR PREVIOUS ATTEMPT FELL SHORT]\n${request.deficit}\nWrite it again, properly this time.` : '',
    ].filter(Boolean).join('\n\n');

    const text = await generateBodyText(
        prompt,
        system,
        options,
        isItem ? Math.round(budget.bodyTokens / 2) : budget.bodyTokens,
    );

    // Models sometimes wrap the whole answer in one fence despite being told not
    // to; unwrapping is cheaper than another round trip.
    const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
    return (fenced ? fenced[1] : text).trim();
}

/**
 * Review finished bodies against the evidence — ai-Plan.md §5.6 (W6).
 *
 * Smart only. Returns the claims the model itself is least confident about, so
 * the panel can say "check these two things" instead of presenting everything
 * with equal certainty. It ANNOTATES rather than edits: silently rewriting a
 * body the user has not read yet would make the verify pass a second author,
 * and a wrong correction is worse than a flagged claim (see §10 D2).
 *
 * Returns `[]` on any failure. A verification that cannot run must never fail
 * the turn — the artifacts are already written and placed.
 */
export async function verifyArtifacts(
    artifacts: { title: string; body: string }[],
    context: string | undefined,
    options: AIRequestOptions = {},
): Promise<{ title: string; concern: string }[]> {
    if (artifacts.length === 0) return [];

    const system = `You are fact-checking your own work before the user reads it.

For each item, name AT MOST ONE claim that a careful reader should verify — a
number, date, benchmark, causal claim or recommendation that you cannot support
from the context given and that is not common knowledge.

Be strict about what counts. Do NOT flag: opinions clearly framed as such,
obvious general knowledge, or anything the context supports. Most well-written
items should have NOTHING to flag; returning an empty array is the expected
result for solid work, not a failure.

Respond ONLY with a JSON array, no prose:
[{"title":"<the item's exact title>","concern":"<one short sentence naming what to check>"}]`;

    const prompt = [
        context ? `[CONTEXT AVAILABLE]\n${context}` : '[NO CONTEXT WAS AVAILABLE]',
        ...artifacts.map((a) => `[ITEM: ${a.title}]\n${a.body.slice(0, 1800)}`),
    ].join('\n\n');

    try {
        const reply = await generateText(prompt, {
            system,
            model: options.model,
            maxTokensOverride: 700,
            phase: 'verify',
        });
        const json = extractJsonFromString(reply, 'array');
        if (!json) return [];
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is { title: string; concern: string } =>
                Boolean(item) && typeof item === 'object'
                && typeof (item as { title?: unknown }).title === 'string'
                && typeof (item as { concern?: unknown }).concern === 'string'
                && (item as { concern: string }).concern.trim().length > 0)
            .slice(0, artifacts.length);
    } catch {
        return [];
    }
}

/**
 * Write several item bodies in one call, delimited by headings.
 *
 * Boards and timelines carry many short bodies. One call each would mean
 * fourteen round trips for a fourteen-card board — slow, and a reliable way to
 * hit the gateway's per-user rate limit, which would turn the partial-success
 * design into a partial-failure one. One call for all of them risks truncating
 * the tail, so the runner batches.
 *
 * The delimiter is a markdown heading rather than JSON or a sentinel string:
 * it is the format the model is already writing in, an imperfect split degrades
 * to "this one card has no body" instead of losing the batch, and there is no
 * escaping layer to get wrong.
 */
export async function composeItemBodies(
    request: {
        shape: AIStructuredAction['type'];
        title: string;
        brief?: string;
        userRequest: string;
        context?: string;
        items: string[];
    },
    options: AIRequestOptions = {},
): Promise<string> {
    const budget = effortBudget(options.effort);
    const perItem = Math.max(2, Math.round(budget.targetBlocks / 3));

    const system = `You are writing the item bodies for one ${request.shape} on an infinite canvas in Infonote.
Return MARKDOWN ONLY. For EACH item, emit exactly this, in the order given:

### <the item title, copied exactly>
<that item's body>

Rules:
- Copy each title EXACTLY as given, including punctuation and dashes. The titles
  are how the bodies are matched back to their items; a paraphrased heading
  loses that item's body.
- Each body is about ${perItem} blocks: a short paragraph plus bullets, steps, a
  "- [ ] " checklist, or a small table where it genuinely helps.
- Do not add items, drop items, reorder them, or write any preamble.
- Do not invent facts, dates or figures.`;

    const prompt = [
        `[THE USER ASKED]\n${request.userRequest}`,
        request.context ? `[CANVAS CONTEXT]\n${request.context}` : '',
        `[THE ${request.shape.toUpperCase()}]\n"${request.title}"${request.brief ? ` — ${request.brief}` : ''}`,
        `[ITEMS TO WRITE, IN ORDER]\n${request.items.map((t) => `### ${t}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');

    const text = await generateBodyText(
        prompt,
        system,
        options,
        // Sized by the batch rather than the effort dial: the ceiling has to
        // scale with how many bodies this one reply is carrying.
        Math.min(8000, 400 + request.items.length * Math.round(budget.bodyTokens / 3)),
    );

    const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
    return (fenced ? fenced[1] : text).trim();
}

/* `parseStructuredAction` lived here: ONE call that had to emit every
   artifact and every body as a single balanced JSON array. That design was
   the root cause of the reliability complaints (ai-Plan.md §2.3 R1), so it is
   deleted rather than kept as a fallback — a dead function that reproduces the
   bug is a trap, not a safety net. `planArtifacts` + `composeArtifactBody`
   above replace it. */
