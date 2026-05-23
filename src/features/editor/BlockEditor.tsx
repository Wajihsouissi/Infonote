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
import { MIN_FUSED_SIZE } from '../../config/layout';

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
    syncUpdate?: boolean; // Instantly push updates to parent without debouncing
    editorId?: string; // Stable identifier for drag-and-drop tracking
}

import { memo } from 'react';

export const BlockEditor = memo(function BlockEditor({ initialContent, onUpdate, readOnly, autoFocus, minimal, nodeId, hideBlockHandles, disableMediaControls, promoteBlockHandles, selectionIslandPortalId, syncUpdate, editorId }: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const editorInstanceId = useRef(editorId || `editor-${uuidv4()}`);
    const nodeColor = useStore(s => (s.nodes.find(n => n.id === nodeId)?.data as any)?.color);
    const theme = useStore(s => s.theme);
    const [blocks, setBlocks] = useState<Block[]>(() => {
        if (Array.isArray(initialContent) && initialContent.length > 0) return initialContent;
        // Migration for legacy string content or empty array
        return [{ id: uuidv4(), type: 'text', content: typeof initialContent === 'string' ? initialContent : '' }];
    });

    // Block Menu State
    const [blockMenuState, setBlockMenuState] = useState<{ x: number, y: number, blockId: string } | null>(null);

    // Focus State
    const [focusId, setFocusId] = useState<string | null>(null);
    const caretPositionRef = useRef<'start' | 'end' | number | null>(null);
    const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const autoFocusDoneRef = useRef(false);

    // Create a stable debounced update function
    const timeoutRef = useRef<any>(null);
    const debouncedOnUpdate = useCallback((newBlocks: Block[]) => {
        if (syncUpdate) {
            onUpdate?.(newBlocks);
            return;
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onUpdate?.(newBlocks);
            timeoutRef.current = null;
        }, 300); // 300ms debounce for store sync
    }, [onUpdate, syncUpdate]);

    // Sync external content and block-level updates

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                onUpdate?.(blocksRef.current);
            }
        };
    }, [onUpdate]);

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
        addBlock,
        editorId: editorInstanceId.current
    });

    const handleDragStartWrapped = useCallback((e: React.DragEvent, block: Block) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            onUpdate?.(blocksRef.current);
            timeoutRef.current = null;
        }
        handleBlockDragStart(e, block);
    }, [handleBlockDragStart, onUpdate]);

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

    // Listen for drag completion events — restore focus after native HTML5 drag blurs it
    const dragClearedRef = useRef(false);
    useEffect(() => {
        const tryFocusEditor = () => {
            // Guard: if this editor's node no longer exists or has no content, do NOT
            // attempt to restore focus — the node was likely the drag source and was
            // deleted/emptied. Focusing a stale block ID would permanently jam focusId.
            if (nodeId) {
                const storeState = useStore.getState();
                const node = storeState.nodes.find(n => n.id === nodeId);
                const freshBlocks = (node?.data as { content?: unknown } | undefined)?.content;
                // Node deleted or emptied — this editor should not steal focus
                if (!node || !Array.isArray(freshBlocks) || freshBlocks.length === 0) {
                    return false;
                }
                caretPositionRef.current = 'end';
                setFocusId(freshBlocks[0].id);
                return true;
            }
            // No nodeId (standalone editor not linked to a canvas node): use local blocks
            const firstBlock = blocksRef.current[0];
            if (firstBlock) {
                caretPositionRef.current = 'end';
                setFocusId(firstBlock.id);
                return true;
            }
            return false;
        };

        const handleDragCleanup = (e: Event) => {
            if (dragClearedRef.current) return;
            dragClearedRef.current = true;
            setTimeout(() => { dragClearedRef.current = false; }, 300);

            setDragSelection(null);
            setMouseDownBlock(null);
            if (selectedBlockIds.size > 0) setSelectedBlockIds(new Set());

            // Only restore focus if this event is for this specific editor, or if it's a
            // broadcast (no targetEditorId). Cross-editor drops broadcast without a target
            // so we guard by checking the node still has content (in tryFocusEditor).
            const detail = (e as CustomEvent).detail;
            if (detail?.targetEditorId && detail.targetEditorId !== editorInstanceId.current) {
                // Event is targeted at a different editor — skip focus restoration
                return;
            }

            // Restore focus — native HTML5 drag blurs the active element
            tryFocusEditor();
        };

        window.addEventListener('chnk-it-clear-selection', handleDragCleanup);
        return () => window.removeEventListener('chnk-it-clear-selection', handleDragCleanup);
    }, [selectedBlockIds.size, setSelectedBlockIds, setDragSelection, setMouseDownBlock, nodeId]);

    // Auto-focus effect
    useEffect(() => {
        if (!autoFocus) return;
        if (autoFocusDoneRef.current) return;
        if (focusId) return;
        if (blocks.length === 0) return;

        autoFocusDoneRef.current = true;
            const targetId = blocks[blocks.length - 1].id;
            setFocusId(targetId);
    }, [autoFocus, blocks.length, focusId]);

    // Sync with external content updates (e.g. Fusion / collab)
    useEffect(() => {
        if (initialContent) {
            setBlocks(prev => {
                // Construct nextContent based on initialContent but reusing prev IDs where possible to prevent DOM unmounts
                const nextContent = Array.isArray(initialContent)
                    ? (initialContent.length > 0 
                        ? initialContent 
                        : (prev.length === 1 && prev[0].type === 'text' && prev[0].content === '' 
                            ? prev 
                            : [{ id: uuidv4(), type: 'text' as const, content: '' }]))
                    : (prev.length === 1 && prev[0].type === 'text' && prev[0].content === initialContent
                        ? prev
                        : [{ id: uuidv4(), type: 'text' as const, content: typeof initialContent === 'string' ? initialContent : '' }]);

                if (timeoutRef.current) {
                    // If actively typing, merge all other blocks but keep the editing block local
                    const activeEl = document.activeElement;
                    let activeBlockId: string | null = null;
                    if (activeEl) {
                        for (const [id, el] of Object.entries(blockRefs.current)) {
                            if (el === activeEl || el?.contains(activeEl)) {
                                activeBlockId = id;
                                break;
                            }
                        }
                    }

                    const localMap = new Map(prev.map(b => [b.id, b]));
                    const merged = nextContent.map(externalBlock => {
                        const localBlock = localMap.get(externalBlock.id);
                        if (localBlock) {
                            // If this block is actively focused and edited, preserve local state
                            if (externalBlock.id === activeBlockId) {
                                return localBlock;
                            }
                            return externalBlock;
                        }
                        return externalBlock;
                    });

                    // Keep local-only blocks that haven't synced yet
                    const externalIds = new Set(nextContent.map(b => b.id));
                    const localOnly = prev.filter(b => !externalIds.has(b.id));
                    if (localOnly.length > 0) {
                        merged.push(...localOnly);
                    }

                    if (JSON.stringify(prev) === JSON.stringify(merged)) {
                        return prev;
                    }
                    return merged;
                }

                if (JSON.stringify(prev) === JSON.stringify(nextContent)) {
                    return prev;
                }
                return nextContent;
            });
        }
    }, [initialContent]);

    // Force external synchronization when TOC rearranges blocks
    useEffect(() => {
        const handleForceSync = () => {
            if (initialContent) {
                setBlocks(prev => {
                    const nextContent = Array.isArray(initialContent)
                        ? (initialContent.length > 0 
                            ? initialContent 
                            : (prev.length === 1 && prev[0].type === 'text' && prev[0].content === '' 
                                ? prev 
                                : [{ id: uuidv4(), type: 'text' as const, content: '' }]))
                        : (prev.length === 1 && prev[0].type === 'text' && prev[0].content === initialContent
                            ? prev
                            : [{ id: uuidv4(), type: 'text' as const, content: typeof initialContent === 'string' ? initialContent : '' }]);
                    return nextContent;
                });
            }
        };
        window.addEventListener('chnk-it-force-editor-sync', handleForceSync);
        return () => window.removeEventListener('chnk-it-force-editor-sync', handleForceSync);
    }, [initialContent]);

    useEffect(() => {
        if (!focusId) return;

        const el = blockRefs.current[focusId];
        if (!el) {
            // Element not in DOM yet — clear focusId to avoid it getting permanently stuck.
            // The drag-cleanup handler will re-call setFocusId if a retry is needed.
            setFocusId(null);
            return;
        }

        el.focus();

        const pos = caretPositionRef.current;

        try {
            const selection = window.getSelection();
            const range = document.createRange();

            if (pos === 'start') {
                range.selectNodeContents(el);
                range.collapse(true);
            } else if (pos === 'end') {
                range.selectNodeContents(el);
                range.collapse(false);
            } else if (typeof pos === 'number') {
                // Walk text nodes to find the correct offset position
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
                let textNode = walker.nextNode();
                let currentOffset = 0;
                let found = false;

                while (textNode) {
                    const nodeLength = textNode.textContent?.length || 0;
                    if (currentOffset + nodeLength >= pos) {
                        range.setStart(textNode, pos - currentOffset);
                        range.collapse(true);
                        found = true;
                        break;
                    }
                    currentOffset += nodeLength;
                    textNode = walker.nextNode();
                }

                if (!found) {
                    range.selectNodeContents(el);
                    range.collapse(false);
                }
            } else {
                // default to end
                range.selectNodeContents(el);
                range.collapse(false);
            }

            selection?.removeAllRanges();
            selection?.addRange(range);
        } catch (e) {
            console.warn('Failed to set caret position', e);
        }

        caretPositionRef.current = null;
        setFocusId(null);
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

            // Slash menu: Only trigger if content starts with '/' and isn't followed immediately by whitespace
            if (content.startsWith('/') && !content.match(/^\/\s/)) {
                if (!slashMenuStateRef.current || slashMenuStateRef.current.blockId !== id) {
                    handleSlashOpen(id);
                }
            } else if (slashMenuStateRef.current) {
                setSlashMenuState(null);
            }
        }
    }, [debouncedOnUpdate, convertBlock, handleSlashOpen, slashMenuStateRef, setSlashMenuState]);

    const checkCaretFirstLine = useCallback((): boolean => {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return true;
            const range = selection.getRangeAt(0).cloneRange();
            const rects = range.getClientRects();
            if (rects.length === 0) return true;
            
            const activeEl = document.activeElement as HTMLElement;
            if (!activeEl) return true;
            
            const caretTop = rects[0].top;
            const blockRect = activeEl.getBoundingClientRect();
            const style = window.getComputedStyle(activeEl);
            const paddingTop = parseFloat(style.paddingTop || '0');
            const borderTop = parseFloat(style.borderTopWidth || '0');
            
            const contentTop = blockRect.top + paddingTop + borderTop;
            const lineHeight = parseFloat(style.lineHeight) || 24;
            
            return (caretTop - contentTop) < (lineHeight * 1.2);
        } catch (err) {
            return true;
        }
    }, []);

    const checkCaretLastLine = useCallback((): boolean => {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return true;
            const range = selection.getRangeAt(0).cloneRange();
            const rects = range.getClientRects();
            if (rects.length === 0) return true;
            
            const activeEl = document.activeElement as HTMLElement;
            if (!activeEl) return true;
            
            const caretBottom = rects[0].bottom;
            const blockRect = activeEl.getBoundingClientRect();
            const style = window.getComputedStyle(activeEl);
            const paddingBottom = parseFloat(style.paddingBottom || '0');
            const borderBottom = parseFloat(style.borderBottomWidth || '0');
            
            const contentBottom = blockRect.bottom - paddingBottom - borderBottom;
            const lineHeight = parseFloat(style.lineHeight) || 24;
            
            return (contentBottom - caretBottom) < (lineHeight * 1.2);
        } catch (err) {
            return true;
        }
    }, []);


    const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string, rawContent: string) => {
        // Normalize: browsers inject trailing \n and \u200B in contentEditable
        const content = rawContent.replace(/[\n\u200B]+$/, '');
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

            // Intercept for Fused Node Conversion
            if (nodeId && blocksRef.current.length >= 2) {
                const store = useStore.getState();
                const node = store.nodes.find(n => n.id === nodeId);
                if (node && node.type === 'block') {
                    // We manually split the block here so we can update the store synchronously
                    // before ReactFlow unmounts this BlockEditor.
                    const caretOffset = getCaretOffset();
                    const textBefore = content.substring(0, caretOffset);
                    const textAfter = content.substring(caretOffset);

                    const typeToCreate = currentBlock && ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type)
                        ? currentBlock.type
                        : 'text';
                    const indent = currentBlock?.indent || 0;

                    const newId = uuidv4();
                    const newBlock: Block = {
                        id: newId,
                        type: typeToCreate,
                        content: textAfter,
                        indent: indent
                    };

                    const index = blocksRef.current.findIndex(b => b.id === id);
                    const newBlocks = [...blocksRef.current];
                    if (index !== -1) {
                        newBlocks[index] = { ...newBlocks[index], content: textBefore };
                        newBlocks.splice(index + 1, 0, newBlock);
                    } else {
                        newBlocks.push(newBlock);
                    }

                    // Atomic update: change data + type + style in a single set() call
                    // to prevent the intermediate state where type='block' but content has 2+ blocks
                    store.setNodes((prev: any[]) => prev.map((n: any) => {
                        if (n.id !== nodeId) return n;
                        return {
                            ...n,
                            type: 'fused-note',
                            data: {
                                ...n.data,
                                content: newBlocks,
                                lastFusedAt: Date.now(),
                                isStandaloneBlock: true
                            },
                            style: {
                                ...n.style,
                                width: MIN_FUSED_SIZE,
                                height: undefined
                            }
                        };
                    }));

                    // Focus the new block after render
                    setTimeout(() => {
                        const node = store.nodes.find(n => n.id === nodeId);
                        if (node) {
                            const el = document.getElementById('block-' + newId)?.querySelector('[contenteditable="true"]');
                            if (el instanceof HTMLElement) {
                                el.focus();
                                try {
                                    const selection = window.getSelection();
                                    const range = document.createRange();
                                    range.selectNodeContents(el);
                                    range.collapse(false);
                                    selection?.removeAllRanges();
                                    selection?.addRange(range);
                                } catch (e) {
                                    console.warn("Error focusing new block after fusion swap:", e);
                                }
                            }
                        }
                    }, 100);
 
                    return; // Skip default addition
                }
            }


            if (currentBlock) {
                const caretOffset = getCaretOffset();
                const textBefore = content.substring(0, caretOffset);
                const textAfter = content.substring(caretOffset);

                let typeToCreate = ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type)
                    ? currentBlock.type
                    : 'text';

                let indent = currentBlock.indent || 0;
                
                // Notion-like behavior: If we press Enter on an expanded toggle, 
                // the new block should be indented inside it.
                if (currentBlock.type === 'toggle' && !currentBlock.metadata?.isCollapsed && caretOffset === content.length) {
                    typeToCreate = 'text'; // Usually starts with text inside
                    indent = indent + 1;
                }

                const newId = uuidv4();

                setBlocks(prev => {
                    const index = prev.findIndex(b => b.id === id);
                    if (index === -1) return prev;

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
                    return newBlocks;
                });
                caretPositionRef.current = 'start';
                setTimeout(() => setFocusId(newId), 0);
                return;
            }

            addBlock(id, 'text');

        } else if (e.key === 'Backspace') {
            const currentBlock = blocksRef.current.find(b => b.id === id);
            if (!currentBlock) return;

            const isEmpty = !content || content.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '').length === 0;

            if (isEmpty) {
                e.preventDefault();
                if ((currentBlock.indent || 0) > 0) {
                    handleOutdent(id);
                } else if (['bullet', 'numbered', 'todo', 'toggle', 'heading1', 'heading2', 'heading3', 'quote', 'callout', 'code'].includes(currentBlock.type)) {
                    convertBlock(id, 'text');
                } else {
                    caretPositionRef.current = 'end';
                    removeBlock(id);
                }
                return;
            }

            // Start of Block -> Outdent if indented, else Merge Up
            if (getCaretOffset() === 0) {
                const currentIndent = currentBlock.indent || 0;
                if (currentIndent > 0) {
                    e.preventDefault();
                    handleOutdent(id);
                    return;
                }
                             const index = blocksRef.current.findIndex(b => b.id === id);
                if (index > 0) {
                    e.preventDefault();
                    
                    const prevBlock = blocksRef.current[index - 1];

                    // Check if previous block is non-textual
                    const nonTextTypes = ['image', 'video', 'file', 'divider', 'columns', 'table', 'page'];
                    if (nonTextTypes.includes(prevBlock.type)) {
                        // If current block is empty or contains only whitespace, delete it and focus previous block
                        const isEmptyBlock = !content || content.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '').length === 0;
                        if (isEmptyBlock) {
                            removeBlock(id);
                        } else {
                            // Focus previous block (outline/container)
                            setFocusId(prevBlock.id);
                        }
                        return;
                    }

                    const prevLength = prevBlock.content.length;
                    setBlocks(prev => {
                        const newBlocks = [...prev];
                        newBlocks.splice(index, 1);
                        newBlocks[index - 1] = {
                            ...prevBlock,
                            content: prevBlock.content + content
                        };
                        debouncedOnUpdate(newBlocks);
                        return newBlocks;
                    });
                    caretPositionRef.current = prevLength;
                    setFocusId(prevBlock.id);
                }     }
                 } else if (e.key === 'Delete') {
            // End of Block -> Merge Down
            if (getCaretOffset() === content.length) {
                const index = blocksRef.current.findIndex(b => b.id === id);
                if (index < blocksRef.current.length - 1) {
                    e.preventDefault();
                    const nextBlock = blocksRef.current[index + 1];

                    // Check if next block is non-textual
                    const nonTextTypes = ['image', 'video', 'file', 'divider', 'columns', 'table', 'page'];
                    if (nonTextTypes.includes(nextBlock.type)) {
                        // If next block is a media or container, just focus it or delete it if it is a divider
                        if (nextBlock.type === 'divider') {
                            removeBlock(nextBlock.id);
                        } else {
                            setFocusId(nextBlock.id);
                        }
                        return;
                    }

                    const currentLength = content.length;
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
                    caretPositionRef.current = currentLength;
                    setFocusId(id);
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
                // Block navigation: Arrow Up at first line or empty block -> focus previous
                if (content === '' || checkCaretFirstLine()) {
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex > 0) {
                        e.preventDefault();
                        
                        // Find previous VISIBLE block
                        let prevVisibleIndex = currentIndex - 1;
                        while (prevVisibleIndex >= 0) {
                            const b = blocksRef.current[prevVisibleIndex];
                            // Check if this block is hidden by some parent toggle
                            let isHidden = false;
                            for (let i = 0; i < prevVisibleIndex; i++) {
                                const parent = blocksRef.current[i];
                                if (parent.type === 'toggle' && parent.metadata?.isCollapsed && (b.indent || 0) > (parent.indent || 0)) {
                                    isHidden = true;
                                    break;
                                }
                            }
                            if (!isHidden) break;
                            prevVisibleIndex--;
                        }

                        if (prevVisibleIndex >= 0) {
                            caretPositionRef.current = 'end';
                            setFocusId(blocksRef.current[prevVisibleIndex].id);
                        }
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
                // Block navigation: Arrow Down at last line of block -> focus next
                if (content === '' || checkCaretLastLine()) {
                    const currentIndex = blocksRef.current.findIndex(b => b.id === id);
                    if (currentIndex < blocksRef.current.length - 1) {
                        e.preventDefault();

                        // Find next VISIBLE block
                        let nextVisibleIndex = currentIndex + 1;
                        while (nextVisibleIndex < blocksRef.current.length) {
                            const b = blocksRef.current[nextVisibleIndex];
                            // Check if this block is hidden by some parent toggle (including the current block if it just collapsed)
                            let isHidden = false;
                            for (let i = 0; i < nextVisibleIndex; i++) {
                                const parent = blocksRef.current[i];
                                if (parent.type === 'toggle' && parent.metadata?.isCollapsed && (b.indent || 0) > (parent.indent || 0)) {
                                    isHidden = true;
                                    break;
                                }
                            }
                            if (!isHidden) break;
                            nextVisibleIndex++;
                        }

                        if (nextVisibleIndex < blocksRef.current.length) {
                            caretPositionRef.current = 'start';
                            setFocusId(blocksRef.current[nextVisibleIndex].id);
                        }
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

        setBlockMenuState(prev => {
            if (prev?.blockId === id) {
                // If we are toggling it off, we should ideally clear the selection. 
                // But we can't safely call setSelectedBlockIds from inside here without side-effects warning.
                // We'll just close the menu. The selection will stay unless they click away.
                // Or we can fire a timeout to clear it.
                setTimeout(() => setSelectedBlockIds(new Set()), 0);
                return null;
            }
            return { x: e.clientX, y: e.clientY, blockId: id };
        });
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
            data-chnk-it-block-editor
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            tabIndex={-1}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={(e) => handleEditorClick(e, wasDraggingRef.current)}
            onPointerDown={(e) => {
                if (e.ctrlKey) {
                    e.stopPropagation();
                }
            }}
            onMouseDown={(e) => {
                // Require Ctrl key for bulk selection
                if (!e.ctrlKey) {
                    return;
                }
                e.stopPropagation(); // Stop React Flow from grabbing the event for canvas selection
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
            {(() => {
                const visibleBlocks: { block: Block, listIndex?: number, hasChildren?: boolean }[] = [];

                blocks.forEach((block, index) => {
                    // Calculate List Index for numbered blocks
                    let listIndex = undefined;
                    if (block.type === 'numbered') {
                        let count = 1;
                        for (let i = index - 1; i >= 0; i--) {
                            if (blocks[i].type === 'numbered' && (blocks[i].indent || 0) === (block.indent || 0)) {
                                count++;
                            } else if ((blocks[i].indent || 0) < (block.indent || 0)) {
                                break;
                            }
                        }
                        listIndex = count;
                    }

                    // If this block is a toggle, calculate hasChildren
                    let hasChildren = false;
                    if (block.type === 'toggle') {
                        // Check if the next block in the flat list is indented relative to this one
                        if (index < blocks.length - 1 && (blocks[index + 1].indent || 0) > (block.indent || 0)) {
                            hasChildren = true;
                        }
                    }

                    visibleBlocks.push({ block, listIndex, hasChildren });
                });

                interface RenderNode {
                    type: 'block' | 'toggle-group';
                    block: Block;
                    listIndex?: number;
                    hasChildren?: boolean;
                    children: RenderNode[];
                }

                const buildRenderTree = (blocksList: typeof visibleBlocks): RenderNode[] => {
                    const root: RenderNode[] = [];
                    const stack: { node: RenderNode; indent: number }[] = [];

                    blocksList.forEach(item => {
                        const indent = item.block.indent || 0;

                        // Find the correct parent in the stack
                        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                            stack.pop();
                        }

                        const currentNode: RenderNode = {
                            type: item.block.type === 'toggle' ? 'toggle-group' : 'block',
                            block: item.block,
                            listIndex: item.listIndex,
                            hasChildren: item.hasChildren,
                            children: []
                        };

                        if (stack.length > 0) {
                            stack[stack.length - 1].node.children.push(currentNode);
                        } else {
                            root.push(currentNode);
                        }

                        if (item.block.type === 'toggle') {
                            stack.push({ node: currentNode, indent });
                        }
                    });

                    return root;
                };

                const renderNode = (node: RenderNode, parentToggleIndent?: number, forceReadOnly?: boolean): React.ReactNode => {
                    const currentReadOnly = readOnly || forceReadOnly;
                    if (node.type === 'block') {
                        return (
                            <BlockItem
                                key={node.block.id}
                                block={node.block}
                                index={node.listIndex}
                                hasChildren={node.hasChildren}
                                isSelected={selectedBlockIds.has(node.block.id)}
                                readOnly={currentReadOnly}
                                nodeId={nodeId}
                                hideBlockHandles={hideBlockHandles}
                                promoteBlockHandles={promoteBlockHandles}
                                disableMediaControls={disableMediaControls}
                                parentToggleIndent={parentToggleIndent}
                                minimal={minimal}
                                onUpdateBlock={updateBlock}
                                onKeyDown={handleKeyDown}
                                onPaste={handleBlockPaste}
                                onMoveBlock={handleMoveBlock}
                                onDragStart={handleDragStartWrapped}
                                onMenuOpen={handleBlockMenuOpen}
                                onSelectionClick={() => {
                                    if (selectedBlockIds.size > 0) {
                                        setSelectedBlockIds(new Set());
                                    }
                                }}
                                onSelectionMouseDown={handleSelectionMouseDown}
                                onRegisterRef={handleRegisterRef}
                            />
                        );
                    } else {
                        const showChildren = node.children && node.children.length > 0;
                        const relativeIndent = Math.max(0, (node.block.indent || 0) - (parentToggleIndent || 0));
                        const isCollapsed = node.block.metadata?.isCollapsed;
                        return (
                            <div 
                                key={node.block.id} 
                                className={styles.toggleGroupContainer}
                                style={{ marginLeft: `${relativeIndent * 24}px` }}
                            >
                                <BlockItem
                                    key={node.block.id}
                                    block={node.block}
                                    index={node.listIndex}
                                    hasChildren={node.hasChildren}
                                    isSelected={selectedBlockIds.has(node.block.id)}
                                    readOnly={currentReadOnly}
                                    nodeId={nodeId}
                                    hideBlockHandles={hideBlockHandles}
                                    promoteBlockHandles={promoteBlockHandles}
                                    disableMediaControls={disableMediaControls}
                                    parentToggleIndent={node.block.indent || 0}
                                    minimal={minimal}
                                    onUpdateBlock={updateBlock}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handleBlockPaste}
                                    onMoveBlock={handleMoveBlock}
                                    onDragStart={handleDragStartWrapped}
                                    onMenuOpen={handleBlockMenuOpen}
                                    onSelectionClick={() => {
                                        if (selectedBlockIds.size > 0) {
                                            setSelectedBlockIds(new Set());
                                        }
                                    }}
                                    onSelectionMouseDown={handleSelectionMouseDown}
                                    onRegisterRef={handleRegisterRef}
                                />
                                {showChildren && !isCollapsed && (
                                    <div className={styles.toggleChildrenContainer}>
                                        {node.children.map(child => renderNode(child, node.block.indent || 0, currentReadOnly))}
                                    </div>
                                )}
                            </div>
                        );
                    }
                };

                const renderTree = buildRenderTree(visibleBlocks);
                return renderTree.map(node => renderNode(node));
            })()}

            {slashMenuState && (
                <SlashMenu
                    anchorRect={slashMenuState.anchorRect}
                    filter={blocksRef.current.find(b => b.id === slashMenuState.blockId)?.content.substring(1) || ''}
                    onSelect={(type, meta) => convertBlock(undefined, type, meta, '')}
                    onClose={() => {
                        const targetId = slashMenuState.blockId;
                        setSlashMenuState(null);
                        setFocusId(targetId);
                    }}
                    nodeColor={nodeColor}
                    theme={theme}
                />
            )}

            {blockMenuState && (
                <BlockMenu
                    x={blockMenuState.x}
                    y={blockMenuState.y}
                    // blockId={blockMenuState.blockId} // Passed via closure/state to onAction
                    currentType={blocks.find(b => b.id === blockMenuState.blockId)?.type || 'text'}
                    onClose={() => {
                        const targetId = blockMenuState.blockId;
                        setBlockMenuState(prev => {
                            if (prev?.blockId === targetId) {
                                return null;
                            }
                            return prev;
                        });
                    }}
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
