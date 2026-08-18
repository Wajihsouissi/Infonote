/**
 * Conversation model for the AI panel.
 *
 * The old AI surface was a one-shot prompt box: you typed, something appeared
 * on the canvas, and the box closed. Nothing was left to read, correct, or
 * follow up on. The panel keeps a transcript instead, and every assistant turn
 * carries the *steps* it took alongside its answer — so "what did it just do to
 * my canvas" is visible rather than inferred.
 */

/** One line in an assistant turn's activity log. */
export interface AIStep {
    id: string;
    /**
     * `thought` — narration of what it is about to do.
     * `action`  — work in flight (spinner until it resolves).
     * `result`  — something concrete landed (a card, an edit).
     * `error`   — that step failed; the turn may still have partial results.
     */
    kind: 'thought' | 'action' | 'result' | 'error';
    text: string;
    /** Only `action` steps are ever pending; the spinner tracks this. */
    status?: 'running' | 'done' | 'failed';
}

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
    /** Context formats explicitly selected for this turn (e.g. mindmap, cards, image). */
    selectedContexts?: AIContextType[];
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
    /** Nodes this turn added, so the turn can be undone on its own. */
    createdNodeIds: string[];
    at: string;
}

export type AIMessage = AIUserMessage | AIAssistantMessage;

/** Create acts on the canvas; Ask answers in the panel and touches nothing. */
export type AIMode = 'create' | 'ask';

