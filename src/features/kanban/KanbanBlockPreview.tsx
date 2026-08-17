/**
 * A block or fused note as it appears in a lane.
 *
 * Deliberately NOT a card. A note on a board is a task, and a card — title,
 * blurb, checklist, chips — is the right shape for one. A block is not a task;
 * it is a piece of the document. Wrapping it in card chrome meant a heading
 * arrived as somebody's idea of a title and an image arrived as a grey cover
 * strip, which is a summary of the block rather than the block.
 *
 * So this renders the real thing: the app's own block editor, the same
 * component the node uses out on the canvas. An h1 looks like an h1 and an
 * image looks like an image, because they are.
 *
 * Selection decides who owns the pointer, which is what lets the block be both
 * freely draggable and fully editable without the two fighting:
 *
 *  - Unselected, it is a tile. The editor is read-only, so the whole card is a
 *    drag surface and can be picked up from anywhere.
 *  - Selected, it is a document. The editor goes live with its media controls,
 *    and pointerdowns belong to the caret — so the drag retreats to the grip.
 *
 * Without that split, the first pointerdown on a live editor would be claimed by
 * the drag and you could never place a caret.
 */

import { memo, useCallback, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import type { Block } from '../editor/types';
import { useStore } from '../../store/useStore';
import type { BoardChild } from './kanbanTypes';
import styles from './KanbanCard.module.css';

export interface KanbanBlockPreviewProps {
    node: BoardChild;
    /** True while this is the one being dragged (the source, not the overlay). */
    isGhost?: boolean;
    /** True when drawn in the drag overlay rather than in a lane. */
    isOverlay?: boolean;
    /**
     * Selected: the editor goes live and takes the pointer. Unselected, the card
     * is a tile and the lane hands its whole surface to the drag.
     */
    isSelected?: boolean;
    /** dnd-kit's drag listeners. Bound to the grip only while editing. */
    dragHandleProps?: Record<string, unknown>;
}

export const KanbanBlockPreview = memo(({
    node, isGhost, isOverlay, isSelected, dragHandleProps,
}: KanbanBlockPreviewProps) => {
    const updateNodeData = useStore((s) => s.updateNodeData);

    const blocks = useMemo<Block[]>(
        () => (Array.isArray(node.data.content) ? node.data.content as Block[] : []),
        [node.data.content],
    );

    /* The same write BlockNode makes from the canvas — the board is just another
       place the node is shown, so editing it here is editing it there. */
    const handleUpdate = useCallback((next: Block[]) => {
        updateNodeData(node.id, { content: next });
    }, [node.id, updateNodeData]);

    /* The overlay is a picture of the thing being moved, never the thing itself,
       so it is inert no matter what is selected. */
    const isEditing = !!isSelected && !isOverlay;

    return (
        <article
            className={styles.card}
            data-ghost={isGhost || undefined}
            data-overlay={isOverlay || undefined}
            /* Lets the stylesheet drop the card-shaped padding for content that
               brings its own. */
            data-kind="blocks"
            data-editing={isEditing || undefined}
        >
            {/* Only while editing. Unselected, the whole card is already the drag
                handle, so a grip would be a second way to do what anywhere does. */}
            {isEditing && (
                <span
                    className={`${styles.blockGrip} nodrag`}
                    title="Drag to move this block"
                    {...dragHandleProps}
                >
                    <GripVertical size={14} />
                </span>
            )}

            <div className={styles.blockBody}>
                <BlockEditor
                    /* Remount when the mode flips, and NOT for tidiness — for
                       correctness. A block's contenteditable is seeded from state
                       once, when it mounts; flipping `readOnly` on a live editor
                       swaps the same DOM nodes to editable without re-running that
                       seeding, so every block came up blank while the store still
                       held the text. The first keystroke then wrote the blanks
                       back over the real content. Keying the editor to the mode
                       gives the editable pass a fresh mount that seeds properly. */
                    key={isEditing ? 'live' : 'view'}
                    initialContent={blocks}
                    /* A read-only instance is given no way to write at all. It has
                       nothing to save, and on unmount BlockEditor flushes any
                       pending update — which is exactly the path that could put an
                       empty editor's state into the store. */
                    onUpdate={isEditing ? handleUpdate : undefined}
                    readOnly={!isEditing}
                    minimal
                    hideBlockHandles={!isEditing}
                    /* Media controls — crop, replace, focal point — come with the
                       live editor, because a selected block is being worked on
                       rather than looked at. */
                    disableMediaControls={!isEditing}
                    nodeId={node.id}
                    /* Its own id, so the editor's instance-scoped state cannot be
                       confused with the same node's editor elsewhere on screen —
                       a board and a drilled-in canvas can both be showing it. */
                    editorId={`kanban-${node.id}${isOverlay ? '-overlay' : ''}`}
                />
            </div>
        </article>
    );
});

KanbanBlockPreview.displayName = 'KanbanBlockPreview';
