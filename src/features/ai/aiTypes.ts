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

export interface AIUserMessage {
    id: string;
    role: 'user';
    text: string;
    intent: AIIntent;
    /** Titles of the cards that were selected when the turn was sent. */
    contextLabels: string[];
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
