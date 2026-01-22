import { useCallback } from 'react';
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
}

export function useBlockDragAndDrop({
    blocks,
    setBlocks,
    debouncedOnUpdate,
    selectedBlockIds,
    nodeId,
    addBlock
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
            if ((window as any).infonoteMultiDragCleanup) {
                (window as any).infonoteMultiDragCleanup();
                delete (window as any).infonoteMultiDragCleanup;
            }
            window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
        } else {
            console.log("[useBlockDragAndDrop] NOT removing from source - same node or no source");
        }
    }, [nodeId]);

    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => {
        console.log("[useBlockDragAndDrop] handleMoveBlock", { sourceId, targetId, position });

        // Check for cross-node move via DataTransfer
        if (dataTransfer) {
            try {
                const rawData = dataTransfer.getData('application/infonote-block-data');
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
                    const rawData = dataTransfer.getData('application/infonote-block-data');
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
            // This prevents duplication if dataTransfer is somehow out of sync with sourceI 
            if (sourceId && !sourceIds.includes(sourceId)) {
                console.warn("[useBlockDragAndDrop] SourceID missing from DataTransfer content, forcing inclusion for removal", sourceId);
                sourceIds.push(sourceId);
                // Also ensures we are moving *something* corresponding to the sourceId if blocksToMove is empty (handled by fallback above),
                // but if blocksToMove IS populated but missing sourceId, we rely on blocksToMove for insertion.
                // If we remove sourceId but don't insert it, we lose the block.
                // So we should also check if we need to add it to blocksToMove?
                // Usually if blocksToMove is populated, it implies a specific set.
                // If the user dragged Block A (sourceId), but dataTransfer has Block B, that's weird.
                // Assuming multi-select logic handles consistency.
                // For valid single-block drag, sourceId should match.
            }

            if (blocksToMove.length === 0) return prev;

            console.log("[useBlockDragAndDrop] Moving blocks:", {
                sourceIds,
                targetId,
                blocksToMoveCount: blocksToMove.length
            });

            const newBlocks = prev.filter(b => !sourceIds.includes(b.id));
            const targetIndex = newBlocks.findIndex(b => b.id === targetId);

            if (targetIndex === -1 && newBlocks.length > 0) {
                console.warn("[useBlockDragAndDrop] Target ID not found in newBlocks", targetId);
                return prev;
            }

            const insertIndex = targetIndex === -1
                ? newBlocks.length
                : position === 'top' ? targetIndex : targetIndex + 1;

            newBlocks.splice(insertIndex, 0, ...blocksToMove);
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks, removeBlocksFromSource, nodeId]);

    const handleBlockDragStart = useCallback((e: React.DragEvent, block: Block) => {
        const isMulti = selectedBlockIds.has(block.id) && selectedBlockIds.size > 1;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('application/infonote-block-id', block.id);
        e.dataTransfer.setData('application/reactflow-block-type', block.type);

        const blocksToDrag = isMulti
            ? blocks.filter(b => selectedBlockIds.has(b.id))
            : [block];

        if (nodeId) {
            e.dataTransfer.setData('application/infonote-block-data', JSON.stringify({
                block,
                blocks: blocksToDrag,
                sourceNodeId: nodeId
            }));
        }

        // Register global cleanup for multi-block drag operations
        if (isMulti) {
            console.log('Registering multi-block drag cleanup for', blocksToDrag.length, 'blocks');
            (window as any).infonoteMultiDragCleanup = () => {
                console.log('Executing multi-block drag cleanup');
                // Dispatch both events to ensure cleanup
                const event1 = new CustomEvent('infonote-clear-selection');
                const event2 = new CustomEvent('infonote-multi-drag-clear-selection');
                window.dispatchEvent(event1);
                window.dispatchEvent(event2);
            };
        }
    }, [selectedBlockIds, blocks, nodeId]);

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
            const sourceBlockId = e.dataTransfer.getData('application/infonote-block-id');

            // Parse block data to get source info
            let sourceNodeId: string | null = null;
            let blocksFromData: Block[] = [];

            try {
                const rawData = e.dataTransfer.getData('application/infonote-block-data');
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

                        // Remove from source node if cross-node drop
                        removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
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

                // Same-node move (internal reorder)
                console.log("[BlockEditor.handleDrop] SAME-NODE move (internal reorder)");
                const lastId = blocks[blocks.length - 1].id;
                handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
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
                    const metaJson = e.dataTransfer.getData('application/infonote-block-metadata');
                    if (metaJson) metadata = JSON.parse(metaJson);
                } catch (err) { console.error("Failed to parse drop metadata", err); }

                const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
                // pass 0 as default indent
                addBlock(lastId, type, 0, metadata);
            }
        } else {
            console.log("[BlockEditor.handleDrop] No type in dataTransfer - ignoring");
        }
    }, [blocks, addBlock, handleMoveBlock, debouncedOnUpdate, setBlocks, nodeId, removeBlocksFromSource]);

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
