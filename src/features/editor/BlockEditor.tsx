import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, BlockType } from './types';
import styles from './BlockEditor.module.css';

import { SlashMenu } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { FloatingToolbar } from './FloatingToolbar';

import { parseClipboardData } from './pasteUtils';
import { BlockItem } from './BlockItem';
import { useStore } from '../../store/useStore';

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
}

import { memo } from 'react';

// ... imports

export const BlockEditor = memo(function BlockEditor({ initialContent, onUpdate, readOnly, autoFocus, minimal, nodeId, hideBlockHandles, disableMediaControls, promoteBlockHandles }: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [blocks, setBlocks] = useState<Block[]>(() => {
        if (Array.isArray(initialContent)) return initialContent;
        // Migration for legacy string content
        return [{ id: uuidv4(), type: 'text', content: typeof initialContent === 'string' ? initialContent : '' }];
    });

    // Slash Menu State
    const [slashMenuState, setSlashMenuState] = useState<{ anchorRect: DOMRect | { top: number; left: number; bottom: number }, blockId: string } | null>(null);
    // Block Menu State
    const [blockMenuState, setBlockMenuState] = useState<{ x: number, y: number, blockId: string } | null>(null);

    // Focus State
    const [focusId, setFocusId] = useState<string | null>(null);
    const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});

    // Toolbar Selection State
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

    // Multi-selection State
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
    const selectionRef = useRef(selectedBlockIds);

    // Sync ref
    useEffect(() => {
        selectionRef.current = selectedBlockIds;
    }, [selectedBlockIds]);

    const [dragSelection, setDragSelection] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const wasDraggingRef = useRef(false);

    // Sync changes to refs for stable handlers
    const blocksRef = useRef(blocks);
    const selectedBlockIdsRef = useRef(selectedBlockIds);
    const slashMenuStateRef = useRef(slashMenuState);

    useLayoutEffect(() => {
        blocksRef.current = blocks;
        selectedBlockIdsRef.current = selectedBlockIds;
        slashMenuStateRef.current = slashMenuState;
    });

    const [mouseDownBlock, setMouseDownBlock] = useState<{ id: string, startX: number, startY: number, initialRect: DOMRect, isInteractive: boolean } | null>(null);

    // Selection Logic Effect
    useEffect(() => {
        if (!dragSelection && !mouseDownBlock) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!editorRef.current) return;
            const editorRect = editorRef.current.getBoundingClientRect();

            // ESCALATION LOGIC: Switch to Block Selection if dragging out of initial block
            if (mouseDownBlock && !dragSelection) {
                const { initialRect } = mouseDownBlock;
                // Check if mouse has left the vertical bounds (or significantly horizontal) of the starting block
                // We use a small buffer to prevent accidental triggers
                const isOutside =
                    e.clientY < initialRect.top ||
                    e.clientY > initialRect.bottom ||
                    e.clientX < initialRect.left - 50 || // Horizontal buffer (gutters are safe)
                    e.clientX > initialRect.right + 50;

                if (isOutside) {
                    // Trigger Escalation
                    window.getSelection()?.removeAllRanges(); // Clear text selection

                    // Shift focus to editor container to prevent text input but capture hotkeys
                    if (editorRef.current) {
                        editorRef.current.focus();
                    }

                    // Calculate Scale
                    const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;

                    // Normalize to CSS pixels
                    const relX = (mouseDownBlock.startX - editorRect.left) / scale;
                    const relY = (mouseDownBlock.startY - editorRect.top) / scale;
                    const currentRelX = (e.clientX - editorRect.left) / scale;
                    const currentRelY = (e.clientY - editorRect.top) / scale;

                    setDragSelection({
                        startX: relX,
                        startY: relY,
                        currentX: currentRelX,
                        currentY: currentRelY
                    });
                    setSelectedBlockIds(new Set([mouseDownBlock.id]));
                    wasDraggingRef.current = true;
                    return;
                }
            }

            // Regular Block Selection Drag
            if (dragSelection) {
                // Calculate Scale
                const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;

                // Normalize current mouse pos to CSS pixels
                const cx = (e.clientX - editorRect.left) / scale;
                const cy = (e.clientY - editorRect.top) / scale;

                if (!wasDraggingRef.current && (Math.abs(cx - dragSelection.startX) > 5 || Math.abs(cy - dragSelection.startY) > 5)) {
                    wasDraggingRef.current = true;
                }

                setDragSelection(prev => prev ? {
                    ...prev,
                    currentX: cx,
                    currentY: cy
                } : null);
            }
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            // Click Logic (No Drag)
            if (!wasDraggingRef.current && mouseDownBlock) {
                if (!e.shiftKey && !e.ctrlKey) {
                    if (mouseDownBlock.isInteractive) {
                        // Clicked interactive content (Text) -> Clear Selection (Edit Mode)
                        if (selectedBlockIds.size > 0) setSelectedBlockIds(new Set());
                    } else {
                        // Clicked Handle/Background -> Exclusive Selection
                        if (selectedBlockIds.size !== 1 || !selectedBlockIds.has(mouseDownBlock.id)) {
                            setSelectedBlockIds(new Set([mouseDownBlock.id]));
                        }
                    }
                }
            }

            setDragSelection(null);
            setMouseDownBlock(null);
            // wasDraggingRef remains true for the subsequent click event
            setTimeout(() => { wasDraggingRef.current = false; }, 0);
        };

        // Calculate intersections live
        if (dragSelection && editorRef.current) {
            // Normalize selection box (relative to editor)
            const left = Math.min(dragSelection.startX, dragSelection.currentX);
            const top = Math.min(dragSelection.startY, dragSelection.currentY);
            const width = Math.abs(dragSelection.currentX - dragSelection.startX);
            const height = Math.abs(dragSelection.currentY - dragSelection.startY);
            const selectionBox = { left, top, right: left + width, bottom: top + height };

            const newSelected = new Set<string>(); // Start fresh or keep additive? Notion is replacing usually unless Shift.
            // But we have mouseDownBlock which should be included? 
            // Actually, if we are escalating, we want to start fresh to avoid stale state, but include what we touch.

            // If dragging, we recalculate everything based on box
            const editorRect = editorRef.current.getBoundingClientRect();
            // Calculate Scale if zoomed
            const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;

            blocks.forEach(block => {
                const el = blockRefs.current[block.id];
                if (el) {
                    const blockRect = el.getBoundingClientRect();
                    // Normalize block position to CSS pixels (handling zoom)
                    const blockRelative = {
                        left: (blockRect.left - editorRect.left) / scale,
                        top: (blockRect.top - editorRect.top) / scale,
                        right: (blockRect.right - editorRect.left) / scale,
                        bottom: (blockRect.bottom - editorRect.top) / scale
                    };

                    // Simple AABB intersection
                    if (
                        blockRelative.left < selectionBox.right &&
                        blockRelative.right > selectionBox.left &&
                        blockRelative.top < selectionBox.bottom &&
                        blockRelative.bottom > selectionBox.top
                    ) {
                        newSelected.add(block.id);
                    }
                }
            });

            if (newSelected.size > 0) {
                setSelectedBlockIds(newSelected);
            }
        }

        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragSelection, blocks, mouseDownBlock]);

    // Clear selection when clicking outside the editor
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!editorRef.current) return;
            const target = e.target as HTMLElement;

            // If click is inside editor, let editor internal logic handle it
            if (editorRef.current.contains(target)) return;

            // If click is inside a Portal (Menu, Toolbar), ignore
            if (
                target.closest(`.${styles.slashMenu}`) ||
                target.closest(`.${styles.floatingToolbar}`)
            ) {
                return;
            }

            // If click is outside editor (and not stopped by Portals like BlockMenu), clear selection
            if (selectedBlockIds.size > 0) {
                setSelectedBlockIds(new Set());
            }
        };

        // Use Capture to ensure we catch clicks even if Canvas/Other components stop propagation
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [selectedBlockIds]);

    // Auto-focus effect
    useEffect(() => {
        if (autoFocus && !focusId && blocks.length > 0) {
            const targetId = blocks[blocks.length - 1].id;
            setFocusId(targetId);
        }
    }, []); // Run once on mount

    // Selection Monitor
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                setSelectionRect(null);
                return;
            }

            const range = selection.getRangeAt(0);

            // Validate that range is inside the editor
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
                const rect = range.getBoundingClientRect();
                // Only show if selection width is substantial (avoid flashing on clicks)
                if (rect.width > 2) {
                    setSelectionRect(rect);
                } else {
                    setSelectionRect(null);
                }
            } else {
                setSelectionRect(null);
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    // Sync with external content updates (e.g. Fusion)
    // Sync with external content updates (e.g. Fusion)
    useEffect(() => {
        if (initialContent) {
            const nextContent = Array.isArray(initialContent) ? initialContent : [{ id: uuidv4(), type: 'text' as const, content: typeof initialContent === 'string' ? initialContent : '' }];

            setBlocks(prev => {
                // Optimization: Avoid re-render if content is identical
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

    // Handle converting the CURRENT block to another type (via slash menu or shortcuts)
    const convertBlock = useCallback((id: string | undefined, type: BlockType, metadata?: any) => {
        const targetId = id || (slashMenuStateRef.current ? slashMenuStateRef.current.blockId : null);
        if (!targetId) return;

        setBlocks(prev => {
            const newBlocks = prev.map(b =>
                b.id === targetId
                    ? {
                        ...b,
                        type,
                        // Content preserved by default
                        metadata: type === 'columns' ? {
                            columns: Array.from({ length: metadata?.count || 2 }).map(() => ({ id: uuidv4(), content: [] }))
                        } : b.metadata
                    }
                    : b
            );
            onUpdate?.(newBlocks);
            return newBlocks;
        });

        // Trigger Split Check if it's a structural type
        if (['heading1', 'heading2', 'heading3', 'toggle', 'divider'].includes(type)) {
            checkForSplit(targetId);
        }

        setFocusId(targetId); // Keep focus
        setSlashMenuState(null);
    }, [onUpdate]); // Stable dependencies

    const updateBlock = useCallback((id: string, contentOrPatch: string | Partial<Block>) => {
        setBlocks(prev => {
            const newBlocks = prev.map(b => {
                if (b.id !== id) return b;

                if (typeof contentOrPatch === 'string') {
                    return { ...b, content: contentOrPatch };
                } else {
                    return { ...b, ...contentOrPatch };
                }
            });
            onUpdate?.(newBlocks);
            return newBlocks;
        });

        if (typeof contentOrPatch === 'string') {
            const content = contentOrPatch;
            // Define auto-split helper (DEBOUNCED or conditional?)
            // We want to trigger it AFTER conversion to type.

            if (content === '# ') {
                convertBlock(id, 'heading1');
                // Immediate split if not first block?
                checkForSplit(id);
                return;
            }
            if (content === '## ') {
                convertBlock(id, 'heading2');
                checkForSplit(id);
                return;
            }
            if (content === '### ') {
                convertBlock(id, 'heading3');
                checkForSplit(id);
                return;
            }
            if (content === '> ') { convertBlock(id, 'quote'); return; }
            if (content === '>> ') { convertBlock(id, 'toggle'); return; }
            if (content === '--- ') { convertBlock(id, 'divider'); return; } // needs space usually to confirm? or just ---
            if (content === '[] ' || content === '- ') { convertBlock(id, 'todo'); return; }

            // Slash menu
            if (content.startsWith('/')) {
                if (!slashMenuStateRef.current || slashMenuStateRef.current.blockId !== id) {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0 && editorRef.current) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        setSlashMenuState({
                            anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right } as any,
                            blockId: id
                        });
                    }
                }
            } else if (slashMenuStateRef.current) {
                setSlashMenuState(null);
            }
        }
    }, [onUpdate, convertBlock]);

    // NEW Helper to trigger split
    const checkForSplit = (blockId: string) => {
        // We have nodeId prop.
        if (!nodeId) return;

        // Check Index: prevent splitting the very first block
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === blockId);
            if (index > 0) {
                // It is NOT the first block. Trigger split.
                // Pass 'prev' as the current content source of truth
                useStore.getState().splitNode(nodeId, blockId, prev);
            }
            return prev;
        });
    };

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
            onUpdate?.(newBlocks);
            return newBlocks;
        });
        setFocusId(newBlock.id);
        setSlashMenuState(null);
    }, [onUpdate]);

    const removeBlock = useCallback((id: string) => {
        setBlocks(prev => {
            if (prev.length <= 1) return prev;
            const index = prev.findIndex(b => b.id === id);
            const newBlocks = prev.filter(b => b.id !== id);

            if (index > 0) {
                setFocusId(prev[index - 1].id);
            }
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);



    const handleBlockMenuAction = useCallback((action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split', value?: any) => {
        if (!blockMenuState) return;
        const { blockId } = blockMenuState;

        // Use direct state instead of ref to ensure consistency
        const idsToUpdate = selectedBlockIds.has(blockId)
            ? Array.from(selectedBlockIds)
            : [blockId];

        // Ensure we have valid targets
        const targetIds = idsToUpdate.length > 0 ? idsToUpdate : [blockId];

        const applyToBlocks = (blockHandler: (block: Block) => Block) => {
            setBlocks(prev => {
                const newBlocks = prev.map(b => targetIds.includes(b.id) ? blockHandler(b) : b);
                onUpdate?.(newBlocks);
                return newBlocks;
            });
        };

        switch (action) {
            case 'turnInto':
                setBlocks(prev => {
                    const newBlocks = prev.map(b => {
                        if (targetIds.includes(b.id)) {
                            // Preserve content, change type.
                            // Reset indent for non-list / non-indented types?
                            // Notion keeps indent usually.
                            return { ...b, type: value };
                        }
                        return b;
                    });
                    onUpdate?.(newBlocks);
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
                    // Find indices
                    const indices = targetIds.map(id => prev.findIndex(b => b.id === id)).filter(i => i !== -1).sort((a, b) => a - b);
                    const lastIndex = indices[indices.length - 1];

                    if (lastIndex === undefined) return prev;

                    const copies = indices.map(i => {
                        const b = prev[i];
                        return { ...b, id: uuidv4(), indent: b.indent || 0 };
                    });

                    newBlocks.splice(lastIndex + 1, 0, ...copies);
                    onUpdate?.(newBlocks);
                    return newBlocks;
                });
                break;
            case 'delete':
                setBlocks(prev => {
                    const newBlocks = prev.filter(b => !targetIds.includes(b.id));
                    onUpdate?.(newBlocks);
                    return newBlocks;
                });
                setSelectedBlockIds(new Set());
                break;
            case 'split':
                if (nodeId) {
                    useStore.getState().splitNode(nodeId, blockId, blocks);
                }
                break;
        }
        setBlockMenuState(null);
    }, [blockMenuState, selectedBlockIds, blocks, nodeId, onUpdate]);

    // Indentation Handlers
    const handleIndent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index <= 0) return prev; // Can't indent first block (or logic to allow it but usually depends on prev)

            // Limit indent to e.g. 8 levels
            const currentIndent = prev[index].indent || 0;
            if (currentIndent >= 8) return prev;

            // Logic: Can only indent if previous block is at least at same level or one less?
            // Notion logic: Indent level <= (prevBlock.indent + 1)
            const prevBlock = prev[index - 1];
            const prevIndent = prevBlock.indent || 0;

            if (currentIndent >= prevIndent + 1) return prev; // Cannot be deeper than parent + 1

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent + 1 };
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleOutdent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;

            const currentIndent = prev[index].indent || 0;
            if (currentIndent <= 0) return prev;

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent - 1 };

            // Optional: Outdent children? Notion outdents subtree. 
            // For now simpler: just single block.

            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string, content: string) => {
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
                const range = selection.getRangeAt(0);
                const preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(target);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                return preCaretRange.toString().length;
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

                    onUpdate?.(newBlocks);
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
                        onUpdate?.(newBlocks);
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
                        onUpdate?.(newBlocks);
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
        }
    }, [handleIndent, handleOutdent, convertBlock, addBlock, removeBlock, onUpdate]);

    // Native Reorder Handler
    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => {
        setBlocks(prev => {
            // Check for multi-block move from external/internal source
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

            // Fallback for internal single drag if dataTransfer didn't help (though it should)
            if (blocksToMove.length === 0) {
                const fromIndex = prev.findIndex(b => b.id === sourceId);
                if (fromIndex !== -1) {
                    blocksToMove = [prev[fromIndex]];
                    sourceIds = [sourceId];
                }
            }

            if (blocksToMove.length === 0) return prev;

            // Remove *all* source blocks from current list (logic handles both internal reorder and cross-editor move if IDs match)
            // Filter out blocks that are being moved (so we don't duplicate if internal)
            // Note: If external move, IDs won't be in `prev` (unless collision), so filter does nothing, which is correct.
            const newBlocks = prev.filter(b => !sourceIds.includes(b.id));

            // Find insertion index in the cleaned list
            const targetIndex = newBlocks.findIndex(b => b.id === targetId);
            if (targetIndex === -1 && newBlocks.length > 0) return prev; // Should be rare

            const insertIndex = targetIndex === -1
                ? newBlocks.length // Append if target not found (empty or fail)
                : position === 'top' ? targetIndex : targetIndex + 1;

            newBlocks.splice(insertIndex, 0, ...blocksToMove);

            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleBlockDragStart = useCallback((e: React.DragEvent, block: Block) => {
        const isMulti = selectedBlockIds.has(block.id) && selectedBlockIds.size > 1;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('application/infonote-block-id', block.id); // Primary ID for single/legacy
        e.dataTransfer.setData('application/reactflow-block-type', block.type);

        const blocksToDrag = isMulti
            ? blocks.filter(b => selectedBlockIds.has(b.id))
            : [block];

        if (nodeId) {
            e.dataTransfer.setData('application/infonote-block-data', JSON.stringify({
                block, // For legacy receivers
                blocks: blocksToDrag, // For new receivers
                sourceNodeId: nodeId
            }));
        }
    }, [selectedBlockIds, blocks, nodeId]);

    // Handle Global Delete for Selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedBlockIds.size === 0) return;

            // Only handle if editor is focused or one of its children
            if (!editorRef.current?.contains(document.activeElement)) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                // If editing text inside a block, don't delete the block unless empty? 
                // Actually, standard behavior usually deletes selection if not in edit mode.
                // But we are somewhat always in edit mode.
                // Let's check if the user has a text selection range that is collapsed?
                // Let's check if the user has a text selection range that is collapsed?
                // const selection = window.getSelection(); // Unused
                // If selection spans multiple blocks or we have "Block Selection Mode" active logic:
                // If selection spans multiple blocks or we have "Block Selection Mode" active logic:
                // Since we rely on manual selection mode via drag/click, we can assume intent to delete blocks.

                e.preventDefault();
                setBlocks(prev => {
                    const newBlocks = prev.filter(b => !selectedBlockIds.has(b.id));
                    onUpdate?.(newBlocks);
                    return newBlocks;
                });
                setSelectedBlockIds(new Set());
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedBlockIds, onUpdate]);

    const handleBlockPaste = useCallback(async (e: React.ClipboardEvent, blockId: string) => {
        // Prevent default paste
        e.preventDefault();

        const parsedBlocks = await parseClipboardData(e);
        if (parsedBlocks.length === 0) return;

        console.log("Pasted blocks:", parsedBlocks);

        const firstBlock = parsedBlocks[0];
        const remainingBlocks = parsedBlocks.slice(1);

        // 1. Handle the first block
        // If it's text-like, insert into current cursor position
        if (firstBlock.type === 'text') {
            // Using deprecated but effective execCommand to insert text at caret and trigger input events
            if (firstBlock.content) document.execCommand('insertText', false, firstBlock.content);
        } else {
            // If first block is media or structured, treat it as a block to be inserted
            remainingBlocks.unshift(firstBlock);
        }


        // 2. Insert remaining blocks after the current one
        if (remainingBlocks.length > 0) {
            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;

                const newBlocks = [...prev];
                newBlocks.splice(index + 1, 0, ...remainingBlocks);
                onUpdate?.(newBlocks);
                return newBlocks;
            });
        }
    }, [onUpdate]);



    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Handle File Drops
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
                            onUpdate?.(newBlocks);
                            return newBlocks;
                        });
                    }
                };
                reader.readAsDataURL(file);
            });
            return;
        }

        // Handle Sidebar new block drops OR Reorder drops
        const type = e.dataTransfer.getData('application/reactflow-block-type') as BlockType;
        if (type) {
            const sourceBlockId = e.dataTransfer.getData('application/infonote-block-id');
            if (sourceBlockId) {
                // Moved into empty space -> Move to bottom

                // Case: Empty Editor (dropping into empty column)
                if (blocks.length === 0) {
                    try {
                        const rawData = e.dataTransfer.getData('application/infonote-block-data');
                        if (rawData) {
                            const parsed = JSON.parse(rawData);
                            if (parsed.block || parsed.blocks) {
                                // Ensure we don't duplicate if it somehow exists
                                const newBlocks = parsed.blocks || [parsed.block];
                                setBlocks(newBlocks);
                                onUpdate?.(newBlocks);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to drop into empty column", err);
                    }
                    return;
                }

                // Case: Append to end of existing list
                // Pass dataTransfer so handleMoveBlock can extract external data if needed
                const lastId = blocks[blocks.length - 1].id;
                handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
                return;
            }

            const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
            addBlock(lastId, type);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleEditorClick = (e: React.MouseEvent) => {
        // If we just finished a drag selection, don't trigger click behavior
        if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            return;
        }

        if (e.target === editorRef.current) {
            e.preventDefault();

            // Clicking empty space clears selection (only if NOT dragging)
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
    };

    const handleBlockMenuOpen = useCallback((e: React.MouseEvent, id: string) => {
        // INTELLIGENT RIGHT-CLICK:
        // Cancel any pending left-click selection logic to prevent conflicts
        setMouseDownBlock(null);

        const target = e.target as HTMLElement;
        const isInteractive =
            target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA';

        const isHandle = target.closest(`.${styles.dragHandle}`);

        // Interactive (Text) + Single Selection => Native Menu (Return early)
        // Check if the block is even selected? Or if we just right-clicked it.
        // If we right-click an unselected text block, we usually want native menu too? Yes.
        // Notion: Right-clicking text -> Native. Right-clicking background -> Block Menu.
        // But if multiple selected -> Block Menu always.

        if (isInteractive && !isHandle) {
            // INTELLIGENT CONTEXT MENU:
            // 1. If block is NOT selected (Edit Mode), allow native menu (Copy/Paste etc)
            // 2. If block IS selected (Block Mode), suppress native and show Block Actions
            if (!selectedBlockIdsRef.current.has(id)) {
                // If we are in "Atomic/Promoted" mode (BlockNode), we WANT to bubble to the wrapper
                // so it can show the EditBar (Color/Delete/Duplicate).
                // If we are in standard mode (FusedNoteNode/Editor), we want to KEEP Native Menu,
                // so we MUST stop propagation to prevent the wrapper from stealing functionality.
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
    }, [promoteBlockHandles]);

    const handleSelectionMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        // Range Selection (Shift+Click)
        if (e.shiftKey && selectedBlockIdsRef.current.size > 0) {
            // If we have an existing selection, extend it to this block
            const lastSelectedId = Array.from(selectedBlockIdsRef.current).pop();
            if (lastSelectedId) {
                const startIdx = blocksRef.current.findIndex(b => b.id === lastSelectedId);
                const endIdx = blocksRef.current.findIndex(b => b.id === id);
                if (startIdx !== -1 && endIdx !== -1) {
                    e.preventDefault(); // Prevent text selection
                    const min = Math.min(startIdx, endIdx);
                    const max = Math.max(startIdx, endIdx);
                    const rangeIds = blocksRef.current.slice(min, max + 1).map(b => b.id);

                    setSelectedBlockIds(new Set(rangeIds));
                    return;
                }
            }
        }

        if (e.button === 0) {
            const target = e.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            setMouseDownBlock({
                id: id,
                startX: e.clientX,
                startY: e.clientY,
                initialRect: rect,
                isInteractive: false
            });
            e.stopPropagation();
        }
    }, []);

    const handleRegisterRef = useCallback((id: string, el: HTMLDivElement | null) => {
        blockRefs.current[id] = el;
    }, []);

    return (
        <div
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            tabIndex={-1}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={handleEditorClick}
            onMouseDown={(e) => {
                // Helper: Check if target is "interactive" (text, input, button)
                const target = e.target as HTMLElement;
                const isInteractive =
                    target.isContentEditable ||
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'BUTTON' ||
                    target.closest('button') ||
                    // target.closest('.nodrag') || // REMOVED: wrappers have nodrag but we want to select from them
                    target.closest(`.${styles.blockContent}`) || // Inside the actual text/content area
                    target.closest(`.${styles.dragHandle}`); // The handle itself

                // If user clicks directly on text/input, let browser handle text selection
                if (isInteractive && !e.ctrlKey) {
                    // Do NOT start block selection
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
        >
            {blocks.map(block => (
                <BlockItem
                    key={block.id}
                    block={block}
                    isSelected={selectedBlockIds.has(block.id)}
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
            ))}

            {slashMenuState && (
                <SlashMenu
                    anchorRect={slashMenuState.anchorRect}
                    filter={blocks.find(b => b.id === slashMenuState.blockId)?.content.substring(1) || ''}
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
                    onAction={handleBlockMenuAction}
                />
            )}
            {/* Floating Toolbar */}
            {selectionRect && !slashMenuState && !blockMenuState && (
                <FloatingToolbar
                    selectionRect={selectionRect}
                    onFormat={(format, value) => {
                        document.execCommand(format, false, value);
                        // Note: execCommand is simple but reliable for contentEditable.
                        // For advanced needs, we'd manually manipulate the range.
                    }}
                />
            )}

            {/* Selection Rect Overlay */}
            {dragSelection && (
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
        </div>
    );
});
