import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';

interface DragAndDropProps {
    blocks: Block[];
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    selectedBlockIds: Set<string>;
    nodeId?: string;
    addBlock: (afterId: string, type: BlockType, indent?: number, metadata?: any) => void;
    editorId: string;
    pendingDropTarget?: MutableRefObject<{ blockId: string; position: 'top' | 'bottom' } | null>;
}

export function useBlockDragAndDrop({
    blocks,
    setBlocks,
    debouncedOnUpdate,
    selectedBlockIds,
    pendingDropTarget,
    nodeId,
    addBlock,
    editorId
}: DragAndDropProps) {

    // Helper: Remove blocks from source node (if different from current)
    const removeBlocksFromSource = useCallback((blockIds: string[], sourceNodeId: string | null) => {
        console.log("[useBlockDragAndDrop] removeBlocksFromSource called:", {
            blockIds,
            sourceNodeId,
            currentNodeId: nodeId
        });

        if (sourceNodeId && sourceNodeId !== nodeId) {
            const { nodes, updateNodeData, setNodes } = useStore.getState();
            const sourceNode = nodes.find(n => n.id === sourceNodeId);

            console.log("[useBlockDragAndDrop] Source node found:", !!sourceNode);

            if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                const currentContent = (sourceNode.data as any).content;
                const newContent = currentContent.filter((b: any) => !blockIds.includes(b.id));

                console.log("[useBlockDragAndDrop] Removing blocks from source:", {
                    sourceNodeId,
                    originalCount: currentContent.length,
                    newCount: newContent.length,
                    removedCount: currentContent.length - newContent.length
                });

                updateNodeData(sourceNodeId, { content: newContent });

                // If source node is now empty and is a fused-note, delete it
                if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                    console.log("[useBlockDragAndDrop] Source node is empty, deleting it");
                    setTimeout(() => {
                        setNodes(nds => nds.filter(n => n.id !== sourceNodeId));
                    }, 0);
                }
            }

            // Trigger cleanup events
            if ((window as any).chnkItMultiDragCleanup) {
                (window as any).chnkItMultiDragCleanup();
                delete (window as any).chnkItMultiDragCleanup;
            }
            // Signal SortableBlockWrapper.handleDragEnd that the drop was already handled.
            (window as any).chnkItCrossEditorDropHandled = true;
            (window as any).chnkItBlockDragging = false;
            document.body.classList.remove('chnk-it-block-dragging');
            window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
        } else {
            console.log("[useBlockDragAndDrop] NOT removing from source - same node or no source");
        }
    }, [nodeId]);

    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => {
        console.log("[useBlockDragAndDrop] handleMoveBlock", { sourceId, targetId, position });

        // Check for cross-editor or cross-node move via DataTransfer
        let isCrossEditor = false;
        if (dataTransfer) {
            const sourceEditorId = dataTransfer.getData('application/chnk-it-editor-id');
            if (sourceEditorId && sourceEditorId !== editorId) {
                isCrossEditor = true;
            }
        }

        if (dataTransfer && !isCrossEditor) {
            try {
                const rawData = dataTransfer.getData('application/chnk-it-block-data');
                if (rawData) {
                    const parsed = JSON.parse(rawData);
                    const sourceNodeId = parsed.sourceNodeId;

                    if (sourceNodeId && sourceNodeId !== nodeId) {
                        console.log("[useBlockDragAndDrop] Cross-node move detected in handleMoveBlock", { sourceNodeId, nodeId });

                        let blocksToRemove: string[] = [];
                        if (parsed.blocks) blocksToRemove = parsed.blocks.map((b: any) => b.id);
                        else if (parsed.block) blocksToRemove = [parsed.block.id];

                        // If parsing failed to get blocks but we have sourceId, use that
                        if (blocksToRemove.length === 0 && sourceId) blocksToRemove = [sourceId];

                        // Execute removal from source
                        removeBlocksFromSource(blocksToRemove, sourceNodeId);
                    }
                }
            } catch (e) {
                console.error("Failed to parse cross-node data in handleMoveBlock", e);
            }
        }

        setBlocks(prev => {
            let blocksToMove: Block[] = [];
            let sourceIds: string[] = [];

            if (dataTransfer) {
                try {
                    const rawData = dataTransfer.getData('application/chnk-it-block-data');
                    if (rawData) {
                        const parsed = JSON.parse(rawData);
                        if (parsed.blocks) {
                            blocksToMove = parsed.blocks;
                            sourceIds = blocksToMove.map(b => b.id);
                        } else if (parsed.block) {
                            blocksToMove = [parsed.block];
                            sourceIds = [parsed.block.id];
                        }
                    }
                } catch (e) { console.error("Failed to parse drop data", e); }
            }

            // Fallback: If no blocks found in dataTransfer, use local lookup
            if (blocksToMove.length === 0) {
                const fromIndex = prev.findIndex(b => b.id === sourceId);
                if (fromIndex !== -1) {
                    blocksToMove = [prev[fromIndex]];
                    sourceIds = [sourceId];
                }
            }

            // SAFETY: Force include the primary sourceId if it's not in the list
            if (sourceId && !sourceIds.includes(sourceId)) {
                sourceIds.push(sourceId);
            }

            if (blocksToMove.length === 0) return prev;

            console.log("[useBlockDragAndDrop] Moving blocks:", {
                sourceIds,
                targetId,
                blocksToMoveCount: blocksToMove.length
            });

            const originalTargetIndex = prev.findIndex(b => b.id === targetId);
            if (originalTargetIndex === -1 && prev.length > 0) {
                console.warn(`Target block ${targetId} not found, appending to end`);
                const newBlocks = prev.filter(b => !sourceIds.includes(b.id));
                newBlocks.push(...blocksToMove);
                return newBlocks;
            }

            let insertIndex = originalTargetIndex;
            if (position === 'bottom') insertIndex += 1;

            let removedBefore = 0;
            for (let i = 0; i < insertIndex; i++) {
                if (sourceIds.includes(prev[i].id)) removedBefore++;
            }

            const finalInsertIndex = insertIndex - removedBefore;
            const newBlocks = prev.filter(b => !sourceIds.includes(b.id));
            
            const targetBlock = originalTargetIndex !== -1 ? prev[originalTargetIndex] : null;
            
            // Notion-like behavior: If dropping on the bottom of an expanded toggle, 
            // make the moved blocks children of that toggle.
            const updatedBlocksToMove = blocksToMove.map(b => {
                if (targetBlock && targetBlock.type === 'toggle' && !targetBlock.metadata?.isCollapsed && position === 'bottom') {
                    // Calculate relative indent: if moving multiple blocks, maintain their relative indentation
                    const baseIndent = blocksToMove[0].indent || 0;
                    const relativeIndent = (b.indent || 0) - baseIndent;
                    return { ...b, indent: (targetBlock.indent || 0) + 1 + relativeIndent };
                }
                return b;
            });

            newBlocks.splice(finalInsertIndex, 0, ...updatedBlocksToMove);
            debouncedOnUpdate(newBlocks);

            // If it is a cross-editor drop, trigger source removal callback
            if (isCrossEditor && typeof (window as any).chnkItRemoveDraggedBlocks === 'function') {
                (window as any).chnkItRemoveDraggedBlocks(sourceIds);
                (window as any).chnkItRemoveDraggedBlocks = null;
            }

            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks, removeBlocksFromSource, nodeId, editorId]);

    const handleBlockDragStart = useCallback((e: React.DragEvent, block: Block) => {
        const isMulti = selectedBlockIds.has(block.id) && selectedBlockIds.size > 1;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('application/chnk-it-block-id', block.id);
        e.dataTransfer.setData('application/reactflow-block-type', block.type);
        e.dataTransfer.setData('application/chnk-it-editor-id', editorId);

        const blocksToDrag = isMulti
            ? blocks.filter(b => selectedBlockIds.has(b.id))
            : [block];

        (window as any).chnkItRemoveDraggedBlocks = (ids: string[]) => {
            console.log("[chnkItRemoveDraggedBlocks] Removing blocks from source:", ids);
            setBlocks(prev => {
                const newBlocks = prev.filter(b => !ids.includes(b.id));
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
        };

        e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify({
            block,
            blocks: blocksToDrag,
            sourceNodeId: nodeId || null
        }));

        // Register global cleanup for multi-block drag operations
        if (isMulti) {
            console.log('Registering multi-block drag cleanup for', blocksToDrag.length, 'blocks');
            (window as any).chnkItMultiDragCleanup = () => {
                console.log('Executing multi-block drag cleanup');
                // Dispatch both events to ensure cleanup
                const event1 = new CustomEvent('chnk-it-clear-selection');
                const event2 = new CustomEvent('chnk-it-multi-drag-clear-selection');
                window.dispatchEvent(event1);
                window.dispatchEvent(event2);
            };
        }
    }, [selectedBlockIds, blocks, nodeId, editorId, debouncedOnUpdate, setBlocks]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        console.log("[BlockEditor.handleDrop] START - Event triggered, nodeId:", nodeId);
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            console.log("[BlockEditor.handleDrop] Handling file drop");
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        const content = event.target.result as string;
                        let type: BlockType = 'file';
                        if (file.type.startsWith('image/')) type = 'image';
                        if (file.type.startsWith('video/')) type = 'video';

                        const newBlock: Block = {
                            id: uuidv4(),
                            type,
                            content,
                            metadata: {
                                name: file.name,
                                size: file.size,
                                type: file.type
                            }
                        };

                        setBlocks(prev => {
                            const newBlocks = [...prev, newBlock];
                            debouncedOnUpdate(newBlocks);
                            return newBlocks;
                        });
                    }
                };
                reader.readAsDataURL(file);
            });
            return;
        }

        const type = e.dataTransfer.getData('application/reactflow-block-type') as BlockType;
        if (type) {
            const sourceBlockId = e.dataTransfer.getData('application/chnk-it-block-id');

            // Parse block data to get source info
            let sourceNodeId: string | null = null;
            let blocksFromData: Block[] = [];

            try {
                const rawData = e.dataTransfer.getData('application/chnk-it-block-data');
                if (rawData) {
                    const parsed = JSON.parse(rawData);
                    sourceNodeId = parsed.sourceNodeId || null;
                    if (parsed.blocks) {
                        blocksFromData = parsed.blocks;
                    } else if (parsed.block) {
                        blocksFromData = [parsed.block];
                    }
                }
            } catch (err) { console.error("Failed to parse drop data", err); }

            console.log("[BlockEditor.handleDrop] Parsed data:", {
                type,
                sourceBlockId,
                sourceNodeId,
                currentNodeId: nodeId,
                blocksFromDataCount: blocksFromData.length,
                isCrossNodeDrop: sourceNodeId && sourceNodeId !== nodeId
            });

            if (sourceBlockId) {
                if (blocks.length === 0) {
                    console.log("[BlockEditor.handleDrop] Drop into empty editor");
                    // Drop into empty editor
                    if (blocksFromData.length > 0) {
                        setBlocks(blocksFromData);
                        debouncedOnUpdate(blocksFromData);

                        const sourceEditorId = e.dataTransfer.getData('application/chnk-it-editor-id');
                        if (sourceEditorId && sourceEditorId !== editorId && typeof (window as any).chnkItRemoveDraggedBlocks === 'function') {
                            (window as any).chnkItRemoveDraggedBlocks(blocksFromData.map(b => b.id));
                            (window as any).chnkItRemoveDraggedBlocks = null;
                        } else {
                            // Remove from source node if cross-node drop
                            removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
                        }
                    }
                    return;
                }

                // If this is a cross-node drop, handle specially
                if (sourceNodeId && sourceNodeId !== nodeId && blocksFromData.length > 0) {
                    console.log("[BlockEditor.handleDrop] CROSS-NODE DROP - Adding blocks and removing from source");
                    // Add blocks to this node
                    setBlocks(prev => {
                        const newBlocks = [...prev, ...blocksFromData];
                        debouncedOnUpdate(newBlocks);
                        return newBlocks;
                    });

                    // Remove from source node
                    removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
                    return;
                }

                // Same-node move (internal reorder) — use container-tracked target if available
                console.log("[BlockEditor.handleDrop] SAME-NODE move (internal reorder)");
                const tracked = pendingDropTarget?.current;
                if (tracked) {
                    handleMoveBlock(sourceBlockId, tracked.blockId, tracked.position, e.dataTransfer);
                } else {
                    const lastId = blocks[blocks.length - 1].id;
                    handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
                }
                return;
            }

            // External drop (e.g. from menu) - blocks without sourceBlockId
            console.log("[BlockEditor.handleDrop] External drop (no sourceBlockId)");
            if (blocksFromData.length > 0) {
                // If we have full block data, insert it at the end
                setBlocks(prev => {
                    const newBlocks = [...prev, ...blocksFromData];
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });

                // Remove from source node if cross-node drop
                removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
            } else {
                // Fallback to type-based creation (new block from menu)
                let metadata = undefined;
                try {
                    const metaJson = e.dataTransfer.getData('application/chnk-it-block-metadata');
                    if (metaJson) metadata = JSON.parse(metaJson);
                } catch (err) { console.error("Failed to parse drop metadata", err); }

                const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
                // pass 0 as default indent
                addBlock(lastId, type, 0, metadata);
            }
        } else {
            console.log("[BlockEditor.handleDrop] No type in dataTransfer - ignoring");
        }
    }, [blocks, addBlock, handleMoveBlock, debouncedOnUpdate, setBlocks, nodeId, removeBlocksFromSource, editorId]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    return {
        handleMoveBlock,
        handleBlockDragStart,
        handleDrop,
        handleDragOver
    };
}
