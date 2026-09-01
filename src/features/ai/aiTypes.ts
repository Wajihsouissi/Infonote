/**
 * Conversation model for the AI panel.
 *
 * The old AI surface was a one-shot prompt box: you typed, something appeared
 * on the canvas, and the box closed. Nothing was left to read, correct, or
 * follow up on. The panel keeps a transcript instead, and every assistant turn
 * carries the *steps* it took alongside its answer — so "what did it just do to
 * my canvas" is visible rather than inferred.
 */

import type { AIScopeSource } from './aiScope';

/** Re-exported so `aiTypes` stays the single import for the message model. */
export type { AIScopeSource };

/**
 * Which stage of the run an event belongs to (see ai-Plan.md §4).
 *
 * The phase is what lets the panel say *what kind* of work is happening rather
 * than just that something is. `compose` is the default for anything a legacy
 * saved chat replays, since that is where every old step originated.
 */
export type AIPhase = 'route' | 'clarify' | 'gather' | 'compose' | 'place' | 'attribute' | 'verify';

/** A thing the answer leaned on — a card on the canvas, or a page on the web. */
export type EvidenceSource =
    | { kind: 'node'; id: string; title: string }
    | { kind: 'web'; url: string; title: string; host: string };

/**
 * The expandable payload under a trace line.
 *
 * A label alone can only ever say "Searching the web". The detail is what turns
 * that into the four queries it actually ran, or the six cards it actually
 * read — which is the whole point of the trace.
 */
export type AITraceDetail =
    | { kind: 'queries'; queries: string[] }
    | { kind: 'cards'; nodeIds: string[]; readCount?: number; totalCount?: number }
    | { kind: 'plan'; artifacts: { shape: string; title: string }[]; why?: string }
    | { kind: 'artifact'; shape: string; title: string; index: number; total: number; note?: string }
    | { kind: 'sources'; sources: EvidenceSource[] }
    | { kind: 'note'; text: string };

/**
 * One line in an assistant turn's activity log.
 *
 * Deliberately a SUPERSET of the shape saved chats already hold rather than a
 * replacement: `phase`, `detail` and the timestamps are all optional, so a
 * transcript written before the trace existed still loads and renders — it just
 * renders without the extra affordances. `AIStep` stays as the alias every
 * existing call site uses.
 */
export interface AITraceEvent {
    id: string;
    /**
     * `thought` — narration of what it is about to do.
     * `action`  — work in flight (spinner until it resolves).
     * `result`  — something concrete landed (a card, an edit).
     * `error`   — that step failed; the turn may still have partial results.
     */
    kind: 'thought' | 'action' | 'result' | 'error';
    text: string;
    /**
     * `queued` — planned but not started, shown dimmed with a hollow marker.
     * `running` — in flight; the spinner tracks this.
     * `done` / `failed` — settled.
     *
     * `queued` is what turns the trace from a log into a plan: the run announces
     * every artifact it intends to write the moment it knows, so the user can
     * see what is coming and stop early if the shape is wrong. Without it the
     * panel only ever says what has already happened, which reads as a spinner
     * with commentary rather than a process.
     */
    status?: 'queued' | 'running' | 'done' | 'failed';
    phase?: AIPhase;
    detail?: AITraceDetail;
    /** epoch ms — drives the per-line duration readout. */
    startedAt?: number;
    endedAt?: number;
}

/** @deprecated Use `AITraceEvent`. Kept so saved chats and existing call sites keep working. */
export type AIStep = AITraceEvent;

/** What an assistant turn was asked to do — drives its badge and its actions. */
export type AIIntent = 'ask' | 'create' | 'edit' | 'image';

export type AIContextType = 'mindmap' | 'cards' | 'boards' | 'fusednodes' | 'timeline';

export interface AIContextDefinition {
    id: AIContextType;
    /**
     * The exact `type` string the structured schema uses (see
     * AIStructuredAction in aiService). The chip ids are UI labels and several
     * of them differ — `cards`/`note`, `boards`/`board`, `fusednodes`/
     * `fused-note`. The chip id used to be interpolated straight into the
     * prompt, so the model was told to emit types its own schema never
     * defined. Always send this, never `id`.
     */
    actionType: 'note' | 'fused-note' | 'mindmap' | 'board' | 'timeline';
    label: string;
    shortLabel: string;
    description: string;
    badge: string;
    color: string;
    accentRgb: string;
    icon: string;
}

export const AI_CONTEXT_DEFINITIONS: AIContextDefinition[] = [
    {
        id: 'mindmap',
        actionType: 'mindmap',
        label: 'Mindmap',
        shortLabel: 'Mindmap',
        description: 'Hierarchical concept tree with radiating branches and links',
        badge: '🧠 Mindmap',
        color: '#8b5cf6',
        accentRgb: '139, 92, 246',
        icon: 'Network',
    },
    {
        id: 'cards',
        actionType: 'note',
        label: 'Cards',
        shortLabel: 'Cards',
        description: 'Topic breakdown note cards with structured points',
        badge: '🃏 Cards',
        color: '#f59e0b',
        accentRgb: '245, 158, 11',
        icon: 'Layers',
    },
    {
        id: 'boards',
        actionType: 'board',
        label: 'Boards',
        shortLabel: 'Board',
        description: 'Structured Kanban board with stage lanes and task cards',
        badge: '📋 Board',
        color: '#3b82f6',
        accentRgb: '59, 130, 246',
        icon: 'Kanban',
    },
    {
        id: 'fusednodes',
        actionType: 'fused-note',
        label: 'Fused Notes',
        shortLabel: 'Fused Note',
        description: 'Deep, comprehensive long-form fused document',
        badge: '📄 Fused Note',
        color: '#10b981',
        accentRgb: '16, 185, 129',
        icon: 'FileText',
    },
    /* `timeline` is fully implemented by placeTimeline in aiRunner but had no
       chip, so it was reachable only by phrasing a prompt that happened to
       trigger it. The two chips removed here were the opposite problem:
       `image` produced a note *describing* an image (the real image path is the
       composer's own toggle), and `blocks` named a type the schema never
       defined, so nothing could render it. */
    {
        id: 'timeline',
        actionType: 'timeline',
        label: 'Timeline',
        shortLabel: 'Timeline',
        description: 'Ordered milestones laid left to right and joined by arrows',
        badge: '📅 Timeline',
        color: '#06b6d4',
        accentRgb: '6, 182, 212',
        icon: 'Waypoints',
    },
];

export interface AIUserMessage {
    id: string;
    role: 'user';
    text: string;
    intent: AIIntent;
    /** Titles of the cards that were selected when the turn was sent. */
    contextLabels: string[];
    /** Concrete card identities for a durable, visual source receipt above the
     * sent chat bubble. Kept separately from labels so renamed cards still
     * render with their current title and icon. */
    selectedNodeIds?: string[];
    /** Context formats explicitly selected for this turn (e.g. mindmap, cards, image). */
    selectedContexts?: AIContextType[];
    /**
     * Exactly what the AI was allowed to see on this turn (ai-Plan.md §5.3).
     *
     * Recorded per message rather than derived, so "why did it know about that
     * card" stays answerable after the selection has moved on. Absent on turns
     * sent before the scope model existed.
     */
    scope?: AIScopeSource[];
    at: string;
}

export interface AIAssistantMessage {
    id: string;
    role: 'assistant';
    /** Prose answer. Empty for pure canvas turns, which speak through `steps`. */
    text: string;
    steps: AIStep[];
    intent: AIIntent;
    status: 'streaming' | 'done' | 'error';
    error?: string;
    /** Server-confirmed model for streamed answers; absent on legacy turns. */
    model?: string;
    /** Total elapsed wall time for a completed answer, in milliseconds. */
    durationMs?: number;
    /** Nodes this turn added, so the turn can be undone on its own. */
    createdNodeIds: string[];
    /**
     * Cards this turn REWROTE, and what they said beforehand.
     *
     * Separate from `createdNodeIds` because the reversal is different in kind:
     * undoing a creation deletes a node, undoing an edit restores content the
     * user wrote themselves (ai-Plan.md §5.7).
     */
    editedNodes?: { nodeId: string; title: string; before: Record<string, unknown> }[];
    at: string;
}

/**
 * One question in a clarifying form — ai-Plan.md §5.2 (W2).
 *
 * Every question ships pre-answered (`defaults`), so pressing Continue without
 * touching anything is a sane run rather than a blank submission. That is what
 * keeps the form an accelerator instead of a toll gate.
 */
export interface AIFormQuestion {
    id: string;
    /** The question, in the user's own vocabulary. */
    prompt: string;
    kind: 'single' | 'multi' | 'text';
    /** 2-5 concrete options. No "Other" — the free-text field covers that. */
    options?: { id: string; label: string; hint?: string }[];
    /** Pre-selected option ids. */
    defaults?: string[];
}

/**
 * The in-progress version of an Ask Me form.
 *
 * This deliberately lives outside the persisted transcript until the user
 * submits it: cancelling should return to the exact chat they were having,
 * rather than leaving an abandoned interview in its history. Once it is
 * submitted, its durable fields are copied onto `AIFormMessage` below.
 */
export interface AIClarifyDraft {
    pendingQuery: string;
    reason: string;
    questions: AIFormQuestion[];
    answers: Record<string, string[]>;
    /** Per-question freeform detail, in addition to any selected choices. */
    customAnswers: Record<string, string>;
    /** A permanent escape hatch for context that did not fit a question. */
    additionalInfo: string;
    status: 'loading' | 'ready' | 'error';
    /** Question ids currently being regenerated or added by the model. */
    generatingQuestionIds: string[];
}

/**
 * A form the assistant put to the user before spending effort.
 *
 * A first-class transcript message rather than a modal: the canvas stays live,
 * the form scrolls with the conversation, and the answers stay visible on the
 * turn afterwards — which is what keeps "why did I get this board?" answerable
 * a week later.
 */
export interface AIFormMessage {
    id: string;
    role: 'form';
    /** Why we are asking — one sentence, shown above the questions. */
    reason: string;
    questions: AIFormQuestion[];
    status: 'open' | 'answered' | 'skipped';
    /** question id -> chosen option ids, or a single free-text string. */
    answers?: Record<string, string[]>;
    /** Freeform additions entered under individual questions. */
    customAnswers?: Record<string, string>;
    /** The user's final extra context from “Anything else AI should know?”. */
    additionalInfo?: string;
    /** The request this form is qualifying, replayed when it is submitted. */
    pendingQuery: string;
    at: string;
}

export type AIMessage = AIUserMessage | AIAssistantMessage | AIFormMessage;

/** Create acts on the canvas; Ask answers in the panel and touches nothing. */
export type AIMode = 'create' | 'ask';

