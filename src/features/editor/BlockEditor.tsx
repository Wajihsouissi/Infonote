import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';

import type { Block } from './types';
import styles from './BlockEditor.module.css';

import { SlashMenu } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { FloatingToolbar } from './FloatingToolbar';

import { BlockItem } from './BlockItem';
import { useStore } from '../../store/useStore';

// Hooks
import { useBlockSelection } from './hooks/useBlockSelection';
import { useSlashCommand } from './hooks/useSlashCommand';
import { useBlockCommands } from './hooks/useBlockCommands';
import { useBlockDragAndDrop } from './hooks/useBlockDragAndDrop';

// UI
import { SelectionCapsule } from './ui/SelectionCapsule';

interface BlockEditorProps {
    initialContent?: string | Block[];
    onUpdate?: (blocks: Block[]) => void;
    readOnly?: boolean;
    autoFocus?: boolean;
    minimal?: boolean;
    mode?: 'document' | 'atomic';
    nodeId?: string; // New prop
    hideBlockHandles?: boolean;
    disableMediaControls?: boolean;
    promoteBlockHandles?: boolean;
    selectionIslandPortalId?: string; // Portal target for selection island
}

import { memo } from 'react';

export const BlockEditor = memo(function BlockEditor({ initialContent, onUpdate, readOnly, autoFocus, minimal, nodeId, hideBlockHandles, disableMediaControls, promoteBlockHandles, selectionIslandPortalId }: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [blocks, setBlocks] = useState<Block[]>(() => {
        if (Array.isArray(initialContent)) return initialContent;
        // Migration for legacy string content
        return [{ id: uuidv4(), type: 'text', content: typeof initialContent === 'string' ? initialContent : '' }];
    });

    // Block Menu State
    const [blockMenuState, setBlockMenuState] = useState<{ x: number, y: number, blockId: string } | null>(null);

    // Focus State
    const [focusId, setFocusId] = useState<string | null>(null);
    const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});

    // Create a stable debounced update function
    const timeoutRef = useRef<any>(null);
    const debouncedOnUpdate = useCallback((newBlocks: Block[]) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onUpdate?.(newBlocks);
            timeoutRef.current = null;
        }, 300); // 300ms debounce for store sync
    }, [onUpdate]);

    useEffect(() => {
        if (Array.isArray(initialContent)) {
            setBlocks(initialContent);
        } else if (typeof initialContent === 'string') {
            setBlocks([{ id: uuidv4(), type: 'text', content: initialContent }]);
        }
    }, [initialContent]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Sync changes to refs for stable handlers
    const blocksRef = useRef(blocks);
    useLayoutEffect(() => {
        blocksRef.current = blocks;
    });

    // 1. Selection Hook
    const {
        selectedBlockIds,
        setSelectedBlockIds,
        dragSelection,
        setDragSelection,
        setMouseDownBlock,
        selectionRect,
        wasDraggingRef,
        handleSelectionMouseDown,
        selectedBlockIdsRef
    } = useBlockSelection({ editorRef, blocks, blocksRef, blockRefs });

    // 2. Slash Command Hook
    const {
        slashMenuState,
        setSlashMenuState,
        slashMenuStateRef,
        convertBlock,
        handleSlashOpen
    } = useSlashCommand({
        editorRef,
        blocks,
        blocksRef,
        setBlocks,
        debouncedOnUpdate,
        setFocusId,
        nodeId
    });

    // 3. Block Commands Hook
    const {
        addBlock,
        removeBlock,
        handleIndent,
        handleOutdent,
        handleBlockMenuAction,
        handleBlockPaste,
        handleEditorClick,
        deleteSelectedBlocks,
        moveBlockUp,
        moveBlockDown,
        duplicateBlock,
        focusPreviousBlock,
        focusNextBlock,
        addBlockBelow
    } = useBlockCommands({
        editorRef,
        blocks,
        blocksRef,
        setBlocks,
        debouncedOnUpdate,
        setFocusId,
        setSelectedBlockIds,
        selectedBlockIds,
        nodeId,
        checkForSplit: (id) => {
            if (!nodeId) return;
            const index = blocksRef.current.findIndex(b => b.id === id);
            if (index > 0) {
                useStore.getState().splitNode(nodeId, id, blocksRef.current);
            }
        }
    });

    // 4. Drag and Drop Hook
    const {
        handleMoveBlock,
        handleBlockDragStart,
        handleDrop,
        handleDragOver
    } = useBlockDragAndDrop({
        blocks,
        setBlocks,
        debouncedOnUpdate,
        selectedBlockIds,
        nodeId,
        addBlock
    });

    // Escape key handler for clearing selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedBlockIds.size > 0) {
                e.preventDefault();
                setSelectedBlockIds(new Set());
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                editorRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedBlockIds.size, setSelectedBlockIds]);

    // Listen for drag completion events to clear selection
    useEffect(() => {
        const handleDragClearSelection = () => {
            console.log('Received drag clear selection event');

            // Explicitly clear drag selection artifacts
            setDragSelection(null);
            setMouseDownBlock(null);

            if (selectedBlockIds.size > 0) {
                console.log('Clearing selection of', selectedBlockIds.size, 'blocks');
                setSelectedBlockIds(new Set());
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                editorRef.current?.focus();
            }
        };

        // Listen for both regular and multi-block cleanup events
        window.addEventListener('infonote-clear-selection', handleDragClearSelection);

        return () => {
            window.removeEventListener('infonote-clear-selection', handleDragClearSelection);
        };
    }, [selectedBlockIds.size, setSelectedBlockIds, setDragSelection, setMouseDownBlock]);

    // Listen specifically for multi-block drag cleanup
    useEffect(() => {
        const handleMultiDragClearSelection = () => {
            console.log('Received multi-block drag clear selection event');
            if (selectedBlockIds.size > 0) {
                console.log('Clearing selection of', selectedBlockIds.size, 'blocks (multi-drag)');
                setSelectedBlockIds(new Set());
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                editorRef.current?.focus();
            }
        };

        window.addEventListener('infonote-multi-drag-clear-selection', handleMultiDragClearSelection);

        return () => {
            window.removeEventListener('infonote-multi-drag-clear-selection', handleMultiDragClearSelection);
        };
    }, [selectedBlockIds.size, setSelectedBlockIds]);

    // Additional cleanup: Clear selection when blocks are removed (happens during drag operations)
    const prevBlocksLengthRef = useRef(blocks.length);

    useEffect(() => {
        if (blocks.length < prevBlocksLengthRef.current && selectedBlockIds.size > 0) {
            // Blocks were removed and we had selection - likely from drag operation
            console.log('Blocks removed, clearing selection');
            setSelectedBlockIds(new Set());
        }

        prevBlocksLengthRef.current = blocks.length;
    }, [blocks.length, selectedBlockIds.size, setSelectedBlockIds]);

    // Auto-focus effect
    useEffect(() => {
        if (autoFocus && !focusId && blocks.length > 0) {
            const targetId = blocks[blocks.length - 1].id;
            setFocusId(targetId);
        }
    }, []); // Run once on mount

    // Sync with external content updates (e.g. Fusion)
    useEffect(() => {
        // If we have pending local changes (debounce active), we assume we are the source of truth
        // and ignore incoming props to prevent overwriting typing.
        if (timeoutRef.current) return;

        if (initialContent) {
            const nextContent = Array.isArray(initialContent) ? initialContent : [{ id: uuidv4(), type: 'text' as const, content: typeof initialContent === 'string' ? initialContent : '' }];

            setBlocks(prev => {
                // Deep comparison to allow text updates from outside
                // If the content is identical, skip update preventing re-renders
                if (JSON.stringify(prev) === JSON.stringify(nextContent)) {
                    return prev;
                }
                return nextContent;
            });
        }
    }, [initialContent]);

    useEffect(() => {
        if (focusId && blockRefs.current[focusId]) {
            blockRefs.current[focusId]?.focus();
            setFocusId(null);
        }
    }, [focusId, blocks]);

    const updateBlock = useCallback((id: string, contentOrPatch: string | Partial<Block>, metadata?: any) => {
        setBlocks(prev => {
            const newBlocks = prev.map(b => {
                if (b.id !== id) return b;

                if (typeof contentOrPatch === 'string') {
                    return { ...b, content: contentOrPatch, metadata: metadata || b.metadata };
                } else {
                    return { ...b, ...contentOrPatch };
                }
            });
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });

        if (typeof contentOrPatch === 'string') {
            const content = contentOrPatch;

            if (content === '# ') {
                convertBlock(id, 'heading1', undefined, '');
                return;
            }
            if (content === '## ') {
                convertBlock(id, 'heading2', undefined, '');
                return;
            }
            if (content === '### ') {
                convertBlock(id, 'heading3', undefined, '');
                return;
            }
            if (content === '> ') { convertBlock(id, 'quote', undefined, ''); return; }
            if (content === '>> ') { convertBlock(id, 'toggle', undefined, ''); return; }
            if (content === '--- ') { convertBlock(id, 'divider', undefined, ''); return; }
            if (content === '[] ' || content === '- ') { convertBlock(id, 'todo', undefined, ''); return; }
            if (content === '1. ') { convertBlock(id, 'numbered', undefined, ''); return; } // Numbered list
            if (content === '* ') { convertBlock(id, 'bullet', undefined, ''); return; } // Bullet list
            if (content === '``` ') { convertBlock(id, 'code', undefined, ''); return; }

            // Slash menu
            if (content.startsWith('/')) {
                if (!slashMenuStateRef.current || slashMenuStateRef.current.blockId !== id) {
                    handleSlashOpen(id);
                }
            } else if (slashMenuStateRef.current) {
                setSlashMenuState(null);
            }
        }
    }, [debouncedOnUpdate, convertBlock, handleSlashOpen, slashMenuStateRef, setSlashMenuState]);


    const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string, content: string) => {
        const isCtrl = e.ctrlKey || e.metaKey;

        // Ctrl+Shift+↑ - Move block up
        if (isCtrl && e.shiftKey && e.key === 'ArrowUp') {
            e.preventDefault();
            moveBlockUp(id);
            return;
        }

        // Ctrl+Shift+↓ - Move block down
        if (isCtrl && e.shiftKey && e.key === 'ArrowDown') {
            e.preventDefault();
            moveBlockDown(id);
            return;
        }

        // Ctrl+D - Duplicate block
        if (isCtrl && e.key === 'd') {
            e.preventDefault();
            duplicateBlock(id);
            return;
        }

        // Ctrl+/ - Open block menu
        if (isCtrl && e.key === '/') {
            e.preventDefault();
            const blockEl = blockRefs.current[id];
            if (blockEl) {
                const rect = blockEl.getBoundingClientRect();
                setBlockMenuState({ x: rect.left, y: rect.bottom, blockId: id });
            }
            return;
        }

        // Ctrl+Enter - Add block below and focus
        if (isCtrl && e.key === 'Enter') {
            e.preventDefault();
            addBlockBelow(id);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                handleOutdent(id);
            } else {
                handleIndent(id);
            }
            return;
        }

        const getCaretOffset = () => {
            const selection = window.getSelection();
            const target = e.target as HTMLElement;
            if (selection && selection.rangeCount > 0 && target) {
                try {
                    const range = selection.getRangeAt(0);
                    // Ensure the selection is actually inside the target to avoid errors
                    if (!target.contains(range.commonAncestorContainer)) return 0;

                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(target);
                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                    return preCaretRange.toString().length;
                } catch (err) {
                    console.warn('Error calculating caret offset:', err);
                    return 0;
                }
            }
            return 0;
        };

        if (e.key === 'Enter' && !e.shiftKey) {
            if (slashMenuStateRef.current) return;
            e.preventDefault();

            const currentBlock = blocksRef.current.find(b => b.id === id);

            if (currentBlock && ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type) && content === '') {
                if ((currentBlock.indent || 0) > 0) {
                    handleOutdent(id);
                } else {
                    convertBlock(id, 'text');
                }
                return;
            }

            if (currentBlock) {
                const caretOffset = getCaretOffset();
                const textBefore = content.substring(0, caretOffset);
                const textAfter = content.substring(caretOffset);

                const typeToCreate = ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type)
                    ? currentBlock.type
                    : 'text';

                const indent = currentBlock.indent || 0;

                setBlocks(prev => {
                    const index = prev.findIndex(b => b.id === id);
                    if (index === -1) return prev;

                    const newId = uuidv4();
                    const newBlock: Block = {
                        id: newId,
                        type: typeToCreate,
                        content: textAfter,
                        indent: indent
                    };

                    const newBlocks = [...prev];
                    newBlocks[index] = { ...newBlocks[index], content: textBefore };
                    newBlocks.splice(index + 1, 0, newBlock);

                    debouncedOnUpdate(newBlocks);
                    setTimeout(() => setFocusId(newId), 0);
                    return newBlocks;
                });
                return;
            }

            addBlock(id, 'text');

        } else if (e.key === 'Backspace') {
            const currentBlock = blocksRef.current.find(b => b.id === id);
            if (!currentBlock) return;

            if (content === '') {
                e.preventDefault();
                if ((currentBlock.indent || 0) > 0) {
                    handleOutdent(id);
                } else {
                    removeBlock(id);
                }
                return;
            }

            // Start of Block -> Merge Up
            if (getCaretOffset() === 0) {
                const index = blocksRef.current.findIndex(b => b.id === id);
                if (index > 0) {
                    e.preventDefault();
                    const prevBlock = blocksRef.current[index - 1];

                    setBlocks(prev => {
                        const newBlocks = [...prev];
                        newBlocks.splice(index, 1);
                        newBlocks[index - 1] = {
                            ...prevBlock,
                            content: prevBlock.content + content
                        };
                        debouncedOnUpdate(newBlocks);
                        setTimeout(() => setFocusId(prevBlock.id), 0);
                        return newBlocks;
                    });
                }
            }

        } else if (e.key === 'Delete') {
            // End of Block -> Merge Down
            if (getCaretOffset() === content.length) {
                const index = blocksRef.current.findIndex(b => b.id === id);
                if (index < blocksRef.current.length - 1) {
                    e.preventDefault();
                    const nextBlock = blocksRef.current[index + 1];

                    setBlocks(prev => {
                        const newBlocks = [...prev];
                        newBlocks.splice(index + 1, 1);
                        newBlocks[index] = {
                            ...prev[index], // Use fresh current
                            content: prev[index].content + nextBlock.content
                        };
                        debouncedOnUpdate(newBlocks);
                        return newBlocks;
                    });
                }
            }
        } else if (e.key === 'ArrowUp') {
            if (e.shiftKey) {
                // If at start of block (offset 0), select previous block + current
                if (getCaretOffset() === 0) {
                    e.preventDefault();
                    // If not already in selection mode, include current + prev
                    // If already, extend upwards
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex > 0) {
                        const newSelection = new Set(selectedBlockIdsRef.current);
                        newSelection.add(id);
                        newSelection.add(blocksRef.current[currentIndex - 1].id);
                        setSelectedBlockIds(newSelection);
                        // Blur text to show block selection clearly?
                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                        editorRef.current?.focus(); // Focus container to capture next arrows
                    }
                }
            } else {
                // Block navigation: Arrow Up at start or empty block -> focus previous
                if (content === '' || getCaretOffset() === 0) {
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex > 0) {
                        e.preventDefault();
                        focusPreviousBlock(id);
                    }
                }
            }
        } else if (e.key === 'ArrowDown') {
            if (e.shiftKey) {
                // If at end of block, select next block + current
                if (getCaretOffset() === content.length) {
                    e.preventDefault();
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex < blocksRef.current.length - 1) {
                        const newSelection = new Set(selectedBlockIdsRef.current);
                        newSelection.add(id);
                        newSelection.add(blocksRef.current[currentIndex + 1].id);
                        setSelectedBlockIds(newSelection);
                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                        editorRef.current?.focus();
                    }
                }
            } else {
                // Block navigation: Arrow Down at end of block -> focus next
                if (getCaretOffset() === content.length) {
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex < blocksRef.current.length - 1) {
                        e.preventDefault();
                        focusNextBlock(id);
                    }
                }
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            // "Select All" Logic
            // Browser default selects text in current block.
            // If we prevent default, we can select all blocks.
            // But we want "Intelligent Select All": 1st press = text, 2nd press = blocks.
            // We can check if all text is already selected?

            const selection = window.getSelection();
            // Check if current text is fully selected
            const isFullTextSelected = selection && selection.toString() === content;

            if (isFullTextSelected || content === '') {
                // Escalate to Block Selection (All Blocks)
                e.preventDefault();
                const allIds = new Set(blocksRef.current.map(b => b.id));
                setSelectedBlockIds(allIds);
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                editorRef.current?.focus();
            }
            // else let browser select all text (default)
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
            // Ctrl+Delete to delete selected blocks
            if (selectedBlockIds.size > 0) {
                e.preventDefault();
                deleteSelectedBlocks();
            }
        } else if (e.key === 'Backspace' && selectedBlockIds.size > 0) {
            // Backspace/Delete to delete selected blocks
            e.preventDefault();
            deleteSelectedBlocks();
        } else if (e.key === 'Delete' && selectedBlockIds.size > 0) {
            // Delete key to delete selected blocks
            e.preventDefault();
            deleteSelectedBlocks();
        }
    }, [handleIndent, handleOutdent, convertBlock, addBlock, removeBlock, debouncedOnUpdate]);

    const handleBlockMenuOpen = useCallback((e: React.MouseEvent, id: string) => {
        setMouseDownBlock(null);

        const target = e.target as HTMLElement;
        const isInteractive =
            target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA';

        const isHandle = target.closest(`.${styles.dragHandle}`);

        if (isInteractive && !isHandle) {
            if (!selectedBlockIdsRef.current.has(id)) {
                if (!promoteBlockHandles) {
                    e.stopPropagation();
                }
                return;
            }
        }

        e.preventDefault();
        e.stopPropagation();

        if (!selectedBlockIdsRef.current.has(id)) {
            setSelectedBlockIds(new Set([id]));
        }

        setBlockMenuState({ x: e.clientX, y: e.clientY, blockId: id });
    }, [promoteBlockHandles, setMouseDownBlock, setSelectedBlockIds, selectedBlockIdsRef]);

    const handleRegisterRef = useCallback((id: string, el: HTMLDivElement | null) => {
        blockRefs.current[id] = el;
    }, []);

    const handleCopySelection = useCallback(() => {
        const selectedBlocks = blocks.filter(b => selectedBlockIds.has(b.id));
        if (selectedBlocks.length === 0) return;

        // Copy actual text content instead of JSON
        const textContent = selectedBlocks
            .map(b => {
                // Handle different block types to extract text
                if (b.type === 'todo') return `[${b.metadata?.checked ? 'x' : ' '}] ${b.content}`;
                if (b.type === 'bullet') return `• ${b.content}`;
                if (b.type === 'numbered') return `1. ${b.content}`; // Simplified, as we don't have global index here easily
                return b.content;
            })
            .join('\n');

        navigator.clipboard.writeText(textContent).then(() => {
            console.log('Copied blocks text to clipboard');
        }).catch(err => {
            console.error('Failed to copy blocks', err);
        });
    }, [blocks, selectedBlockIds]);



    return (
        <div
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            tabIndex={-1}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={(e) => handleEditorClick(e, wasDraggingRef.current)}
            onMouseDown={(e) => {
                // Require Ctrl key for bulk selection
                if (!e.ctrlKey) {
                    return;
                }

                // OTHERWISE: Start Block Selection (Margin/Gap click)
                if (e.button === 0 && editorRef.current) {
                    wasDraggingRef.current = false;
                    // Start Selection
                    const rect = editorRef.current.getBoundingClientRect();
                    // Calculate Scale (Robust check for width)
                    const scale = rect.width ? (rect.width / editorRef.current.offsetWidth) : 1;

                    const relativeX = (e.clientX - rect.left) / scale;
                    const relativeY = (e.clientY - rect.top) / scale;

                    setDragSelection({
                        startX: relativeX,
                        startY: relativeY,
                        currentX: relativeX,
                        currentY: relativeY
                    });

                    // Clear previous if not purely additive (Ctrl allows adding, but let's keep it simple: simple click clears)
                    if (!e.shiftKey && !e.ctrlKey) {
                        setSelectedBlockIds(new Set());
                    }
                }
            }}
            onDoubleClick={(e) => {
                const target = e.target as HTMLElement;
                const chip = target.closest(`.${styles.inlinePageChip}`) as HTMLElement;
                if (chip && chip.dataset.nodeId) {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodeId = chip.dataset.nodeId;
                    useStore.getState().navigateToNode(nodeId);
                }
            }}
        >
            {blocks.map((block, index) => {
                // Calculate List Index
                let listIndex = undefined;
                if (block.type === 'numbered') {
                    // Look backwards to count consecutive numbered blocks (ignoring indentation children for now? or simplified sequence)
                    // Simplified: Count how many numbered blocks are immediately preceding this one (ignoring pure indentation logic for now, or just monotonic increase)
                    // Actually, simple sequential logic:
                    let count = 1;
                    for (let i = index - 1; i >= 0; i--) {
                        if (blocks[i].type === 'numbered') {
                            count++;
                        } else {
                            break;
                        }
                    }
                    listIndex = count;
                }

                return (
                    <BlockItem
                        key={block.id}
                        block={block}
                        index={listIndex} // Pass calculated index
                        isSelected={selectedBlockIds.size > 1 && selectedBlockIds.has(block.id)}
                        readOnly={readOnly}
                        nodeId={nodeId}
                        hideBlockHandles={hideBlockHandles}
                        promoteBlockHandles={promoteBlockHandles}
                        disableMediaControls={disableMediaControls}

                        onUpdateBlock={updateBlock}
                        onKeyDown={handleKeyDown}
                        onPaste={handleBlockPaste}
                        onMoveBlock={handleMoveBlock}
                        onDragStart={handleBlockDragStart}
                        onMenuOpen={handleBlockMenuOpen}
                        onSelectionClick={() => { }}
                        onSelectionMouseDown={handleSelectionMouseDown}
                        onRegisterRef={handleRegisterRef}
                    />
                );
            })}

            {slashMenuState && (
                <SlashMenu
                    anchorRect={slashMenuState.anchorRect}
                    filter={blocksRef.current.find(b => b.id === slashMenuState.blockId)?.content.substring(1) || ''}
                    onSelect={(type, meta) => convertBlock(undefined, type, meta)}
                    onClose={() => setSlashMenuState(null)}
                />
            )}

            {blockMenuState && (
                <BlockMenu
                    x={blockMenuState.x}
                    y={blockMenuState.y}
                    // blockId={blockMenuState.blockId} // Passed via closure/state to onAction
                    currentType={blocks.find(b => b.id === blockMenuState.blockId)?.type || 'text'}
                    onClose={() => setBlockMenuState(null)}
                    onAction={(action, value) => handleBlockMenuAction(blockMenuState.blockId, action, value)}
                />
            )}
            {/* Floating Toolbar */}
            {selectionRect && !slashMenuState && !blockMenuState && (
                <FloatingToolbar
                    selectionRect={selectionRect}
                    onFormat={(format, value) => {
                        if (format === 'createPage') {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                const text = selection.toString();
                                if (text.trim()) {
                                    const createPageFromText = useStore.getState().createPageFromText;
                                    const rect = selection.getRangeAt(0).getBoundingClientRect();
                                    const newPageId = createPageFromText(text, { x: rect.left, y: rect.bottom + 20 });

                                    // Use Span with data-node-id for custom handling
                                    const html = `<span data-node-id="${newPageId}" class="${styles.inlinePageChip}" contenteditable="false"><span class="${styles.inlinePageIcon}">📄</span>${text}</span>`;
                                    document.execCommand('insertHTML', false, html);
                                }
                            }
                        } else if (format === 'createLink') {
                            const url = prompt('Enter URL:');
                            if (url) {
                                document.execCommand('createLink', false, url);
                            }
                        } else {
                            document.execCommand(format, false, value);
                        }
                    }}
                />
            )}

            {/* Selection Rect Overlay */}
            {dragSelection && selectedBlockIds.size > 1 && (
                <div
                    className={styles.selectionRect}
                    style={{
                        left: Math.min(dragSelection.startX, dragSelection.currentX),
                        top: Math.min(dragSelection.startY, dragSelection.currentY),
                        width: Math.abs(dragSelection.currentX - dragSelection.startX),
                        height: Math.abs(dragSelection.currentY - dragSelection.startY)
                    }}
                />
            )}

            {/* Selection Counter */}
            {/* Selection Capsule (Dynamic Island) */}
            {selectedBlockIds.size > 1 && selectionIslandPortalId && (() => {
                const portalTarget = document.getElementById(selectionIslandPortalId);
                if (!portalTarget) return null;
                return createPortal(
                    <SelectionCapsule
                        count={selectedBlockIds.size}
                        onClear={() => setSelectedBlockIds(new Set())}
                        onDelete={deleteSelectedBlocks}
                        onCopy={handleCopySelection}
                    />,
                    portalTarget
                );
            })()}

            {/* Fallback for non-portal mode */}
            {selectedBlockIds.size > 1 && !selectionIslandPortalId && (
                <SelectionCapsule
                    count={selectedBlockIds.size}
                    onClear={() => setSelectedBlockIds(new Set())}
                    onDelete={deleteSelectedBlocks}
                    onCopy={handleCopySelection}
                />
            )}
        </div>
    );
});
