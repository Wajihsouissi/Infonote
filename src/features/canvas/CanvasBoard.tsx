import { useMemo, useEffect, useCallback, useState, Suspense, lazy, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ReactFlow,
    Controls,
    useReactFlow,
    MiniMap,
} from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { useStore } from '../../store/useStore';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { CustomGrid } from './CustomGrid';
import { BottomMenu } from '../ui/BottomMenu';
import { SidePanel } from '../ui/SidePanel';
import { FullscreenModal } from '../ui/FullscreenModal';
import { CenterModal } from '../ui/CenterModal';
import { MetadataMenu } from '../ui/MetadataMenu';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
// Lazy load KanbanConfigModal
const KanbanConfigModal = lazy(() => import('../kanban/KanbanConfigModal').then(module => ({ default: module.KanbanConfigModal })));

import type { BlockType } from "../editor/types";
import type { AppNode } from "../../types";
import styles from "./CanvasBoard.module.css";
import { CANVAS_HORIZONTAL_GAP, CANVAS_VERTICAL_GAP, MAX_ITEMS_PER_ROW, ICON_SIZE, BASE_UNIT } from '../../config/layout';

export function CanvasBoard() {
    // Atomic Selectors to prevent unnecessary re-renders
    const nodes = useStore(useCallback(s => s.nodes, []));
    const edges = useStore(useCallback(s => s.edges, []));
    const currentParentId = useStore(useCallback(s => s.currentParentId, []));
    const interactionState = useStore(useCallback(s => s.interactionState, []));

    // Actions (stable references, no need for selectors typically if store is stable, 
    // but better to match pattern or use getState() inside callbacks if appropriate.
    // However, zustand actions are stable. We can pluck them or just use the hook for actions only if we are careful).
    // Actually, simply plucking actions from the store hook without selector subscribes to the WHOLE store.
    // So we MUST use specific selectors even for functions if we use the hook this way.

    const onNodesChange = useStore(useCallback(s => s.onNodesChange, []));
    const onEdgesChange = useStore(useCallback(s => s.onEdgesChange, []));
    const onConnect = useStore(useCallback(s => s.onConnect, []));
    const addNode = useStore(useCallback(s => s.addNode, []));
    const setNodesStore = useStore(useCallback(s => s.setNodes, []));
    const updateNodeData = useStore(useCallback(s => s.updateNodeData, []));
    const setInteractionState = useStore(useCallback(s => s.setInteractionState, []));
    const extractPageFromBlock = useStore(useCallback(s => s.extractPageFromBlock, []));
    const syncParentContent = useStore(useCallback(s => s.syncParentContent, []));

    // Throttling Ref
    const lastDragCheck = useRef(0);

    const { fitView, screenToFlowPosition, getIntersectingNodes, deleteElements, getNode } = useReactFlow();

    // Filter nodes and edges for the current view
    const visibleNodes = useMemo(() => {
        // 1. Identify "Root" nodes for this view level
        const rootNodes = nodes.filter(n =>
            (n.parentId === undefined && currentParentId === null) ||
            n.parentId === currentParentId
        );

        // 2. Identify "Child" nodes that should also be visible
        // We ONLY show children if they belong to specific container types that rely on ReactFlow's nesting (e.g. explicit Groups).
        // Standard 'note' cards in this app act as opaque pages/folders, so we do NOT show their children on the canvas
        // unless we navigate INTO them.

        // This fixes the "duplication" issue where children appeared on top of parent icons.

        // If we implement "Canvas Groups" later, we can whitelist them here.
        // For now, we return only the nodes for the current navigation level.

        // STRIP PARENT ID for View Roots
        // When we navigate INTO a parent (currentParentId), that parent is NOT rendered.
        // Therefore, its children must effectively become "Root" nodes for the renderer.
        // If we leave `parentId` set, React Flow crashes because it can't find the parent in `nodes`.
        return rootNodes.map(n => {
            if (n.parentId === currentParentId) {
                return { ...n, parentId: undefined };
            }
            return n;
        });
    }, [nodes, currentParentId]);

    // Update edges
    const visibleEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        return edges.filter(e =>
            visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        );
    }, [edges, visibleNodes]);

    const nodeTypes = useMemo(() => ({
        note: NoteCard,
        block: BlockNode,
        'fused-note': FusedNoteNode,
        kanban: KanbanNodeComponent
    }), []);

    const activeParentNode = useMemo(() =>
        nodes.find(n => n.id === currentParentId),
        [nodes, currentParentId]
    );

    // Track theme for ReactFlow colorMode
    const theme = useStore(s => s.theme);

    // --- REF ACTORED PERSISTENCE LOGIC ---

    // 1. LOAD CONTENT (Forward Sync) - "Mount" Logic
    // Runs once when currentParentId changes to populate the canvas.
    const hasLoadedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!activeParentNode || activeParentNode.type !== 'note') {
            hasLoadedRef.current = null; // CRITICAL: Reset loaded state when leaving a note
            return;
        }
        if (hasLoadedRef.current === activeParentNode.id) return; // Prevent double load

        // Determine if we need to load content
        // Strict Rule: If we just navigated here, we MUST regenerate the transient view.
        // We do this by checking if there are ANY visible nodes for this parent.
        // If the store is already populated (e.g. from history), we might want to keep it?
        // User requested "remove temporary info", suggesting a fresh reconstruction is better.

        const content = activeParentNode.data.content || [];
        console.log("CanvasBoard: Loading Content", { parentId: activeParentNode.id, items: Array.isArray(content) ? content.length : 0 });

        // A. EXPLOSION LOGIC
        const itemsToRender: Array<{ type: 'fused' | 'note', data: any }> = [];
        let currentChunk: any[] = [];
        const splitterTypes = ['heading1', 'heading2', 'heading3', 'toggle', 'divider'];

        if (Array.isArray(content)) {
            content.forEach((block: any) => {
                if (block.type === 'page') {
                    if (currentChunk.length > 0) {
                        itemsToRender.push({ type: 'fused', data: currentChunk });
                        currentChunk = [];
                    }
                    itemsToRender.push({ type: 'note', data: block });
                    return;
                }

                if (splitterTypes.includes(block.type)) {
                    if (currentChunk.length > 0) {
                        itemsToRender.push({ type: 'fused', data: currentChunk });
                        currentChunk = [];
                    }
                }
                currentChunk.push(block);
            });
        }
        if (currentChunk.length > 0) {
            itemsToRender.push({ type: 'fused', data: currentChunk });
        }

        // B. NODE GENERATION
        let currentY = 0;
        let currentX = 0;
        let itemsInRow = 0;
        let currentRowMaxHeight = 0;

        const newNodes: any[] = [];

        // Deduplication: Check for existing nodes to preserve identities and positions
        const existingNodesMap = new Map(
            useStore.getState().nodes
                .filter(n => n.parentId === activeParentNode.id)
                .map(n => [n.id, n])
        );

        const missingLinks: { blockId: string; nodeId: string }[] = [];

        itemsToRender.forEach((item) => {
            const isNote = item.type === 'note';

            // Stable ID Generation
            let nodeId: string;
            if (isNote) {
                nodeId = item.data.metadata?.nodeId || uuidv4();
            } else {
                // Use first block ID for fused note stability
                const firstBlock = item.data[0];
                nodeId = firstBlock ? `fused-${firstBlock.id}` : uuidv4();
            }

            const existing = existingNodesMap.get(nodeId);

            if (existing) {
                // Finish current row to avoid overlap with existing items
                if (itemsInRow > 0) {
                    currentY += currentRowMaxHeight + CANVAS_VERTICAL_GAP;
                    currentX = 0;
                    itemsInRow = 0;
                    currentRowMaxHeight = 0;
                }

                // KEEP EXISTING (Preserve position/state)
                const updatedNode = {
                    ...existing,
                    zIndex: isNote ? 10 : 5,
                    data: isNote ? {
                        ...existing.data,
                        label: item.data.content
                    } : {
                        ...existing.data,
                        content: item.data
                    }
                };
                newNodes.push(updatedNode);

                // Update flow cursor to be below this existing node
                const h = existing.style?.height;
                const nodeHeight = (typeof h === 'number' ? h : parseInt(h as string)) || (isNote ? ICON_SIZE : 200);
                currentY = Math.max(currentY, existing.position.y + nodeHeight + CANVAS_VERTICAL_GAP);
            } else {
                // NEW ITEM - Place in Grid
                if (itemsInRow >= MAX_ITEMS_PER_ROW) {
                    currentY += currentRowMaxHeight + CANVAS_VERTICAL_GAP;
                    currentX = 0;
                    itemsInRow = 0;
                    currentRowMaxHeight = 0;
                }

                const width = isNote ? ICON_SIZE : 350;
                const estimatedHeight = isNote ? ICON_SIZE : Math.max(120, item.data.length * 45);

                const node = {
                    id: nodeId,
                    type: isNote ? 'note' : 'fused-note',
                    position: { x: currentX, y: currentY },
                    zIndex: isNote ? 10 : 5,
                    data: isNote ? {
                        label: item.data.content,
                        viewMode: 'icon',
                        icon: 'FileText',
                        date: new Date().toISOString()
                    } : {
                        content: item.data
                    },
                    style: {
                        width,
                        height: isNote ? estimatedHeight : 'auto' as any
                    },
                    parentId: activeParentNode.id
                };

                if (isNote && !item.data.metadata?.nodeId) {
                    missingLinks.push({ blockId: item.data.id, nodeId });
                }

                newNodes.push(node);
                currentX += width + CANVAS_HORIZONTAL_GAP;
                currentRowMaxHeight = Math.max(currentRowMaxHeight, estimatedHeight);
                itemsInRow++;
            }
        });



        // UPDATE STORE 
        useStore.setState(state => ({
            nodes: [
                ...state.nodes.filter(n => n.parentId !== activeParentNode.id), // Keep others
                ...newNodes // Add new
            ]
        }));

        // CRITICAL: Patch Parent Content if we created new links
        if (missingLinks.length > 0) {
            console.log("CanvasBoard: Patching Missing Links", missingLinks);
            const parent = useStore.getState().nodes.find(n => n.id === activeParentNode.id);
            if (parent && Array.isArray((parent.data as any).content)) {

                const newContent = (parent.data as any).content.map((b: any) => {
                    const link = missingLinks.find(l => l.blockId === b.id);
                    if (link) {
                        return { ...b, metadata: { ...b.metadata || {}, nodeId: link.nodeId } };
                    }
                    return b;
                });

                // Update parent without triggering full sync loop?
                // Actually, we WANT to persist this to the parent node.
                // updateNodeData triggers syncParentContent for the user actions, but for this...
                // If we use updateNodeData, it will trigger syncParentContent(grandParent).
                // It WON'T trigger syncParentContent(parent) (Backwards).
                updateNodeData(activeParentNode.id, { content: newContent });
            }
        }

        hasLoadedRef.current = activeParentNode.id;
        setTimeout(() => fitView({ duration: 800 }), 50);

    }, [activeParentNode?.id]); // Only run on ID change


    // 2. AUTO-SAVE (Reverse Sync) - "Update" Logic
    // Runs when visible content changes to persist back to parent.
    // 2. AUTO-SAVE REMOVED (Replaced by Store Action Sync)
    // The store now handles 'syncParentContent' triggers on every 'updateNodeData' and 'onNodesChange'.
    // This ensures immediate, dynamic persistence without timer-based effects here.



    // Drop Handlers
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const blockDataJson = event.dataTransfer.getData('application/infonote-block-data');
            const type = event.dataTransfer.getData('application/reactflow-block-type') as BlockType;

            const rawPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Snap drop position to grid (BASE_UNIT = 56)
            const position = {
                x: Math.round(rawPosition.x / BASE_UNIT) * BASE_UNIT,
                y: Math.round(rawPosition.y / BASE_UNIT) * BASE_UNIT
            };

            let blocksToAdd: any[] = [];
            let sourceNodeId: string | null = null;
            let draggedBlockId: string | null = null;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    if (parsed.block) {
                        blocksToAdd = [parsed.block];
                        sourceNodeId = parsed.sourceNodeId;
                        draggedBlockId = parsed.block.id;
                    }
                } catch (e) {
                    console.error("Failed to parse block data", e);
                }
            } else if (type) {
                blocksToAdd = [{
                    id: uuidv4(),
                    type: type,
                    content: ''
                }];
            } else {
                return;
            }

            const dropRect = {
                x: position.x - 10,
                y: position.y - 10,
                width: 20,
                height: 20
            };

            const intersections = getIntersectingNodes(dropRect as any);
            const targetNode = intersections.find(n =>
                (n.type === 'block' || n.type === 'fused-note' || n.type === 'note') &&
                n.id !== sourceNodeId
            );

            if (targetNode) {
                const currentContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                updateNodeData(targetNode.id, {
                    content: [...currentContent, ...blocksToAdd]
                });

                if (targetNode.type === 'block') {
                    // Convert block to fused-note by updating its data
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, ...blocksToAdd]
                    });

                    // Update the node type and style separately to avoid complex typing
                    const updatedNodes = nodes.map(n => {
                        if (n.id === targetNode.id) {
                            return {
                                ...n,
                                type: 'fused-note' as const,
                                style: { ...n.style, height: 'auto' }
                            } as AppNode;
                        }
                        return n;
                    });
                    setNodesStore(updatedNodes);
                }

                if (sourceNodeId && draggedBlockId) {
                    const sourceNode = nodes.find(n => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const newContent = (sourceNode.data as any).content.filter((b: any) => b.id !== draggedBlockId);
                        updateNodeData(sourceNodeId, { content: newContent });

                        if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }

            } else {

                // SPECIAL LOGIC: Dropping a 'page' block onto the canvas -> Convert to Icon Card
                // Use Store Action for atomic update
                if (blocksToAdd.length === 1 && blocksToAdd[0].type === 'page') {
                    console.log("CanvasBoard: Detected Page Drop", blocksToAdd[0]);
                    extractPageFromBlock(blocksToAdd[0], position, sourceNodeId || undefined);
                    return;
                }

                // Standard Logic for other blocks -> Create Block Container
                const BLOCK_WIDTH = 300;
                const BLOCK_HEIGHT = 100;
                const centeredPosition = {
                    x: position.x - (BLOCK_WIDTH / 2),
                    y: position.y - (BLOCK_HEIGHT / 2),
                };

                addNode('block', centeredPosition, {
                    content: blocksToAdd,
                }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT });

                if (sourceNodeId && draggedBlockId) {
                    const sourceNode = nodes.find(n => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const newContent = (sourceNode.data as any).content.filter((b: any) => b.id !== draggedBlockId);
                        updateNodeData(sourceNodeId, { content: newContent });

                        if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }
            }
        },
        [screenToFlowPosition, addNode, nodes, updateNodeData, getIntersectingNodes, deleteElements, setNodesStore, currentParentId],
    );

    // Grid config
    const snapGrid: [number, number] = [56, 56];

    // --- Drag In Logic (Canvas -> Kanban) ---
    const onNodeDrag = useCallback((_event: React.MouseEvent, node: any) => {
        // Throttle to max once per 100ms to reduce INP
        const now = Date.now();
        if (now - lastDragCheck.current < 100) return;
        lastDragCheck.current = now;

        // Only care if dragging a regular note
        if (node.type !== 'note') {
            if (interactionState.hoveredKanbanColumn) {
                setInteractionState({ hoveredKanbanColumn: null });
            }
            return;
        }

        const intersections = getIntersectingNodes(node);
        // Find a Kanban board we are hovering over
        const targetKanban = intersections.find(n => n.type === 'kanban');

        if (targetKanban) {
            // Calculate column
            const kanbanData = targetKanban.data as any;
            const currentColumns = kanbanData.columns;

            if (currentColumns && currentColumns.length > 0) {
                const boardWidth = targetKanban.measured?.width ?? (targetKanban.style?.width as number) ?? 800;

                // Calculate relative position based on absolute node position vs absolute board position
                const relativeX = node.position.x - targetKanban.position.x;

                const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;
                const gap = 20;
                const padding = 24;
                const totalStep = visualColWidth + gap;

                let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);

                if (colIndex < 0) colIndex = 0;
                if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

                const targetCol = currentColumns[colIndex];

                // Update shared state only if changed
                if (
                    interactionState.hoveredKanbanColumn?.kanbanId !== targetKanban.id ||
                    interactionState.hoveredKanbanColumn?.columnId !== targetCol.statusValue
                ) {
                    setInteractionState({
                        hoveredKanbanColumn: {
                            kanbanId: targetKanban.id,
                            columnId: targetCol.statusValue
                        }
                    });
                }
                return;
            }
        }

        // If no intersection or not kanban, clear state
        if (interactionState.hoveredKanbanColumn) {
            setInteractionState({ hoveredKanbanColumn: null });
        }

    }, [getIntersectingNodes, interactionState.hoveredKanbanColumn, setInteractionState]);


    const onNodeDragStop = useCallback((_event: React.MouseEvent, node: any) => {
        // Capture state before clearing
        const hoveredColumn = interactionState.hoveredKanbanColumn;
        setInteractionState({ hoveredKanbanColumn: null });

        const isSourceBlock = node.type === 'block';
        const isSourceFused = node.type === 'fused-note';
        const isSourceNote = node.type === 'note';

        if (!isSourceBlock && !isSourceFused && !isSourceNote) return;

        const intersections = getIntersectingNodes(node);
        const targetNode = intersections.find(n => n.id !== node.id);

        // CASE 0: DRAG OUT - Un-nesting
        // Check if we are dragging a nested node onto the canvas background (targetNode is null/undefined)
        // AND the node currently has a parent.
        if (!targetNode && node.parentId) {
            const parentNode = getNode(node.parentId);

            if (parentNode) {
                // EJECT FROM PARENT
                // Convert Relative Position to Absolute Position
                // Absolute = ParentAbsolute + Relative
                const absPos = {
                    x: parentNode.position.x + node.position.x,
                    y: parentNode.position.y + node.position.y
                };

                setNodesStore(nds => nds.map(n => {
                    if (n.id === node.id) {
                        return {
                            ...n,
                            parentId: undefined, // Clear Parent
                            extent: undefined,   // Clear boundary
                            zIndex: 10,          // Reset Z-Index
                            position: absPos,    // Use new absolute position
                            // Keep style/size as is? Or reset? 
                            // The user probably wants it to stay 'Icon' size or maybe return to previous?
                            // For now, let's keep it as is, user can resize.
                        };
                    }
                    return n;
                }));
            }
            return;
        }

        // Use hoveredColumn from state if available for Kanban drop
        if (hoveredColumn && isSourceNote) {
            const targetKanban = getNode(hoveredColumn.kanbanId);

            if (targetKanban) {
                const kanbanData = targetKanban.data as any;
                const targetCol = kanbanData.columns.find((c: any) => c.statusValue === hoveredColumn.columnId);

                if (targetCol) {
                    const newStatus = targetCol.statusValue;

                    // STACKING LOGIC
                    const GAP = 16;
                    const HEADER_OFFSET = 130;

                    // Find siblings in THIS specific column
                    const columnSiblings = nodes.filter(n => {
                        if (n.type !== 'note') return false;
                        if (n.parentId !== targetKanban.id) return false;
                        if (n.id === node.id) return false;

                        const d = n.data as any;
                        return d.status === newStatus;
                    });

                    columnSiblings.sort((a, b) => a.position.y - b.position.y);
                    const lastSibling = columnSiblings[columnSiblings.length - 1];

                    // Center X in Col
                    // We need to know the index of the column
                    const colIndex = kanbanData.columns.findIndex((c: any) => c.statusValue === newStatus);

                    // Re-calc exact visual dimensions
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
                    } else {
                        targetWidth = 112;
                        targetHeight = 112;
                        targetViewMode = 'icon';
                    }

                    const colXOffset = 24 + (colIndex * (exactColWidth + 20));
                    const centeredX = colXOffset + (exactColWidth - targetWidth) / 2;

                    let nextY = HEADER_OFFSET;
                    if (lastSibling) {
                        const lastSiblingH = (lastSibling.style?.height as number) || 112;
                        nextY = lastSibling.position.y + lastSiblingH + GAP;
                    }

                    setNodesStore((nds: AppNode[]) => nds.map((n: AppNode) => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                parentId: targetKanban.id,
                                extent: 'parent',
                                zIndex: 1001,
                                position: { x: centeredX, y: nextY },
                                style: {
                                    ...n.style,
                                    width: targetWidth,
                                    height: targetHeight
                                },
                                data: {
                                    ...(n.data as any),
                                    viewMode: targetViewMode as any,
                                    status: newStatus
                                }
                            };
                        }
                        return n;
                    }));
                    return;
                }
            }
        }

        if (targetNode) {
            const isTargetBlock = targetNode.type === 'block';
            const isTargetFused = targetNode.type === 'fused-note';
            const isTargetNote = targetNode.type === 'note';
            const isTargetKanban = targetNode.type === 'kanban';

            // CASE 1: Kanban Status Update (Note -> Kanban) (NESTING LOGIC V3)
            if (isTargetKanban && isSourceNote) {
                const kanbanData = targetNode.data as any;
                const currentColumns = kanbanData.columns;

                if (currentColumns && currentColumns.length > 0) {
                    const boardWidth = targetNode.measured?.width ?? (targetNode.style?.width as number) ?? 800;

                    // IF node was already inside, its position is relative.
                    // IF node was outside, position is absolute.
                    // BUT: ReactFlow updates `node.position` to be RELATIVE to the new parent if we were dragging it? 
                    // No, when dragging, ReactFlow keeps it consistent with where it currently lives.
                    // If it WAS inside, `node.position` is already relative to the board.
                    // If it WAS outside, `node.position` is absolute.
                    // However, `getIntersectingNodes` works in absolute coords usually?

                    // We need relative visual coordinate to calculate column index.
                    // Case A: Dragging from Outside -> targetNode is absolute, node is absolute. Relative = Node - Target.
                    // Case B: Dragging from Inside -> targetNode is absolute, node is relative (to target). relative = node.position.

                    let relativeX = 0;
                    if (node.parentId === targetNode.id) {
                        // Dragging within board
                        relativeX = node.position.x;
                    } else {
                        // Dragging from outside (or another parent)
                        relativeX = node.position.x - targetNode.position.x;
                    }

                    // Calculate visual dimensions first for accurate detection
                    const visualColWidth = (boardWidth - 48 - (20 * (currentColumns.length - 1))) / currentColumns.length;

                    // Improved Col Index Calculation (Gap-Aware)
                    // relativeX - Padding / (ColWidth + Gap)
                    const gap = 20;
                    const padding = 24;
                    const totalStep = visualColWidth + gap;

                    let colIndex = Math.floor((relativeX - padding + (gap / 2)) / totalStep);
                    // Added gap/2 offset so dragging into the gap favors the closer column? 
                    // Actually simple floor is usually fine, or rounds to 'previous' if in gap.
                    // Let's stick to standard floor but clamp.

                    if (colIndex < 0) colIndex = 0;
                    if (colIndex >= currentColumns.length) colIndex = currentColumns.length - 1;

                    const targetCol = currentColumns[colIndex];
                    const newStatus = targetCol.statusValue;

                    // STACKING LOGIC

                    const GAP = 16;
                    const HEADER_OFFSET = 130;

                    // Find siblings in THIS specific column
                    const columnSiblings = nodes.filter(n => {
                        if (n.type !== 'note') return false;
                        if (n.parentId !== targetNode.id) return false; // Must be child of this board
                        if (n.id === node.id) return false; // Exclude self

                        const d = n.data as any;
                        return d.status === newStatus;
                    });

                    // Sort siblings by Y position
                    columnSiblings.sort((a, b) => a.position.y - b.position.y);
                    const lastSibling = columnSiblings[columnSiblings.length - 1];



                    // Calculate X to center

                    // FLEXIBLE CARD SIZING LOGIC
                    // Check if 'medium' (224px) fits in the column with some padding
                    // visualColWidth must be > 224 + padding (e.g. 16px)
                    let targetWidth = 112; // Default Icon
                    let targetHeight = 112;
                    let targetViewMode = 'icon';

                    // If existing node has a viewMode that fits, keep it?
                    // Or auto-expand if column is wide?
                    // Let's implement: If column > 240px, allow 'medium' (224px).
                    // If the user's card was already 'expanded', we might shrink it to 'medium' or 'icon'.

                    // Check user intent: if they dropped a 'medium' card, try to keep it 'medium'.
                    // If they dropped an 'expanded' card, shrink to 'medium'.
                    // If they dropped an 'icon', keep 'icon' OR expand to 'medium' if we want auto-fill?
                    // Plan says: "allow medium... if it fits". 

                    const canFitMedium = visualColWidth >= 240;
                    const currentNodeWidth = node.style?.width as number || 112;

                    if (canFitMedium && currentNodeWidth >= 224) {
                        targetWidth = 224;
                        targetHeight = 224;
                        targetViewMode = 'medium';
                    } else {
                        // Default to Icon
                        targetWidth = 112;
                        targetHeight = 112;
                        targetViewMode = 'icon';
                    }

                    const colXOffset = 24 + (colIndex * (visualColWidth + 20)); // padding + gaps
                    const centeredX = colXOffset + (visualColWidth - targetWidth) / 2;

                    // Re-calculate Y based on stack with correct Heights
                    // Sort siblings using THIS specific logic since we are about to update THIS node

                    // We need to re-fetch siblings but this time considering that unrelated siblings might have different heights.
                    // But we only care about the siblings *above* where we dropped?
                    // Actually, for a simple Kanban, we might just append to bottom or use the sort order.
                    // The robust way is to re-layout the whole column, but for `onNodeDragStop` we usually just place THIS node.
                    // However, if we change specific node size, we might overlap. 
                    // Let's stick to appending to bottom or simple Y sort for now as previously implemented.
                    // The previous impl found `lastSibling`. 

                    // Recalculate `lastSibling` bottom using its ACTUAL height
                    let nextY = HEADER_OFFSET;
                    if (lastSibling) {
                        const lastSiblingH = (lastSibling.style?.height as number) || 112;
                        nextY = lastSibling.position.y + lastSiblingH + GAP;
                    }

                    // Update Node
                    const updatedNodesForKanban = nodes.map(n => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                parentId: targetNode.id,
                                extent: 'parent',
                                zIndex: 1001,
                                position: { x: centeredX, y: nextY },
                                style: {
                                    ...n.style,
                                    width: targetWidth,
                                    height: targetHeight
                                },
                                data: {
                                    ...(n.data as any),
                                    viewMode: targetViewMode as any,
                                    status: newStatus
                                }
                            } as AppNode;
                        }
                        return n;
                    });
                    setNodesStore(updatedNodesForKanban);
                }
                return;
            }

            // CASE 2: Fusion (Block/Fused -> Block/Fused)
            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {

                const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];
                const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                const newContent = [...targetContent, ...sourceContent];

                setNodesStore((nds) => nds.map((n) => {
                    if (n.id === targetNode.id) {
                        return {
                            ...n,
                            type: 'fused-note',
                            style: {
                                ...n.style,
                                height: 'auto',
                            },
                            data: {
                                ...n.data,
                                content: newContent,
                            }
                        };
                    }
                    return n;
                }));

                setTimeout(() => deleteElements({ nodes: [{ id: node.id }] }), 0);
            }
            // CASE 3: Nesting (Block/Fused/Note -> Note Card)
            else if (isTargetNote && (isSourceFused || isSourceNote || isSourceBlock)) {

                if (isSourceNote) {
                    const pageBlock = {
                        id: uuidv4(),
                        type: 'page',
                        content: node.data.label || 'Untitled Page',
                        metadata: { nodeId: node.id }
                    };

                    const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

                    updateNodeData(targetNode.id, {
                        content: [...targetContent, pageBlock]
                    });

                    setNodesStore((nds) => nds.map((n) => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                parentId: targetNode.id,
                                extent: 'parent',
                                position: { x: 0, y: 0 }
                            };
                        }
                        return n;
                    }));

                    return;
                }

                const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];

                if (sourceContent.length > 0) {
                    const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];

                    updateNodeData(targetNode.id, {
                        content: [...targetContent, ...sourceContent]
                    });

                    setTimeout(() => deleteElements({ nodes: [{ id: node.id }] }), 0);
                }
            }
        }

        // Final Sync to ensure parent content order matches new positions
        if (currentParentId) {
            syncParentContent(currentParentId);
        }
    }, [getIntersectingNodes, deleteElements, setNodesStore, updateNodeData, getNode, nodes, currentParentId, syncParentContent]); // Added currentParentId, syncParentContent

    // Cleanup ref on unmount
    useEffect(() => {
        return () => {
            lastDragCheck.current = 0;
        };
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.canvasArea}>
                <ThemeSwitcher />
                <div style={{ position: 'absolute', top: 20, left: 30, zIndex: 100 }}>
                    <Breadcrumbs />
                </div>
                {activeParentNode && (
                    <MetadataMenu nodeId={activeParentNode.id} />
                )}
                <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView={!currentParentId}
                    colorMode={theme}
                    minZoom={0.05}
                    maxZoom={2}
                    snapToGrid={true}
                    snapGrid={snapGrid}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onPaneClick={() => {
                        // Clear native text selection
                        window.getSelection()?.removeAllRanges();
                        // Blur any active input/contenteditable to stop typing
                        if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                        }
                    }}
                >
                    {/* Visual Drop Zone for Kanban Drag Out - REMOVED */}
                    <CustomGrid />
                    <Controls className={styles.canvasControls} />
                    <MiniMap
                        position="bottom-right"
                        nodeColor="var(--color-primary)"
                        maskColor="var(--glass-bg)"
                        className={styles.canvasMiniMap}
                    />
                </ReactFlow>
            </div>

            <BottomMenu />
            <SidePanel />
            <FullscreenModal />
            <CenterModal />
            <Suspense fallback={null}>
                <KanbanConfigModal />
            </Suspense>
        </div>
    );
}
