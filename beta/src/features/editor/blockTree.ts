import type { Block } from './types';

/**
 * The shape the editor renders: blocks nested under the toggles that own them,
 * with each numbered block's ordinal worked out.
 *
 * Built in one pass over the document. The numbering used to be a backwards
 * scan per numbered block, so a long numbered list cost O(n²) on every
 * keystroke.
 */

export interface RenderNode {
    kind: 'block' | 'toggle-group';
    block: Block;
    /** 1-based ordinal for a numbered block. */
    listIndex?: number;
    /** A toggle with content nested under it. */
    hasChildren?: boolean;
    /** Position in the flat document, for `renderBetweenBlocks`. */
    index: number;
    children: RenderNode[];
}

const indentOf = (block: Block) => block.indent ?? 0;

/**
 * A numbered run continues through deeper blocks but is broken by anything
 * else at its own depth, and by any shallower block (which ends the nesting
 * the run lived in).
 */
function assignListIndexes(blocks: Block[], startIndex: number): (number | undefined)[] {
    const runs = new Map<number, number>();
    return blocks.map((block, i) => {
        const depth = indentOf(block);
        for (const knownDepth of runs.keys()) {
            if (knownDepth > depth) runs.delete(knownDepth);
        }
        if (block.type !== 'numbered') {
            runs.set(depth, 0);
            return undefined;
        }
        // The first block continues the count of whatever came before this
        // editor — a canvas block's own list numbering carries across nodes.
        const next = (runs.get(depth) ?? (i === 0 ? startIndex - 1 : 0)) + 1;
        runs.set(depth, next);
        return next;
    });
}

/** Groups the flat document into the tree the editor renders. */
export function buildRenderTree(blocks: Block[], startIndex = 1): RenderNode[] {
    const listIndexes = assignListIndexes(blocks, startIndex);
    const root: RenderNode[] = [];
    const openToggles: { node: RenderNode; indent: number }[] = [];

    blocks.forEach((block, index) => {
        const indent = indentOf(block);
        while (openToggles.length > 0 && openToggles[openToggles.length - 1].indent >= indent) {
            openToggles.pop();
        }

        const node: RenderNode = {
            kind: block.type === 'toggle' ? 'toggle-group' : 'block',
            block,
            listIndex: listIndexes[index],
            hasChildren: block.type === 'toggle'
                && index < blocks.length - 1
                && indentOf(blocks[index + 1]) > indent,
            index,
            children: [],
        };

        if (openToggles.length > 0) openToggles[openToggles.length - 1].node.children.push(node);
        else root.push(node);

        if (block.type === 'toggle') openToggles.push({ node, indent });
    });

    return root;
}

/** Blocks hidden inside a collapsed toggle, which keyboard navigation skips. */
export function isHiddenByCollapsedToggle(blocks: Block[], index: number): boolean {
    const depth = indentOf(blocks[index]);
    for (let i = 0; i < index; i++) {
        const parent = blocks[i];
        if (parent.type === 'toggle' && parent.metadata?.isCollapsed && depth > indentOf(parent)) return true;
    }
    return false;
}

/** The toggle whose body `index` sits in, if any. */
export function enclosingToggle(blocks: Block[], index: number): Block | null {
    const depth = indentOf(blocks[index]);
    for (let i = index - 1; i >= 0; i--) {
        if (indentOf(blocks[i]) < depth) return blocks[i].type === 'toggle' ? blocks[i] : null;
    }
    return null;
}
