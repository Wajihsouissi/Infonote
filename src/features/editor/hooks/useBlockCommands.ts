import { useCallback, useEffect } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { parseFiles, parseTextOrHtml } from '../pasteUtils';

interface BlockCommandsProps {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocks: Block[];
    blocksRef: React.MutableRefObject<Block[]>; // Added blocksRef
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
    blocksRef,
    setBlocks,
    debouncedOnUpdate,
    setFocusId,
    setSelectedBlockIds,
    selectedBlockIds,
    checkForSplit,
    nodeId
}: BlockCommandsProps) {

    const addBlock = useCallback((afterId: string, type: BlockType = 'text', initialIndent: number = 0, initialMetadata?: any) => {
        const newBlock: Block = {
            id: uuidv4(),
            type,
            content: '',
            indent: initialIndent,
            metadata: initialMetadata || undefined
        };

        if (type === 'columns') {
            const count = initialMetadata?.count || 2;
            newBlock.metadata = {
                ...initialMetadata,
                columns: Array.from({ length: count }).map(() => ({ 
                    id: uuidv4(), 
                    content: [{ id: uuidv4(), type: 'text', content: '' }] 
                }))
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
            if (index === -1) return prev;

            const targetBlock = prev[index];
            const targetIndent = targetBlock.indent || 0;

            // Remove the block
            const newBlocks = [...prev];
            newBlocks.splice(index, 1);

            // Shift all subsequent descendant blocks out by 1 level
            let i = index; // Since we spliced, index now points to the next block
            while (i < newBlocks.length) {
                const nextBlock = newBlocks[i];
                const nextIndent = nextBlock.indent || 0;
                if (nextIndent > targetIndent) {
                    newBlocks[i] = { ...nextBlock, indent: Math.max(0, nextIndent - 1) };
                } else {
                    break;
                }
                i++;
            }

            if (index > 0) {
                setFocusId(prev[index - 1].id);
            } else if (newBlocks.length > 0) {
                setFocusId(newBlocks[0].id);
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
            const newIndent = currentIndent - 1;
            newBlocks[index] = { ...newBlocks[index], indent: newIndent };
            
            // Shift subsequent dependent blocks
            let i = index + 1;
            while (i < newBlocks.length) {
                const nextBlock = newBlocks[i];
                const nextIndent = nextBlock.indent || 0;
                if (nextIndent > currentIndent) {
                    newBlocks[i] = { ...nextBlock, indent: nextIndent - 1 };
                } else if (nextIndent === currentIndent) {
                    break;
                } else {
                    break;
                }
                i++;
            }

            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [debouncedOnUpdate, setBlocks]);

    const handleBlockMenuAction = useCallback((blockId: string, action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split' | 'toggleHeader', value?: any) => {
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
            case 'toggleHeader':
                setBlocks(prev => {
                    const index = prev.findIndex(b => b.id === blockId);
                    if (index === -1) return prev;

                    const headingBlock = prev[index];
                    const headingType = headingBlock.type;
                    if (headingType !== 'heading1' && headingType !== 'heading2' && headingType !== 'heading3') return prev;

                    const newBlocks = [...prev];
                    // Preserve heading level in metadata so the toggle keeps heading styling
                    const headingLevel = headingType === 'heading1' ? 1 : headingType === 'heading2' ? 2 : 3;
                    newBlocks[index] = {
                        id: headingBlock.id,
                        type: 'toggle',
                        content: headingBlock.content,
                        indent: headingBlock.indent || 0,
                        metadata: { toggleHeaderLevel: headingLevel, isCollapsed: false }
                    };

                    // Indent all blocks until next same-level heading or divider
                    let i = index + 1;
                    while (i < newBlocks.length) {
                        const b = newBlocks[i];
                        if (b.type === headingType || b.type === 'divider') break;
                        newBlocks[i] = { ...b, indent: (b.indent || 0) + 1 };
                        i++;
                    }

                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
                break;
        }
    }, [selectedBlockIds, debouncedOnUpdate, setBlocks, setSelectedBlockIds, checkForSplit]);

    const handleBlockPaste = useCallback(async (e: React.ClipboardEvent, blockId: string) => {
        // Check for files first (async path)
        const files = e.clipboardData.files;
        if (files && files.length > 0) {
            e.preventDefault();
            const parsedBlocks = await parseFiles(files);
            if (parsedBlocks.length > 0) {
                setBlocks(prev => {
                    const index = prev.findIndex(b => b.id === blockId);
                    if (index === -1) return prev;
                    const newBlocks = [...prev];
                    newBlocks.splice(index + 1, 0, ...parsedBlocks);
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
            }
            return;
        }

        // Sync path for Text/HTML to preserve user gesture for execCommand
        const parsedBlocks = parseTextOrHtml(e);
        if (parsedBlocks.length === 0) return;

        e.preventDefault();

        const currentBlock = blocksRef.current.find(b => b.id === blockId);
        const isCurrentBlockEmpty = currentBlock && currentBlock.type === 'text' && !currentBlock.content.trim();

        // 1. Empty Block URL Upgrade: replace empty block with first link block
        const firstBlock = parsedBlocks[0];
        const remainingBlocks = parsedBlocks.slice(1);
        if (firstBlock.type === 'link' && isCurrentBlockEmpty) {
            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;
                const newBlocks = [...prev];
                newBlocks[index] = firstBlock;
                if (remainingBlocks.length > 0) {
                    newBlocks.splice(index + 1, 0, ...remainingBlocks);
                }
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
            setFocusId(firstBlock.id);
            return;
        }

        // 2. Determine caret offset for splitting
        const selection = window.getSelection();
        let caretOffset = 0;
        let textBefore = '';
        let textAfter = '';
        let wasSplit = false;

        if (selection && selection.rangeCount > 0 && currentBlock) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            let container: Node | null = range.startContainer;
            while (container && container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentNode;
            }
            if (container && (container as HTMLElement).isContentEditable) {
                preCaretRange.selectNodeContents(container);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                caretOffset = preCaretRange.toString().length;
                
                const fullText = currentBlock.content || '';
                textBefore = fullText.substring(0, caretOffset);
                textAfter = fullText.substring(caretOffset);
                wasSplit = true;
            }
        }

        // 3. If it's a simple, single text block paste, use the native execCommand to insert text inline
        if (parsedBlocks.length === 1 && firstBlock.type === 'text') {
            if (firstBlock.content) {
                document.execCommand('insertText', false, firstBlock.content);
            }
            return;
        }

        // 4. Multi-block or non-text block paste: Split the block!
        if (wasSplit && currentBlock) {
            const trailingBlockId = uuidv4();
            const trailingBlock = {
                id: trailingBlockId,
                type: 'text' as const,
                content: textAfter || '',
                indent: currentBlock.indent || 0
            };

            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;

                const newBlocks = [...prev];
                // Update the current block to contain only textBefore
                newBlocks[index] = {
                    ...currentBlock,
                    content: textBefore
                };

                // Insert pasted blocks and the trailing block
                newBlocks.splice(index + 1, 0, ...parsedBlocks, trailingBlock);
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });

            // Focus the trailing block at the start
            setFocusId(trailingBlockId);
        } else {
            // Fallback if split failed
            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;
                const newBlocks = [...prev];
                newBlocks.splice(index + 1, 0, ...parsedBlocks);
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
            if (parsedBlocks.length > 0) {
                setFocusId(parsedBlocks[parsedBlocks.length - 1].id);
            }
        }
    }, [debouncedOnUpdate, setBlocks, blocksRef, setFocusId]);

    // Batch operations

    // Move block up in the list
    const moveBlockUp = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index <= 0) return prev; // Already at top or not found
            const newBlocks = [...prev];
            [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [setBlocks, debouncedOnUpdate]);

    // Move block down in the list
    const moveBlockDown = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1 || index >= prev.length - 1) return prev; // At bottom or not found
            const newBlocks = [...prev];
            [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [setBlocks, debouncedOnUpdate]);

    // Duplicate a single block
    const duplicateBlock = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;
            const block = prev[index];
            const newBlock = { ...block, id: uuidv4() };
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            debouncedOnUpdate(newBlocks);
            setFocusId(newBlock.id);
            return newBlocks;
        });
    }, [setBlocks, debouncedOnUpdate, setFocusId]);

    // Focus previous block
    const focusPreviousBlock = useCallback((currentId: string) => {
        const index = blocksRef.current.findIndex(b => b.id === currentId);
        if (index > 0) {
            setFocusId(blocksRef.current[index - 1].id);
        }
    }, [blocksRef, setFocusId]);

    // Focus next block
    const focusNextBlock = useCallback((currentId: string) => {
        const index = blocksRef.current.findIndex(b => b.id === currentId);
        if (index < blocksRef.current.length - 1) {
            setFocusId(blocksRef.current[index + 1].id);
        }
    }, [blocksRef, setFocusId]);

    // Add block below current and focus it
    const addBlockBelow = useCallback((id: string) => {
        const currentBlock = blocksRef.current.find(b => b.id === id);
        const indent = currentBlock?.indent || 0;
        addBlock(id, 'text', indent);
    }, [blocksRef, addBlock]);

    const deleteSelectedBlocks = useCallback(() => {
        if (selectedBlockIds.size === 0) return;

        setBlocks(prev => {
            const newBlocks = prev.filter(b => !selectedBlockIds.has(b.id));
            debouncedOnUpdate(newBlocks);
            setSelectedBlockIds(new Set()); // Clear selection
            return newBlocks;
        });
    }, [selectedBlockIds, setBlocks, debouncedOnUpdate, setSelectedBlockIds]);

    const convertSelectedBlocks = useCallback((newType: BlockType) => {
        if (selectedBlockIds.size === 0) return;
 
        setBlocks(prev => {
            const newBlocks = [...prev];
            
            // First, find all toggle blocks that are being converted to a non-toggle type
            const isTargetTypeToggle = newType === 'toggle';
            
            for (let i = 0; i < newBlocks.length; i++) {
                const block = newBlocks[i];
                if (selectedBlockIds.has(block.id)) {
                    const oldType = block.type;
                    newBlocks[i] = { ...block, type: newType };
                    
                    // If converting a toggle to a non-toggle, outdent its nested children by 1
                    if (oldType === 'toggle' && !isTargetTypeToggle) {
                        const targetIndent = block.indent || 0;
                        let j = i + 1;
                        while (j < newBlocks.length) {
                            const nextBlock = newBlocks[j];
                            const nextIndent = nextBlock.indent || 0;
                            if (nextIndent > targetIndent) {
                                newBlocks[j] = { ...nextBlock, indent: Math.max(0, nextIndent - 1) };
                                j++;
                            } else {
                                break;
                            }
                        }
                    }
                }
            }
            
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });
    }, [selectedBlockIds, setBlocks, debouncedOnUpdate]);

    const handleEditorClick = useCallback((e: React.MouseEvent, wasDragging: boolean) => {
        if (wasDragging) return;

        if (e.target === editorRef.current) {
            e.preventDefault();

            if (selectedBlockIds.size > 0 && !e.ctrlKey) {
                setSelectedBlockIds(new Set());
                return;
            }

            const lastId = blocksRef.current.length > 0 ? blocksRef.current[blocksRef.current.length - 1].id : null;
            if (lastId) {
                const lastBlock = blocksRef.current[blocksRef.current.length - 1];
                if (lastBlock.type === 'text' && lastBlock.content === '') {
                    setFocusId(lastId);
                } else {
                    addBlock(lastId, 'text');
                }
            } else if (blocksRef.current.length === 0) {
                const newId = uuidv4();
                setBlocks([{ id: newId, type: 'text', content: '' }]);
                setFocusId(newId);
            }
        }
    }, [editorRef, selectedBlockIds, blocksRef, setFocusId, addBlock, setBlocks, setSelectedBlockIds]);

    useEffect(() => {
        if (!nodeId) return;
        const handleBgClick = (e: any) => {
            if (e.detail.nodeId === nodeId) {
                handleEditorClick({ target: editorRef.current, preventDefault: () => {} } as any, false);
            }
        };
        window.addEventListener('chnk-it-editor-bg-click', handleBgClick);
        return () => window.removeEventListener('chnk-it-editor-bg-click', handleBgClick);
    }, [nodeId, handleEditorClick, editorRef]);

    return {
        addBlock,
        removeBlock,
        handleIndent,
        handleOutdent,
        handleBlockMenuAction,
        handleBlockPaste,
        handleEditorClick,
        deleteSelectedBlocks,
        convertSelectedBlocks,
        // New keyboard shortcut functions
        moveBlockUp,
        moveBlockDown,
        duplicateBlock,
        focusPreviousBlock,
        focusNextBlock,
        addBlockBelow
    };
}
