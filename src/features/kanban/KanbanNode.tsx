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
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Calendar, LayoutGrid, Maximize2, Move, Plus, X } from '../../components/icons';
import { v4 as uuidv4 } from 'uuid';

import { useStore } from '../../store/useStore';
import type { AppNode, KanbanNode } from '../../types';
import { GRID_GAP, MEDIUM_SIZE } from '../../config/layout';
import {
    fromDayKey,
    resizeCardPatch,
    scheduleCardAtTime,
    toStoredDate,
    unscheduleCardPatch,
    type DayKey,
} from '../../utils/cardDate';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { KanbanCard } from './KanbanCard';
import { KanbanBlockPreview } from './KanbanBlockPreview';
import { KanbanLane } from './KanbanLane';
import { KanbanCalendar } from './KanbanCalendar';
import { KanbanCalendarChip } from './KanbanCalendarChip';
import { KanbanCalendarTaskChip } from './KanbanCalendarTaskChip';
import { KanbanColumnDeleteModal } from './KanbanColumnDeleteModal';
import { KanbanZoomContext } from './kanbanDragScale';
import {
    DATE_FIELDS,
    DATE_FIELD_LABEL,
    DAY_PREFIX,
    DEFAULT_COLUMNS,
    GROUP_FIELDS,
    GROUP_FIELD_LABEL,
    LANE_PREFIX,
    TRAY_DROPPABLE_ID,
    parseSlotId,
    parseTaskDragId,
    UNSORTED_VALUE,
    cardValue,
    configuredColumns,
    createColumn,
    dateFieldOf,
    granularityOf,
    groupCards,
    isUnsortedColumn,
    laneDroppableId,
    moveColumn,
    reorderCardOrder,
    resolveColumns,
    scaleOf,
    toneOf,
    viewModeOf,
    type BoardChild,
    type KanbanCalendarScale,
    type KanbanColumn,
    type KanbanDateField,
    type KanbanGranularity,
    type KanbanTone,
    type KanbanGroupField,
    type KanbanViewMode,
} from './kanbanTypes';
import { cardTasks, setTaskDetails } from '../card/cardTasks';
import styles from './KanbanNode.module.css';
import { Tabs, type TabItem } from '../../components/ui/Tabs';

/* Two readings of one board. Glyph-only, so the label doubles as the tooltip
   and the accessible name. */
const BOARD_VIEW_TABS: TabItem<KanbanViewMode>[] = [
    { id: 'board', ariaLabel: 'Board', icon: <LayoutGrid size={14} /> },
    { id: 'calendar', ariaLabel: 'Calendar', icon: <Calendar size={14} /> },
];

/** Columns the drilled-in canvas lays new cards out in. */
const DRILL_GRID_COLS = 4;

/** Ignore sub-pixel jitter when mirroring the rendered size onto the node. */
const SIZE_EPSILON = 2;

type KanbanNodeViewProps = Pick<NodeProps<KanbanNode>, 'id' | 'data' | 'selected'> & {
    /** Rendered by the app fullscreen modal instead of the React Flow canvas. */
    fullscreenView?: boolean;
};

export const KanbanNodeComponent = memo(({ id, data, selected, fullscreenView = false }: KanbanNodeViewProps) => {
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
    const [drag, setDrag] = useState<{ id: string; zoom: number; type: 'card' | 'lane' | 'chip' | 'task' } | null>(null);
    const [overLane, setOverLane] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const fullscreenId = useStore((s) => s.fullscreenId);
    const setFullscreenId = useStore((s) => s.setFullscreenId);

    const view = viewModeOf(data);

    /**
     * Which screenful of time the calendar is showing, and whether its tray is
     * folded away.
     *
     * Local, and reset to today on mount, deliberately. `updateNodeData` stamps
     * `updatedAt` and marks the document cloud-dirty unconditionally, so a
     * persisted cursor would be a sync-marking store write on every arrow
     * press. It would also couple the two live copies of a board — the canvas
     * one and the fullscreen one are the same component with the same data
     * (see peekContent) — so paging one would page the other.
     */
    const [cursor, setCursor] = useState<Date>(() => new Date());
    const [trayCollapsed, setTrayCollapsed] = useState(false);

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
        () => (drag && drag.type !== 'lane' && drag.type !== 'task'
            ? cards.find((c) => c.id === drag.id) ?? null
            : null),
        [drag, cards],
    );

    /** The lane colour a card wears, for anything drawn outside a lane. */
    const toneOfCardId = useCallback((cardId: string): KanbanTone => {
        const card = cards.find((c) => c.id === cardId);
        if (!card) return 'neutral';
        const value = cardValue(card.data, data.groupBy);
        const column = columns.find((c) => c.value === value);
        return column ? toneOf(column) : 'neutral';
    }, [cards, columns, data.groupBy]);

    /* The held task, for the overlay. A task's drag id is not a node id, so it
       cannot come out of `activeCard` — both halves are unpacked from the id
       rather than being carried in state, which keeps the drag state one shape
       whatever is being held. */
    const activeTask = useMemo(() => {
        if (drag?.type !== 'task') return null;
        const dragged = parseTaskDragId(drag.id);
        if (!dragged) return null;
        const card = cards.find((c) => c.id === dragged.cardId);
        if (!card || card.type !== 'note') return null;
        const task = cardTasks(card.data).find((t) => t.id === dragged.taskId);
        return task ? { card, task } : null;
    }, [drag, cards]);

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
            /* The modal renders a second board instance. Its responsive size is
               presentation-only and must never overwrite the canvas node. */
            if (fullscreenView) return;

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
    }, [fullscreenView, id, setNodesStore]);

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
        /* A grid of equal cells wants the cell under the pointer, not the
           nearest corner: `closestCorners` favours large containers, which lets
           a chip released near a cell edge resolve to its neighbour — a card
           filed on the wrong day. `rectIntersection` covers the gaps between
           cells, where the pointer is inside no cell at all. */
        if (view === 'calendar') {
            const hits = pointerWithin(args);
            return hits.length > 0 ? hits : rectIntersection(args);
        }

        if (args.active.data.current?.type !== 'lane') return closestCorners(args);
        return closestCorners({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) =>
                c.data.current?.type === 'lane' && c.data.current?.value !== UNSORTED_VALUE),
        });
    }, [view]);

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
        const kind = event.active.data.current?.type;
        setDrag({
            id: String(event.active.id),
            zoom: getZoom(),
            type: kind === 'lane' ? 'lane'
                : kind === 'task' ? 'task'
                    : kind === 'chip' ? 'chip' : 'card',
        });
    }, [getZoom]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        /* Lane highlighting is a board concern; on the calendar each cell owns
           its own `isOver`, because a cell has no nested droppables to swallow
           the collision the way a lane's cards do. */
        if (view === 'calendar' || event.active.data.current?.type === 'lane') return;
        setOverLane(event.over ? laneValueOf(String(event.over.id)) : null);
    }, [view, laneValueOf]);

    const handleDragCancel = useCallback(() => {
        setDrag(null);
        setOverLane(null);
    }, []);

    /** Persist a new column list, materialising the on-screen lanes first. */
    const persistColumns = useCallback((next: KanbanColumn[]) => {
        updateNodeData(id, { columns: next });
    }, [id, updateNodeData]);

    /**
     * A chip released on a day cell or on the tray.
     *
     * The patch is worked out here, at drop time, from the card as it stands
     * now — never from a snapshot taken when the drag began, which would
     * resurrect a value something else has since changed. A card that vanished
     * mid-gesture simply produces no write.
     *
     * `cardOrder` is deliberately untouched: that is lane order, and moving a
     * card on the calendar must not quietly reshuffle the board's columns.
     */
    /**
     * A task chip released on a day cell or on the tray.
     *
     * The card and the task both travel in the drag id, so nothing has to be
     * searched for at drop time beyond the card itself. Which field is written
     * is the calendar's choice, not the chip's — the same field the cards are
     * being placed by, so a task and its card always answer the same question.
     *
     * A task is placed by day and never by hour: `cardTasks` reads a body
     * task's due date out of its `todo` block, which has room for a date and
     * not for a clock reading. Dropping one on a half-hour slot therefore sets
     * the day and drops the time, rather than writing a time only one of the
     * two storage shapes could hold.
     */
    const handleTaskDrop = useCallback((activeId: string, overId: string) => {
        const dragged = parseTaskDragId(activeId);
        if (!dragged) return false;

        const card = cards.find((c) => c.id === dragged.cardId);
        if (!card || card.type !== 'note') return true;

        const field = dateFieldOf(data);
        // Created is not a field a task carries; the chips are disabled there.
        if (field === 'createdAt') return true;

        const slot = parseSlotId(overId);
        const key = overId === TRAY_DROPPABLE_ID
            ? null
            : slot
                ? slot.dayKey
                : overId.startsWith(DAY_PREFIX)
                    ? overId.slice(DAY_PREFIX.length)
                    : undefined;

        // Dropped on nothing this handler understands: leave the task alone.
        if (key === undefined) return true;

        const date = key === null ? null : fromDayKey(key);
        if (key !== null && !date) return true;
        const next = date ? toStoredDate(date) : undefined;

        /* `updateNodeData` stamps `updatedAt` and marks the document
           cloud-dirty whatever it is handed, so a drop onto the day the task is
           already on must not reach it. */
        const task = cardTasks(card.data).find((t) => t.id === dragged.taskId);
        if (!task || (task[field] ?? undefined) === next) return true;

        const patch = setTaskDetails(card.data, dragged.taskId, { [field]: next });
        if (Object.keys(patch).length > 0) updateNodeData(card.id, patch);
        return true;
    }, [cards, data, updateNodeData]);

    const handleCalendarDrop = useCallback((activeId: string, overId: string) => {
        if (handleTaskDrop(activeId, overId)) return;

        const card = cards.find((c) => c.id === activeId);
        // Only notes carry dates — see calendarModel's `excluded`.
        if (!card || card.type !== 'note') return;

        const field = dateFieldOf(data);

        /* Three targets, and the middle one is the hour grid: dropping on a
           half-hour slot sets the day AND the clock reading, dropping on a day
           cell or the all-day strip sets the day and clears the time. */
        const slot = parseSlotId(overId);
        const patch = overId === TRAY_DROPPABLE_ID
            ? unscheduleCardPatch(field)
            : slot
                ? scheduleCardAtTime(card.data, field, slot.dayKey, slot.minutes)
                : overId.startsWith(DAY_PREFIX)
                    ? scheduleCardAtTime(card.data, field, overId.slice(DAY_PREFIX.length), null)
                    : {};

        /* The board's own rule, for the board's own reason: `updateNodeData`
           stamps `updatedAt` and marks the document cloud-dirty whatever it is
           handed, so a drop that changes nothing must not reach it. */
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        if (keys.length === 0) return;
        if (keys.every((k) => patch[k] === undefined && card.data[k] === undefined)) return;

        updateNodeData(activeId, patch);
    }, [handleTaskDrop, cards, data, updateNodeData]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setDrag(null);
        setOverLane(null);

        const { active, over } = event;
        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        if (view === 'calendar') {
            handleCalendarDrop(activeId, overId);
            return;
        }

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
    }, [view, handleCalendarDrop, cards, lanes, laneValueOf, data, id, updateNodeData, persistColumns]);

    /**
     * A new card, born into the lane whose "+" was pressed.
     *
     * It is laid out on a grid in board-local coordinates so that drilling into
     * the board shows a tidy canvas rather than forty cards stacked on the
     * origin — those coordinates are invisible from the board itself, which is
     * exactly why they would otherwise never get set.
     */
    const spawnCard = useCallback((extra: Record<string, unknown>) => {
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
                viewMode: 'medium',
                icon: 'FileText',
                createdAt: new Date().toISOString(),
                ...extra,
            },
            { width: MEDIUM_SIZE, height: MEDIUM_SIZE },
            id,
            uuidv4(),
        );
    }, [addNode, cards.length, id]);

    const handleAddCard = useCallback((value: string) => {
        spawnCard({ [data.groupBy]: value || undefined });
    }, [spawnCard, data.groupBy]);

    /**
     * A new card, dated to the day whose "+" was pressed.
     *
     * With `createdAt` selected there is nothing to set — the card is stamped
     * with now on the way in, which is the same thing that field means — so it
     * lands on today rather than on the day clicked. That is honest: created is
     * a fact about the card, and this view cannot choose it.
     */
    /**
     * An event resized by its edge in the hour grid.
     *
     * Writes both dates whatever field the calendar is placing by, because that
     * is what a resize says — this begins here and ends there. `resizeCardPatch`
     * orders and floors the pair, so a wild drag cannot leave a card reading as
     * inverted.
     */
    const handleResizeCard = useCallback((
        cardId: string,
        key: DayKey,
        startMinutes: number,
        endMinutes: number,
    ) => {
        const card = cards.find((c) => c.id === cardId);
        if (!card || card.type !== 'note') return;
        if (dateFieldOf(data) === 'createdAt') return;

        const patch = resizeCardPatch(key, startMinutes, endMinutes);
        if (Object.keys(patch).length === 0) return;
        if (patch.startDate === card.data.startDate && patch.dueDate === card.data.dueDate) return;

        updateNodeData(cardId, patch);
    }, [cards, data, updateNodeData]);

    const handleAddCardOn = useCallback((key: DayKey) => {
        const date = fromDayKey(key);
        if (!date) return;
        const field = dateFieldOf(data);
        spawnCard(field === 'createdAt' ? {} : { [field]: toStoredDate(date) });
    }, [spawnCard, data]);

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

    const toggleBoardFullscreen = useCallback(() => {
        setFullscreenId(fullscreenId === id ? null : id);
    }, [fullscreenId, id, setFullscreenId]);

    const handleGroupByChange = useCallback((field: KanbanGroupField) => {
        /* Lanes belong to the field they describe, so switching field replaces
           them wholesale. Keeping the old ones would leave a board grouped by
           assignee showing columns called "In Review". */
        updateNodeData(id, { groupBy: field, columns: DEFAULT_COLUMNS[field] ?? [] });
    }, [id, updateNodeData]);

    /* Each of these guards on "did it actually change". A select re-picking the
       value it already holds still fires onChange, and `updateNodeData` would
       stamp `updatedAt` and mark the document cloud-dirty for it. */
    const handleViewChange = useCallback((next: KanbanViewMode) => {
        if (next === view) return;
        updateNodeData(id, { viewMode: next });
    }, [view, id, updateNodeData]);

    const handleDateFieldChange = useCallback((next: KanbanDateField) => {
        if (next === dateFieldOf(data)) return;
        updateNodeData(id, { dateField: next });
    }, [data, id, updateNodeData]);

    const handleScaleChange = useCallback((next: KanbanCalendarScale) => {
        if (next === scaleOf(data)) return;
        updateNodeData(id, { calendarScale: next });
    }, [data, id, updateNodeData]);

    const handleGranularityChange = useCallback((next: KanbanGranularity) => {
        if (next === granularityOf(data)) return;
        updateNodeData(id, { granularity: next });
    }, [data, id, updateNodeData]);

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
                    ${fullscreenView ? styles.fullscreenView : ''}
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
                        <button
                            type="button"
                            className={`${styles.fullscreenBtn} nodrag nopan`}
                            onClick={() => toggleBoardFullscreen()}
                            title={fullscreenId === id ? 'Close fullscreen board' : 'Focus board fullscreen'}
                            aria-label={fullscreenId === id ? 'Close fullscreen board' : 'Focus board fullscreen'}
                        >
                            {fullscreenId === id ? <X size={14} /> : <Maximize2 size={14} />}
                        </button>

                        {/* Two readings of one board, so one control with two
                            positions rather than a button that toggles. Sits
                            after the window control and before the field
                            selects, because it decides what those selects are
                            for. */}
                        <div
                            className={`${styles.viewToggle} nodrag`}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Tabs
                                items={BOARD_VIEW_TABS}
                                value={view}
                                onChange={handleViewChange}
                                variant="light"
                                color="accent"
                                iconOnly
                                semantics="radio"
                                aria-label="Board view"
                            />
                        </div>

                        {/* One slot, two contents, so the bar never grows. The
                            calendar's field select reuses the group-by classes
                            rather than cloning them: two controls that must
                            read as one family should share the rules, not
                            resemble each other. */}
                        {view === 'board' ? (
                            <>
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
                            </>
                        ) : (
                            <label className={styles.groupBy}>
                                <span className={styles.groupByLabel}>Date</span>
                                <select
                                    className={`${styles.groupBySelect} nodrag`}
                                    value={dateFieldOf(data)}
                                    onChange={(e) => handleDateFieldChange(e.target.value as KanbanDateField)}
                                >
                                    {DATE_FIELDS.map((field) => (
                                        <option key={field} value={field}>{DATE_FIELD_LABEL[field]}</option>
                                    ))}
                                </select>
                            </label>
                        )}
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
                    {/* The two views are mutually exclusive, so one DndContext
                        wraps both and its handlers branch on the view mode. A
                        second context would only mean a second overlay and a
                        second held-item state to keep in step. */}
                    {view === 'calendar' ? (
                        <KanbanCalendar
                            boardId={id}
                            data={data}
                            cards={cards}
                            columns={columns}
                            cursor={cursor}
                            onCursorChange={setCursor}
                            scale={scaleOf(data)}
                            onScaleChange={handleScaleChange}
                            onGranularityChange={handleGranularityChange}
                            trayCollapsed={trayCollapsed}
                            onTrayToggle={() => setTrayCollapsed((v) => !v)}
                            onOpenCard={handleOpenCard}
                            onAddCardOn={handleAddCardOn}
                            onResizeCard={handleResizeCard}
                            fullscreenView={fullscreenView}
                        />
                    ) : (
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
                    )}

                    {/* Portalled to the body so the overlay lives in unscaled client
                        space, where dnd-kit's client-pixel deltas are already correct
                        — see kanbanDragScale.ts. */}
                    {createPortal(
                        <DragOverlay dropAnimation={null}>
                            {activeTask && (
                                <KanbanCalendarTaskChip
                                    card={activeTask.card}
                                    task={activeTask.task}
                                    tone={toneOfCardId(activeTask.card.id)}
                                    isOverlay
                                />
                            )}
                            {activeCard && (drag?.type === 'chip'
                                ? (activeCard.type === 'note'
                                    ? <KanbanCalendarChip node={activeCard} isOverlay />
                                    : null)
                                : activeCard.type === 'note'
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
