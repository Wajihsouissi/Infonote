import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
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
import { NoteCard } from '../card/NoteCard';
import { KanbanColumn } from './KanbanColumn';
import styles from './KanbanNode.module.css';
import { getStrictSize, ICON_SIZE, snapToGridValue } from '../../config/layout';

const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
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
    const interactionState = useStore(s => s.interactionState);

    const { setNodes, screenToFlowPosition, getIntersectingNodes, getViewport } = useReactFlow();
    const { zoom } = getViewport();

    const isDraggingBoard = interactionState.draggedNodeId === id;

    const boardRef = useRef<HTMLDivElement>(null);

    // --- AUTO RESIZE LOGIC ---
    useEffect(() => {
        if (!boardRef.current) return;

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
    const childNodes = useMemo(() => {
        const children = nodes.filter(n => n.parentId === id && n.type === 'note') as NoteNode[];
        return children.sort((a, b) => {
            const orderA = a.data.order ?? 0;
            const orderB = b.data.order ?? 0;
            return orderA - orderB;
        });
    }, [nodes, id]);

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
        return map;
    }, [childNodes, data.columns]);

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


    // --- Dnd Kit Configuration ---
    // --- Custom Collision Detection ---
    const customCollisionDetection: CollisionDetection = useCallback((args) => {
        const pointerCollisions = pointerWithin(args);

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

        // Fallback
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

    // --- Custom Modifiers ---
    const snapCenterToCursor: Modifier = useCallback(({ activatorEvent, draggingNodeRect, transform }) => {
        if (draggingNodeRect && activatorEvent && (activatorEvent as any).clientX !== undefined) {
            const evt = activatorEvent as any;

            return {
                ...transform,
                x: evt.clientX - draggingNodeRect.left - (draggingNodeRect.width / 2),
                y: evt.clientY - draggingNodeRect.top - (draggingNodeRect.height / 2),
            };
        }
        return transform;
    }, [zoom]);

    const [activeId, setActiveId] = useState<string | null>(null);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setInteractionState({ draggingKanbanNodeId: event.active.id as string });
    }, [setInteractionState]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
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

    return (
        <div
            className={`${styles.board} ${selected ? styles.selected : ''} ${isDraggingBoard ? styles.dragging : ''} ${data.background ? styles[data.background] : ''}`}
            ref={boardRef}
            style={data.background ? {
                background: data.background.startsWith('#') || data.background.startsWith('rgba')
                    ? data.background
                    : undefined
            } : undefined}
        >
            {/* Header */}
            <div className={styles.header}>
                <h3 className={styles.title}>{data.label}</h3>
                <div className={styles.columnCount}>
                    {data.columns.length} columns
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
                        />
                    ))}
                </div>

                <DragOverlay dropAnimation={dropAnimation} modifiers={[snapCenterToCursor]}>
                    {activeNode ? (
                        <div style={{
                            transform: `scale(${zoom * 0.98}) rotate(2deg)`,
                            cursor: 'grabbing',
                            width: activeNode.measured?.width || activeNode.style?.width || 224,
                            transformOrigin: 'center center'
                        }}>
                            <NoteCard
                                {...activeNode}
                                selected={false}
                                dragging={true}
                                zIndex={100}
                                isConnectable={false}
                                selectable={false}
                                deletable={false}
                                draggable={false}
                                positionAbsoluteX={0}
                                positionAbsoluteY={0}
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            <Handle type="target" position={Position.Top} className={styles.handle} />
            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
});
