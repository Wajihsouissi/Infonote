import { useMemo, useEffect, useCallback, useState, Suspense, lazy, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ReactFlow,
    Controls,
    useReactFlow,
    MiniMap,
    SelectionMode,
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

// Debug flag
const DEBUG = import.meta.env.DEV;

// Selection box state type - now uses screen coordinates for visual and flow coordinates for detection
interface SelectionBox {
    // Screen coordinates (for visual rendering)
    screenStartX: number;
    screenStartY: number;
    screenCurrentX: number;
    screenCurrentY: number;
    // Flow coordinates (for node detection)
    flowStartX: number;
    flowStartY: number;
    flowCurrentX: number;
    flowCurrentY: number;
}

export function CanvasBoard() {
    // Atomic Selectors to prevent unnecessary re-renders
    const nodes = useStore(useCallback(s => s.nodes, []));
    const edges = useStore(useCallback(s => s.edges, []));
    const currentParentId = useStore(useCallback(s => s.currentParentId, []));
    const interactionState = useStore(useCallback(s => s.interactionState, []));
    const selectedCanvasNodeIds = useStore(useCallback(s => s.selectedCanvasNodeIds, []));

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
    const toggleCanvasNodeSelection = useStore(useCallback(s => s.toggleCanvasNodeSelection, []));
    const setSelectedCanvasNodeIds = useStore(useCallback(s => s.setSelectedCanvasNodeIds, []));
    const clearCanvasSelection = useStore(useCallback(s => s.clearCanvasSelection, []));

    // Throttling Ref
    const lastDragCheck = useRef(0);

    // Viewport tracking for culling
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    const lastViewportUpdate = useRef(0);

    // Box selection state
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const selectionBoxRef = useRef<HTMLDivElement>(null);
    const justFinishedBoxSelection = useRef(false); // Prevents pane click from clearing selection immediately after box select

    const { fitView, screenToFlowPosition, getIntersectingNodes, deleteElements, getNode, addNodes: reactFlowAddNodes, getNodes, getViewport } = useReactFlow();

    // Memoize root nodes for the current parent level to avoid filtering all nodes on every viewport change
    const rootNodes = useMemo(() => {
        if (DEBUG) console.log("[rootNodes] Computing for currentParentId:", currentParentId);

        return nodes.filter(n =>
            (n.parentId === undefined && currentParentId === null) ||
            n.parentId === currentParentId
        );
    }, [nodes, currentParentId]);

    // Filter nodes and edges for the current view using viewport culling
    const visibleNodes = useMemo(() => {
        // Performance: For large graphs (>100 nodes), apply viewport culling
        let culledNodes = rootNodes;
        if (rootNodes.length > 100 && viewport) {
            // Calculate visible viewport bounds with margin
            const MARGIN = 500; // Reduced from 1000px for tighter culling
            const minX = viewport.x - MARGIN;
            const maxX = viewport.x + (window.innerWidth / viewport.zoom) + MARGIN;
            const minY = viewport.y - MARGIN;
            const maxY = viewport.y + (window.innerHeight / viewport.zoom) + MARGIN;

            culledNodes = rootNodes.filter(n => {
                const nodeWidth = (n.style?.width as number) || 432;
                const nodeHeight = (n.style?.height as number) || 432;
                const nodeX = n.position.x;
                const nodeY = n.position.y;

                // Check if node intersects with viewport
                return (
                    nodeX + nodeWidth >= minX &&
                    nodeX <= maxX &&
                    nodeY + nodeHeight >= minY &&
                    nodeY <= maxY
                );
            });

            if (DEBUG) console.log("[visibleNodes] Culled:", rootNodes.length, "->", culledNodes.length);
        }

        // STRIP PARENT ID for ReactFlow rendering
        return culledNodes.map(n => {
            if (n.parentId === currentParentId) {
                return { ...n, parentId: undefined };
            }
            return n;
        });
    }, [rootNodes, currentParentId, viewport]);

    useEffect(() => {
        if (currentParentId) {
            if (DEBUG) console.log("CanvasBoard Visible Nodes:", visibleNodes.map(n => ({
                id: n.id,
                type: n.type,
                parentId: n.parentId, // Should be undefined after mapping
                realParentId: nodes.find(og => og.id === n.id)?.parentId, // Check actual store parentId
                pos: n.position
            })));
        }
    }, [currentParentId, visibleNodes, nodes]);

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
        currentParentId ? nodes.find(n => n.id === currentParentId) : null,
        [nodes, currentParentId]
    );

    // Track theme for ReactFlow colorMode
    const theme = useStore(s => s.theme);

    // --- REMOVED EXPLOSION LOGIC ---
    // Blocks now persist in the store with their parentId
    // The visibleNodes filter handles showing the right nodes for each canvas level
    // No need to "explode" parent content into temporary nodes



    // Drop Handlers
    const onDragOver = useCallback((event: React.DragEvent) => {
        const { centerPanelId, fullscreenId } = useStore.getState();
        if (centerPanelId || fullscreenId) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            // Performance: Skip logging

            const { centerPanelId, fullscreenId, currentParentId, nodes } = useStore.getState();
            if (centerPanelId || fullscreenId) {
            // Skipping due to modal
                return;
            }

            // Check if the drop landed inside a node's BlockEditor - if so, let BlockEditor handle it
            const target = event.target as HTMLElement;
            // Drop target logging disabled

            const isInsideBlockEditor = target.closest('[class*="BlockEditor"]') ||
                target.closest('[class*="editor"]') ||
                target.closest('[class*="noteArea"]') ||
                target.closest('[class*="fusedNoteNode"]') ||
                target.closest('[class*="content"]');

            // BlockEditor check result cached

            // Parse block data to check if this is a cross-node block transfer
            const blockDataJson = event.dataTransfer.getData('application/infonote-block-data');
            let hasSourceNode = false;
            let sourceNodeIdFromData: string | null = null;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    hasSourceNode = !!parsed.sourceNodeId;
                    sourceNodeIdFromData = parsed.sourceNodeId;
            // Block data parsed
                } catch (e) {
            // Parse failed
                }
            } else {
            // No block data
            }

            // Check if drop position intersects with a node (early check)
            const earlyPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const earlyDropRect = {
                x: earlyPosition.x - 10,
                y: earlyPosition.y - 10,
                width: 20,
                height: 20
            };
            const earlyIntersections = getIntersectingNodes(earlyDropRect as any);
            const earlyTargetNode = earlyIntersections.find(n =>
                (n.type === 'block' || n.type === 'fused-note' || n.type === 'note') &&
                n.id !== sourceNodeIdFromData &&
                n.id !== currentParentId
            );

            // Intersection logging disabled

            // If dropping inside a node's content area OR on a target node AND it's from another node, 
            // let BlockEditor handle it
            if ((isInsideBlockEditor || earlyTargetNode) && hasSourceNode) {
            // BlockEditor handling
                return;
            }

            // Canvas drop handling
            event.preventDefault();

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
                    if (parsed.blocks && Array.isArray(parsed.blocks)) {
                        blocksToAdd = parsed.blocks;
                        sourceNodeId = parsed.sourceNodeId;
                        draggedBlockId = null;
                    } else if (parsed.block) {
                        blocksToAdd = [parsed.block];
                        sourceNodeId = parsed.sourceNodeId;
                        draggedBlockId = parsed.block.id;
                    }
                } catch (e) {
                    console.error("Failed to parse block data", e);
                }
            } else if (type) {
                let metadata = undefined;
                try {
                    const metaJson = event.dataTransfer.getData('application/infonote-block-metadata');
                    if (metaJson) metadata = JSON.parse(metaJson);
                } catch (e) { console.error("Failed to parse metadata", e); }

                blocksToAdd = [{
                    id: uuidv4(),
                    type: type,
                    content: '', // Empty content for new blocks
                    metadata
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
                n.id !== sourceNodeId &&
                n.id !== currentParentId
            );

            // Drop event logging disabled

            if (targetNode) {
                const currentContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                updateNodeData(targetNode.id, {
                    content: [...currentContent, ...blocksToAdd],
                    lastFusedAt: Date.now()
                });

                if (targetNode.type === 'block') {
                    // Upgrade block to fused-note if needed
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, ...blocksToAdd]
                    });

                    const updatedNodes = nodes.map((n: AppNode) => {
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

                if (sourceNodeId) {
                    // Logic to cleanup source node if moving...
            // Cleanup skipped
                    const sourceNode = nodes.find((n: AppNode) => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const draggedBlockIds = blocksToAdd.map(b => b.id);
                        let newContent = (sourceNode.data as any).content.filter((b: any) => !draggedBlockIds.includes(b.id));
                        console.log("[CanvasBoard.onDrop] Source cleanup - removing blocks:", draggedBlockIds, "original:", (sourceNode.data as any).content.length, "new:", newContent.length);
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }

            } else {
                // ADDING NEW NODE TO CANVAS
                if (blocksToAdd.length === 1 && blocksToAdd[0].type === 'page') {
                    extractPageFromBlock(blocksToAdd[0], position, sourceNodeId || undefined);
                    // Standard cleanup for page extraction
                    if ((window as any).infonoteMultiDragCleanup) ((window as any).infonoteMultiDragCleanup(), delete (window as any).infonoteMultiDragCleanup);
                    window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
                    return;
                }

                const BLOCK_WIDTH = 300;
                const BLOCK_HEIGHT = 100;
                const centeredPosition = {
                    x: position.x - (BLOCK_WIDTH / 2),
                    y: position.y - (BLOCK_HEIGHT / 2),
                };

                // SIMPLE FIX: Just add directly to the store with correct parentId
                const nodeId = uuidv4();
                const targetParentId = currentParentId || undefined;

                console.log("[DND] Adding block to store:", {
                    nodeId,
                    parentId: targetParentId,
                    currentParentId,
                    blockCount: blocksToAdd.length
                });

                const newNode: AppNode = {
                    id: nodeId,
                    type: blocksToAdd.length > 1 ? 'fused-note' : 'block',
                    position: centeredPosition,
                    data: {
                        content: blocksToAdd,
                        isStandaloneBlock: true
                    },
                    style: {
                        width: blocksToAdd.length > 1 ? 350 : BLOCK_WIDTH,
                        height: blocksToAdd.length > 1 ? 'auto' as any : BLOCK_HEIGHT
                    },
                    parentId: targetParentId,
                };

                // Add directly to store - bypass onNodesChange
                useStore.setState(state => ({
                    nodes: [...state.nodes, newNode]
                }));

                if (sourceNodeId) {
            // Final cleanup
                    const sourceNode = nodes.find((n: AppNode) => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const draggedBlockIds = blocksToAdd.map(b => b.id);
                        let newContent = (sourceNode.data as any).content.filter((b: any) => !draggedBlockIds.includes(b.id));
                        console.log("[CanvasBoard.onDrop] Source cleanup - removing blocks:", draggedBlockIds, "original:", (sourceNode.data as any).content.length, "new:", newContent.length);
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }
            }
            if ((window as any).infonoteMultiDragCleanup) {
                (window as any).infonoteMultiDragCleanup();
                delete (window as any).infonoteMultiDragCleanup;
            }
            window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
        },
        [screenToFlowPosition, addNode, updateNodeData, getIntersectingNodes, deleteElements, setNodesStore, extractPageFromBlock],
    );

    // Grid config
    const snapGrid: [number, number] = [56, 56];

    const onNodeDragStart = useCallback((_event: React.MouseEvent, node: any) => {
        setInteractionState({ draggedNodeId: node.id });
        // DON'T hide the node - causes it to disappear
        // Instead, just boost z-index for better visual layering
        setNodesStore(nds => nds.map(n => n.id === node.id ? {
            ...n,
            zIndex: 10000
        } : n));

        // Safety cleanup explicitly
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            (el as HTMLElement).removeAttribute('data-external-drop-target');
        });
        document.body.classList.add('infonote-node-dragging');
    }, [setInteractionState, setNodesStore]);

    // --- Drag In Logic (Canvas -> Kanban) ---
    const onNodeDrag = useCallback((event: React.MouseEvent, node: any) => {
        // Throttle to max once per 100ms to reduce INP
        const now = Date.now();
        if (now - lastDragCheck.current < 32) return; // ~30fps for smoother feedback
        lastDragCheck.current = now;

        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = { x: mousePos.x - 1, y: mousePos.y - 1, width: 2, height: 2 };
        const intersections = getIntersectingNodes(mouseRect as any);

        // Find potential targets
        const targetKanban = intersections.find(n => n.type === 'kanban');
        const targetOther = intersections.find(n => n.id !== node.id && (n.type === 'note' || n.type === 'fused-note' || n.type === 'block'));

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

                if (
                    interactionState.hoveredKanbanColumn?.kanbanId !== targetKanban.id ||
                    interactionState.hoveredKanbanColumn?.columnId !== targetCol.statusValue
                ) {
                    setInteractionState({
                        hoveredKanbanColumn: {
                            kanbanId: targetKanban.id,
                            columnId: targetCol.statusValue
                        },
                        dropTarget: newDropTarget
                    });
                }
                return;
            }
        }

        // Clear Kanban hover if not hovering kanban anymore
        if (!targetKanban && interactionState.hoveredKanbanColumn) {
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

            // VISUAL INDICATOR LOGIC
            // Clear previous indicators first (global or scoped to target)
            document.querySelectorAll('[data-external-drop-target]').forEach(el => {
                (el as HTMLElement).removeAttribute('data-external-drop-target');
            });

            if (newDropTarget && (newDropTarget.type === 'fusion' || newDropTarget.type === 'nesting')) {
                const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
                const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-'));

                if (blockElement) {
                    const rect = blockElement.getBoundingClientRect();
                    const midY = rect.top + (rect.height / 2);
                    const position = event.clientY < midY ? 'top' : 'bottom';
                    blockElement.setAttribute('data-external-drop-target', position);
                }
            }
        }

        if (interactionState.dropTarget?.id !== newDropTarget?.id || interactionState.dropTarget?.type !== newDropTarget?.type) {
            setInteractionState({ dropTarget: newDropTarget });
        }

    }, [getIntersectingNodes, interactionState.hoveredKanbanColumn, interactionState.dropTarget, setInteractionState, screenToFlowPosition]);



    const onNodeDragStop = useCallback((event: React.MouseEvent, node: any) => {
        // Capture state before clearing
        const hoveredColumn = interactionState.hoveredKanbanColumn;

        // Clear interaction states
        setInteractionState({
            hoveredKanbanColumn: null,
            draggedNodeId: null,
            dropTarget: null
        });

        // FORCE CLEANUP of visual indicators
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            (el as HTMLElement).removeAttribute('data-external-drop-target');
        });
        document.body.classList.remove('infonote-node-dragging');

        // Helper function to restore node z-index
        const restoreNodeZIndex = () => {
            setNodesStore(nds => nds.map(n => {
                if (n.id === node.id) {
                    return {
                        ...n,
                        zIndex: 10
                    };
                }
                return n;
            }));
        };

        // Restore Z-index and visibility (OR DELETE if dropped)
        // We defer this check to see if we dropped successfully below.
        // Actually, let's restore first, and if we merged, the next setNodesStore will delete it.
        // BUT, to be atomic, we should combine operations if possible.
        // For now, let's just do the restore here as a fallback if no drop happens, 
        // OR better: handle it in the specific drop cases to avoid flicker.

        // Let's hold off on global restore here and do it inside the cases OR at end if no match.

        const isSourceBlock = node.type === 'block';
        const isSourceFused = node.type === 'fused-note';
        const isSourceNote = node.type === 'note';



        const supportsInteraction = isSourceBlock || isSourceFused || isSourceNote;

        const mousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const mouseRect = { x: mousePos.x - 1, y: mousePos.y - 1, width: 2, height: 2 };
        const intersections = getIntersectingNodes(mouseRect as any);
        const targetNode = intersections.find(n => n.id !== node.id && n.id !== currentParentId);

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

                // Calculate Insertion Index
                let insertIndex = targetContent.length; // Default to append

                const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
                const blockElement = elementsUnderCursor.find(el => el.id && el.id.startsWith('block-'));

                if (blockElement) {
                    const blockId = blockElement.id.replace('block-', '');
                    const targetBlockIndex = targetContent.findIndex((b: any) => b.id === blockId);

                    if (targetBlockIndex !== -1) {
                        const rect = blockElement.getBoundingClientRect();
                        const midY = rect.top + (rect.height / 2);
                        // If cursor is above middle, insert before. Else insert after.
                        insertIndex = event.clientY < midY ? targetBlockIndex : targetBlockIndex + 1;
                    }
                }

                // Insert source content at calculation index
                const newContent = [
                    ...targetContent.slice(0, insertIndex),
                    ...sourceContent,
                    ...targetContent.slice(insertIndex)
                ];

                // Preserve standalone flag if either node was standalone
                const isStandalone = (node.data as any).isStandaloneBlock || (targetNode.data as any).isStandaloneBlock;

                // ATOMIC UPDATE: Update Target + Delete Source
                setNodesStore((nds) => {
                    // 1. Filter out the source node (DELETE)
                    const filtered = nds.filter(n => n.id !== node.id);

                    // 2. Update the target node
                    return filtered.map(n => {
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
                                    lastFusedAt: Date.now(),
                                    ...(isStandalone ? { isStandaloneBlock: true } : {})
                                }
                            };
                        }
                        return n;
                    });
                });
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

                    // Simple append for Page nesting (or could implement index logic here too if pages are blocks)
                    // Usually pages are just appended, but let's see if we can obey index too.
                    // Assuming PageBlock is also rendered with block-id if it's in content.

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

                    setNodesStore((nds) => nds.map((n) => {
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

                    // ATOMIC UPDATE for Content Nesting
                    setNodesStore((nds) => {
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
                                } as any; // Cast to any to avoid union type discrimination issues
                            }
                            return n;
                        });
                    });
                }
            } else {
                // No Drop Target Found - Restore Node Z-Index
                restoreNodeZIndex();
            }
        } else {
            // NO TARGET NODE (Dropped on Canvas Root)
            // Restore Z-Index
            restoreNodeZIndex();
        }

        // Final Sync to ensure parent content order matches new positions
        if (currentParentId) {
            syncParentContent(currentParentId);
        }
    }, [getIntersectingNodes, deleteElements, setNodesStore, updateNodeData, getNode, nodes, currentParentId, syncParentContent, screenToFlowPosition]); // Added currentParentId, syncParentContent

    // Handle node click for multi-selection
    const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
        // Ignore clicks on interactive elements within nodes
        const target = event.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('textarea') ||
            target.closest('[contenteditable="true"]') || target.closest('a')) {
            return;
        }

        // Shift+Click for multi-selection
        if (event.shiftKey) {
            event.stopPropagation();
            toggleCanvasNodeSelection(node.id);
        } else {
            // Single click without modifiers clears selection
            if (selectedCanvasNodeIds.size > 0) {
                clearCanvasSelection();
            }
        }
    }, [toggleCanvasNodeSelection, clearCanvasSelection, selectedCanvasNodeIds.size]);

    // Clear selection when clicking pane
    const handlePaneClick = useCallback((event: React.MouseEvent) => {
        // Don't clear if we just finished a box selection
        if (selectionBox || justFinishedBoxSelection.current) return;

        // Clear native text selection
        window.getSelection()?.removeAllRanges();
        // Blur any active input/contenteditable to stop typing
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        // Clear canvas node selection
        if (selectedCanvasNodeIds.size > 0) {
            clearCanvasSelection();
        }
    }, [clearCanvasSelection, selectedCanvasNodeIds.size, selectionBox]);

    // Track Ctrl key state
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                setIsCtrlPressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                setIsCtrlPressed(false);
                setSelectionBox(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Box selection handlers
    const handleSelectionStart = useCallback((event: React.MouseEvent) => {
        // Only start box selection with Ctrl+drag on pane (not on nodes)
        if (!event.ctrlKey) return;

        const target = event.target as HTMLElement;
        // Check if clicking on pane (react-flow__pane)
        if (!target.classList.contains('react-flow__pane')) return;

        event.preventDefault();

        // Get the container rect for relative screen positioning
        const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const screenX = event.clientX - containerRect.left;
        const screenY = event.clientY - containerRect.top;

        const flowPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setSelectionBox({
            screenStartX: screenX,
            screenStartY: screenY,
            screenCurrentX: screenX,
            screenCurrentY: screenY,
            flowStartX: flowPosition.x,
            flowStartY: flowPosition.y,
            flowCurrentX: flowPosition.x,
            flowCurrentY: flowPosition.y,
        });
    }, [screenToFlowPosition]);

    const handleSelectionMove = useCallback((event: React.MouseEvent) => {
        if (!selectionBox) return;

        // Get the container rect for relative screen positioning
        const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const screenX = event.clientX - containerRect.left;
        const screenY = event.clientY - containerRect.top;

        const flowPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setSelectionBox(prev => prev ? {
            ...prev,
            screenCurrentX: screenX,
            screenCurrentY: screenY,
            flowCurrentX: flowPosition.x,
            flowCurrentY: flowPosition.y,
        } : null);
    }, [selectionBox, screenToFlowPosition]);

    // Calculate which nodes are currently under the selection box (for live preview)
    const nodesUnderSelection = useMemo(() => {
        if (!selectionBox) return new Set<string>();

        const left = Math.min(selectionBox.flowStartX, selectionBox.flowCurrentX);
        const right = Math.max(selectionBox.flowStartX, selectionBox.flowCurrentX);
        const top = Math.min(selectionBox.flowStartY, selectionBox.flowCurrentY);
        const bottom = Math.max(selectionBox.flowStartY, selectionBox.flowCurrentY);

        const selectedIds = new Set<string>();

        visibleNodes.forEach(node => {
            const nodeWidth = (node.measured?.width || node.style?.width as number) || 200;
            const nodeHeight = (node.measured?.height || node.style?.height as number) || 100;

            const nodeLeft = node.position.x;
            const nodeRight = node.position.x + nodeWidth;
            const nodeTop = node.position.y;
            const nodeBottom = node.position.y + nodeHeight;

            // Check if rectangles intersect
            const intersects = !(
                nodeRight < left ||
                nodeLeft > right ||
                nodeBottom < top ||
                nodeTop > bottom
            );

            if (intersects) {
                selectedIds.add(node.id);
            }
        });

        return selectedIds;
    }, [selectionBox, visibleNodes]);

    const handleSelectionEnd = useCallback(() => {
        if (!selectionBox) return;

        // Use the already computed nodesUnderSelection
        if (nodesUnderSelection.size > 0) {
            // Set flag to prevent pane click from immediately clearing selection
            justFinishedBoxSelection.current = true;
            setTimeout(() => {
                justFinishedBoxSelection.current = false;
            }, 100);

            setSelectedCanvasNodeIds(nodesUnderSelection);
        }

        setSelectionBox(null);
    }, [selectionBox, nodesUnderSelection, setSelectedCanvasNodeIds]);

    // Calculate selection box visual bounds (in screen coordinates relative to container)
    const selectionBoxStyle = useMemo(() => {
        if (!selectionBox) return null;

        const left = Math.min(selectionBox.screenStartX, selectionBox.screenCurrentX);
        const top = Math.min(selectionBox.screenStartY, selectionBox.screenCurrentY);
        const width = Math.abs(selectionBox.screenCurrentX - selectionBox.screenStartX);
        const height = Math.abs(selectionBox.screenCurrentY - selectionBox.screenStartY);

        return {
            left,
            top,
            width,
            height,
        };
    }, [selectionBox]);

    // Cleanup ref on unmount
    useEffect(() => {
        return () => {
            lastDragCheck.current = 0;
        };
    }, []);

    // Track viewport changes (throttled)
    const handleViewportChange = useCallback(() => {
        const now = Date.now();
        if (now - lastViewportUpdate.current < 200) return; // Throttle to 200ms

        lastViewportUpdate.current = now;
        const currentViewport = getViewport();
        setViewport(currentViewport);
    }, [getViewport]);

    return (
        <div
            className={`${styles.container} ${isCtrlPressed ? styles.selectMode : ''}`}
            onMouseDown={handleSelectionStart}
            onMouseMove={handleSelectionMove}
            onMouseUp={handleSelectionEnd}
            onMouseLeave={handleSelectionEnd}
        >
            <div className={styles.canvasArea}>
                <ThemeSwitcher />
                <div style={{ position: 'absolute', top: 20, left: 30, zIndex: 100 }}>
                    <Breadcrumbs />
                </div>
                {activeParentNode && (
                    <MetadataMenu nodeId={activeParentNode.id} />
                )}

                {/* Selection Box Overlay - Rendered outside ReactFlow for accurate positioning */}
                {selectionBoxStyle && (
                    <div
                        className={styles.selectionBox}
                        style={{
                            position: 'absolute',
                            left: selectionBoxStyle.left,
                            top: selectionBoxStyle.top,
                            width: selectionBoxStyle.width,
                            height: selectionBoxStyle.height,
                            pointerEvents: 'none',
                            zIndex: 9999,
                        }}
                    />
                )}

                <ReactFlow
                    nodes={visibleNodes.map(node => ({
                        ...node,
                        // Add preview selection class during box selection drag
                        className: nodesUnderSelection.has(node.id) ? 'box-selection-preview' : '',
                    }))}
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
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onNodeClick={onNodeClick}
                    onPaneClick={handlePaneClick}
                    onMove={handleViewportChange}
                    selectionOnDrag={false}
                    panOnDrag={!isCtrlPressed}
                    selectionMode={SelectionMode.Partial}
                    // Performance optimizations
                    nodesDraggable={true}
                    nodesConnectable={true}
                    nodesFocusable={true}
                    edgesFocusable={false}
                    elementsSelectable={true}
                    selectNodesOnDrag={false}
                    panOnScroll={true}
                    zoomOnScroll={true}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    preventScrolling={false}
                    // Improve rendering performance
                    autoPanOnConnect={false}
                    autoPanOnNodeDrag={false}
                    connectOnClick={false}
                    deleteKeyCode={null}
                >
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

            {/* Selection mode indicator */}
            {isCtrlPressed && (
                <div className={styles.selectionModeIndicator}>
                    Ctrl+Drag to select area
                </div>
            )}

            {/* Live selection count during drag */}
            {selectionBox && nodesUnderSelection.size > 0 && (
                <div className={styles.selectionCount}>
                    {nodesUnderSelection.size} node{nodesUnderSelection.size > 1 ? 's' : ''}
                </div>
            )}

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
