/**
 * Turning a model reply into something the canvas can safely place.
 *
 * The rule this file exists to enforce: malformed output produces an error the
 * user can act on, never a surprise card. Everything the planner returns is
 * checked here before anything is drawn.
 */

import type { AIStructuredAction } from './types';

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

const ACTION_TYPES = new Set<AIStructuredAction['type']>(['note', 'fused-note', 'mindmap']);

/** A recoverable failure: never turn malformed model JSON into a surprise card. */
export class AIOutputValidationError extends Error {
    constructor(
        detail = 'The AI returned an incomplete canvas plan.',
        /* Advice is a parameter because the two causes need opposite fixes.
           Malformed output wants a more specific request; output that ran out
           of room wants a SMALLER one, and telling that user to be more
           specific sends them toward a bigger prompt that truncates harder. */
        advice = 'try again or make the requested format more specific',
    ) {
        super(`${detail} Nothing was added to the canvas — ${advice}.`);
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
     * off for them. Everything structural — shapes, connected mindmaps — is
     * still enforced, because a malformed skeleton is exactly as unplaceable as
     * a malformed full action.
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

        if (action.type === 'mindmap') validateMindmap(action.nodes);
    });

    if (requestedTypes.some((type) => !actions.some((action) => action.type === type))) {
        throw new AIOutputValidationError('The AI did not honour every output type you selected.');
    }
    return actions;
}

/**
 * A mindmap has to be one tree.
 *
 * Every node needs a real parent that exists, nothing may parent itself, and
 * there is exactly one root — a second root is two maps drawn on top of each
 * other, and a dangling parentId draws an edge to nothing.
 */
function validateMindmap(nodes: AIStructuredAction['nodes']): void {
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

export function parseValidatedStructuredActions(
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
