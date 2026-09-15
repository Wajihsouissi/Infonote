import type { Block } from '../editor/types';
import type { AppNode } from '../../types';
import { useStore } from '../../store/useStore';
import { withoutHistory } from '../../store/temporalControl';

/**
 * Writes AI text into canvas cards WHILE it streams.
 *
 * Create used to place nothing until every body had been written, so a turn
 * was a long silence followed by everything at once. Now the runner places the
 * planned cards first and pours each body into its card as it arrives.
 *
 * Two costs shaped this:
 *
 * - Every store write to `nodes` is watched: the local save, the cloud-sync
 *   diff over the whole canvas, and undo history all react to it. A write per
 *   token would run those dozens of times a second. So partial text is batched
 *   — one `setState` for every card that changed, at most every `intervalMs`.
 * - A streamed body is one change to the user, not forty. Partial writes go in
 *   with history paused; `commit` then records the finished body as a single
 *   normal write, which is also what marks it for cloud sync.
 */
export interface CanvasStreamWriter {
    /** Show partial content. Coalesced; the latest value per card wins. */
    write: (nodeId: string, blocks: Block[]) => void;
    /** Record the finished content for one card, as one undoable change. */
    commit: (nodeId: string, blocks: Block[]) => void;
    /** Apply anything still pending now (e.g. when the run is stopped). */
    flush: () => void;
}

export function createCanvasStreamWriter(intervalMs = 250): CanvasStreamWriter {
    const pending = new Map<string, Block[]>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const apply = () => {
        timer = null;
        if (pending.size === 0) return;
        const updates = new Map(pending);
        pending.clear();
        const updatedAt = new Date().toISOString();

        withoutHistory(() => {
            useStore.setState((state) => ({
                nodes: state.nodes.map((node) => {
                    const content = updates.get(node.id);
                    return content
                        ? ({ ...node, data: { ...node.data, content, updatedAt } } as AppNode)
                        : node;
                }),
            }));
        });
    };

    return {
        write(nodeId, blocks) {
            pending.set(nodeId, blocks);
            if (timer === null) timer = setTimeout(apply, intervalMs);
        },
        commit(nodeId, blocks) {
            // A queued partial must not land on top of the finished body.
            pending.delete(nodeId);
            if (useStore.getState().nodes.some((node) => node.id === nodeId)) {
                useStore.getState().updateNodeData(nodeId, { content: blocks });
            }
        },
        flush() {
            if (timer !== null) clearTimeout(timer);
            apply();
        },
    };
}
