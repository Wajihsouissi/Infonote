import { getNodeBlocks, type AppNode } from '../../../types';
import type { Block } from '../types';
import { endBlockDrag } from './blockDragLock';
import { flushPendingEditorWrites } from '../../../services/storage/workspace/pendingEditorWrites';

interface TransferSource {
    nodes: AppNode[];
    updateNodeData(id: string, data: { content: Block[] }): void;
    removeNode(id: string): unknown;
}

/** Remove transferred top-level blocks after the destination accepts them.
 * Document destinations retain empty block cards; canvas destinations remove
 * them too. The adapter supplies its existing graph-deletion operation. */
export function removeTransferredBlocks(
    sourceNodeId: string,
    movedIds: string[],
    source: TransferSource,
    destination: 'document' | 'canvas',
): void {
    const { nodes, updateNodeData, removeNode } = source;
    const node = nodes.find(candidate => candidate.id === sourceNodeId);
    const content = node ? getNodeBlocks(node.data) : undefined;
    if (!node || !content) return;
    const remaining = content.filter(block => !movedIds.includes(block.id));
    updateNodeData(sourceNodeId, { content: remaining });
    if (remaining.length === 0 && (node.type === 'fused-note' || (destination === 'canvas' && node.type === 'block'))) {
        setTimeout(() => removeNode(sourceNodeId), 0);
    }
}

/** Finish the accepted transfer in its existing event order. Cross-editor
 * callbacks retain multi-drag cleanup; page extraction leaves lock release to
 * the existing drag failsafe. No payload or gallery ownership is changed here. */
export function finishBlockTransfer(kind: 'move' | 'cross-editor' | 'page-extraction' = 'move'): void {
    // Destination and source editors can both debounce their writes. Publish
    // them while the enclosing history gesture is still open, including a
    // child write that queues its owning document.
    flushPendingEditorWrites();
    flushPendingEditorWrites();
    if (kind !== 'cross-editor' && window.chnkItMultiDragCleanup) {
        window.chnkItMultiDragCleanup();
        delete window.chnkItMultiDragCleanup;
    }
    // The source can unmount before dragend reaches SortableBlockWrapper.
    // Mark it handled so that wrapper does not dispatch selection cleanup again.
    window.chnkItCrossEditorDropHandled = true;
    if (kind !== 'page-extraction') endBlockDrag();
    window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
}
