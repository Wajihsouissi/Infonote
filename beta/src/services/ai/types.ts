/**
 * What the AI service takes and gives back.
 *
 * Shapes only, no behaviour: the request options, the structured plan the
 * model emits, and the result shape every text call returns. Kept in one place
 * so the transport, the generators and the runner can all speak about the same
 * things without importing each other.
 */

import type { AIEffort } from '../../config/aiEffort';
import type { AIContextType } from '../../features/ai/aiTypes';

/**
 * One thing the AI decided to put on the canvas.
 *
 * Three shapes, and they are the three the beta can actually draw: a card, a
 * long document, and a mindmap. A shape the canvas cannot render is worse than
 * no shape at all — the model happily emits it and the turn dies at placement.
 */
export interface AIStructuredAction {
    type: 'note' | 'fused-note' | 'mindmap';
    title: string;
    content?: string;
    color?: string;
    /** mindmap — one root (no parentId) and every other node hanging off it. */
    nodes?: Array<{ id: string; label: string; parentId?: string }>;
}

/**
 * A planned artifact before its bodies exist.
 *
 * Structurally an `AIStructuredAction` with every `content` field still empty,
 * plus the one-line `brief` the body pass writes against. Keeping it the same
 * shape is deliberate: the runner fills the bodies in and hands the result
 * straight to placement, so the two-pass split changed how content is
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

/** Extra request fields every text entry point accepts. */
export interface AIRequestOptions {
    system?: string;
    /** Gateway model id. Honoured only if the server allow-lists it. */
    model?: string | null;
    /** Data-URL images sent as multimodal parts. */
    images?: string[];
    /** How deep the answer should go. Widens/narrows the token ceiling too. */
    effort?: AIEffort;
    /** Content types the user explicitly selected (mindmap, cards, fused note). */
    contexts?: AIContextType[];
    /**
     * Exact output ceiling, overriding whatever `effort` would imply.
     *
     * The two-pass generator needs to size its calls independently of the
     * user's effort dial: a plan is short at every level. Without this they
     * would both inherit the freeform ceiling and either truncate or run away.
     */
    maxTokensOverride?: number;
    /**
     * Prior conversation turns, sent as a real messages array.
     *
     * Kept separate from `prompt` so the gateway sees the user/assistant
     * boundary structurally, and so the cacheable prefix stops changing on
     * every turn.
     */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /**
     * Which stage of a run this call belongs to, for rate limiting.
     *
     * One Create turn is a plan call plus one body call per artifact plus a
     * verify call. Sent as a header so the server can bucket them without
     * parsing the body. Omitting it is safe — the server falls back to the
     * strictest bucket — so only the fan-out paths need to set it.
     */
    phase?: 'plan' | 'body' | 'verify';
    /**
     * Whether the model may reason before answering. Omitted = `'off'`.
     *
     * Gemini's flash models think by default, and the thinking is billed
     * against the same `max_tokens` as the answer: measured on 2026-09-13, a
     * plan call spent 1493 of its 1560 tokens thinking and returned broken JSON
     * after 10s. `'light'` allows a little reasoning (with extra token headroom
     * added server-side) and is reserved for Smart free-form answers.
     */
    thinking?: 'off' | 'light' | 'deep';
    /**
     * Planner only: the canvas shapes the router judged the best fit. A hint,
     * not a requirement — `contexts` is what the user explicitly demanded.
     */
    shapeHint?: AIStructuredAction['type'][];
    /** Sampling temperature in [0, 1]; the server defaults to 0.7. */
    temperature?: number;
    /**
     * Return the reply without trimming its edges. Only for replies that get
     * joined to another reply (continuations), where the trimmed space is the
     * one between two words.
     */
    preserveWhitespace?: boolean;
}

/** Body-writing options: pass `onText` to receive the text as it streams. */
export type AIBodyOptions = AIRequestOptions & {
    /** Called with the FULL body so far, each time more of it arrives. */
    onText?: (markdown: string) => void;
    signal?: AbortSignal;
};

/** A completion plus why the model stopped. `truncated` means it ran out of room. */
export interface AITextResult {
    text: string;
    finishReason: string | null;
    truncated: boolean;
}

/** A streamed completion: the same, plus who answered and how long it took. */
export interface AIStreamResult extends AITextResult {
    model: string | null;
    durationMs: number;
}
