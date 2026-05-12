import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { KanbanCalendarView } from './KanbanCalendarView';
import { v4 as uuidv4 } from 'uuid';
import { Settings } from 'lucide-react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    pointerWithin,
    rectIntersection,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
    type CollisionDetection,
    type Modifier
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { useStore } from '../../store/useStore';
import type { KanbanNode, NoteNode } from '../../types';
import { KanbanCardPreview } from './KanbanCardPreview';
import { KanbanColumn } from './KanbanColumn';
import { KanbanToolbar } from './KanbanToolbar';
import { KanbanTableView } from './KanbanTableView';
import { KanbanTimelineView } from './KanbanTimelineView';
import styles from './KanbanNode.module.css';
import { getStrictSize, ICON_SIZE, snapToGridValue } from '../../config/layout';

const dropAnimation = {
    duration: 200,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0',
            },
        },
    }),
};

export const KanbanNodeComponent = memo(({ id, data, selected }: NodeProps<KanbanNode>) => {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const addNode = useStore(s => s.addNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const updateNode = useStore(s => s.updateNode);
    const setInteractionState = useStore(s => s.setInteractionState);
    const setKanbanModalOpen = useStore(s => s.setKanbanModalOpen);
    const setEditingKanbanId = useStore(s => s.setEditingKanbanId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const interactionState = useStore(s => s.interactionState);

    const { setNodes, screenToFlowPosition, getIntersectingNodes } = useReactFlow();

    const isDraggingBoard = interactionState.draggedNodeId === id;

    const boardRef = useRef<HTMLDivElement>(null);

    // --- FILTER STATE ---
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
    const [assigneeFilter, setAssigneeFilter] = useState('');

    // --- SORT STATE ---
    type SortField = 'dueDate' | 'priority' | 'createdAt' | 'label' | null;
    type SortDirection = 'asc' | 'desc';
    const [sortBy, setSortBy] = useState<SortField>(data.sortBy || null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(data.sortDirection || 'asc');

    const handleSortChange = useCallback((field: SortField, direction: SortDirection) => {
        setSortBy(field);
        setSortDirection(direction);
        // Persist to node data
        updateNodeData(id, { sortBy: field, sortDirection: direction });
    }, [id, updateNodeData]);

    // --- SWIMLANE STATE ---
    type SwimlaneField = 'assignee' | 'category' | 'priority' | null;
    const [swimlaneField, setSwimlaneField] = useState<SwimlaneField>(data.swimlaneField || null);

    const handleSwimlaneChange = useCallback((field: SwimlaneField) => {
        setSwimlaneField(field);
        // Persist to node data
        updateNodeData(id, { swimlaneField: field });
    }, [id, updateNodeData]);

    // --- VIEW MODE STATE ---
    const [viewMode, setViewMode] = useState<'board' | 'table' | 'calendar' | 'timeline'>(data.viewMode || 'board');

    const handleViewModeChange = useCallback((mode: 'board' | 'table' | 'calendar' | 'timeline') => {
        setViewMode(mode);
        updateNodeData(id, { viewMode: mode });
        // Hide/show React Flow child note nodes so they don't intercept clicks in table/calendar view
        setNodes(nds => nds.map(n =>
            n.parentId === id && n.type === 'note'
                ? { ...n, hidden: mode !== 'board' }
                : n
        ));
    }, [id, updateNodeData, setNodes]);

    // Also hide child nodes on initial mount if starting in table/calendar mode
    useEffect(() => {
        if (viewMode !== 'board') {
            setNodes(nds => nds.map(n =>
                n.parentId === id && n.type === 'note'
                    ? { ...n, hidden: true }
                    : n
            ));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- TABLE VIEW CALLBACKS ---
    const handleTableAddCard = useCallback((statusValue: string) => {
        const children = nodes.filter(n => n.parentId === id && n.type === 'note') as NoteNode[];
        const existing = children.filter(n => n.data.status === statusValue).length;
        addNode('note', { x: 0, y: 0 }, {
            label: 'New Task',
            status: statusValue,
            description: '',
            viewMode: 'icon',
            order: existing,
            createdAt: new Date().toISOString(),
        }, { width: ICON_SIZE, height: ICON_SIZE }, id);
    }, [addNode, nodes, id]);

    const handleReorderCards = useCallback((orderedIds: string[]) => {
        orderedIds.forEach((cardId, index) => {
            updateNodeData(cardId, { order: index });
        });
    }, [updateNodeData]);

    const [visibleExtraColumns, setVisibleExtraColumns] = useState<string[]>(data.tableColumns || []);

    const handleTableColumnsChange = useCallback((cols: string[]) => {
        setVisibleExtraColumns(cols);
        updateNodeData(id, { tableColumns: cols });
    }, [id, updateNodeData]);

    const hasActiveFilters = searchQuery.length > 0 || priorityFilter.length > 0 || assigneeFilter.length > 0;

    const clearFilters = useCallback(() => {
        setSearchQuery('');
        setPriorityFilter([]);
        setAssigneeFilter('');
    }, []);

    // Open card in center peek
    const handleCardClick = useCallback((node: NoteNode) => {
        setCenterPanelId(node.id);
    }, [setCenterPanelId]);

    // --- AUTO RESIZE LOGIC ---
    useEffect(() => {
        if (!boardRef.current) return;
        // Skip auto-resize for calendar and timeline views as they should fill the container
        if (viewMode === 'calendar' || viewMode === 'timeline') return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const target = entry.target as HTMLElement;
                const newWidth = target.scrollWidth;
                const newHeight = target.scrollHeight;

                // Snap width to grid
                const snappedWidth = getStrictSize(newWidth);

                setNodes(nds => nds.map(n => {
                    if (n.id === id) {
                        const currentW = n.style?.width as number;
                        const currentH = n.style?.height as number;

                        if (Math.abs(currentW - snappedWidth) > 5 || Math.abs(currentH - newHeight) > 5) {
                            return {
                                ...n,
                                style: {
                                    ...n.style,
                                    width: snappedWidth,
                                    height: newHeight
                                }
                            };
                        }
                    }
                    return n;
                }));
            }
        });

        observer.observe(boardRef.current);
        return () => observer.disconnect();
    }, [id, setNodes]);


    // 1. Filter and Sort Children
    const allChildNodes = useMemo(() => {
        const children = nodes.filter(n => n.parentId === id && n.type === 'note') as NoteNode[];
        return children.sort((a, b) => {
            const orderA = a.data.order ?? 0;
            const orderB = b.data.order ?? 0;
            return orderA - orderB;
        });
    }, [nodes, id]);

    // Apply filters
    const childNodes = useMemo(() => {
        return allChildNodes.filter(node => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesLabel = node.data.label?.toLowerCase().includes(query);
                const matchesDescription = node.data.description?.toLowerCase().includes(query);
                if (!matchesLabel && !matchesDescription) return false;
            }

            // Priority filter
            if (priorityFilter.length > 0) {
                if (!node.data.priority || !priorityFilter.includes(node.data.priority)) {
                    return false;
                }
            }

            // Assignee filter
            if (assigneeFilter) {
                const filter = assigneeFilter.toLowerCase();
                if (!node.data.assignee?.toLowerCase().includes(filter)) {
                    return false;
                }
            }

            return true;
        });
    }, [allChildNodes, searchQuery, priorityFilter, assigneeFilter]);

    // 2. Group by Column
    const columnsData = useMemo(() => {
        const map: Record<string, NoteNode[]> = {};
        data.columns.forEach(col => {
            map[col.statusValue] = [];
        });

        childNodes.forEach(node => {
            const status = node.data.status || data.columns[0]?.statusValue;
            if (map[status]) {
                map[status].push(node);
            } else {
                if (data.columns.length > 0) {
                    map[data.columns[0].statusValue].push(node);
                }
            }
        });

        // Sort cards within each column
        if (sortBy) {
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };

            Object.keys(map).forEach(status => {
                map[status].sort((a, b) => {
                    let aVal: any, bVal: any;

                    switch (sortBy) {
                        case 'dueDate':
                            aVal = a.data.dueDate ? new Date(a.data.dueDate).getTime() : Infinity;
                            bVal = b.data.dueDate ? new Date(b.data.dueDate).getTime() : Infinity;
                            break;
                        case 'priority':
                            aVal = priorityOrder[a.data.priority as keyof typeof priorityOrder] || 0;
                            bVal = priorityOrder[b.data.priority as keyof typeof priorityOrder] || 0;
                            break;
                        case 'createdAt':
                            aVal = a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0;
                            bVal = b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0;
                            break;
                        case 'label':
                            aVal = a.data.label?.toLowerCase() || '';
                            bVal = b.data.label?.toLowerCase() || '';
                            break;
                        default:
                            return 0;
                    }

                    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                    return 0;
                });
            });
        }

        return map;
    }, [data.columns, childNodes, sortBy, sortDirection]);

    const handleAddCard = useCallback((e: React.MouseEvent, _columnId: string, statusValue: string) => {
        e.stopPropagation();
        const existing = childNodes.filter(n => n.data.status === statusValue).length;
        const newCard = {
            parentId: id,
            extent: 'parent',
            data: {
                label: 'New Task',
                status: statusValue,
                description: '',
                viewMode: 'icon',
                order: existing
            },
            position: { x: 0, y: 0 }
        };
        addNode('note', newCard.position, newCard.data, { width: ICON_SIZE, height: ICON_SIZE }, id);
    }, [addNode, childNodes, id]);

    const handleTimelineAddCard = useCallback((startDateOverride?: string) => {
        const existing = childNodes.length;
        const now = startDateOverride ? new Date(startDateOverride) : new Date();
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + 3); // Default 3 day duration

        addNode('note', { x: 0, y: 0 }, {
            label: 'New Timeline Task',
            status: data.columns[0]?.statusValue || 'todo',
            description: '',
            viewMode: 'icon',
            order: existing,
            startDate: now.toISOString(),
            dueDate: nextWeek.toISOString(),
            createdAt: now.toISOString(),
        }, { width: ICON_SIZE, height: ICON_SIZE }, id);
    }, [addNode, childNodes.length, id, data.columns]);


    // --- Dnd Kit Configuration ---
    // --- Custom Collision Detection ---
    const customCollisionDetection: CollisionDetection = useCallback((args) => {
        const pointerCollisions = pointerWithin(args);

        // First check: is the pointer outside the board?
        // If so, return empty to trigger eject
        if (boardRef.current && args.pointerCoordinates) {
            const boardRect = boardRef.current.getBoundingClientRect();
            const { x, y } = args.pointerCoordinates;

            // Check if pointer is outside board bounds
            if (x < boardRect.left || x > boardRect.right || y < boardRect.top || y > boardRect.bottom) {
                // Outside board - return empty to trigger eject
                return [];
            }
        }

        // Priority 1: Check if we are over a column directly using pointer
        const columnCollision = pointerCollisions.find(c =>
            data.columns.some(col => col.statusValue === c.id)
        );

        if (columnCollision) {
            return [columnCollision];
        }

        // Priority 2: Standard rect intersection (good for items)
        const rectCollisions = rectIntersection(args);
        const cardCollision = rectCollisions.find(c =>
            childNodes.some(n => n.id === c.id)
        );

        if (cardCollision) {
            return [cardCollision];
        }

        // Fallback to closest corners only if inside board
        return closestCorners(args);
    }, [data.columns, childNodes]);

    // --- Custom Smart Sensor ---
    class SmartPointerSensor extends PointerSensor {
        static activators = [
            {
                eventName: 'onPointerDown' as const,
                handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
                    if (
                        !event.isPrimary ||
                        event.button !== 0 ||
                        isInteractiveElement(event.target as HTMLElement)
                    ) {
                        return false;
                    }
                    return true;
                },
            },
        ];
    }

    function isInteractiveElement(element: HTMLElement | null) {
        const interactiveTags = ['input', 'textarea', 'select', 'option', 'button'];
        if (element && interactiveTags.includes(element.tagName.toLowerCase())) {
            return true;
        }
        return element?.isContentEditable || element?.closest('[contenteditable]');
    }

    const sensors = useSensors(
        useSensor(SmartPointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [activeId, setActiveId] = useState<string | null>(null);
    const [isOutsideBoard, setIsOutsideBoard] = useState(false);

    // Modifier: Adjust overlay position so click point stays under cursor
    const adjustOffset: Modifier = useCallback(({ transform, activatorEvent, draggingNodeRect }) => {
        if (!activatorEvent || !draggingNodeRect) return transform;

        const event = activatorEvent as PointerEvent;
        if (!event.clientX) return transform;

        // Calculate where in the element the click happened
        const offsetX = event.clientX - draggingNodeRect.left;
        const offsetY = event.clientY - draggingNodeRect.top;

        // The overlay starts at position 0,0 relative to the original element
        // We need to shift it so the click point is at the cursor
        return {
            ...transform,
            x: transform.x - (draggingNodeRect.width / 2 - offsetX),
            y: transform.y - (draggingNodeRect.height / 2 - offsetY),
        };
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        setActiveId(active.id as string);
        setIsOutsideBoard(false);
        setInteractionState({ draggingKanbanNodeId: active.id as string });
    }, [setInteractionState]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;

        // Update outside board state based on collision detection result
        // If over is null, it means collision detection returned empty (outside board)
        setIsOutsideBoard(!over);

        if (!over) return;

        const activeIdStr = active.id as string;
        const overIdStr = over.id as string;

        // Find the containers
        const activeNode = childNodes.find(n => n.id === activeIdStr);
        const overNode = childNodes.find(n => n.id === overIdStr);

        if (!activeNode) return;

        // Case 1: Over a column (dropping on empty column)
        const isOverColumn = data.columns.some(col => col.statusValue === overIdStr);

        if (isOverColumn) {
            const newStatus = overIdStr;
            if (activeNode.data.status !== newStatus) {
                updateNodeData(activeIdStr, { status: newStatus });
            }
            return;
        }

        // Case 2: Over another card
        if (activeNode && overNode && activeNode.data.status !== overNode.data.status) {
            // Moving between columns by dragging over a card in a different column
            const newStatus = overNode.data.status;
            updateNodeData(activeIdStr, { status: newStatus });
        }
    }, [childNodes, data.columns, updateNodeData]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        const activeIdStr = active.id as string;
        const activeNode = childNodes.find(n => n.id === activeIdStr);

        setActiveId(null);
        setIsOutsideBoard(false);
        setInteractionState({ draggingKanbanNodeId: null });

        if (!activeNode) return;

        // --- EJECT TO CANVAS logic ---
        // If not over anything, OR over the board main container but not a specific column?
        // Actually simplest check: check if the 'over' is one of our columns or cards.
        // If over is null, we definitely eject.

        let shouldEject = !over;

        // Also check if we 'missed' the board entirely? 
        // dnd-kit might return null if we drop on the canvas background since it's not a droppable.
        // The board itself is not a droppable in this context, only columns are. 
        // So dropping on the header or outside columns = null (or valid if we stick to last col).

        // We can use the layout rects to be sure.
        if (shouldEject) {
            // EJECT
            // 1. Calculate drop position in ReactFlow units
            // active.rect.current.translated includes the transform
            if (active.rect.current.translated) {
                const { left, top } = active.rect.current.translated;
                const p1 = screenToFlowPosition({ x: left, y: top });

                // 2. Check collisions for nesting
                // Create a rect for collision check
                const width = activeNode.style?.width as number || ICON_SIZE;
                const height = activeNode.style?.height as number || ICON_SIZE;
                const dropRect = { x: p1.x, y: p1.y, width, height };

                const intersections = getIntersectingNodes(dropRect as any);
                const targetNode = intersections.find((n) =>
                    n.id !== activeIdStr &&
                    n.id !== id && // Not self (board)
                    n.parentId !== id // Not a sibling
                );

                if (targetNode && (targetNode.type === 'note' || targetNode.type === 'block' || targetNode.type === 'fused-note')) {
                    // NESTING
                    const pageBlock = {
                        id: uuidv4(),
                        type: 'page',
                        content: activeNode.data.label || 'Untitled',
                        metadata: { nodeId: activeIdStr }
                    };
                    const currentContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, pageBlock]
                    });
                    // Move Node into Target (Hide it)
                    updateNode(activeIdStr, {
                        parentId: targetNode.id,
                        extent: 'parent',
                        position: { x: 0, y: 0 },
                        zIndex: 10
                    });

                } else {
                    // PLAIN EJECT
                    updateNode(activeIdStr, {
                        parentId: undefined,
                        extent: undefined,
                        position: {
                            x: snapToGridValue(p1.x),
                            y: snapToGridValue(p1.y)
                        },
                        zIndex: 10
                    });
                }
                return;
            }
        }

        // --- REORDER LOGIC ---
        if (over) {
            const overIdStr = over.id as string;

            // If dropped on a column (empty or end), it is already handled by DragOver for status change.
            // We just need to ensure order is correct. 
            // If dropped on a Card, we reorder.

            const overNode = childNodes.find(n => n.id === overIdStr);
            if (activeIdStr !== overIdStr) {
                // We are reordering within the (potentially new) column
                // Get all cards in that column
                const status = activeNode.data.status || ''; // It should have been updated in DragOver
                const cardsInCol = childNodes.filter(n => n.data.status === status);

                const oldIndex = cardsInCol.findIndex(n => n.id === activeIdStr);
                const newIndex = overNode ? cardsInCol.findIndex(n => n.id === overIdStr) : cardsInCol.length;

                // Note: if over is a column ID, newIndex is usually end, or 0? 
                // arrayMove handles indices. 
                // However, dnd-kit's SortableContext behaves best if we actually reorder the array.

                if (oldIndex !== -1 && newIndex !== -1) {
                    const newOrder = arrayMove(cardsInCol, oldIndex, newIndex);
                    // Update ALL orders in this column
                    newOrder.forEach((node, idx) => {
                        updateNodeData(node.id, { order: idx });
                    });
                }
            }
        }
    }, [childNodes, id, screenToFlowPosition, getIntersectingNodes, updateNodeData, updateNode]);


    const activeNode = useMemo(() =>
        childNodes.find(n => n.id === activeId),
        [activeId, childNodes]);

    const handleToggleColumn = useCallback((columnId: string) => {
        updateNodeData(id, {
            columns: data.columns.map(col =>
                col.id === columnId ? { ...col, collapsed: !col.collapsed } : col
            )
        });
    }, [id, data.columns, updateNodeData]);

    const isFixedSizeView = viewMode === 'calendar' || viewMode === 'timeline';

    return (
        <div
            className={`${styles.board} ${selected ? styles.selected : ''} ${isDraggingBoard ? styles.dragging : ''} ${data.background ? styles[data.background] : ''}`}
            ref={boardRef}
            style={{
                background: data.background && (data.background.startsWith('#') || data.background.startsWith('rgba'))
                    ? data.background
                    : undefined,
                height: isFixedSizeView ? '100%' : undefined,
                width: isFixedSizeView ? '100%' : undefined,
            }}
        >
            {/* Header */}
            <div className={styles.header}>
                <h3 className={styles.title}>{data.label}</h3>
                <div className={styles.columnCount}>
                    {childNodes.length} / {allChildNodes.length} cards
                </div>
                <button
                    className="nodrag"
                    style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 4 }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditingKanbanId(id);
                        setKanbanModalOpen(true);
                    }}
                >
                    <Settings size={16} />
                </button>
            </div>

            {/* Toolbar */}
            <div className="nodrag">
                <KanbanToolbar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    priorityFilter={priorityFilter}
                    onPriorityFilterChange={setPriorityFilter}
                    assigneeFilter={assigneeFilter}
                    onAssigneeFilterChange={setAssigneeFilter}
                    onClearFilters={clearFilters}
                    hasActiveFilters={hasActiveFilters}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    onSortChange={handleSortChange}
                    swimlaneField={swimlaneField}
                    onSwimlaneChange={handleSwimlaneChange}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                />
            </div>

            {viewMode === 'table' ? (
                <div className="nodrag">
                    <KanbanTableView
                        cards={childNodes}
                        columns={data.columns}
                        onCardClick={handleCardClick}
                        onAddCard={handleTableAddCard}
                        onReorderCards={handleReorderCards}
                        onUpdateCard={updateNodeData}
                        visibleExtraColumns={visibleExtraColumns}
                        onVisibleExtraColumnsChange={handleTableColumnsChange}
                    />
                </div>
            ) : viewMode === 'calendar' ? (
                <div className="nodrag" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <KanbanCalendarView
                        cards={childNodes}
                        onCardClick={handleCardClick}
                        onUpdateCard={updateNodeData}
                        onAddCard={handleTimelineAddCard}
                    />
                </div>
            ) : viewMode === 'timeline' ? (
                <div className="nodrag" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <KanbanTimelineView
                        cards={childNodes}
                        onCardClick={handleCardClick}
                        onUpdateCard={updateNodeData}
                        onAddCard={handleTimelineAddCard}
                        onReorder={handleReorderCards}
                    />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={customCollisionDetection}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className={`${styles.columnsContainer} nodrag`}>
                        {data.columns.map((col) => (
                            <KanbanColumn
                                key={col.id}
                                kanbanId={id}
                                column={col}
                                cards={columnsData[col.statusValue] || []}
                                onAddCard={handleAddCard}
                                onToggleCollapse={handleToggleColumn}
                                onCardClick={handleCardClick}
                            />
                        ))}
                    </div>

                    <DragOverlay dropAnimation={dropAnimation} modifiers={[adjustOffset]}>
                        {activeNode ? (
                            <div className={styles.dragOverlayCard} data-ejecting={isOutsideBoard || undefined}>
                                <KanbanCardPreview
                                    node={activeNode}
                                    isDragging={true}
                                />
                                {isOutsideBoard && (
                                    <div className={styles.ejectBadge}>
                                        ↗
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}

            <Handle type="source" position={Position.Top} className={styles.handle} id="connection" />
        </div>
    );
});
