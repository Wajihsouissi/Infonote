/**
 * The kanban board node.
 *
 * Its cards are ordinary `note` nodes carrying this board's id as their
 * `parentId`, and the board draws them itself as DOM previews rather than
 * mounting them as React Flow child nodes. That is not a stylistic choice: the
 * canvas only ever renders nodes whose `parentId` matches the canvas you are
 * currently looking at (see useCanvasViewport.getRootNodes), so a card handed to
 * React Flow as a sub-flow child of a board would never be mounted at all.
 * Drawing them here also means a board of forty cards costs one culled node
 * instead of forty-one.
 *
 * Because the parent link is the ordinary one, drilling into a board opens its
 * cards as a nested canvas for free — the same cards, arranged spatially rather
 * than by status.
 *
 * The board has no size of its own: it is exactly as wide as its lanes and as
 * tall as the tallest one. What the canvas stores on the node is a mirror of the
 * rendered size, written back by a resize observer, and it is read only for
 * culling and hit-testing — never to lay the board out.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, useConnection, useReactFlow } from '@xyflow/react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCorners,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Move, Plus } from '../../components/icons';
import { v4 as uuidv4 } from 'uuid';

import { useStore } from '../../store/useStore';
import type { AppNode, KanbanNode } from '../../types';
import { GRID_GAP, MEDIUM_SIZE } from '../../config/layout';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { KanbanCard } from './KanbanCard';
import { KanbanBlockPreview } from './KanbanBlockPreview';
import { KanbanLane } from './KanbanLane';
import { KanbanColumnDeleteModal } from './KanbanColumnDeleteModal';
import { KanbanZoomContext } from './kanbanDragScale';
import {
    DEFAULT_COLUMNS,
    GROUP_FIELDS,
    GROUP_FIELD_LABEL,
    LANE_PREFIX,
    UNSORTED_VALUE,
    cardValue,
    configuredColumns,
    createColumn,
    groupCards,
    isUnsortedColumn,
    laneDroppableId,
    moveColumn,
    reorderCardOrder,
    resolveColumns,
    type BoardChild,
    type KanbanColumn,
    type KanbanTone,
    type KanbanGroupField,
} from './kanbanTypes';
import styles from './KanbanNode.module.css';

/** Columns the drilled-in canvas lays new cards out in. */
const DRILL_GRID_COLS = 4;

/** Ignore sub-pixel jitter when mirroring the rendered size onto the node. */
const SIZE_EPSILON = 2;

export const KanbanNodeComponent = memo(({ id, data, selected }: NodeProps<KanbanNode>) => {
    const nodes = useStore((s) => s.nodes);
    const addNode = useStore((s) => s.addNode);
    const updateNodeData = useStore((s) => s.updateNodeData);
    const setCenterPanelId = useStore((s) => s.setCenterPanelId);
    const isDraggingBoard = useStore((s) => s.interactionState.draggedNodeId === id);
    /* The APP store's setNodes, not React Flow's. `useReactFlow().setNodes`
       writes React Flow's own copy of the graph, which is downstream of this
       store and gets rebuilt from it — a size written there is discarded on the
       next cull. BlockNode keeps both for the same reason. */
    const setNodesStore = useStore((s) => s.setNodes);

    const { getZoom } = useReactFlow<AppNode>();
    const connection = useConnection();
    const isConnecting = connection.inProgress;

    const boardRef = useRef<HTMLDivElement>(null);
    const lastSyncedSize = useRef<{ width: number; height: number } | null>(null);

    /* The held item and the zoom it is held at, captured together at drag start.
       Both are constant for the length of a gesture, so this is two renders per
       drag rather than two per frame. */
    const [drag, setDrag] = useState<{ id: string; zoom: number; type: 'card' | 'lane' } | null>(null);
    const [overLane, setOverLane] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    /**
     * The child being worked on, if any.
     *
     * Board-local rather than the canvas's `selectedCanvasNodeIds`: these are not
     * nodes the canvas is rendering, and putting them in that set would summon
     * the multi-select toolbar for things it cannot act on. All this selection
     * decides is which block owns its own pointer — see KanbanBlockPreview.
     */
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

    /* Everything the board holds, whatever kind of node it is. A block dropped
       on a board stays a block — see kanbanTypes.BoardChild. */
    const cards = useMemo(
        () => nodes.filter((n): n is BoardChild =>
            n.parentId === id && (n.type === 'note' || n.type === 'block' || n.type === 'fused-note')),
        [nodes, id],
    );

    const columns = useMemo(() => resolveColumns(data, cards), [data, cards]);
    const lanes = useMemo(
        () => groupCards(cards, columns, data.groupBy, data.cardOrder),
        [cards, columns, data.groupBy, data.cardOrder],
    );

    const activeCard = useMemo(
        () => (drag?.type === 'card' ? cards.find((c) => c.id === drag.id) ?? null : null),
        [drag, cards],
    );

    /**
     * Mirror the rendered size onto the node.
     *
     * Nothing lays the board out from these numbers — the lanes do that — but
     * the canvas culls and hit-tests against `node.style`, so a board that has
     * grown a column while the stored size says otherwise is a board you can see
     * and cannot click. Safe from feedback precisely because the size is not
     * read back: writing it cannot change what was measured.
     */
    useEffect(() => {
        const el = boardRef.current;
        if (!el) return;

        const sync = () => {
            const width = el.offsetWidth;
            const height = el.offsetHeight;
            if (!width || !height) return;

            /* Compared against what this observer last wrote, not against what
               is in the store. Reading the node back to decide whether to write
               makes the guard depend on the write having already landed, and a
               single missed round trip then wedges the mirror permanently —
               which is exactly how the height got stuck at its seeded value
               while the width tracked fine. */
            const last = lastSyncedSize.current;
            if (last
                && Math.abs(last.width - width) < SIZE_EPSILON
                && Math.abs(last.height - height) < SIZE_EPSILON) return;
            lastSyncedSize.current = { width, height };

            setNodesStore((nds) => nds.map((n) => (
                n.id === id ? { ...n, style: { ...n.style, width, height } } : n
            )));
        };

        const observer = new ResizeObserver(sync);
        observer.observe(el);
        sync();
        return () => observer.disconnect();
    }, [id, setNodesStore]);

    const sensors = useSensors(
        /* A few pixels of slop: a card is both draggable and clickable, and
           without this every attempt to open one starts a one-pixel drag. */
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    /**
     * Lanes and cards share one DndContext, so collisions have to be filtered by
     * what is being dragged. A lane may only land among lanes — and never on the
     * catch-all, which holds no configured position to take.
     */
    const collisionDetection = useCallback<CollisionDetection>((args) => {
        if (args.active.data.current?.type !== 'lane') return closestCorners(args);
        return closestCorners({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) =>
                c.data.current?.type === 'lane' && c.data.current?.value !== UNSORTED_VALUE),
        });
    }, []);

    /** Which lane a dnd-kit `over` id refers to — a lane's own id, or the lane
     *  holding the card hovered. Read from `lanes` rather than the card's field
     *  so a card sitting in the unsorted bucket resolves to that bucket. */
    const laneValueOf = useCallback((overId: string): string | null => {
        if (overId.startsWith(LANE_PREFIX)) return overId.slice(LANE_PREFIX.length);
        for (const [value, list] of lanes) {
            if (list.some((c) => c.id === overId)) return value;
        }
        return null;
    }, [lanes]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setDrag({
            id: String(event.active.id),
            zoom: getZoom(),
            type: event.active.data.current?.type === 'lane' ? 'lane' : 'card',
        });
    }, [getZoom]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        if (event.active.data.current?.type === 'lane') return;
        setOverLane(event.over ? laneValueOf(String(event.over.id)) : null);
    }, [laneValueOf]);

    const handleDragCancel = useCallback(() => {
        setDrag(null);
        setOverLane(null);
    }, []);

    /** Persist a new column list, materialising the on-screen lanes first. */
    const persistColumns = useCallback((next: KanbanColumn[]) => {
        updateNodeData(id, { columns: next });
    }, [id, updateNodeData]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setDrag(null);
        setOverLane(null);

        const { active, over } = event;
        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        // ---- reordering lanes
        if (active.data.current?.type === 'lane') {
            if (activeId === overId) return;
            const from = activeId.slice(LANE_PREFIX.length);
            const to = overId.slice(LANE_PREFIX.length);
            persistColumns(moveColumn(configuredColumns(data, cards), from, to));
            return;
        }

        // ---- moving a card between (or within) lanes
        const targetValue = laneValueOf(overId);
        if (targetValue === null) return;

        const card = cards.find((c) => c.id === activeId);
        if (!card) return;

        const targetCards = lanes.get(targetValue) ?? [];
        const overIndex = overId.startsWith(LANE_PREFIX)
            ? -1
            : targetCards.findIndex((c) => c.id === overId);
        // Dropped on the lane rather than on a card: append.
        const index = overIndex === -1 ? targetCards.length : overIndex;

        /* One field, and only when it actually changed. A reorder inside a lane
           must not rewrite the card's status — that would stamp an `updatedAt`
           on every card the user merely tidied. */
        if (cardValue(card.data, data.groupBy) !== targetValue) {
            updateNodeData(activeId, { [data.groupBy]: targetValue || undefined });
        }
        updateNodeData(id, {
            cardOrder: reorderCardOrder(lanes, activeId, targetValue, index),
        });
    }, [cards, lanes, laneValueOf, data, id, updateNodeData, persistColumns]);

    /**
     * A new card, born into the lane whose "+" was pressed.
     *
     * It is laid out on a grid in board-local coordinates so that drilling into
     * the board shows a tidy canvas rather than forty cards stacked on the
     * origin — those coordinates are invisible from the board itself, which is
     * exactly why they would otherwise never get set.
     */
    const handleAddCard = useCallback((value: string) => {
        const slot = cards.length;
        const step = MEDIUM_SIZE + GRID_GAP;

        addNode(
            'note',
            {
                x: (slot % DRILL_GRID_COLS) * step,
                y: Math.floor(slot / DRILL_GRID_COLS) * step,
            },
            {
                label: 'New card',
                [data.groupBy]: value || undefined,
                viewMode: 'medium',
                icon: 'FileText',
                createdAt: new Date().toISOString(),
            },
            { width: MEDIUM_SIZE, height: MEDIUM_SIZE },
            id,
            uuidv4(),
        );
    }, [addNode, cards.length, data.groupBy, id]);

    const handleAddColumn = useCallback(() => {
        const existing = configuredColumns(data, cards);
        persistColumns([...existing, createColumn('New column', existing)]);
    }, [data, cards, persistColumns]);

    const handleRenameColumn = useCallback((value: string, label: string) => {
        persistColumns(configuredColumns(data, cards).map((c) => (
            c.value === value ? { ...c, label } : c
        )));
    }, [data, cards, persistColumns]);

    const handleRecolorColumn = useCallback((value: string, tone: KanbanTone) => {
        persistColumns(configuredColumns(data, cards).map((c) => (
            c.value === value ? { ...c, tone } : c
        )));
    }, [data, cards, persistColumns]);

    /**
     * Delete a column and unfile whatever was standing in it.
     *
     * The cards are never deleted — they are notes on the canvas that happen to
     * carry a value. Clearing the field drops them into the catch-all lane,
     * which `resolveColumns` brings back the moment there is something in it.
     */
    const handleDeleteColumn = useCallback((value: string) => {
        for (const card of cards) {
            if (cardValue(card.data, data.groupBy) === value) {
                updateNodeData(card.id, { [data.groupBy]: undefined });
            }
        }
        persistColumns(configuredColumns(data, cards).filter((c) => c.value !== value));
        setPendingDelete(null);
    }, [cards, data, updateNodeData, persistColumns]);

    const handleOpenCard = useCallback((cardId: string) => {
        setCenterPanelId(cardId);
    }, [setCenterPanelId]);

    const handleGroupByChange = useCallback((field: KanbanGroupField) => {
        /* Lanes belong to the field they describe, so switching field replaces
           them wholesale. Keeping the old ones would leave a board grouped by
           assignee showing columns called "In Review". */
        updateNodeData(id, { groupBy: field, columns: DEFAULT_COLUMNS[field] ?? [] });
    }, [id, updateNodeData]);

    const laneIds = useMemo(
        () => columns.filter((c) => !isUnsortedColumn(c)).map((c) => laneDroppableId(c.value)),
        [columns],
    );

    const deleteTarget = pendingDelete === null
        ? null
        : columns.find((c) => c.value === pendingDelete) ?? null;

    return (
        <KanbanZoomContext.Provider value={drag?.zoom ?? 1}>
            <div
                ref={boardRef}
                /* The whole board is the node's drag handle. Anything with its own
                   gesture — cards, lane grips, inputs, buttons — opts out with
                   `nodrag`, so what is left over (the gaps between lanes, a lane's
                   header background, the empty space under its last card) picks the
                   board up. */
                className={`
                    ${styles.board}
                    ${selected ? styles.selected : ''}
                    ${isDraggingBoard ? styles.dragging : ''}
                    custom-drag-handle
                `}
                /* Anywhere that is not a card puts the selected block back to
                   being a tile — the click that leaves a document is the click
                   that lands outside it. Card slots stop propagation, so this
                   only ever sees the board's own empty space. */
                onClick={() => setSelectedChildId(null)}
            >
                {/* Floating chrome, borrowed from the gallery board: at rest a
                    board is nothing but its columns, and the toolbar rises over
                    them on hover. It doubles as the canvas drag handle — with no
                    background left to grab, it is the only thing to hold — so
                    the controls inside it opt back out with `nodrag`. */}
                <header className={`${styles.toolbar} custom-drag-handle`}>
                    {/* The board's move handle. The whole toolbar is the drag
                        handle, but every control on it opts out with `nodrag`,
                        which left only the gaps between them actually grabbable —
                        and with the board itself pointer-transparent there is
                        nothing else on a board to take hold of. This is the one
                        thing that says "pick the board up", so it is explicit.

                        A four-way move arrow, not the lane's vertical grip: the
                        two handles sit about forty pixels apart and do different
                        jobs — this moves the whole board across the canvas, that
                        one reorders a column within it — so they must not read as
                        the same control twice. */}
                    <span className={styles.boardGrip} title="Drag to move the board">
                        <Move size={14} />
                    </span>

                    <div className={styles.headMain}>
                        <input
                            className={`${styles.boardTitle} nodrag nopan`}
                            value={data.label}
                            placeholder="Board"
                            onChange={(e) => updateNodeData(id, { label: e.target.value })}
                            /* The canvas listens globally for single-key shortcuts;
                               without this, naming a board pans and deletes instead
                               of typing. */
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                e.stopPropagation();
                            }}
                            onKeyUp={(e) => e.stopPropagation()}
                        />
                        <span className={styles.boardCount}>
                            {cards.length} {cards.length === 1 ? 'card' : 'cards'}
                        </span>
                    </div>

                    <div className={styles.headTools}>
                        <label className={styles.groupBy}>
                            <span className={styles.groupByLabel}>Group by</span>
                            <select
                                className={`${styles.groupBySelect} nodrag`}
                                value={data.groupBy}
                                onChange={(e) => handleGroupByChange(e.target.value as KanbanGroupField)}
                            >
                                {GROUP_FIELDS.map((field) => (
                                    <option key={field} value={field}>{GROUP_FIELD_LABEL[field]}</option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            className={`${styles.addBtn} nodrag`}
                            onClick={handleAddColumn}
                        >
                            <Plus size={13} strokeWidth={2.5} />
                            Add column
                        </button>

                        <button
                            type="button"
                            className={`${styles.addBtn} nodrag`}
                            onClick={() => handleAddCard(columns[0]?.value ?? '')}
                        >
                            <Plus size={13} strokeWidth={2.5} />
                            Add card
                        </button>
                    </div>
                </header>

                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetection}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <SortableContext items={laneIds} strategy={horizontalListSortingStrategy}>
                        {/* Neither `nodrag` nor `nowheel` any more: the lanes are
                            part of what you grab the board by, and nothing inside
                            them scrolls, so the wheel belongs to the canvas. */}
                        <div className={styles.lanes}>
                            {columns.map((column) => (
                                <KanbanLane
                                    key={column.id}
                                    boardId={id}
                                    column={column}
                                    cards={lanes.get(column.value) ?? []}
                                    groupBy={data.groupBy}
                                    isDropTarget={overLane === column.value}
                                    selectedId={selectedChildId}
                                    onSelectCard={setSelectedChildId}
                                    onAddCard={handleAddCard}
                                    onOpenCard={handleOpenCard}
                                    onRename={handleRenameColumn}
                                    onRecolor={handleRecolorColumn}
                                    onRequestDelete={setPendingDelete}
                                />
                            ))}
                        </div>
                    </SortableContext>

                    {/* Portalled to the body so the overlay lives in unscaled client
                        space, where dnd-kit's client-pixel deltas are already correct
                        — see kanbanDragScale.ts. */}
                    {createPortal(
                        <DragOverlay dropAnimation={null}>
                            {activeCard && (activeCard.type === 'note'
                                ? <KanbanCard node={activeCard} groupBy={data.groupBy} isOverlay />
                                : <KanbanBlockPreview node={activeCard} isOverlay />)}
                        </DragOverlay>,
                        document.body,
                    )}
                </DndContext>

                {/* Full-area target so an edge can be dropped anywhere on the board,
                    and a single visible source handle to drag one out from.
                    It only takes the pointer while a connection is actually being
                    dragged: left permanently live, this invisible sheet would catch
                    every click in the gaps between lanes, which is precisely the
                    click-through the backgroundless board is for. */}
                <Handle
                    type="target"
                    position={Position.Top}
                    id="in"
                    isConnectableStart={false}
                    style={{
                        top: '50%', left: '50%', width: '100%', height: '100%',
                        border: 'none', background: 'transparent',
                        transform: 'translate(-50%, -50%)', zIndex: -1,
                        pointerEvents: isConnecting ? 'auto' : 'none',
                    }}
                />
                {!isConnecting && (
                    <Handle type="source" position={Position.Top} className={styles.handle} isConnectableEnd={false} id="out" />
                )}
            </div>

            {deleteTarget && (
                <KanbanColumnDeleteModal
                    columnLabel={deleteTarget.label}
                    cardCount={(lanes.get(deleteTarget.value) ?? []).length}
                    unsortedLabel={columns.find(isUnsortedColumn)?.label ?? 'the catch-all column'}
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={() => handleDeleteColumn(deleteTarget.value)}
                />
            )}
        </KanbanZoomContext.Provider>
    );
}, samePropsIgnoringPosition);

KanbanNodeComponent.displayName = 'KanbanNode';
