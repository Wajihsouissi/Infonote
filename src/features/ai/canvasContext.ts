import type { AppNode } from '../../types';
import { getNodeBlocks, getNodeLabel } from '../../types';
import type { ResolvedScope } from './aiScope';

/** Rough character budget for what we paste into a prompt as canvas context. */
const SELECTED_BODY_CHARS = 1200;
const NEIGHBOUR_BODY_CHARS = 120;

function bodyText(node: AppNode, limit: number): string {
    const blocks = getNodeBlocks(node.data) ?? [];
    const text = blocks
        .map((b) => (typeof b.content === 'string' ? b.content : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function nodeTitle(node: AppNode): string {
    return getNodeLabel(node.data) || (node.type === 'fused-note' ? 'Document' : 'Untitled');
}

/**
 * What the model is allowed to know about the canvas.
 *
 * Two things changed here from the original (ai-Plan.md §5.3):
 *
 * 1. Nothing is decided by sniffing the question any more. This function is
 *    handed an already-resolved scope and renders exactly that — if the scope
 *    is empty it says so and stops, which is what makes "the AI reads my canvas
 *    only when I ask" true rather than aspirational.
 *
 * 2. Every card carries a short reference id (`[N1]`). The model is told to cite
 *    with those ids, and the panel maps them back to nodes on the way out. Raw
 *    uuids are deliberately never shown to the model: they burn tokens, they
 *    invite hallucinated ids, and a wrong one is indistinguishable from a right
 *    one. A small dense namespace fails visibly instead.
 */
export function buildCanvasContext(scope: ResolvedScope): string {
    const parts: string[] = [];
    let ref = 0;
    const refFor = () => `N${(ref += 1)}`;

    if (scope.focus.length > 0) {
        parts.push(
            `[CARDS THE USER IS POINTING AT]\n` +
                scope.focus
                    .map((n) => {
                        const body = bodyText(n, SELECTED_BODY_CHARS);
                        return `[${refFor()}] "${nodeTitle(n)}" (${n.type})${body ? `\n  ${body.replace(/\n/g, '\n  ')}` : ''}`;
                    })
                    .join('\n')
        );
    }

    if (scope.ambient.length > 0) {
        const trimmed = scope.consideredCount > scope.ambient.length + scope.focus.length;
        parts.push(
            `[OTHER CARDS IN SCOPE${trimmed ? ` — the ${scope.ambient.length} most relevant of ${scope.consideredCount}` : ''}]\n` +
                scope.ambient
                    .map((n) => {
                        const body = bodyText(n, NEIGHBOUR_BODY_CHARS);
                        return `[${refFor()}] "${nodeTitle(n)}" (${n.type})${body ? ` — ${body.replace(/\n/g, ' ')}` : ''}`;
                    })
                    .join('\n')
        );
    }

    if (parts.length === 0) {
        return 'The user has attached no canvas content to this turn. Answer from your own knowledge, and do not invent or refer to cards, notes or documents you cannot see.';
    }

    parts.push(
        'Cite these when you use them: write the reference in square brackets, e.g. [N1], immediately after the claim it supports. Only cite ids listed above.'
    );

    return parts.join('\n\n');
}

/**
 * The `[N1] -> node id` map for the same scope, in the same order.
 *
 * Built by a second walk rather than returned from `buildCanvasContext` so the
 * prompt builder stays a pure string function; both walk the scope identically,
 * and a test asserts they agree.
 */
export function buildScopeRefs(scope: ResolvedScope): Map<string, AppNode> {
    const refs = new Map<string, AppNode>();
    let ref = 0;
    for (const node of [...scope.focus, ...scope.ambient]) {
        refs.set(`N${(ref += 1)}`, node);
    }
    return refs;
}
