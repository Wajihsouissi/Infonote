import { useCallback } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { parseClipboardData } from '../pasteUtils';

interface BlockCommandsProps {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocks: Block[];
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    setFocusId: (id: string | null) => void;
    setSelectedBlockIds: (ids: Set<string>) => void;
    selectedBlockIds: Set<string>;
    nodeId?: string;
    checkForSplit: (id: string) => void;
}

export function useBlockCommands({
    editorRef,
    blocks,
    setBlocks,
    debouncedOnUpdate,
    setFocusId,
    setSelectedBlockIds,
    selectedBlockIds,
    nodeId,
    checkForSplit
}: BlockCommandsProps) {

    const addBlock = useCallback((afterId: string, type: BlockType = 'text', initialIndent: number = 0, initialMetadata?: any) => {
        const newBlock: Block = { id: uuidv4(), type, content: '', indent: initialIndent };

        if (type === 'columns') {
            const count = initialMetadata?.count || 2;
            newBlock.metadata = {
                columns: Array.from({ length: count }).map(() => ({ id: uuidv4(), content: [] }))
            };
        }

        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === afterId);
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
        setFocusId(newBlock.id);
    }, [debouncedOnUpdate, setBlocks, setFocusId]);

    const removeBlock = useCallback((id: string) => {
        setBlocks(prev => {
            if (prev.length <= 1) return prev;
            const index = prev.findIndex(b => b.id === id);
            const newBlocks = prev.filter(b => b.id !== id);

            if (index > 0) {
                setFocusId(prev[index - 1].id);
            }
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks, setFocusId]);

    const handleIndent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index <= 0) return prev;

            const currentIndent = prev[index].indent || 0;
            if (currentIndent >= 8) return prev;

            const prevBlock = prev[index - 1];
            const prevIndent = prevBlock.indent || 0;

            if (currentIndent >= prevIndent + 1) return prev;

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent + 1 };
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks]);

    const handleOutdent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;

            const currentIndent = prev[index].indent || 0;
            if (currentIndent <= 0) return prev;

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent - 1 };
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks]);

    const handleBlockMenuAction = useCallback((blockId: string, action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split', value?: any) => {
        const idsToUpdate = selectedBlockIds.has(blockId)
            ? Array.from(selectedBlockIds)
            : [blockId];

        const targetIds = idsToUpdate.length > 0 ? idsToUpdate : [blockId];

        const applyToBlocks = (blockHandler: (block: Block) => Block) => {
            setBlocks(prev => {
                const newBlocks = prev.map(b => targetIds.includes(b.id) ? blockHandler(b) : b);
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
        };

        switch (action) {
            case 'turnInto':
                setBlocks(prev => {
                    const newBlocks = prev.map(b => {
                        if (targetIds.includes(b.id)) {
                            return { ...b, type: value };
                        }
                        return b;
                    });
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
                break;
            case 'color':
                applyToBlocks(b => {
                    const newMetadata = { ...(b.metadata || {}) };
                    if (value.type === 'text') newMetadata.textColor = value.value;
                    else newMetadata.backgroundColor = value.value;
                    return { ...b, metadata: newMetadata };
                });
                break;
            case 'duplicate':
                setBlocks(prev => {
                    const newBlocks = [...prev];
                    const indices = targetIds.map(id => prev.findIndex(b => b.id === id)).filter(i => i !== -1).sort((a, b) => a - b);
                    const lastIndex = indices[indices.length - 1];

                    if (lastIndex === undefined) return prev;

                    const copies = indices.map(i => {
                        const b = prev[i];
                        return { ...b, id: uuidv4(), indent: b.indent || 0 };
                    });

                    newBlocks.splice(lastIndex + 1, 0, ...copies);
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
                break;
            case 'delete':
                setBlocks(prev => {
                    const newBlocks = prev.filter(b => !targetIds.includes(b.id));
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
                setSelectedBlockIds(new Set());
                break;
            case 'split':
                checkForSplit(blockId);
                break;
        }
    }, [selectedBlockIds, debouncedOnUpdate, setBlocks, setSelectedBlockIds, checkForSplit]);

    const handleBlockPaste = useCallback(async (e: React.ClipboardEvent, blockId: string) => {
        e.preventDefault();
        const parsedBlocks = await parseClipboardData(e);
        if (parsedBlocks.length === 0) return;

        const firstBlock = parsedBlocks[0];
        const remainingBlocks = parsedBlocks.slice(1);

        if (firstBlock.type === 'text') {
            if (firstBlock.content) document.execCommand('insertText', false, firstBlock.content);
        } else {
            remainingBlocks.unshift(firstBlock);
        }

        if (remainingBlocks.length > 0) {
            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;
                const newBlocks = [...prev];
                newBlocks.splice(index + 1, 0, ...remainingBlocks);
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
        }
    }, [debouncedOnUpdate, setBlocks]);

    const handleEditorClick = useCallback((e: React.MouseEvent, wasDragging: boolean) => {
        if (wasDragging) return;

        if (e.target === editorRef.current) {
            e.preventDefault();

            if (selectedBlockIds.size > 0 && !e.ctrlKey) {
                setSelectedBlockIds(new Set());
                return;
            }

            const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : null;
            if (lastId) {
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock.type === 'text' && lastBlock.content === '') {
                    setFocusId(lastId);
                } else {
                    addBlock(lastId, 'text');
                }
            } else if (blocks.length === 0) {
                const newId = uuidv4();
                setBlocks([{ id: newId, type: 'text', content: '' }]);
                setFocusId(newId);
            }
        }
    }, [editorRef, selectedBlockIds, blocks, setFocusId, addBlock, setBlocks, setSelectedBlockIds]);

    return {
        addBlock,
        removeBlock,
        handleIndent,
        handleOutdent,
        handleBlockMenuAction,
        handleBlockPaste,
        handleEditorClick
    };
}
