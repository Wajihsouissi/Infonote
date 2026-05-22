import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import type { BlockType } from '../../editor/types';
import type { AppNode } from '../../../types';
import { BASE_UNIT, MIN_FUSED_SIZE, ICON_SIZE, snapToGridValue, GRID_GAP } from '../../../config/layout';

interface UseCanvasDropOptions {
    updateNodeData: (id: string, data: any) => void;
    setNodes: (updater: (nodes: AppNode[]) => AppNode[]) => void;
    extractPageFromBlock: (block: any, position: { x: number; y: number }, sourceNodeId?: string) => void;
}

/**
 * Hook that handles drag-over and drop events on the canvas.
 * Manages block drops, node creation, and fusion logic.
 */
export function useCanvasDrop({
    updateNodeData,
    setNodes,
    extractPageFromBlock,
}: UseCanvasDropOptions) {
    const { screenToFlowPosition, getIntersectingNodes, deleteElements, getViewport } = useReactFlow();

    const onDragOver = useCallback((event: React.DragEvent) => {
        const { centerPanelId, fullscreenId } = useStore.getState();
        if (centerPanelId || fullscreenId) {
            const isDraggingBlock = event.dataTransfer.types.includes('application/reactflow-block-type') || 
                                    event.dataTransfer.types.includes('application/infonote-block-data');
            if (!isDraggingBlock) return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            const { centerPanelId, fullscreenId, currentParentId, nodes } = useStore.getState();

            const type = event.dataTransfer.getData('application/reactflow-block-type') as BlockType;
            const blockDataJson = event.dataTransfer.getData('application/infonote-block-data');

            if (centerPanelId || fullscreenId) {
                if (!type && !blockDataJson) return;
            }

            // Check if the drop landed inside a node's BlockEditor
            const target = event.target as HTMLElement;
            const isInsideBlockEditor = !!target.closest('[data-infonote-block-editor]');

            // Parse block data to check if this is a cross-node block transfer
            let hasSourceNode = false;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    hasSourceNode = !!parsed.sourceNodeId;
                } catch (e) {
                    // Parse failed
                }
            }

            const { zoom } = getViewport();
            // Constant 20px screen-space hover checking size, scaled to flow space
            const checkSize = Math.max(10, 20 / zoom);



            // If dropping inside a node's content area AND it's from another node, let BlockEditor handle it
            if (isInsideBlockEditor && hasSourceNode) {
                return;
            }

            event.preventDefault();

            const rawPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Snap drop position to grid
            const position = {
                x: Math.round(rawPosition.x / BASE_UNIT) * BASE_UNIT,
                y: Math.round(rawPosition.y / BASE_UNIT) * BASE_UNIT
            };

            let blocksToAdd: any[] = [];
            let sourceNodeId: string | null = null;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    if (parsed.blocks && Array.isArray(parsed.blocks)) {
                        blocksToAdd = parsed.blocks;
                        sourceNodeId = parsed.sourceNodeId;
                    } else if (parsed.block) {
                        blocksToAdd = [parsed.block];
                        sourceNodeId = parsed.sourceNodeId;
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
                    content: '',
                    metadata
                }];
            } else {
                return;
            }

            const dropRect = {
                x: position.x - checkSize / 2,
                y: position.y - checkSize / 2,
                width: checkSize,
                height: checkSize
            };

            const intersections = getIntersectingNodes(dropRect as any);
            const targetNode = intersections.find(n =>
                (n.type === 'block' || n.type === 'fused-note' || n.type === 'note') &&
                n.id !== sourceNodeId &&
                n.id !== currentParentId
            );

            if (targetNode) {
                const currentContent = Array.isArray((targetNode.data as any).content) ? (targetNode.data as any).content : [];
                updateNodeData(targetNode.id, {
                    content: [...currentContent, ...blocksToAdd],
                    lastFusedAt: Date.now()
                });

                if (targetNode.type === 'block') {
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, ...blocksToAdd]
                    });

                    const updatedNodes = nodes.map((n: AppNode) => {
                        if (n.id === targetNode.id) {
                            return {
                                ...n,
                                type: 'fused-note' as const,
                                style: { ...n.style, height: undefined }
                            } as AppNode;
                        }
                        return n;
                    });
                    setNodes(() => updatedNodes);
                }

                if (sourceNodeId) {
                    const sourceNode = nodes.find((n: AppNode) => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const draggedBlockIds = blocksToAdd.map(b => b.id);
                        let newContent = (sourceNode.data as any).content.filter((b: any) => !draggedBlockIds.includes(b.id));
                        console.log("[useCanvasDrop] Source cleanup - removing blocks:", draggedBlockIds);
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && (sourceNode.type === 'fused-note' || sourceNode.type === 'block')) {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }
            } else {
                // Adding new node to canvas
                if (blocksToAdd.length === 1 && blocksToAdd[0].type === 'page') {
                    extractPageFromBlock(blocksToAdd[0], position, sourceNodeId || undefined);
                    if ((window as any).infonoteMultiDragCleanup) {
                        (window as any).infonoteMultiDragCleanup();
                        delete (window as any).infonoteMultiDragCleanup;
                    }
                    window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
                    return;
                }

                const isFusedLink = blocksToAdd.length > 1;
                const isSingleMedia = blocksToAdd.length === 1 && 
                    (blocksToAdd[0].type === 'image' || blocksToAdd[0].type === 'video' || blocksToAdd[0].type === 'file');
                
                const BLOCK_WIDTH = isSingleMedia ? ((BASE_UNIT * 4) - GRID_GAP) : MIN_FUSED_SIZE;
                const BLOCK_HEIGHT = isFusedLink ? MIN_FUSED_SIZE : ICON_SIZE;

                const centeredPosition = {
                    x: snapToGridValue(position.x - (BLOCK_WIDTH / 2)),
                    y: snapToGridValue(position.y - (BLOCK_HEIGHT / 2)),
                };

                const nodeId = uuidv4();
                const targetParentId = currentParentId || undefined;

                console.log("[useCanvasDrop] Adding block to store:", {
                    nodeId,
                    parentId: targetParentId,
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
                        width: BLOCK_WIDTH,
                        height: blocksToAdd.length > 1 ? undefined : BLOCK_HEIGHT
                    },
                    parentId: targetParentId,
                };

                useStore.setState(state => ({
                    nodes: [...state.nodes, newNode]
                }));

                if (sourceNodeId) {
                    const sourceNode = nodes.find((n: AppNode) => n.id === sourceNodeId);
                    if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                        const draggedBlockIds = blocksToAdd.map(b => b.id);
                        let newContent = (sourceNode.data as any).content.filter((b: any) => !draggedBlockIds.includes(b.id));
                        console.log("[useCanvasDrop] Source cleanup:", draggedBlockIds.length, "blocks");
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && (sourceNode.type === 'fused-note' || sourceNode.type === 'block')) {
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
        [screenToFlowPosition, updateNodeData, getIntersectingNodes, deleteElements, setNodes, extractPageFromBlock, getViewport],
    );

    return {
        onDragOver,
        onDrop,
    };
}
