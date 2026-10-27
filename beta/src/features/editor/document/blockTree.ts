import type { Block } from '../types';

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

/** Per-editor, single-snapshot memo. Results never mutate an earlier snapshot.
 * Text/metadata edits reuse the topology and unchanged subtrees. Speculative
 * calls may replace the memo, but cannot change the result of any later call. */
export function createRenderTreeBuilder() {
    let previous: Block[] = [];
    let previousStart = 1;
    let tree: RenderNode[] = [];
    return (blocks: Block[], startIndex = 1): RenderNode[] => {
        if (previous === blocks && previousStart === startIndex) return tree;
        const sameStructure = previousStart === startIndex && previous.length === blocks.length
            && previous.every((block, i) => block === blocks[i] || (
                block.id === blocks[i].id && block.type === blocks[i].type
                && indentOf(block) === indentOf(blocks[i])
            ));
        if (sameStructure) {
            const refresh = (nodes: RenderNode[]): RenderNode[] => {
                let changed = false;
                const next = nodes.map(node => {
                    const children = node.children.length ? refresh(node.children) : node.children;
                    const block = blocks[node.index];
                    if (block === node.block && children === node.children) return node;
                    changed = true;
                    return { ...node, block, children };
                });
                return changed ? next : nodes;
            };
            tree = refresh(tree);
        } else tree = buildRenderTree(blocks, startIndex);
        previous = blocks;
        previousStart = startIndex;
        return tree;
    };
}

/** Blocks hidden inside a collapsed toggle, which keyboard navigation skips. */
const visibilityCache = new WeakMap<Block[], { hidden: Uint8Array; previous: Int32Array; next: Int32Array }>();

function visibilityOf(blocks: Block[]) {
    const cached = visibilityCache.get(blocks);
    if (cached) return cached;
    const hidden = new Uint8Array(blocks.length);
    const previous = new Int32Array(blocks.length), next = new Int32Array(blocks.length);
    let collapsedDepth: number | null = null;
    let lastVisible = -1;
    blocks.forEach((block, i) => {
        const depth = indentOf(block);
        if (collapsedDepth !== null && depth <= collapsedDepth) collapsedDepth = null;
        previous[i] = lastVisible;
        if (collapsedDepth !== null) hidden[i] = 1;
        else {
            lastVisible = i;
            if (block.type === 'toggle' && block.metadata?.isCollapsed) collapsedDepth = depth;
        }
    });
    lastVisible = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
        next[i] = lastVisible;
        if (!hidden[i]) lastVisible = i;
    }
    const result = { hidden, previous, next };
    visibilityCache.set(blocks, result);
    return result;
}

export function isHiddenByCollapsedToggle(blocks: Block[], index: number): boolean {
    return Boolean(visibilityOf(blocks).hidden[index]);
}

/** O(1) navigation after one visibility pass per immutable document revision. */
export function visibleBlockNeighbour(blocks: Block[], index: number, direction: 'previous' | 'next'): number {
    return visibilityOf(blocks)[direction][index] ?? -1;
}

/** The toggle whose body `index` sits in, if any. */
export function enclosingToggle(blocks: Block[], index: number): Block | null {
    const depth = indentOf(blocks[index]);
    for (let i = index - 1; i >= 0; i--) {
        if (indentOf(blocks[i]) < depth) return blocks[i].type === 'toggle' ? blocks[i] : null;
    }
    return null;
}
