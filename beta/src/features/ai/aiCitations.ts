/**
 * Turning an answer into a *cited* answer.
 *
 * The prompt hands the model short refs (`[N1]`) for the cards in scope and
 * asks it to cite with them; this maps those back to real nodes and rewrites
 * them as inline chips. The model never sees a uuid: they cost tokens, invite
 * hallucinated ids, and a wrong one is indistinguishable from a right one,
 * whereas a bad `[N7]` in a 3-card scope fails visibly.
 */

import type { AppNode } from '../../types';
import { nodeTitle } from './canvasContext';

/**
 * Rewrite `[N1]` refs as inline node chips, and drop the ones that resolve to
 * nothing.
 *
 * The chip uses the editor's existing `chnk://` link convention rather than a
 * new mechanism, so it renders, serialises and survives a copy-paste like every
 * other inline chip already does. A ref the scope does not contain is stripped
 * rather than shown: a citation the reader cannot follow is worse than none,
 * and a visible `[N7]` pointing at nothing actively misleads.
 */
export function resolveNodeCitations(text: string, refs: Map<string, AppNode>): string {
    if (!text) return text;
    return text.replace(/\[(N\d{1,3})\]/g, (_match, ref: string) => {
        const node = refs.get(ref);
        if (!node) return '';
        // `]` in a title would close the markdown link early.
        const title = nodeTitle(node).replace(/[[\]]/g, '');
        return `[${title}](chnk://node/${node.id})`;
    }).replace(/ {2,}/g, ' ').replace(/ +([.,;:])/g, '$1');
}
