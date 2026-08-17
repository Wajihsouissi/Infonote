import type { AppNode } from '../../types';
import { getNodeBlocks, getNodeLabel } from '../../types';

/** Rough character budget for what we paste into a prompt as canvas context. */
const SELECTED_BODY_CHARS = 1200;
const NEIGHBOUR_BODY_CHARS = 200;
const MAX_NEIGHBOURS = 24;

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
 * The old prompt passed a bare list of titles, which is why answers never felt
 * grounded in the actual notes — it could see that a card called "Tech Stack"
 * existed but not a word of what was in it. Selected cards go in with their
 * bodies; everything else in the current level goes in as titles plus a short
 * excerpt, so the model can reference neighbours without the prompt exploding.
 */
export function buildCanvasContext(
    nodes: AppNode[],
    selectedIds: Set<string>,
    currentParentId: string | null
): string {
    const inScope = nodes.filter((n) => (n.parentId ?? null) === currentParentId);
    const selected = nodes.filter((n) => selectedIds.has(n.id));
    const others = inScope.filter((n) => !selectedIds.has(n.id)).slice(0, MAX_NEIGHBOURS);

    const parts: string[] = [];

    if (selected.length > 0) {
        parts.push(
            `[SELECTED CARDS — the user is pointing at these]\n` +
                selected
                    .map((n) => {
                        const body = bodyText(n, SELECTED_BODY_CHARS);
                        return `- "${nodeTitle(n)}" (${n.type})${body ? `\n  ${body.replace(/\n/g, '\n  ')}` : ''}`;
                    })
                    .join('\n')
        );
    }

    if (others.length > 0) {
        parts.push(
            `[OTHER CARDS ON THIS CANVAS]\n` +
                others
                    .map((n) => {
                        const body = bodyText(n, NEIGHBOUR_BODY_CHARS);
                        return `- "${nodeTitle(n)}" (${n.type})${body ? ` — ${body.replace(/\n/g, ' ')}` : ''}`;
                    })
                    .join('\n')
        );
    }

    if (parts.length === 0) return 'The canvas is currently empty.';
    return parts.join('\n\n');
}
