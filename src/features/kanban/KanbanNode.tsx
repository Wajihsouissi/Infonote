import { memo, useMemo, useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { KanbanNode, NoteNode } from '../../types';
import { NoteCard } from '../card/NoteCard';
import styles from './KanbanNode.module.css';

// Helper to find extraction index
const getInsertionIndex = (y: number, elements: Element[]) => {
    for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        if (y < middle) {
            return i;
        }
    }
    return elements.length;
};

export const KanbanNodeComponent = memo(({ id, data, selected }: NodeProps<KanbanNode>) => {
    const { nodes, addNode, updateNodeData, setInteractionState, interactionState } = useStore();
    // ^ setNodes from store allows raw access if needed, but useReactFlow
    const { setNodes, screenToFlowPosition, getIntersectingNodes } = useReactFlow();

    const boardRef = useRef<HTMLDivElement>(null);

    // --- AUTO RESIZE LOGIC ---
    useEffect(() => {
        if (!boardRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // We want to sync the RF Node 'style.width/height' with the actual DOM size 
                // to ensure the selection box matches the visual board.
                // However, if we just set width/height, it might force that size.
                // We want the BOARD to grow with content.
                // CSS: min-width / min-height + fit-content.

                // If we update the node.style.width/height based on scrollWidth, we ensure RF knows the size.

                const target = entry.target as HTMLElement;
                const newWidth = target.scrollWidth;
                const newHeight = target.scrollHeight;

                setNodes(nds => nds.map(n => {
                    if (n.id === id) {
                        // Only update if significantly changed to avoid loops
                        const currentW = n.style?.width as number;
                        const currentH = n.style?.height as number;

                        if (Math.abs(currentW - newWidth) > 5 || Math.abs(currentH - newHeight) > 5) {
                            return {
                                ...n,
                                style: {
                                    ...n.style,
                                    width: newWidth,
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

        // Sort by order/index
        // If order is missing, we revert to index in array or some fallback
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
                // Fallback for unknown status
                if (data.columns.length > 0) {
                    map[data.columns[0].statusValue].push(node);
                }
            }
        });
        return map;
    }, [childNodes, data.columns]);

    // --- Drag & Drop State ---
    const [dragState, setDragState] = useState<{
        nodeId: string;
        startCol: string;
        startIndex: number;
        currentCol: string | 'CANVAS'; // 'CANVAS' means dragged out
        placeholderIndex: number;
        ghostPos: { x: number; y: number };
        width: number;
        height: number;
        offset: { x: number; y: number };
    } | null>(null);

    const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const handleAddCard = (e: React.MouseEvent, _columnId: string, statusValue: string) => {
        e.stopPropagation();

        // Count existing to determine order
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
            position: { x: 0, y: 0 } // Position irrelevant in flex
        };

        addNode('note', newCard.position, newCard.data, { width: 112, height: 112 }, id);
    };

    // --- DnD Handlers ---

    // Global Move / Up Listeners
    useEffect(() => {
        if (!dragState) return;

        const handleMove = (e: MouseEvent) => {
            // 1. Update Ghost Pos
            setDragState(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    ghostPos: {
                        x: e.clientX - prev.offset.x,
                        y: e.clientY - prev.offset.y
                    }
                };
            });

            // 2. Hit Test Logic
            // Check board bounds.
            if (boardRef.current) {
                const boardRect = boardRef.current.getBoundingClientRect();
                // Reduce buffer to make it easier to drag out
                const BUFFER = 10;

                const isOutside = (
                    e.clientX < boardRect.left - BUFFER ||
                    e.clientX > boardRect.right + BUFFER ||
                    e.clientY < boardRect.top - BUFFER ||
                    e.clientY > boardRect.bottom + BUFFER
                );

                if (isOutside) {
                    setDragState(prev => {
                        if (!prev) return null;
                        if (prev.currentCol === 'CANVAS') return prev;
                        return { ...prev, currentCol: 'CANVAS', placeholderIndex: -1 };
                    });
                    return;
                }
            }

            // If inside, check columns
            const hitColumn = data.columns.find(col => {
                const ref = columnRefs.current[col.statusValue];
                if (!ref) return false;
                const rect = ref.getBoundingClientRect();
                return e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom; // Strict column hit
            });

            if (hitColumn) {
                const colStatus = hitColumn.statusValue;
                const ref = columnRefs.current[colStatus];
                if (ref) {
                    // Find children cards
                    const cardElements = Array.from(ref.querySelectorAll(`.${styles.cardWrapper}`))
                        .filter(el => el.getAttribute('data-ghost') !== 'true'); // Exclude ghost if needed

                    const index = getInsertionIndex(e.clientY, cardElements);

                    setDragState(prev => {
                        if (!prev) return null;
                        if (prev.currentCol === colStatus && prev.placeholderIndex === index) return prev;
                        return { ...prev, currentCol: colStatus, placeholderIndex: index };
                    });
                }
            } else {
                // If we are INSIDE the board (passed isOutside check) but NOT hitting a column:
                // We could treat this as "Still in previous column" (Sticky) OR "Canvas".
                // If we treat it as Canvas, users can drop in the gaps to eject.
                // Let's try treating gaps as Canvas for easier exit?
                // Or maybe keep sticky to avoid accidental drops?
                // Given user complaint "cannot drag out", maybe they are hitting the gap?
                // Use a 'soft' stickiness or just default to CANVAS if not in column?

                // Let's set it to CANVAS if not in column. This makes "dragging out" very responsive.
                setDragState(prev => {
                    if (!prev) return null;
                    if (prev.currentCol === 'CANVAS') return prev;
                    return { ...prev, currentCol: 'CANVAS', placeholderIndex: -1 };
                });
            }
        };

        const handleUp = (_e: MouseEvent) => {
            if (!dragState) return;

            // Commit Change
            const { nodeId, currentCol, placeholderIndex, ghostPos } = dragState;

            if (currentCol === 'CANVAS') {
                // --- DRAG OUT LOGIC ---

                // 1. Calculate drop rect in Flow Units
                // We used screenToFlowPosition which handles transform.

                // Calculate Flow Rect for intersections
                const p1 = screenToFlowPosition({ x: ghostPos.x, y: ghostPos.y });
                const p2 = screenToFlowPosition({ x: ghostPos.x + dragState.width, y: ghostPos.y + dragState.height });

                const dropRect = {
                    x: p1.x,
                    y: p1.y,
                    width: p2.x - p1.x,
                    height: p2.y - p1.y
                };

                // 2. Check for Target Node (Nesting)
                const intersections = getIntersectingNodes(dropRect as any);
                const targetNode = intersections.find((n) =>
                    n.id !== nodeId &&
                    n.id !== id && // Not self (board)
                    n.parentId !== id // Not a sibling in the board (though filter removes them usually if hidden)
                    // We might want to filter out 'kanban' unless we support board-to-board
                );

                if (targetNode && (targetNode.type === 'note' || targetNode.type === 'block' || targetNode.type === 'fused-note')) {
                    // --- NESTING ---
                    // Convert the dragged note into a Page Block inside the target
                    // 1. Create Page Block
                    const pageBlock = {
                        id: uuidv4(),
                        type: 'page',
                        content: (childNodes.find(n => n.id === nodeId)?.data.label) || 'Untitled Page',
                        metadata: { nodeId: nodeId }
                    };

                    // 2. Add to Target Content
                    const currentContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, pageBlock]
                    });

                    // 3. Move Node into Target
                    setNodes(nds => nds.map(n => {
                        if (n.id === nodeId) {
                            return {
                                ...n,
                                parentId: targetNode.id,
                                extent: 'parent',
                                position: { x: 0, y: 0 }, // Hidden/Virtual
                                zIndex: 10
                            };
                        }
                        return n;
                    }));

                } else {
                    // --- EJECT TO CANVAS ---

                    // 1. Calculate proper ReactFlow position
                    // We already have p1 from above
                    const newPos = p1;

                    // 2. Update Node to be a Root Node
                    setNodes(nds => nds.map(n => {
                        if (n.id === nodeId) {
                            return {
                                ...n,
                                parentId: undefined,
                                extent: undefined,
                                position: newPos,
                                zIndex: 10 // Bring to standard level
                            };
                        }
                        return n;
                    }));
                }
            } else {
                // --- REORDER WITHIN KANBAN ---
                // (Existing logic)

                // Get all items in target column EXCEPT the dragged one (if it was already there)
                // But getting from 'nodes' state is safer 
                // We need to construct the NEW order for the target column.

                // 1. Get filtered list of Target Column
                let targetList = childNodes.filter(n => n.data.status === currentCol && n.id !== nodeId);

                // 2. Insert at index
                // Clamp index
                let safeIndex = placeholderIndex;
                if (safeIndex < 0) safeIndex = 0;
                if (safeIndex > targetList.length) safeIndex = targetList.length;

                const movingNode = childNodes.find(n => n.id === nodeId);
                if (movingNode) {
                    targetList.splice(safeIndex, 0, movingNode);
                }

                // 3. Update ALL nodes in that column with new order
                targetList.forEach((n, idx) => {
                    // Only update if changed
                    const isActive = n.id === nodeId;
                    const newStatus = currentCol; // Only important for active

                    // We batch update? or individual. 
                    // updateNodeData merges data.

                    const updates: any = { order: idx };
                    if (isActive) updates.status = newStatus;

                    updateNodeData(n.id, updates);
                });
            }

            setDragState(null);
            setInteractionState({ draggingKanbanNodeId: null });
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState, data.columns, childNodes, updateNodeData, setNodes, screenToFlowPosition]);

    const startDrag = (e: React.MouseEvent, node: NoteNode) => {
        // Prevent drag if interacting with controls
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.closest('button') || target.closest('.nodrag')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const currentTarget = e.currentTarget as HTMLElement;
        const rect = currentTarget.getBoundingClientRect();

        // Find current index
        const colList = columnsData[node.data.status || ''] || [];
        const idx = colList.indexOf(node);

        setInteractionState({ draggingKanbanNodeId: node.id });

        setDragState({
            nodeId: node.id,
            startCol: node.data.status || '',
            startIndex: idx,
            currentCol: node.data.status || '',
            placeholderIndex: idx,
            ghostPos: { x: rect.left, y: rect.top },
            width: rect.width,
            height: rect.height,
            offset: { x: e.clientX - rect.left, y: e.clientY - rect.top }
        });
    };

    return (
        <div className={`${styles.board} ${selected ? styles.selected : ''}`}>

            {/* Header */}
            <div className={styles.header}>
                <h3 className={styles.title}>{data.label}</h3>
                <div className={styles.columnCount}>
                    {data.columns.length} columns
                </div>
            </div>

            {/* Columns */}
            <div className={`${styles.columnsContainer} nodrag`}>
                {data.columns.map((col) => {
                    const cards = columnsData[col.statusValue] || [];
                    const isTargetCol = dragState?.currentCol === col.statusValue ||
                        (interactionState.hoveredKanbanColumn?.kanbanId === id && interactionState.hoveredKanbanColumn?.columnId === col.statusValue);

                    return (
                        <div
                            key={col.id}
                            className={`${styles.column} ${isTargetCol ? styles.columnActive : ''}`}
                            ref={el => { columnRefs.current[col.statusValue] = el; }}
                        >
                            <div className={styles.columnHeader}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <div className={styles.columnColorBar} style={{ background: col.color || '#ccc' }} />
                                    <span className={styles.columnTitle}>{col.label}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span
                                        className={styles.statusBadge}
                                        style={{ background: `${col.color}33`, color: col.color }}
                                    >
                                        {cards.length}
                                    </span>
                                    <button
                                        className={styles.addCardBtn}
                                        onClick={(e) => handleAddCard(e, col.id, col.statusValue)}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.dropZone}>
                                {cards.map((card, idx) => {
                                    // If this card is being dragged, hiding it (it becomes ghost)
                                    if (dragState && dragState.nodeId === card.id) return null;

                                    // Placeholder logic:
                                    // If this is the target col, and we are at the placeholder index, render placeholder BEFORE this card
                                    const showPlaceholderBefore = isTargetCol && dragState?.placeholderIndex === idx;

                                    return (
                                        <>
                                            {showPlaceholderBefore && (
                                                <div
                                                    className={styles.dropPlaceholder}
                                                    style={{ height: dragState.height, width: '100%' }}
                                                />
                                            )}

                                            <div
                                                key={card.id}
                                                className={styles.cardWrapper}
                                                onMouseDown={(e) => startDrag(e, card)}
                                                style={{
                                                    // Ensure it takes the height from NoteCard strict sizing
                                                    height: card.style?.height ?? 112
                                                }}
                                            >
                                                <NoteCard
                                                    {...card}
                                                    selected={selected && !dragState} // Only selected if board is selected? Or handle logic.
                                                    dragging={false}
                                                    zIndex={0}
                                                    isConnectable={false}
                                                    selectable={true}
                                                    deletable={true}
                                                    draggable={true}
                                                    positionAbsoluteX={0}
                                                    positionAbsoluteY={0}
                                                />
                                            </div>
                                        </>
                                    );
                                })}

                                {/* Edge Case: Placeholder at the end of list */}
                                {(isTargetCol && dragState?.placeholderIndex === cards.length) ||
                                    (isTargetCol && dragState?.nodeId && dragState.placeholderIndex >= (cards.filter(c => c.id !== dragState.nodeId).length)) ? (
                                    <div
                                        className={styles.dropPlaceholder}
                                        style={{ height: dragState?.height, width: '100%' }}
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Drag Ghost Overlay */}
            {dragState && (
                <div
                    className={styles.dragGhost}
                    style={{
                        top: dragState.ghostPos.y,
                        left: dragState.ghostPos.x,
                        width: dragState.width,
                        height: dragState.height
                    }}
                >
                    {/* Re-render the dragged card visuals for the ghost */}
                    {(() => {
                        const node = childNodes.find(n => n.id === dragState.nodeId);
                        if (!node) return null;
                        return (
                            <NoteCard
                                {...node}
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
                        );
                    })()}
                </div>
            )}

            <Handle type="target" position={Position.Top} className={styles.handle} />
            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
});

