/**
 * One lane of a board — a single value of the board's group field.
 *
 * The lane is three things at once, which is worth keeping straight:
 *  - a drop target for cards, so that releasing one in the empty space below the
 *    last card still means "put it in this lane";
 *  - a sortable item itself, so lanes can be reordered by dragging;
 *  - the editing surface for its own column (rename, delete).
 *
 * Only the header carries the drag listeners. Put them on the lane root and a
 * pointerdown on a card would arm both the card's activator and the lane's, and
 * which drag you got would come down to event order.
 */

import { memo, useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical } from 'lucide-react';

import { useStore } from '../../store/useStore';
import { KanbanCard } from './KanbanCard';
import { KanbanBlockPreview } from './KanbanBlockPreview';
import { unscale, useKanbanZoom } from './kanbanDragScale';
import {
    KANBAN_TONES,
    isUnsortedColumn,
    laneDroppableId,
    toneOf,
    type BoardChild,
    type KanbanColumn,
    type KanbanGroupField,
    type KanbanTone,
} from './kanbanTypes';
import styles from './KanbanNode.module.css';

interface SortableCardProps {
    node: BoardChild;
    groupBy: KanbanGroupField;
    /** The board's selected child, if any — see KanbanBlockPreview. */
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpen: (id: string) => void;
}

const SortableCard = memo(({ node, groupBy, selectedId, onSelect, onOpen }: SortableCardProps) => {
    const zoom = useKanbanZoom();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: node.id,
        data: { type: 'card' },
    });

    const isNote = node.type === 'note';

    /* Selected, a card is being worked on: a block's editor and a note's title,
       icon and metadata controls all need their own pointerdowns. Unselected,
       every card hands its whole surface to the drag — so the usual way to move
       something on this board stays "grab it anywhere". */
    const isEditing = selectedId === node.id;

    /* A selected NOTE keeps its drag listeners: its editable parts — the title
       field, the icon button, the checkboxes, the metadata strip — each swallow
       their own pointerdown, so everything left over on the card is still a drag
       surface. A selected BLOCK gives them up entirely, because its whole body is
       one live editor with nothing left over; that one drags from its grip. */
    return (
        <div
            ref={setNodeRef}
            /* `nodrag`: the board is grabbable everywhere, and without this a
               pointerdown on a card would arm React Flow's node drag as well as
               dnd-kit's card drag — moving the board and the card at once. */
            className={`${styles.cardSlot} nodrag`}
            style={{
                /* Translate only, divided by the canvas zoom — see kanbanDragScale.ts. */
                transform: CSS.Translate.toString(unscale(transform, zoom)),
                transition,
            }}
            /* Click, not pointerdown: a drag ends in a pointerup elsewhere and
               never fires a click, so dragging a block does not also select it. */
            onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
            }}
            onDoubleClick={isNote ? (e) => {
                e.stopPropagation();
                onOpen(node.id);
            } : undefined}
            {...attributes}
            {...(isEditing && !isNote ? {} : listeners)}
        >
            {/* A note is a task, so it draws as a card. A block is a piece of the
                document, so it draws as itself — see KanbanBlockPreview. */}
            {isNote
                ? <KanbanCard
                    node={node}
                    groupBy={groupBy}
                    isGhost={isDragging}
                    isSelected={isEditing}
                />
                : <KanbanBlockPreview
                    node={node}
                    isGhost={isDragging}
                    isSelected={isEditing}
                    dragHandleProps={listeners}
                />}
        </div>
    );
});

SortableCard.displayName = 'SortableCard';

export interface KanbanLaneProps {
    boardId: string;
    column: KanbanColumn;
    cards: BoardChild[];
    groupBy: KanbanGroupField;
    /**
     * Whether a card drag would land here. Decided by the board rather than by
     * this lane's own droppable: hovering a lane that already holds cards
     * resolves the collision to one of those cards, so `isOver` would stay false
     * for every lane that is not empty.
     */
    isDropTarget?: boolean;
    /** The board's selected child, if any. */
    selectedId: string | null;
    onSelectCard: (id: string) => void;
    onAddCard: (value: string) => void;
    onOpenCard: (id: string) => void;
    onRename: (value: string, label: string) => void;
    onRecolor: (value: string, tone: KanbanTone) => void;
    onRequestDelete: (value: string) => void;
}

export const KanbanLane = memo(({
    boardId, column, cards, groupBy, isDropTarget, selectedId, onSelectCard,
    onAddCard, onOpenCard, onRename, onRecolor, onRequestDelete,
}: KanbanLaneProps) => {
    const zoom = useKanbanZoom();
    const [paletteOpen, setPaletteOpen] = useState(false);

    /* Resolved rather than read straight off the column: boards saved before the
       palette existed carry the old semantic names. */
    const tone = toneOf(column);

    /* The catch-all lane is a consequence of the cards, not a column anyone
       configured, so it has nothing to rename, reorder or delete. */
    const isUnsorted = isUnsortedColumn(column);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: laneDroppableId(column.value),
        data: { type: 'lane', value: column.value },
        disabled: isUnsorted,
    });

    /* Local while typing so the field stays responsive, committed to the store on
       blur or Enter. The draft is re-synced when the label changes underneath —
       an undo, or the same board open in another view — by adjusting state during
       render rather than in an effect: React re-renders before painting, so there
       is no flash of the stale name and no second commit to the DOM. */
    const [draftLabel, setDraftLabel] = useState(column.label);
    const [syncedLabel, setSyncedLabel] = useState(column.label);
    if (syncedLabel !== column.label) {
        setSyncedLabel(column.label);
        setDraftLabel(column.label);
    }

    const isCanvasTarget = useStore(
        (s) => s.interactionState.hoveredKanbanLane?.boardId === boardId
            && s.interactionState.hoveredKanbanLane?.value === column.value,
    );

    const commitLabel = () => {
        const next = draftLabel.trim();
        if (!next) {
            setDraftLabel(column.label);   // never let a lane go nameless
            return;
        }
        if (next !== column.label) onRename(column.value, next);
    };

    return (
        <section
            ref={setNodeRef}
            className={styles.lane}
            data-tone={tone}
            data-over={(isDropTarget || isCanvasTarget) || undefined}
            data-dragging={isDragging || undefined}
            style={{
                transform: CSS.Translate.toString(unscale(transform, zoom)),
                transition,
            }}
            /* Read by useCanvasNodeDrag via elementsFromPoint: a card dragged in
               from the canvas is a React Flow gesture that never reaches dnd-kit,
               so the lane under the cursor has to be identifiable from the DOM. */
            data-kanban-board={boardId}
            data-kanban-lane={column.value}
        >
            <header className={styles.laneHead}>
                {!isUnsorted && (
                    <span className={`${styles.laneGrip} nodrag`} {...attributes} {...listeners}>
                        <GripVertical size={14} />
                    </span>
                )}

                {/* The dot is the colour control. It already shows the column's
                    colour, so making it the thing you click to change it needs no
                    extra chrome in a header that is already full. */}
                {isUnsorted ? (
                    <span className={styles.laneMark} aria-hidden="true" />
                ) : (
                    <span className={styles.laneMarkWrap}>
                        <button
                            type="button"
                            className={`${styles.laneMark} ${styles.laneMarkBtn} nodrag`}
                            aria-label={`Colour for ${column.label}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPaletteOpen((v) => !v);
                            }}
                        />
                        {paletteOpen && (
                            <div
                                className={`${styles.palette} nodrag nopan`}
                                role="listbox"
                                aria-label="Column colour"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {KANBAN_TONES.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        role="option"
                                        aria-selected={t === tone}
                                        aria-label={t}
                                        title={t}
                                        data-swatch={t}
                                        className={styles.swatch}
                                        onClick={() => {
                                            onRecolor(column.value, t);
                                            setPaletteOpen(false);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </span>
                )}

                {isUnsorted ? (
                    <h3 className={styles.laneTitle}>{column.label}</h3>
                ) : (
                    <input
                        className={`${styles.laneTitleInput} nodrag nopan`}
                        value={draftLabel}
                        aria-label="Column name"
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onBlur={commitLabel}
                        /* The canvas listens globally for single-key shortcuts, and
                           the lane above listens for pointerdown to start a drag. */
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') {
                                setDraftLabel(column.label);
                                e.currentTarget.blur();
                            }
                            e.stopPropagation();
                        }}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                )}

                <span className={styles.laneCount}>{cards.length}</span>

                <button
                    type="button"
                    className={`${styles.laneAdd} nodrag`}
                    title={`Add a card to ${column.label}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddCard(column.value);
                    }}
                >
                    <Plus size={14} strokeWidth={2.5} />
                </button>

                {!isUnsorted && (
                    <button
                        type="button"
                        className={`${styles.laneDelete} nodrag`}
                        title={`Delete ${column.label}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRequestDelete(column.value);
                        }}
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </header>

            <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.laneBody}>
                    {cards.map((card) => (
                        <SortableCard
                            key={card.id}
                            node={card}
                            groupBy={groupBy}
                            selectedId={selectedId}
                            onSelect={onSelectCard}
                            onOpen={onOpenCard}
                        />
                    ))}

                    {cards.length === 0 && (
                        <button
                            type="button"
                            className={`${styles.laneEmpty} nodrag`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddCard(column.value);
                            }}
                        >
                            <Plus size={14} />
                            Add a card
                        </button>
                    )}
                </div>
            </SortableContext>
        </section>
    );
});

KanbanLane.displayName = 'KanbanLane';
