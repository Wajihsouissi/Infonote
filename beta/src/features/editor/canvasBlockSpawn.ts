import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { Block } from './types';

/** Gap between stacked canvas blocks, matching the canvas grid. */
const GAP = 16;
/** A column this tall starts a new one to the right instead of growing down. */
const COLUMN_LIMIT = 5;
const DEFAULT_WIDTH = 432;
const DEFAULT_HEIGHT = 100;

/** Whether this node is a standalone block on the canvas, not a card. */
export function isCanvasBlockNode(nodeId: string | undefined): boolean {
    if (!nodeId) return false;
    return getNodeById(useStore.getState().nodes, nodeId)?.type === 'block';
}

/**
 * Pressing Enter in a standalone canvas block makes the NEXT block a node of
 * its own, below this one — the canvas equivalent of a new line.
 *
 * Returns the new node's id, or null if `sourceNodeId` is not a canvas block.
 */
export function spawnBlockNodeBelow(sourceNodeId: string, block: Block): string | null {
    const store = useStore.getState();
    const source = getNodeById(store.nodes, sourceNodeId);
    if (!source || source.type !== 'block') return null;

    const parentId = source.parentId || undefined;
    const column = store.nodes.filter((node) => node.type === 'block'
        && node.data.isStandaloneBlock
        && Math.abs(node.position.x - source.position.x) < 10
        && node.parentId === parentId);

    const width = Number(source.style?.width) || DEFAULT_WIDTH;
    const height = Number(source.style?.height) || DEFAULT_HEIGHT;
    const position = column.length >= COLUMN_LIMIT
        ? { x: source.position.x + width + GAP, y: Math.min(...column.map((node) => node.position.y)) }
        : { x: source.position.x, y: source.position.y + height + GAP };

    // uuid, not crypto.randomUUID: the latter needs a secure context, and a
    // LAN address over http is not one.
    const newNodeId = uuidv4();
    store.addNode(
        'block',
        position,
        { content: [block], isStandaloneBlock: true },
        { width: source.style?.width || DEFAULT_WIDTH, height: source.style?.height || DEFAULT_HEIGHT },
        parentId,
        newNodeId,
    );

    // The new block is where the writing continues, so it takes the selection.
    store.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: node.id === newNodeId })));
    store.setSelectedCanvasNodeIds(new Set([newNodeId]));
    return newNodeId;
}

/**
 * A block that should take the caret as soon as its editor mounts.
 *
 * Enter on a canvas block puts the rest of the line into a NEW node, and the
 * caret has to follow it. That node renders, gets selected and mounts its
 * editor over the next few frames, so instead of chasing it with a timer the
 * spawning side leaves this request and the editor claims it on mount.
 */
let pendingFocus: { blockId: string; expires: number } | null = null;

/** Request the caret for `blockId` once its editor exists. */
export function requestBlockFocus(blockId: string): void {
    // A node that never mounts (deleted mid-flight) must not hand the caret to
    // an unrelated editor minutes later.
    pendingFocus = { blockId, expires: performance.now() + 3000 };
}

/** Claims the pending request if it is for one of `blockIds`. */
export function takeBlockFocusRequest(blockIds: string[]): string | null {
    if (!pendingFocus) return null;
    if (performance.now() > pendingFocus.expires) {
        pendingFocus = null;
        return null;
    }
    if (!blockIds.includes(pendingFocus.blockId)) return null;
    const { blockId } = pendingFocus;
    pendingFocus = null;
    return blockId;
}
