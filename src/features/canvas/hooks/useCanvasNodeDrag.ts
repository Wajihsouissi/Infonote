import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { snapToGridValue } from '../../../config/layout';

interface UseCanvasNodeDragOptions {
    nodes: AppNode[];
    currentParentId: string | null;
    setInteractionState: (state: any) => void;
    setNodes: (updater: (nodes: AppNode[]) => AppNode[]) => void;
    updateNodeData: (id: string, data: any) => void;
    syncParentContent: (parentId: string) => void;
    selectedCanvasNodeIds: Set<string>;
}

/**
 * Hook that handles all node drag interactions on the canvas.
 * Manages drag start, drag move, and drag stop with fusion/nesting/kanban logic.
 */
export function useCanvasNodeDrag({
    nodes,
    currentParentId,
    setInteractionState,
    setNodes,
    updateNodeData,
    syncParentContent,
    selectedCanvasNodeIds,
}: UseCanvasNodeDragOptions) {
    const { screenToFlowPosition, getIntersectingNodes, getNode, getViewport } = useReactFlow();

    // Throttling and state Refs
    const lastDragCheck = useRef(0);
    const lastHighlightedBlockRef = useRef<HTMLElement | null>(null);
    const activeDropTargetRef = useRef<any>(null);
    const activeKanbanColumnRef = useRef<any>(null);

    const onNodeDragStart = useCallback((_event: React.MouseEvent, node: any) => {
        setInteractionState({ draggedNodeId: node.id });
        activeDropTargetRef.current = null;
        activeKanbanColumnRef.current = null;
        if (lastHighlightedBlockRef.current) {
            lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
            lastHighlightedBlockRef.current = null;
        }

        // Collect IDs to boost: primary node + any selected nodes
        const idsToBoost = new Set(selectedCanvasNodeIds);
        idsToBoost.add(node.id);

        // Boost z-index and remove extent for ALL dragged nodes
        setNodes(nds => nds.map(n => idsToBoost.has(n.id) ? {
            ...n,
            zIndex: 10000,
            extent: undefined // Allow dragging out of parent
        } : n));

        // Cleanup any previous drop target indicators
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            (el as HTMLElement).removeAttribute('data-external-drop-target');
        });
        document.body.classList.add('chnk-it-node-dragging');
    }, [setInteractionState, setNodes, selectedCanvasNodeIds]);

    const onNodeDrag = useCallback((event: React.MouseEvent, node: any) => {
        // Throttle for smoother grid response (approx 30fps)
        const now = Date.now();
        if (now - lastDragCheck.current < 32) {
            return;
        }
        lastDragCheck.current = now;

        const { zoom } = getViewport();
        // Constant 16px screen-space hover checking size, scaled to flow space
        const checkSize = Math.max(2, 16 / zoom);

        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = { 
            x: mousePos.x - checkSize / 2, 
            y: mousePos.y - checkSize / 2, 
            width: checkSize, 
            height: checkSize 
        };
        const intersections = getIntersectingNodes(mouseRect as any);

        const targetKanban = intersections.find(n => n.type === 'kanban');
        const targetOther = intersections.find(n =>
            n.id !== node.id && (n.type === 'note' || n.type === 'fused-note' || n.type === 'block')
        );

        let newDropTarget: { id: string; type: 'fusion' | 'nesting' | 'kanban-column' } | null = null;

        // Priority 1: Kanban Column
        if (targetKanban && node.type === 'note') {
            const kanbanData = targetKanban.data as any;
            const currentColumns = kanbanData.columns;

            if (currentColumns && currentColumns.length > 0) {
                const boardWidth = targetKanban.measured?.width ?? (targetKanban.style?.width as number) ?? 800;
                const relativeX = node.position.x - targetKanban.position.x;
                const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;
                const gap = 20;
                const padding = 24;
                const totalStep = visualColWidth + gap;

                let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);
                if (colIndex < 0) colIndex = 0;
                if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

                const targetCol = currentColumns[colIndex];

                newDropTarget = {
                    id: targetKanban.id,
                    type: 'kanban-column'
                };

                const lastKanbanCol = activeKanbanColumnRef.current;
                if (
                    lastKanbanCol?.kanbanId !== targetKanban.id ||
                    lastKanbanCol?.columnId !== targetCol.statusValue
                ) {
                    const nextKanbanCol = {
                        kanbanId: targetKanban.id,
                        columnId: targetCol.statusValue
                    };
                    activeKanbanColumnRef.current = nextKanbanCol;
                    activeDropTargetRef.current = newDropTarget;

                    setInteractionState({
                        hoveredKanbanColumn: nextKanbanCol,
                        dropTarget: newDropTarget
                    });
                }
                return;
            }
        }

        // Clear Kanban hover if not hovering kanban anymore
        if (!targetKanban && activeKanbanColumnRef.current) {
            activeKanbanColumnRef.current = null;
            setInteractionState({ hoveredKanbanColumn: null });
        }

        // Priority 2: Fusion or Nesting
        if (targetOther) {
            const isSourceBlock = node.type === 'block';
            const isSourceFused = node.type === 'fused-note';
            const isSourceNote = node.type === 'note';

            const isTargetBlock = targetOther.type === 'block';
            const isTargetFused = targetOther.type === 'fused-note';
            const isTargetNote = targetOther.type === 'note';

            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                newDropTarget = { id: targetOther.id, type: 'fusion' };
            } else if (isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {
                newDropTarget = { id: targetOther.id, type: 'nesting' };
            }

            // Visual indicator logic
            if (newDropTarget && (newDropTarget.type === 'fusion' || newDropTarget.type === 'nesting')) {
                const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
                const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-')) as HTMLElement | undefined;

                if (blockElement) {
                    const rect = blockElement.getBoundingClientRect();
                    const midY = rect.top + (rect.height / 2);
                    const position = event.clientY < midY ? 'top' : 'bottom';
                    
                    if (lastHighlightedBlockRef.current && lastHighlightedBlockRef.current !== blockElement) {
                        lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
                    }
                    
                    blockElement.setAttribute('data-external-drop-target', position);
                    lastHighlightedBlockRef.current = blockElement;
                } else if (lastHighlightedBlockRef.current) {
                    lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
                    lastHighlightedBlockRef.current = null;
                }
            } else if (lastHighlightedBlockRef.current) {
                lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
                lastHighlightedBlockRef.current = null;
            }
        } else if (lastHighlightedBlockRef.current) {
            lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
            lastHighlightedBlockRef.current = null;
        }

        const lastDropTarget = activeDropTargetRef.current;
        if (lastDropTarget?.id !== newDropTarget?.id ||
            lastDropTarget?.type !== newDropTarget?.type) {
            activeDropTargetRef.current = newDropTarget;
            setInteractionState({ dropTarget: newDropTarget });
        }
    }, [getIntersectingNodes, setInteractionState, screenToFlowPosition, getViewport]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, node: any) => {
        const hoveredColumn = activeKanbanColumnRef.current;
        const isMultiDrag = selectedCanvasNodeIds.size > 1 && selectedCanvasNodeIds.has(node.id);

        // Clear interaction states
        setInteractionState({
            hoveredKanbanColumn: null,
            draggedNodeId: null,
            dropTarget: null
        });

        activeDropTargetRef.current = null;
        activeKanbanColumnRef.current = null;

        // Cleanup visual indicators
        if (lastHighlightedBlockRef.current) {
            lastHighlightedBlockRef.current.removeAttribute('data-external-drop-target');
            lastHighlightedBlockRef.current = null;
        }
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            (el as HTMLElement).removeAttribute('data-external-drop-target');
        });
        document.body.classList.remove('chnk-it-node-dragging');

        // FREE-FORM POSITIONING: preserve raw decimal coordinates produced by React Flow.
        // No grid snapping is applied — nodes float exactly where the cursor releases them.
        const restoreNodeZIndex = () => {
            const idsToRestore = isMultiDrag ? new Set(selectedCanvasNodeIds) : new Set([node.id]);

            setNodes(nds => nds.map(n => {
                if (!idsToRestore.has(n.id)) return n;
                return {
                    ...n,
                    zIndex: 10,
                    extent: n.parentId ? 'parent' : undefined,
                };
            }));
        };

        const isSourceBlock = node.type === 'block';
        const isSourceFused = node.type === 'fused-note';
        const isSourceNote = node.type === 'note';

        // Multi-drag: skip fusion/nesting/kanban — just snap all nodes and return
        if (isMultiDrag) {
            restoreNodeZIndex();
            if (currentParentId) syncParentContent(currentParentId);
            return;
        }

        const { zoom } = getViewport();
        // Constant 16px screen-space hover checking size, scaled to flow space
        const checkSize = Math.max(2, 16 / zoom);

        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = { 
            x: mousePos.x - checkSize / 2, 
            y: mousePos.y - checkSize / 2, 
            width: checkSize, 
            height: checkSize 
        };
        const intersections = getIntersectingNodes(mouseRect as any);
        const targetNode = intersections.find(n => n.id !== node.id && n.id !== currentParentId);

        // CASE 0: Drag Out - Un-nesting (free-form, no grid snap)
        if (!targetNode && node.parentId) {
            const parentNode = getNode(node.parentId);

            if (parentNode) {
                // Preserve raw decimal coordinates; child relative -> absolute
                const absPos = {
                    x: snapToGridValue(node.positionAbsolute?.x ?? (parentNode.position.x + node.position.x)),
                    y: snapToGridValue(node.positionAbsolute?.y ?? (parentNode.position.y + node.position.y))
                };

                setNodes(nds => nds.map(n => {
                    if (n.id === node.id) {
                        return {
                            ...n,
                            parentId: undefined,
                            extent: undefined,
                            zIndex: 10,
                            position: absPos
                        };
                    }
                    return n;
                }));
            }
            return;
        }

        // Use hoveredColumn for Kanban drop
        if (hoveredColumn && isSourceNote) {
            const targetKanban = getNode(hoveredColumn.kanbanId);

            if (targetKanban) {
                const kanbanData = targetKanban.data as any;
                const targetCol = kanbanData.columns.find((c: any) => c.statusValue === hoveredColumn.columnId);

                if (targetCol) {
                    const newStatus = targetCol.statusValue;
                    const GAP = 16;
                    const HEADER_OFFSET = 130;

                    const columnSiblings = nodes.filter(n => {
                        if (n.type !== 'note') return false;
                        if (n.parentId !== targetKanban.id) return false;
                        if (n.id === node.id) return false;
                        const d = n.data as any;
                        return d.status === newStatus;
                    });

                    columnSiblings.sort((a, b) => a.position.y - b.position.y);
                    const lastSibling = columnSiblings[columnSiblings.length - 1];

                    const colIndex = kanbanData.columns.findIndex((c: any) => c.statusValue === newStatus);
                    const exactColWidth = ((targetKanban.measured?.width ?? 800) - 48 - (20 * (kanbanData.columns.length - 1))) / kanbanData.columns.length;

                    let targetWidth = 112;
                    let targetHeight = 112;
                    let targetViewMode = 'icon';

                    const canFitMedium = exactColWidth >= 240;
                    const currentNodeWidth = node.style?.width as number || 112;

                    if (canFitMedium && currentNodeWidth >= 224) {
                        targetWidth = 224;
                        targetHeight = 224;
                        targetViewMode = 'medium';
                    }

                    const colXOffset = 24 + (colIndex * (exactColWidth + 20));
                    const centeredX = colXOffset + (exactColWidth - targetWidth) / 2;

                    let nextY = HEADER_OFFSET;
                    if (lastSibling) {
                        const lastSiblingH = (lastSibling.style?.height as number) || 112;
                        nextY = lastSibling.position.y + lastSiblingH + GAP;
                    }

                    setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                parentId: targetKanban.id,
                                extent: 'parent',
                                zIndex: 1001,
                                position: { x: centeredX, y: nextY },
                                style: { ...n.style, width: targetWidth, height: targetHeight },
                                data: { ...(n.data as any), viewMode: targetViewMode as any, status: newStatus }
                            };
                        }
                        return n;
                    }));
                    return;
                }
            }
        }

        if (targetNode) {
            // Guard: If dragging over current parent, ignore to prevent re-nesting/duplication
            if (targetNode.id === node.parentId) {
                restoreNodeZIndex();
                return;
            }

            const isTargetBlock = targetNode.type === 'block';
            const isTargetFused = targetNode.type === 'fused-note';
            const isTargetNote = targetNode.type === 'note';
            const isTargetKanban = targetNode.type === 'kanban';

            // CASE 1: Kanban Status Update
            if (isTargetKanban && isSourceNote) {
                handleKanbanDrop(targetNode, node, nodes, setNodes);
                return;
            }

            // CASE 2: Fusion
            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {
                handleFusionDrop(targetNode, node, event, setNodes);
                return;
            }

            // CASE 3: Nesting
            if (isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {
                handleNestingDrop(targetNode, node, event, updateNodeData, setNodes);
                return;
            }

            restoreNodeZIndex();
        } else {
            restoreNodeZIndex();
        }

        // Final sync
        if (currentParentId) {
            syncParentContent(currentParentId);
        }
    }, [getIntersectingNodes, setNodes, updateNodeData, getNode, nodes, currentParentId,
        syncParentContent, screenToFlowPosition, setInteractionState, selectedCanvasNodeIds, getViewport]);

    return {
        onNodeDragStart,
        onNodeDrag,
        onNodeDragStop,
    };
}

// Helper: Handle Kanban drop
function handleKanbanDrop(targetNode: any, node: any, nodes: AppNode[], setNodes: any) {
    const kanbanData = targetNode.data as any;
    const currentColumns = kanbanData.columns;

    if (!currentColumns || currentColumns.length === 0) return;

    const boardWidth = targetNode.measured?.width ?? (targetNode.style?.width as number) ?? 800;

    let relativeX = 0;
    if (node.parentId === targetNode.id) {
        relativeX = node.position.x;
    } else {
        relativeX = node.position.x - targetNode.position.x;
    }

    const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;
    const gap = 20;
    const padding = 24;
    const totalStep = visualColWidth + gap;

    let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);
    if (colIndex < 0) colIndex = 0;
    if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

    const targetCol = currentColumns[colIndex];
    const newStatus = targetCol.statusValue;

    const GAP = 16;
    const HEADER_OFFSET = 130;

    const columnSiblings = nodes.filter(n => {
        if (n.type !== 'note') return false;
        if (n.parentId !== targetNode.id) return false;
        if (n.id === node.id) return false;
        const d = n.data as any;
        return d.status === newStatus;
    });

    columnSiblings.sort((a, b) => a.position.y - b.position.y);
    const lastSibling = columnSiblings[columnSiblings.length - 1];

    let targetWidth = 112;
    let targetHeight = 112;
    let targetViewMode = 'icon';

    const canFitMedium = visualColWidth >= 240;
    const currentNodeWidth = node.style?.width as number || 112;

    if (canFitMedium && currentNodeWidth >= 224) {
        targetWidth = 224;
        targetHeight = 224;
        targetViewMode = 'medium';
    }

    const colXOffset = 24 + (colIndex * (visualColWidth + 20));
    // Free-form: keep raw kanban column placement (no grid snap)
    const centeredX = colXOffset + (visualColWidth - targetWidth) / 2;

    let nextY = HEADER_OFFSET;
    if (lastSibling) {
        const lastSiblingH = (lastSibling.style?.height as number) || 112;
        nextY = lastSibling.position.y + lastSiblingH + GAP;
    }

    setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
        if (n.id === node.id) {
            return {
                ...n,
                parentId: targetNode.id,
                extent: 'parent',
                zIndex: 1001,
                position: { x: centeredX, y: nextY },
                style: { ...n.style, width: targetWidth, height: targetHeight },
                data: { ...(n.data as any), viewMode: targetViewMode as any, status: newStatus }
            } as AppNode;
        }
        return n;
    }));
}

// Helper: Handle Fusion drop
function handleFusionDrop(targetNode: any, node: any, event: React.MouseEvent, setNodes: any) {
    const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];
    const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

    let insertIndex = targetContent.length;
    const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
    const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-'));

    if (blockElement) {
        const blockId = blockElement.id.replace('block-', '');
        const targetBlockIndex = targetContent.findIndex((b: any) => b.id === blockId);

        if (targetBlockIndex !== -1) {
            const rect = blockElement.getBoundingClientRect();
            const midY = rect.top + (rect.height / 2);
            insertIndex = event.clientY < midY ? targetBlockIndex : targetBlockIndex + 1;
        }
    }

    const newContent = [
        ...targetContent.slice(0, insertIndex),
        ...sourceContent,
        ...targetContent.slice(insertIndex)
    ];

    const isStandalone = (node.data as any).isStandaloneBlock || (targetNode.data as any).isStandaloneBlock;

    // Default fused note size: 8 units wide × 4 units tall (432×208)
    const DEFAULT_FUSED_WIDTH = 432; // 8 * 56 - 16
    const DEFAULT_FUSED_HEIGHT = 208; // 4 * 56 - 16

    setNodes((nds: AppNode[]) => {
        const filtered = nds.filter(n => n.id !== node.id);
        return filtered.map(n => {
            if (n.id === targetNode.id) {
                // If target already is a fused-note with manual dimensions, keep them;
                // otherwise apply the 8×4 default
                const currentWidth = n.style?.width as number | undefined;
                const currentHeight = n.style?.height as number | undefined;
                const isAlreadyFused = n.type === 'fused-note';
                const keepWidth = isAlreadyFused && typeof currentWidth === 'number' ? currentWidth : DEFAULT_FUSED_WIDTH;
                const keepHeight = isAlreadyFused && typeof currentHeight === 'number' ? currentHeight : DEFAULT_FUSED_HEIGHT;

                return {
                    ...n,
                    type: 'fused-note',
                    style: { ...n.style, width: keepWidth, height: keepHeight },
                    data: {
                        ...n.data,
                        content: newContent,
                        lastFusedAt: Date.now(),
                        ...(isStandalone ? { isStandaloneBlock: true } : {})
                    }
                };
            }
            return n;
        });
    });
}

// Helper: Handle Nesting drop
function handleNestingDrop(
    targetNode: any,
    node: any,
    event: React.MouseEvent,
    updateNodeData: any,
    setNodes: any
) {
    const isSourceNote = node.type === 'note';

    if (isSourceNote) {
        const pageBlock = {
            id: uuidv4(),
            type: 'page',
            content: node.data.label || 'Untitled Page',
            metadata: { nodeId: node.id }
        };

        const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

        let insertIndex = targetContent.length;
        const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
        const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-'));

        if (blockElement) {
            const blockId = blockElement.id.replace('block-', '');
            const targetBlockIndex = targetContent.findIndex((b: any) => b.id === blockId);
            if (targetBlockIndex !== -1) {
                const rect = blockElement.getBoundingClientRect();
                const midY = rect.top + (rect.height / 2);
                insertIndex = event.clientY < midY ? targetBlockIndex : targetBlockIndex + 1;
            }
        }

        updateNodeData(targetNode.id, {
            content: [
                ...targetContent.slice(0, insertIndex),
                pageBlock,
                ...targetContent.slice(insertIndex)
            ]
        });

        setNodes((nds: AppNode[]) => nds.map((n: AppNode) => {
            if (n.id === node.id) {
                return {
                    ...n,
                    parentId: targetNode.id,
                    extent: 'parent',
                    position: { x: 0, y: 0 },
                    style: n.style
                };
            }
            return n;
        }));
        return;
    }

    // For fused/block sources
    const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];

    if (sourceContent.length > 0) {
        const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

        let insertIndex = targetContent.length;
        const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
        const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-'));

        if (blockElement) {
            const blockId = blockElement.id.replace('block-', '');
            const targetBlockIndex = targetContent.findIndex((b: any) => b.id === blockId);
            if (targetBlockIndex !== -1) {
                const rect = blockElement.getBoundingClientRect();
                const midY = rect.top + (rect.height / 2);
                insertIndex = event.clientY < midY ? targetBlockIndex : targetBlockIndex + 1;
            }
        }

        const newTargetContent = [
            ...targetContent.slice(0, insertIndex),
            ...sourceContent,
            ...targetContent.slice(insertIndex)
        ];

        setNodes((nds: AppNode[]) => {
            const filtered = nds.filter(n => n.id !== node.id);
            return filtered.map(n => {
                if (n.id === targetNode.id) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            content: newTargetContent,
                            lastFusedAt: Date.now()
                        }
                    } as any;
                }
                return n;
            });
        });
    }
}
