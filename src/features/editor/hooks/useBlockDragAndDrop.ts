import { useCallback } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DragAndDropProps {
    blocks: Block[];
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    selectedBlockIds: Set<string>;
    nodeId?: string;
    addBlock: (afterId: string, type: BlockType) => void;
}

export function useBlockDragAndDrop({
    blocks,
    setBlocks,
    debouncedOnUpdate,
    selectedBlockIds,
    nodeId,
    addBlock
}: DragAndDropProps) {

    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => {
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

            if (blocksToMove.length === 0) {
                const fromIndex = prev.findIndex(b => b.id === sourceId);
                if (fromIndex !== -1) {
                    blocksToMove = [prev[fromIndex]];
                    sourceIds = [sourceId];
                }
            }

            if (blocksToMove.length === 0) return prev;

            const newBlocks = prev.filter(b => !sourceIds.includes(b.id));
            const targetIndex = newBlocks.findIndex(b => b.id === targetId);
            
            if (targetIndex === -1 && newBlocks.length > 0) return prev;

            const insertIndex = targetIndex === -1
                ? newBlocks.length
                : position === 'top' ? targetIndex : targetIndex + 1;

            newBlocks.splice(insertIndex, 0, ...blocksToMove);
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks]);

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
    }, [selectedBlockIds, blocks, nodeId]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
            if (sourceBlockId) {
                if (blocks.length === 0) {
                    try {
                        const rawData = e.dataTransfer.getData('application/infonote-block-data');
                        if (rawData) {
                            const parsed = JSON.parse(rawData);
                            if (parsed.block || parsed.blocks) {
                                const newBlocks = parsed.blocks || [parsed.block];
                                setBlocks(newBlocks);
                                debouncedOnUpdate(newBlocks);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to drop into empty column", err);
                    }
                    return;
                }

                const lastId = blocks[blocks.length - 1].id;
                handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
                return;
            }

            const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
            addBlock(lastId, type);
        }
    }, [blocks, addBlock, handleMoveBlock, debouncedOnUpdate, setBlocks]);

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
