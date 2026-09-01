/**
 * What the AI is allowed to see on a turn — ai-Plan.md §5.3 (W3).
 *
 * This replaces `requestNeedsCanvasContext`, which decided whether to attach the
 * canvas by running a regex over the question:
 *
 *     /\b(canvas|cards?|notes?|selection|selected|above|below|existing)\b/i
 *
 * That both over- and under-fired. "Write me a note about Rome" matched on the
 * word *note* and silently pasted ambient canvas content into the prompt;
 * "what am I missing here" matched nothing and got no canvas at all. Either way
 * the user neither asked for the behaviour nor could see it.
 *
 * A scope is an explicit list of sources instead. It is set by the user (a
 * selection, an `@` mention, the web toggle), shown as chips above the composer
 * before sending, and recorded on the message afterwards. The default is EMPTY:
 * with nothing selected and nothing mentioned, the model answers from its own
 * knowledge and says so.
 */

import type { AppNode } from '../../types';
import { getNodeBlocks } from '../../types';
import { nodeTitle } from './canvasContext';

export type AIScopeSource =
    /** Whatever is selected on the canvas at send time — resolved late, so the
     *  chip tracks the selection instead of freezing a stale set of ids. */
    | { kind: 'selection' }
    /** One card, named with `@`. */
    | { kind: 'node'; id: string }
    /** Every card at one canvas level. `parentId` null is the root canvas. */
    | { kind: 'canvas'; parentId: string | null }
    /** A container and everything inside it — a board, a fused note. */
    | { kind: 'subtree'; rootId: string }
    /** Live web results. */
    | { kind: 'web' };

/** Stable identity for dedupe and React keys. */
export function scopeKey(source: AIScopeSource): string {
    switch (source.kind) {
        case 'selection': return 'selection';
        case 'web': return 'web';
        case 'node': return `node:${source.id}`;
        case 'canvas': return `canvas:${source.parentId ?? 'root'}`;
        case 'subtree': return `subtree:${source.rootId}`;
    }
}

export const hasScopeSource = (scope: AIScopeSource[], source: AIScopeSource): boolean =>
    scope.some((s) => scopeKey(s) === scopeKey(source));

export const addScopeSource = (scope: AIScopeSource[], source: AIScopeSource): AIScopeSource[] =>
    hasScopeSource(scope, source) ? scope : [...scope, source];

export const removeScopeSource = (scope: AIScopeSource[], key: string): AIScopeSource[] =>
    scope.filter((s) => scopeKey(s) !== key);

/* ---------------------------------------------------------------- resolving */

export interface ResolvedScope {
    /** Cards whose FULL body goes into the prompt — what the user pointed at. */
    focus: AppNode[];
    /** Cards in view as titles plus a short excerpt, for orientation only. */
    ambient: AppNode[];
    /** True when the turn should run web-grounded. */
    web: boolean;
    /** How many cards the scope covers in total, before ranking trimmed it. */
    consideredCount: number;
}

/** Focus cards carry their body; past this many the prompt gets unaffordable. */
const MAX_FOCUS = 8;
/** Ambient cards are one line each, so more of them fit. */
const MAX_AMBIENT = 12;
/**
 * Below this, a canvas scope sends everything and ranking is pointless noise.
 * Above it, rank against the question and report the trim in the trace
 * ("Read 6 of 31 cards") rather than silently truncating.
 */
export const RANK_THRESHOLD = 12;

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these',
    'those', 'my', 'our', 'your', 'me', 'we', 'i', 'you', 'what', 'how', 'why',
    'from', 'at', 'by', 'as', 'do', 'does', 'did', 'can', 'should', 'would',
]);

function terms(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9']+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function nodeSearchText(node: AppNode): string {
    const body = (getNodeBlocks(node.data) ?? [])
        .map((b) => (typeof b.content === 'string' ? b.content : ''))
        .join(' ');
    return `${nodeTitle(node)} ${body}`.toLowerCase();
}

/**
 * Rank cards against the question so a 31-card canvas sends the 6 that matter.
 *
 * Deliberately lexical rather than embedding-based (ai-Plan.md D3): it needs no
 * index, no async, and no model call, and a title match is a strong signal in a
 * canvas where the user wrote every title themselves. A title hit is worth more
 * than a body hit for exactly that reason.
 */
export function rankNodes(nodes: AppNode[], question: string): AppNode[] {
    const queryTerms = terms(question);
    if (queryTerms.length === 0) return nodes;

    return nodes
        .map((node) => {
            const title = nodeTitle(node).toLowerCase();
            const haystack = nodeSearchText(node);
            let score = 0;
            for (const term of queryTerms) {
                if (title.includes(term)) score += 3;
                else if (haystack.includes(term)) score += 1;
            }
            return { node, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.node);
}

/**
 * Turn the declared scope into the cards that will actually be sent.
 *
 * `selection` and `node` sources are FOCUS — the user pointed at them, so they
 * go in with their bodies. `canvas` and `subtree` are AMBIENT: enough to orient
 * the model without pasting a whole workspace into a prompt.
 */
export function resolveScope(
    scope: AIScopeSource[],
    nodes: AppNode[],
    selectedIds: ReadonlySet<string>,
    question = '',
): ResolvedScope {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const focus = new Map<string, AppNode>();
    const ambientPool = new Map<string, AppNode>();
    let web = false;
    let consideredCount = 0;

    for (const source of scope) {
        switch (source.kind) {
            case 'web':
                web = true;
                break;
            case 'selection':
                for (const id of selectedIds) {
                    const node = byId.get(id);
                    if (node) focus.set(node.id, node);
                }
                break;
            case 'node': {
                const node = byId.get(source.id);
                if (node) focus.set(node.id, node);
                break;
            }
            case 'canvas': {
                const level = nodes.filter((n) => (n.parentId ?? null) === source.parentId);
                consideredCount += level.length;
                for (const node of level) ambientPool.set(node.id, node);
                break;
            }
            case 'subtree': {
                const root = byId.get(source.rootId);
                if (root) ambientPool.set(root.id, root);
                const children = nodes.filter((n) => n.parentId === source.rootId);
                consideredCount += children.length + (root ? 1 : 0);
                for (const node of children) ambientPool.set(node.id, node);
                break;
            }
        }
    }

    // A card explicitly pointed at is never demoted to an excerpt because a
    // broader scope also happens to contain it.
    for (const id of focus.keys()) ambientPool.delete(id);

    const ambientAll = [...ambientPool.values()];
    const ambient = ambientAll.length > RANK_THRESHOLD
        ? rankNodes(ambientAll, question).slice(0, MAX_AMBIENT)
        : ambientAll.slice(0, MAX_AMBIENT);

    return {
        focus: [...focus.values()].slice(0, MAX_FOCUS),
        ambient,
        web,
        consideredCount: consideredCount || focus.size,
    };
}

/* ------------------------------------------------------------- presentation */

export interface ScopeChip {
    key: string;
    label: string;
    /** Size or count, shown quietly beside the label. */
    detail?: string;
    tone: 'canvas' | 'card' | 'selection' | 'web';
}

const approxSize = (nodes: AppNode[]): string => {
    const chars = nodes.reduce((sum, node) => {
        const body = (getNodeBlocks(node.data) ?? [])
            .map((b) => (typeof b.content === 'string' ? b.content : ''))
            .join('');
        return sum + body.length + nodeTitle(node).length;
    }, 0);
    if (chars < 1000) return `~${Math.max(1, Math.round(chars / 100) * 100)} chars`;
    return `~${(chars / 1000).toFixed(chars < 10_000 ? 1 : 0)}k chars`;
};

/**
 * One chip per source, describing it in the user's terms.
 *
 * The size estimate matters: "31 cards · ~9k chars" is the difference between
 * a scope the user understands the cost of and one they do not.
 */
export function describeScope(
    scope: AIScopeSource[],
    nodes: AppNode[],
    selectedIds: ReadonlySet<string>,
): ScopeChip[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    return scope.map((source): ScopeChip => {
        const key = scopeKey(source);
        switch (source.kind) {
            case 'web':
                return { key, label: 'Web', detail: 'live sources', tone: 'web' };
            case 'selection': {
                const selected = nodes.filter((n) => selectedIds.has(n.id));
                return {
                    key,
                    label: 'Selection',
                    detail: selected.length === 0
                        ? 'nothing selected'
                        : `${selected.length} card${selected.length === 1 ? '' : 's'}`,
                    tone: 'selection',
                };
            }
            case 'node': {
                const node = byId.get(source.id);
                return {
                    key,
                    label: node ? nodeTitle(node) : 'Missing card',
                    detail: node ? undefined : 'deleted',
                    tone: 'card',
                };
            }
            case 'canvas': {
                const level = nodes.filter((n) => (n.parentId ?? null) === source.parentId);
                return {
                    key,
                    label: '@Canvas',
                    detail: `${level.length} card${level.length === 1 ? '' : 's'} · ${approxSize(level)}`,
                    tone: 'canvas',
                };
            }
            case 'subtree': {
                const root = byId.get(source.rootId);
                const children = nodes.filter((n) => n.parentId === source.rootId);
                return {
                    key,
                    label: root ? nodeTitle(root) : 'Missing container',
                    detail: `${children.length} inside`,
                    tone: 'canvas',
                };
            }
        }
    });
}

/**
 * Would the question have triggered the old regex?
 *
 * Kept for ONE purpose: offering a ghost "Add @canvas?" chip the user can
 * accept in a click. It must never attach anything on its own — that silent
 * behaviour is the bug this whole module exists to remove.
 */
export function suggestsCanvasScope(question: string): boolean {
    return /\b(this canvas|these cards?|my (?:cards?|notes?|canvas)|on the canvas|what(?:'s| is) (?:here|missing)|above|below)\b/i.test(question);
}
