// ============================================================
// AI Service - talks to our /api/ai/* routes, which proxy an OpenAI-compatible
// endpoint (Google Gemini by default; see AI_GATEWAY_BASE_URL).
// Text: OpenAI-compatible chat completions.
// Image: OpenAI-compatible image generations.
// ============================================================
import { supabase, isSupabaseConfigured } from './supabase/client';
import {
    effortMaxTokens,
    freeformEffortDirective,
    structuredEffortDirective,
    type AIEffort,
} from '../config/aiEffort';
import { AI_CONTEXT_DEFINITIONS, type AIContextType } from '../features/ai/aiTypes';

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
export const FREEFORM_SYSTEM_PROMPT = `You are a knowledgeable, articulate writing assistant inside Infonote, an infinite-canvas note app.

Match the depth and length of your answer to what is actually asked:
- Simple or factual question → answer directly in 1–3 sentences. Do not pad or add headings.
- "Explain", "compare", "how do I…" → a focused answer with light structure where it helps.
- "Guide", "deep dive", "comprehensive", "everything about…" → fully structured with clear sections.

Formatting (clean Markdown that renders beautifully):
- **Bold** for key terms, *italic* for nuance, \`inline code\` for code, commands, or identifiers.
- Use ##/### headings, "- " bullets, "1." numbered steps, "> " quotes, and tables ONLY when they add clarity.
- Use fenced \`\`\` code blocks for multi-line code.

Lead with the answer — no preamble, no "Certainly!", no restating the question. Never over-structure a short answer.`;

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

async function gatewayFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await getAiAuthHeader()),
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
        // The /api/ai routes send `{ error: "<message>" }` — a plain string.
        // Reading only `error.message` meant every server-side explanation was
        // dropped for a bare status code: "AI Gateway is not configured" and
        // "Too many AI requests" both surfaced as "failed with HTTP 500".
        const message =
            (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
            data?.message ||
            `AI request failed with HTTP ${response.status}`;
        throw new Error(message);
    }

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
    const { system, model, images, effort } = typeof options === 'string'
        ? { system: options, model: undefined, images: undefined, effort: undefined }
        : options;

    const finalSystem = systemWithEffort(system, effort);
    const response = await gatewayFetch<ChatCompletionResponse>('/api/ai/text', {
        model: model || TEXT_MODEL,
        prompt,
        ...(finalSystem ? { system: finalSystem } : {}),
        ...(images && images.length > 0 ? { images } : {}),
        ...(effort ? { maxTokens: effortMaxTokens(effort) } : {}),
    });

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
): Promise<string> {
    const { system, model, images, effort, onDelta, signal } = options;
    const finalSystem = systemWithEffort(system, effort);
    const response = await fetch('/api/ai/stream', {
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
            ...(effort ? { maxTokens: effortMaxTokens(effort) } : {}),
        }),
        signal,
    });

    if (!response.ok || !response.body) {
        const text = await response.text();
        let message = `AI request failed with HTTP ${response.status}`;
        try {
            const parsed = text ? JSON.parse(text) : {};
            message = parsed?.error?.message || parsed?.error || parsed?.message || message;
        } catch {
            if (text) message = text;
        }
        throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
            full += chunk;
            onDelta(chunk);
        }
    }

    if (!full.trim()) throw new Error('AI Gateway returned no text content.');
    return full;
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
 * Parse structured action instructions from user's natural language prompts.
 * Understands intents to create note cards, fused notes, mindmaps, kanban
 * boards and timelines. Every type listed here is one the runner can actually
 * place — the schema and the placer are meant to be read together.
 */
export async function parseStructuredAction(prompt: string, context?: string, options: AIRequestOptions = {}): Promise<AIStructuredAction[]> {
    /* Map the picker's chip ids to the schema's own type names. Sending the raw
       chip ids told the model to emit "boards"/"fusednodes"/"cards" — none of
       which appear in the type union below, so the instruction contradicted the
       schema it was attached to. */
    const requestedTypes = (options.contexts ?? [])
        .map((id) => AI_CONTEXT_DEFINITIONS.find((d) => d.id === id)?.actionType)
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

    const systemPrompt = `You are a structured intent parser for Infonote, an infinite canvas note-taking app.
Analyze the user's request and parse it into an array of actions.
The user might ask to:
- Create note cards: e.g. "create 3 cards with productivity tips"
- Create a fused note or document: e.g. "create a fusednote with a to do list"
- Create a mindmap: e.g. "mindmap of artificial intelligence"
- Create a board: e.g. "kanban for the redesign", "plan this as a board"
- Create a timeline: e.g. "timeline for the case study", "roadmap over 6 weeks"

CHOOSING THE RIGHT SHAPE — this matters more than the content:
- Work that moves through stages, or anything the user will tick off → ONE "board".
- Anything sequenced in time (weeks, sprints, phases with dates) → ONE "timeline".
- Ideas that branch from a centre → "mindmap". A long written piece → "fused-note".
- Loose, unordered pieces → "note" cards.
A request to "plan" something is almost always ONE board or ONE timeline, not a
pile of loose note cards. Do not emit both a board and separate cards for the
same items — pick the single shape that fits and put everything inside it.

${options.effort ? `\n${structuredEffortDirective(options.effort)}\n` : ''}

${requestedTypes.length > 0 ? `\nThe user has explicitly selected these output types: [${requestedTypes.join(', ')}]. You MUST include at least one action of each selected type in your response — these are exactly the "type" values defined below. Honour the selection; do not substitute a different shape for a selected type.\n` : ''}

${context ? `[CURRENT CANVAS CONTEXT]\n${context}\nUse this context to inform your response if the user refers to existing topics.\n` : ''}
First, briefly outline your plan for the content in <think> tags.
Then, respond ONLY with a valid JSON array of action objects. Do not include markdown, code blocks, or text outside the JSON (except for the <think> tags at the beginning).
Each action object must have:
- "type": "note" | "fused-note" | "mindmap" | "board" | "timeline"
- "title": Title of the card/doc/mindmap/board/timeline
- If type is "note" or "fused-note":
  - "content": Body content whose length and depth MATCH the user's request — concise for simple asks, richly structured only when the topic warrants it. Use markdown where it helps (headers, bullet lists, quote blocks, '- [ ] Task' lists, and **bold** for key terms). A "fused-note" is a document, so it can go deeper, but still avoid padding.
  - "color": Optional background hex color. MUST choose ONLY from: #f95d2e, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #e3a24f, #6366f1
- If type is "mindmap":
  - "nodes": Array of objects representing the mindmap graph: {"id": "unique-string", "label": "Short Title", "parentId": "id-of-parent-node-if-any"} (Do not include parentId for the root node)
- If type is "board":
  - "groupBy": "status" (default) | "priority" | "category" | "assignee"
  - "columns": 3-6 lanes in the order work moves through them: {"label": "Discovery", "value": "discovery", "tone": "azure"}. "value" is lowercase-kebab and is what each card stores. "tone" MUST be one of: neutral, rose, amber, citrine, olive, jade, teal, azure, indigo, violet, magenta.
  - "cards": the cards that open on the board: {"title": "...", "content": "markdown body", "column": "discovery", "priority": "high"}. "column" MUST match one of the column "value"s. Give every card a real body — a board of bare titles is useless.
- If type is "timeline":
  - "milestones": the steps IN ORDER: {"title": "Week 1 — Research", "content": "markdown body", "date": "2026-09-07"}. "date" is optional and ISO (YYYY-MM-DD). They are drawn left to right and joined by arrows, so order is the meaning.

Example JSON response:
[
  {"type": "note", "title": "The Milky Way", "content": "The Milky Way galaxy is...", "color": "#f95d2e"},
  {"type": "fused-note", "title": "Project Launch Doc", "content": "## Goals\\n- [ ] Task 1\\n- [ ] Task 2", "color": "#10b981"},
  {
    "type": "board",
    "title": "Redesign plan",
    "groupBy": "status",
    "columns": [
      {"label": "Discovery", "value": "discovery", "tone": "azure"},
      {"label": "Design", "value": "design", "tone": "violet"},
      {"label": "Validate", "value": "validate", "tone": "jade"}
    ],
    "cards": [
      {"title": "User interviews", "content": "Recruit 6 users.\\n- [ ] Write the script", "column": "discovery", "priority": "high"},
      {"title": "Wireframes", "content": "Low-fi flows for the core task.", "column": "design"}
    ]
  },
  {
    "type": "timeline",
    "title": "Six week plan",
    "milestones": [
      {"title": "Week 1 — Research", "content": "Interviews and audit.", "date": "2026-09-07"},
      {"title": "Week 2 — Synthesis", "content": "Affinity map, personas."}
    ]
  },
  {
    "type": "mindmap",
    "title": "AI Concepts",
    "nodes": [
      {"id": "root", "label": "AI Concepts"},
      {"id": "ml", "label": "Machine Learning", "parentId": "root"},
      {"id": "dl", "label": "Deep Learning", "parentId": "ml"}
    ]
  }
]`;

    // We use clear XML-style tags to separate system instructions from user prompt
    const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n<user>\n${prompt}\n</user>`;

    // Images ride along on the first pass only: the retry is a repair of the
    // model's own malformed JSON, and re-sending the pictures just costs money.
    let responseText = await generateText(fullPrompt, options);
    let jsonStr = extractJsonFromString(responseText, 'array');
    
    // Retry logic if no valid JSON array was found
    if (!jsonStr) {
        try {
            const retryPrompt = `${fullPrompt}\n\n<assistant>\n${responseText}\n</assistant>\n\n<user>\nThis JSON was invalid or missing. Please fix the syntax errors and return ONLY the valid JSON array without any markdown wrappers or text.\n</user>`;
            // Effort rides along so a Smart repair keeps the same token ceiling
            // — re-emitting a long board under the default cap would truncate.
            const retryResponse = await generateText(retryPrompt, { model: options.model, effort: options.effort });
            jsonStr = extractJsonFromString(retryResponse, 'array');
            if (jsonStr) {
                responseText = retryResponse;
            }
        } catch (retryErr) {
            console.error("Retry failed:", retryErr);
        }
    }

    const cleanResponseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if (!jsonStr) {
        // Fallback: If still no structured JSON, parse as a single note card
        return [{
            type: 'note',
            title: prompt.length > 20 ? prompt.substring(0, 17) + '...' : prompt,
            content: cleanResponseText,
            color: '#1a191d'
        }];
    }

    try {
        const parsed = JSON.parse(jsonStr) as AIStructuredAction[];
        return parsed;
    } catch (e) {
        console.error("Failed to parse structured actions:", e);
        return [{
            type: 'note',
            title: 'AI Generated Card',
            content: cleanResponseText,
            color: '#1a191d'
        }];
    }
}
