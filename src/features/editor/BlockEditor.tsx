import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';

import type { Block } from './types';
import styles from './BlockEditor.module.css';

import { SlashMenu } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { FloatingToolbar } from './FloatingToolbar';
import { computeInlineFormat, getActiveInlineFormats, sourceText, targetText, type InlineFormat, type FormatTarget } from './inlineFormat';

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
    nodeId?: string; // New prop
    hideBlockHandles?: boolean;
    disableMediaControls?: boolean;
    promoteBlockHandles?: boolean;
    selectionIslandPortalId?: string; // Portal target for selection island
    syncUpdate?: boolean; // Instantly push updates to parent without debouncing
    editorId?: string; // Stable identifier for drag-and-drop tracking
    renderBetweenBlocks?: (index: number) => React.ReactNode;
    globalStartIndex?: number; // Starting index for numbered lists computed globally
}

import { memo } from 'react';

export const BlockEditor = memo(function BlockEditor({ initialContent, onUpdate, readOnly, autoFocus, minimal, nodeId, hideBlockHandles, disableMediaControls, promoteBlockHandles, selectionIslandPortalId, syncUpdate, editorId, renderBetweenBlocks, globalStartIndex = 1 }: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const editorInstanceId = useRef(editorId || `editor-${uuidv4()}`);

    // Remember the last non-empty selection made inside this editor as text
    // OFFSETS into the block's raw markdown (focused blocks are a single text
    // node). A toolbar click can then format that exact range even if the
    // drag-handle overlay or portal stole focus/selection on mousedown.
    const savedSelectionRef = useRef<FormatTarget | null>(null);
    useEffect(() => {
        const onSelChange = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            if (range.startContainer !== range.endContainer) return;
            if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
            const editable = range.startContainer.parentElement?.closest('[contenteditable="true"]') as HTMLElement | null;
            if (editable && editorRef.current?.contains(editable)) {
                savedSelectionRef.current = { host: editable, start: range.startOffset, end: range.endOffset };
            }
        };
        document.addEventListener('selectionchange', onSelChange);
        return () => document.removeEventListener('selectionchange', onSelChange);
    }, []);
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
    const caretPositionRef = useRef<'start' | 'end' | number | { x: number, line: 'last' | 'first', fallbackOffset: number } | null>(null);
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
    // Tracks the "nearest block + position" the cursor is over during a drag,
    // including the 8px gaps between blocks and the zones before/after all blocks.
    const dragDropTargetRef = useRef<{ blockId: string; position: 'top' | 'bottom' } | null>(null);

    const clearBlockDropIndicators = useCallback(() => {
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            el.removeAttribute('data-external-drop-target');
        });
        dragDropTargetRef.current = null;
    }, []);

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
        editorId: editorInstanceId.current,
        pendingDropTarget: dragDropTargetRef
    });

    // Container-level drag-over: covers the gap between blocks, above the first
    // block, and below the last block. The per-block handlers still fire for blocks
    // themselves; this fills the dead zones.
    const handleEditorDragOver = useCallback((e: React.DragEvent) => {
        handleDragOver(e); // e.preventDefault() + dropEffect

        const clientY = e.clientY;

        // Walk blocks top-to-bottom to find the insertion point.
        // Any Y above a block's bottom edge that is also above the block's midpoint → 'top' of that block.
        // Any Y in the gap above a block (below previous block's bottom) → 'top' of this block.
        // Y below all blocks → 'bottom' of last block.
        let target: { blockId: string; position: 'top' | 'bottom' } | null = null;

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const el = document.getElementById(`block-${block.id}`);
            if (!el) continue;
            const rect = el.getBoundingClientRect();

            if (clientY < rect.bottom) {
                // Cursor is above this block's bottom edge.
                // If cursor is above the block's top edge it's in the gap → insert before this block.
                // If cursor is inside the block, use midpoint to decide.
                const position: 'top' | 'bottom' = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
                target = { blockId: block.id, position };
                break;
            }
        }

        // Cursor is below all blocks
        if (!target && blocks.length > 0) {
            target = { blockId: blocks[blocks.length - 1].id, position: 'bottom' };
        }

        if (!target) return;

        // Only update DOM if target changed (avoids unnecessary attribute thrashing)
        const prev = dragDropTargetRef.current;
        if (prev?.blockId === target.blockId && prev?.position === target.position) return;

        // Clear old attribute
        if (prev) {
            document.getElementById(`block-${prev.blockId}`)?.removeAttribute('data-external-drop-target');
        }

        dragDropTargetRef.current = target;
        document.getElementById(`block-${target.blockId}`)?.setAttribute('data-external-drop-target', target.position);
    }, [blocks, handleDragOver]);

    const handleEditorDragLeave = useCallback((e: React.DragEvent) => {
        // Only clear when leaving the editor itself (not entering a child element)
        if (!editorRef.current?.contains(e.relatedTarget as Node)) {
            clearBlockDropIndicators();
        }
    }, [clearBlockDropIndicators]);

    const handleDragStartWrapped = useCallback((e: React.DragEvent, block: Block) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            onUpdate?.(blocksRef.current);
            timeoutRef.current = null;
        }
        handleBlockDragStart(e, block);
    }, [handleBlockDragStart, onUpdate]);

    // Escape / Delete key handling for block selection. Lives on `document`
    // because multi-select blurs the block contentEditables (focus moves to
    // the editor container), so per-block onKeyDown handlers never fire.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedBlockIds.size === 0) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                setSelectedBlockIds(new Set());
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                editorRef.current?.focus({ preventScroll: true });
                return;
            }

            if (e.key === 'Backspace' || e.key === 'Delete') {
                // Don't hijack typing — if focus sits in any editable element,
                // the per-block handler owns Backspace/Delete.
                const target = e.target as HTMLElement | null;
                const isEditableTarget = !!target && (
                    target.isContentEditable ||
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT'
                );
                if (isEditableTarget) return;

                e.preventDefault();
                deleteSelectedBlocks();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedBlockIds.size, setSelectedBlockIds, deleteSelectedBlocks]);

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

        el.focus({ preventScroll: true });
        
        // Ensure the newly focused block is fully visible within the closest scrollable container
        // Avoid using native scrollIntoView because it bubbles up and aggressively pans the ReactFlow canvas
        const scrollContainer = el.closest('[class*="custom-scrollbar"]') 
            || el.closest('[class*="noteArea"]')
            || el.closest('[style*="overflow-y"]')
            || el.parentElement;

        if (scrollContainer && scrollContainer !== document.body) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            
            // Check if element is out of view vertically
            if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
                // Scroll the container to center the element
                const scrollTarget = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
                scrollContainer.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        } else {
            // Safari/older browser fallback, use nearest to avoid large canvas jumps
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (e) {
                el.scrollIntoView({ block: 'nearest' });
            }
        }

        const pos = caretPositionRef.current;

        try {
            const selection = window.getSelection();
            const range = document.createRange();

            const setCaretByOffset = (targetOffset: number) => {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
                let textNode = walker.nextNode();
                let currentOffset = 0;
                let found = false;

                while (textNode) {
                    const nodeLength = textNode.textContent?.length || 0;
                    if (currentOffset + nodeLength >= targetOffset) {
                        range.setStart(textNode, targetOffset - currentOffset);
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
            };

            if (pos === 'start') {
                range.selectNodeContents(el);
                range.collapse(true);
                selection?.removeAllRanges();
                selection?.addRange(range);
            } else if (pos === 'end') {
                range.selectNodeContents(el);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
            } else if (typeof pos === 'object' && pos !== null && 'x' in pos) {
                const rect = el.getBoundingClientRect();
                const x = pos.x;
                const y = pos.line === 'last' ? rect.bottom - 10 : rect.top + 10;
                let rangeFromPoint: Range | null = null;
                
                try {
                    if (typeof document.caretRangeFromPoint === 'function') {
                        rangeFromPoint = document.caretRangeFromPoint(x, y);
                    } else if (typeof (document as any).caretPositionFromPoint === 'function') {
                        const caretPos = (document as any).caretPositionFromPoint(x, y);
                        if (caretPos) {
                            rangeFromPoint = document.createRange();
                            rangeFromPoint.setStart(caretPos.offsetNode, caretPos.offset);
                            rangeFromPoint.collapse(true);
                        }
                    }
                } catch (e) {
                    // Ignore
                }
                
                if (rangeFromPoint && el.contains(rangeFromPoint.commonAncestorContainer)) {
                    selection?.removeAllRanges();
                    selection?.addRange(rangeFromPoint);
                } else {
                    setCaretByOffset(pos.fallbackOffset);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                }
            } else if (typeof pos === 'number') {
                setCaretByOffset(pos);
                selection?.removeAllRanges();
                selection?.addRange(range);
            } else {
                // default to end
                range.selectNodeContents(el);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        } catch (e) {
            console.warn('Failed to set caret position', e);
        }

        caretPositionRef.current = null;
        setFocusId(null);
    }, [focusId, blocks]);

    useEffect(() => {
        const handleAIGenerate = (e: Event) => {
            const customEvent = e as CustomEvent;
            const { id, content } = customEvent.detail;
            
            import('./pasteUtils').then(({ parsePlainText }) => {
                const parsedBlocks = parsePlainText(content);
                if (parsedBlocks.length === 0) return;
                
                setBlocks(prev => {
                    const index = prev.findIndex(b => b.id === id);
                    if (index === -1) return prev;
                    
                    const indent = prev[index].indent || 0;
                    const formattedBlocks = parsedBlocks.map(b => ({ ...b, indent }));
                    
                    const newBlocks = [...prev];
                    newBlocks.splice(index, 1, ...formattedBlocks);
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });
                setTimeout(() => setFocusId(parsedBlocks[parsedBlocks.length - 1].id), 50);
            });
        };
        window.addEventListener('chnk-it-ai-generate', handleAIGenerate);
        return () => window.removeEventListener('chnk-it-ai-generate', handleAIGenerate);
    }, [setBlocks, debouncedOnUpdate, setFocusId]);

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

    const handleDeleteBlock = useCallback((id: string) => {
        removeBlock(id);
    }, [removeBlock]);

    // Resolve a format target (saved offsets, else the live source-mode
    // selection) to the block that owns it.
    const resolveFormatTarget = useCallback((explicit?: FormatTarget | null): { target: FormatTarget; blockId: string } | null => {
        let target = explicit && explicit.host.isConnected ? explicit : null;
        if (!target) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                const range = sel.getRangeAt(0);
                if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                    const host = range.startContainer.parentElement?.closest('[contenteditable="true"]') as HTMLElement | null;
                    if (host && editorRef.current?.contains(host)) {
                        target = { host, start: range.startOffset, end: range.endOffset };
                    }
                }
            }
        }
        if (!target) return null;
        for (const [id, el] of Object.entries(blockRefs.current)) {
            if (el && (el === target.host || el.contains(target.host))) return { target, blockId: id };
        }
        return null;
    }, []);

    // Write new raw text to a block: persist to state (updateBlock) AND sync the
    // focused block's text node directly for instant feedback, then restore the
    // selection. No execCommand — deterministic and always persists.
    const writeBlockText = useCallback((target: FormatTarget, blockId: string, text: string, selStart: number, selEnd: number) => {
        updateBlock(blockId, text);
        const host = target.host;
        const node = host.firstChild;
        if (node && node.nodeType === Node.TEXT_NODE) node.nodeValue = text;
        else host.textContent = text;
        host.focus({ preventScroll: true });
        const tn = host.firstChild;
        if (tn && tn.nodeType === Node.TEXT_NODE) {
            const len = (tn as Text).length;
            const r = document.createRange();
            r.setStart(tn, Math.min(selStart, len));
            r.setEnd(tn, Math.min(selEnd, len));
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(r);
            savedSelectionRef.current = { host, start: selStart, end: selEnd };
        }
    }, [updateBlock]);

    // Toggle a markdown format on the current (or saved) selection.
    const formatSelection = useCallback((format: InlineFormat, explicit?: FormatTarget | null) => {
        const resolved = resolveFormatTarget(explicit);
        if (!resolved) return;
        const { target, blockId } = resolved;
        const raw = sourceText(target.host);
        if (raw === null) return; // block not in source mode — refuse to corrupt
        const start = Math.min(target.start, raw.length);
        const end = Math.min(target.end, raw.length);
        const { text, selStart, selEnd } = computeInlineFormat(raw, start, end, format);
        writeBlockText(target, blockId, text, selStart, selEnd);
    }, [resolveFormatTarget, writeBlockText]);

    // Insert a markdown link [text](url) over the current (or saved) selection.
    const linkSelection = useCallback((explicit?: FormatTarget | null) => {
        const resolved = resolveFormatTarget(explicit);
        if (!resolved) return;
        const { target, blockId } = resolved;
        const raw = sourceText(target.host);
        if (raw === null) return;
        const start = Math.min(target.start, raw.length);
        const end = Math.min(target.end, raw.length);
        const text = raw.slice(start, end);
        if (!text.trim()) return;
        const url = prompt('Enter URL:');
        if (!url || !url.trim()) return;
        const link = `[${text}](${url.trim()})`;
        writeBlockText(target, blockId, raw.slice(0, start) + link + raw.slice(end), start, start + link.length);
    }, [resolveFormatTarget, writeBlockText]);

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
        const lowerKey = e.key.toLowerCase();

        // Inline formatting shortcuts. These wrap the selection in markdown
        // markers (see inlineFormat.ts) so they persist through save — the
        // native Ctrl+B/I/U would inject <b> tags that innerText strips.
        if (isCtrl && !e.shiftKey && lowerKey === 'b') {
            e.preventDefault();
            formatSelection('bold');
            return;
        }
        if (isCtrl && !e.shiftKey && lowerKey === 'i') {
            e.preventDefault();
            formatSelection('italic');
            return;
        }
        if (isCtrl && !e.shiftKey && lowerKey === 'u') {
            e.preventDefault();
            formatSelection('underline');
            return;
        }
        if (isCtrl && e.shiftKey && lowerKey === 's') {
            e.preventDefault();
            formatSelection('strikeThrough');
            return;
        }
        if (isCtrl && !e.shiftKey && lowerKey === 'e') {
            e.preventDefault();
            formatSelection('code');
            return;
        }
        if (isCtrl && !e.shiftKey && lowerKey === 'k') {
            e.preventDefault();
            linkSelection();
            return;
        }

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

        const getCaretX = () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    const rects = range.getClientRects();
                    if (rects.length > 0) return rects[0].left;
                } else {
                    return rect.left;
                }
            }
            return null;
        };

        // --- Toggle-aware Enter / Shift+Enter ---------------------------------------
        // A toggle is a header line plus indented content. We keep the header and its
        // content together as one unit and route the keys to build the toggle body:
        //   • Enter on the header        -> first content line inside the toggle
        //   • Shift+Enter inside content -> another content line inside the toggle
        //   • Enter inside content       -> a new toggle right under this toggle's body
        if (e.key === 'Enter' && !slashMenuStateRef.current) {
            const allBlocks = blocksRef.current;
            const idx = allBlocks.findIndex(b => b.id === id);
            const currentBlock = idx !== -1 ? allBlocks[idx] : undefined;

            if (currentBlock) {
                const curIndent = currentBlock.indent || 0;
                const isToggleHeader = currentBlock.type === 'toggle';

                // The enclosing toggle is the nearest preceding block with a smaller
                // indent; a toggle's content always sits at indent > the toggle's indent.
                let enclosingToggle: Block | null = null;
                for (let j = idx - 1; j >= 0; j--) {
                    if ((allBlocks[j].indent || 0) < curIndent) {
                        enclosingToggle = allBlocks[j].type === 'toggle' ? allBlocks[j] : null;
                        break;
                    }
                }
                const inToggleContent = !!enclosingToggle;

                if (isToggleHeader || inToggleContent) {
                    // Shift+Enter on the header keeps the native soft line-break.
                    if (e.shiftKey && isToggleHeader) {
                        return;
                    }

                    e.preventDefault();
                    const caretOffset = getCaretOffset();
                    const textBefore = content.substring(0, caretOffset);
                    const textAfter = content.substring(caretOffset);
                    const newId = uuidv4();

                    if (e.shiftKey && inToggleContent) {
                        // Clause 2: another content line inside the toggle (same indent).
                        setBlocks(prev => {
                            const i = prev.findIndex(b => b.id === id);
                            if (i === -1) return prev;
                            const nb = [...prev];
                            nb[i] = { ...nb[i], content: textBefore };
                            nb.splice(i + 1, 0, { id: newId, type: 'text', content: textAfter, indent: curIndent });
                            debouncedOnUpdate(nb);
                            return nb;
                        });
                    } else if (isToggleHeader) {
                        // Clause 1: Enter on the header -> first content line inside (indent + 1).
                        setBlocks(prev => {
                            const i = prev.findIndex(b => b.id === id);
                            if (i === -1) return prev;
                            const nb = [...prev];
                            nb[i] = { ...nb[i], content: textBefore, metadata: { ...nb[i].metadata, isCollapsed: false } };
                            nb.splice(i + 1, 0, { id: newId, type: 'text', content: textAfter, indent: curIndent + 1 });
                            debouncedOnUpdate(nb);
                            return nb;
                        });
                    } else {
                        // Clause 3: Enter inside content -> a new toggle.
                        const store = nodeId ? useStore.getState() : null;
                        const canvasNode = store ? store.nodes.find(n => n.id === nodeId) : null;

                        if (store && canvasNode && canvasNode.type === 'block') {
                            // On the canvas: spawn a SEPARATE toggle node below this one.
                            // Keep the text before the caret in this line; carry the rest into the new toggle.
                            if (textAfter) {
                                setBlocks(prev => {
                                    const i = prev.findIndex(b => b.id === id);
                                    if (i === -1) return prev;
                                    const nb = [...prev];
                                    nb[i] = { ...nb[i], content: textBefore };
                                    debouncedOnUpdate(nb);
                                    return nb;
                                });
                            }
                            const newNodeId = uuidv4();
                            const newToggleBlock: Block = {
                                id: newId,
                                type: 'toggle',
                                content: textAfter,
                                indent: 0,
                                metadata: { isCollapsed: false }
                            };
                            const parentId = canvasNode.parentId || undefined;
                            const nodesInColumn = store.nodes.filter(n =>
                                n.type === 'block' &&
                                (n.data as any)?.isStandaloneBlock &&
                                Math.abs(n.position.x - canvasNode.position.x) < 10 &&
                                n.parentId === parentId
                            );
                            const position = nodesInColumn.length >= 5
                                ? {
                                    x: canvasNode.position.x + (Number(canvasNode.style?.width) || 432) + 16,
                                    y: Math.min(...nodesInColumn.map(n => n.position.y))
                                }
                                : {
                                    x: canvasNode.position.x,
                                    y: canvasNode.position.y + (Number(canvasNode.style?.height) || 100) + 16
                                };

                            store.addNode(
                                'block',
                                position,
                                { content: [newToggleBlock], isStandaloneBlock: true },
                                { width: canvasNode.style?.width || 432, height: canvasNode.style?.height || 100 },
                                parentId,
                                newNodeId
                            );
                            store.setNodes((nodes) => nodes.map(n => ({ ...n, selected: n.id === newNodeId })));
                            store.setSelectedCanvasNodeIds(new Set([newNodeId]));
                            setTimeout(() => {
                                const el = document.getElementById('block-' + newId)?.querySelector('[contenteditable="true"]');
                                if (el instanceof HTMLElement) {
                                    el.focus({ preventScroll: true });
                                    window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: newNodeId } }));
                                }
                            }, 50);
                            return;
                        }

                        // Document editor: insert a plain text block under the toggle's body, in-place.
                        // Keep textBefore in the current line; carry textAfter into the new block.
                        const toggleIndent = enclosingToggle!.indent || 0;
                        setBlocks(prev => {
                            const i = prev.findIndex(b => b.id === id);
                            const encI = prev.findIndex(b => b.id === enclosingToggle!.id);
                            if (encI === -1) return prev;
                            const nb = [...prev];
                            if (i !== -1) nb[i] = { ...nb[i], content: textBefore };
                            // Insert after the toggle's entire content subtree.
                            let end = encI + 1;
                            while (end < nb.length && (nb[end].indent || 0) > toggleIndent) end++;
                            nb.splice(end, 0, {
                                id: newId,
                                type: 'text',
                                content: textAfter,
                                indent: toggleIndent
                            });
                            debouncedOnUpdate(nb);
                            return nb;
                        });
                    }

                    caretPositionRef.current = 'start';
                    setTimeout(() => setFocusId(newId), 0);
                    return;
                }
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            if (slashMenuStateRef.current) return;
            
            const currentBlock = blocksRef.current.find(b => b.id === id);
            if (currentBlock?.type === 'code') {
                return; // Allow native newline insertion in code blocks
            }

            e.preventDefault();

            // Intercept Enter on standalone Canvas Block
            
            if (nodeId) {
                const store = useStore.getState();
                const node = store.nodes.find(n => n.id === nodeId);
                // Toggles keep their body inside the same canvas node: pressing Enter on the
                // toggle header (or on one of its nested children) should build the toggle's
                // content in-place instead of spawning a brand-new block node. We let those
                // cases fall through to the in-node split logic below.
                const inToggleContext = !!currentBlock && (currentBlock.type === 'toggle' || (currentBlock.indent || 0) > 0);
                if (node && node.type === 'block' && !inToggleContext) {
                    // Create a new block node on the canvas directly below this one
                    const caretOffset = getCaretOffset();
                    const textBefore = content.substring(0, caretOffset);
                    const textAfter = content.substring(caretOffset);

                    const typeToCreate = currentBlock && ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type)
                        ? currentBlock.type
                        : 'text';
                    const indent = currentBlock?.indent || 0;

                    // Update current node's content
                    const newBlocks = [...blocksRef.current];
                    const index = newBlocks.findIndex(b => b.id === id);
                    if (index !== -1) {
                        newBlocks[index] = { ...newBlocks[index], content: textBefore };
                        setBlocks(newBlocks);
                        debouncedOnUpdate(newBlocks);
                    }

                    // Create new node below
                    const newNodeId = uuidv4();
                    const newBlockId = uuidv4();
                    const newBlock: Block = {
                        id: newBlockId,
                        type: typeToCreate,
                        content: textAfter,
                        indent: indent
                    };

                    const parentId = node.parentId || undefined;
                    
                    const nodesInColumn = store.nodes.filter(n => 
                        n.type === 'block' && 
                        (n.data as any)?.isStandaloneBlock && 
                        Math.abs(n.position.x - node.position.x) < 10 &&
                        n.parentId === parentId
                    );

                    let position: { x: number, y: number };

                    if (nodesInColumn.length >= 5) {
                        // Start a new column to the right
                        const topY = Math.min(...nodesInColumn.map(n => n.position.y));
                        position = {
                            x: node.position.x + (Number(node.style?.width) || 432) + 16,
                            y: topY
                        };
                    } else {
                        // Position exactly below it, plus GRID_GAP (16)
                        position = { 
                            x: node.position.x, 
                            y: node.position.y + (Number(node.style?.height) || 100) + 16 
                        };
                    }

                    store.addNode(
                        'block',
                        position,
                        { content: [newBlock], isStandaloneBlock: true },
                        { width: node.style?.width || 432, height: node.style?.height || 100 },
                        parentId,
                        newNodeId
                    );

                    // Deselect current and select new
                    store.setNodes((nodes) => nodes.map(n => ({
                        ...n,
                        selected: n.id === newNodeId
                    })));
                    store.setSelectedCanvasNodeIds(new Set([newNodeId]));

                    // Focus the new block
                    setTimeout(() => {
                        const el = document.getElementById('block-' + newBlockId)?.querySelector('[contenteditable="true"]');
                        if (el instanceof HTMLElement) {
                            el.focus({ preventScroll: true });
                            window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: newNodeId } }));
                            try {
                                const selection = window.getSelection();
                                const range = document.createRange();
                                range.selectNodeContents(el);
                                range.collapse(true);
                                selection?.removeAllRanges();
                                selection?.addRange(range);
                            } catch (e) {
                                console.warn("Error focusing new canvas block:", e);
                            }
                        }
                    }, 50);

                    return;
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

        } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIdsRef.current.size > 0) {
            // Multi-select active: delete the selected blocks, not the focused
            // one. Reads through refs/stable setters because this callback's
            // dep list intentionally omits selection state.
            e.preventDefault();
            const selected = selectedBlockIdsRef.current;
            setBlocks(prev => {
                const newBlocks = prev.filter(b => !selected.has(b.id));
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
            setSelectedBlockIds(new Set());
        } else if (e.key === 'Backspace') {
            const currentBlock = blocksRef.current.find(b => b.id === id);
            if (!currentBlock) return;

            const isEmpty = !content || content.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '').length === 0;

            if (isEmpty) {
                e.preventDefault();
                const curIndent = currentBlock.indent || 0;

                // Is this empty block the content of a toggle? (enclosed by a toggle header)
                let enclosingToggle: Block | null = null;
                if (curIndent > 0) {
                    const allBlocks = blocksRef.current;
                    const idx = allBlocks.findIndex(b => b.id === id);
                    for (let j = idx - 1; j >= 0; j--) {
                        if ((allBlocks[j].indent || 0) < curIndent) {
                            enclosingToggle = allBlocks[j].type === 'toggle' ? allBlocks[j] : null;
                            break;
                        }
                    }
                }

                if (enclosingToggle) {
                    // Empty toggle content: merge up naturally — remove this line and move the
                    // caret to the end of the previous line (the toggle header or prior content).
                    caretPositionRef.current = 'end';
                    removeBlock(id);
                } else if (curIndent > 0) {
                    handleOutdent(id);
                } else if (currentBlock.type === 'toggle') {
                    // Empty toggle: in the document editor, delete it and move the caret to the
                    // previous line (natural deletion). On the canvas a standalone single-block
                    // node can't be removed, so fall back to converting it to plain text.
                    const store = nodeId ? useStore.getState() : null;
                    const canvasNode = store ? store.nodes.find(n => n.id === nodeId) : null;
                    if (canvasNode && canvasNode.type === 'block') {
                        convertBlock(id, 'text');
                    } else {
                        caretPositionRef.current = 'end';
                        removeBlock(id);
                    }
                } else if (['bullet', 'numbered', 'todo', 'heading1', 'heading2', 'heading3', 'quote', 'callout', 'code'].includes(currentBlock.type)) {
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
                        editorRef.current?.focus({ preventScroll: true }); // Focus container to capture next arrows
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
                            const x = getCaretX();
                            const fallbackOffset = getCaretOffset();
                            if (x !== null) {
                                caretPositionRef.current = { x, line: 'last', fallbackOffset };
                            } else {
                                caretPositionRef.current = fallbackOffset;
                            }
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
                        editorRef.current?.focus({ preventScroll: true });
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
                            const x = getCaretX();
                            const fallbackOffset = getCaretOffset();
                            if (x !== null) {
                                caretPositionRef.current = { x, line: 'first', fallbackOffset };
                            } else {
                                caretPositionRef.current = fallbackOffset;
                            }
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
                editorRef.current?.focus({ preventScroll: true });
            }
            // else let browser select all text (default)
        }
        // NOTE: selection-aware Backspace/Delete is handled at the TOP of this
        // chain — branches placed here are shadowed by the single-block
        // Backspace/Delete branches above and can never execute.
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
            onDrop={(e) => { handleDrop(e); clearBlockDropIndicators(); }}
            onDragOver={handleEditorDragOver}
            onDragLeave={handleEditorDragLeave}
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
                const visibleBlocks: { block: Block, listIndex?: number, hasChildren?: boolean, originalIndex: number }[] = [];

                blocks.forEach((block, index) => {
                    // Calculate List Index for numbered blocks
                    let listIndex = undefined;
                    if (block.type === 'numbered') {
                        let count = index === 0 ? globalStartIndex : 1;
                        if (index > 0) {
                            for (let i = index - 1; i >= 0; i--) {
                                if (blocks[i].type === 'numbered' && (blocks[i].indent || 0) === (block.indent || 0)) {
                                    count++;
                                } else if ((blocks[i].indent || 0) < (block.indent || 0)) {
                                    break;
                                } else if (blocks[i].type !== 'numbered' && (blocks[i].indent || 0) === (block.indent || 0)) {
                                    break; // Reset list if interrupted by another block type at same indent
                                }
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

                    visibleBlocks.push({ block, listIndex, hasChildren, originalIndex: index });
                });

                interface RenderNode {
                    type: 'block' | 'toggle-group';
                    block: Block;
                    listIndex?: number;
                    hasChildren?: boolean;
                    originalIndex: number;
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
                            originalIndex: item.originalIndex,
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

                const renderNode = (node: RenderNode, parentToggleIndent?: number, forceReadOnly?: boolean, isFirstChildOfToggle?: boolean): React.ReactNode => {
                    const currentReadOnly = readOnly || forceReadOnly;
                    if (node.type === 'block') {
                        return (
                            <React.Fragment key={node.block.id}>
                                <BlockItem
                                    block={node.block}
                                    index={node.listIndex}
                                    hasChildren={node.hasChildren}
                                    isSelected={selectedBlockIds.has(node.block.id)}
                                    isFirstChildOfToggle={isFirstChildOfToggle}
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
                                    onDeleteBlock={handleDeleteBlock}
                                    onSelectionClick={() => {
                                        if (selectedBlockIds.size > 0) {
                                            setSelectedBlockIds(new Set());
                                        }
                                    }}
                                    onSelectionMouseDown={handleSelectionMouseDown}
                                    onRegisterRef={handleRegisterRef}
                                />
                                {renderBetweenBlocks && node.originalIndex < blocks.length - 1 && renderBetweenBlocks(node.originalIndex)}
                            </React.Fragment>
                        );
                    } else {
                        const showChildren = node.children && node.children.length > 0;
                        const relativeIndent = Math.max(0, (node.block.indent || 0) - (parentToggleIndent || 0));
                        const isCollapsed = node.block.metadata?.isCollapsed;
                        return (
                            <React.Fragment key={node.block.id}>
                                <div 
                                    className={styles.toggleGroupContainer}
                                    style={{ marginLeft: `${relativeIndent * 24}px` }}
                                >
                                    <BlockItem
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
                                        onDeleteBlock={handleDeleteBlock}
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
                                            {node.children.map((child, i) => renderNode(child, node.block.indent || 0, currentReadOnly, i === 0))}
                                        </div>
                                    )}
                                </div>
                                {renderBetweenBlocks && node.originalIndex < blocks.length - 1 && renderBetweenBlocks(node.originalIndex)}
                            </React.Fragment>
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
                    activeFormats={getActiveInlineFormats()}
                    onFormat={(format) => {
                        // Use the selection captured when it was made — the toolbar
                        // click may have stolen focus/selection on mousedown.
                        const saved = savedSelectionRef.current;
                        if (format === 'createLink') {
                            linkSelection(saved);
                        } else if (format === 'createPage') {
                            if (!saved || !saved.host.isConnected) return;
                            const text = targetText(saved);
                            if (!text.trim()) return;
                            const createPageFromText = useStore.getState().createPageFromText;
                            const rect = saved.host.getBoundingClientRect();
                            createPageFromText(text, { x: rect.left, y: rect.bottom + 20 });
                        } else {
                            formatSelection(format as InlineFormat, saved);
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
