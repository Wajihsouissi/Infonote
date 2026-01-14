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

import type { BlockType } from '../editor/types';
import styles from './CanvasBoard.module.css';

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
    const updateNodeData = useStore(useCallback(s => s.updateNodeData, []));
    const setInteractionState = useStore(useCallback(s => s.setInteractionState, []));

    // Throttling Ref
    const lastDragCheck = useRef(0);

    const { fitView, screenToFlowPosition, getIntersectingNodes, deleteElements, setNodes, getNode } = useReactFlow();

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

        return rootNodes;
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
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
    });

    useEffect(() => {
        const observer = new MutationObserver(() => {
            const currentTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
            setTheme(currentTheme || 'dark');
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        return () => observer.disconnect();
    }, []);

    // Sync Readiness State
    const [isSyncReady, setIsSyncReady] = useState(false);

    useEffect(() => {
        setIsSyncReady(false);
    }, [currentParentId]);

    useEffect(() => {
        if (!activeParentNode || activeParentNode.type !== 'note') return;

        const hasContentNodes = visibleNodes.some(n => n.type === 'block' || n.type === 'fused-note');
        if (hasContentNodes) {
            setIsSyncReady(true);
        }
        else if (Array.isArray(activeParentNode.data.content) && activeParentNode.data.content.length === 0) {
            setIsSyncReady(true);
        }
    }, [visibleNodes.length, activeParentNode]);

    // Migration Logic: Copy Note Content into a Fused Note Node (Forward Sync)
    useEffect(() => {
        if (!activeParentNode || activeParentNode.type !== 'note') return;

        const hasContentNodes = visibleNodes.some(n => n.type === 'block' || n.type === 'fused-note');
        if (hasContentNodes || isSyncReady) return;

        const content = activeParentNode.data.content;

        if (Array.isArray(content) && content.length > 0) {

            // Splitting Logic
            const chunks: any[][] = [];
            let currentChunk: any[] = [];
            const splitterTypes = ['heading1', 'heading2', 'heading3', 'toggle', 'divider'];

            content.forEach((block: any) => {
                if (splitterTypes.includes(block.type)) {
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                    }
                }
                currentChunk.push(block);
            });
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }

            // Create Nodes from Chunks
            let currentY = 0;
            const newNodes = chunks.map((chunk) => {
                const estimatedHeight = Math.max(100, chunk.length * 40); // Simple heuristic

                const node = {
                    id: uuidv4(),
                    type: 'fused-note' as const,
                    position: { x: 0, y: currentY },
                    data: {
                        content: chunk
                    },
                    style: { width: 350, height: 'auto' as any },
                    parentId: activeParentNode.id
                };

                currentY += estimatedHeight + 50; // Gap
                return node;
            });

            useStore.setState(state => ({
                nodes: [...state.nodes, ...newNodes]
            }));

            setTimeout(() => fitView({ duration: 800 }), 100);
        } else {
            // console.log("CanvasBoard: Content empty or invalid", content);
        }

    }, [currentParentId, activeParentNode, visibleNodes.length, fitView, isSyncReady]);

    // Reverse Sync: Persist Children Nodes back to Parent Content
    useEffect(() => {
        if (!currentParentId || !activeParentNode || activeParentNode.type !== 'note') return;

        if (!isSyncReady) return;

        const syncContent = () => {
            const sortedChildren = [...visibleNodes].sort((a, b) => {
                if (Math.abs(a.position.y - b.position.y) < 10) {
                    return a.position.x - b.position.x;
                }
                return a.position.y - b.position.y;
            });

            let reconstructedContent: any[] = [];
            sortedChildren.forEach(child => {
                if (child.type === 'fused-note' || child.type === 'block') {
                    const content = (child.data as any).content;
                    if (Array.isArray(content)) {
                        reconstructedContent = [...reconstructedContent, ...content];
                    }
                }
            });

            const currentContentStr = JSON.stringify(activeParentNode.data.content || []);
            const newContentStr = JSON.stringify(reconstructedContent);

            if (currentContentStr !== newContentStr) {
                updateNodeData(currentParentId, { content: reconstructedContent });
            }
        };

        const timer = setTimeout(syncContent, 1000); // Debounce 1s to avoid drag thrashing

        return () => {
            clearTimeout(timer);
        };

    }, [visibleNodes, currentParentId, activeParentNode, updateNodeData, isSyncReady]);

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

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

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
                    setNodes(nds => nds.map(n => {
                        if (n.id === targetNode.id) {
                            return {
                                ...n,
                                type: 'fused-note',
                                style: { ...n.style, height: 'auto' }
                            };
                        }
                        return n;
                    }));
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
        [screenToFlowPosition, addNode, nodes, updateNodeData, getIntersectingNodes, deleteElements, setNodes],
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

                setNodes(nds => nds.map(n => {
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

                    setNodes(nds => nds.map(n => {
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
                                    ...n.data,
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
                    setNodes(nds => nds.map(n => {
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
                                    ...n.data,
                                    viewMode: targetViewMode as any,
                                    status: newStatus
                                }
                            };
                        }
                        return n;
                    }));
                }
                return;
            }

            // CASE 2: Fusion (Block/Fused -> Block/Fused)
            if ((isTargetBlock || isTargetFused) && (isSourceBlock || isSourceFused)) {

                const sourceContent = Array.isArray(node.data.content) ? node.data.content : [];
                const targetContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                const newContent = [...targetContent, ...sourceContent];

                setNodes((nds) => nds.map((n) => {
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

                    setNodes((nds) => nds.map((n) => {
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
    }, [getIntersectingNodes, deleteElements, setNodes, updateNodeData, getNode, nodes]); // Added getNode, nodes dependencies

    return (
        <div className={styles.container}>
            <div className={styles.canvasArea}>
                <ThemeSwitcher />
                <div style={{ position: 'absolute', top: 20, left: 30, zIndex: 100, transition: 'all 0.3s' }}>
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
                    <Controls
                        style={{
                            background: '#1e1e1e',
                            borderColor: '#333',
                            border: 'none',
                            borderRadius: '8px',
                            fill: 'white',
                            padding: '4px'
                        }}
                    />
                    <MiniMap
                        position="bottom-right"
                        nodeColor="#8b5cf6"
                        maskColor="rgba(0,0,0, 0.6)"
                        className="glass-panel"
                        style={{ background: 'transparent', margin: 20 }}
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
