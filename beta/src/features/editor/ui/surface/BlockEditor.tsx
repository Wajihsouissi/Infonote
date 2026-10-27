import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, BlockMetadata } from '../../types';
import styles from './BlockEditor.module.css';

import { SlashMenu } from '../menus/slash/SlashMenu';
import { BlockMenu } from '../menus/block/BlockMenu';
import { FloatingToolbar } from '../toolbars/FloatingToolbar';
import type { EditOptions } from '../../blocks/types';
import { SelectionCapsule } from '../toolbars/SelectionCapsule';
import { isHighlightHue, type InlineFormat } from '../../text/inlineFormat';
import { createRenderTreeBuilder } from '../../document/blockTree';
import { EditorRenderNode } from './EditorRenderNode';
import { considerAutoFormat, emptyAutoFormatMemory, stripMarkerFromHost } from '../../text/autoFormat';
import { caretOffsetIn } from '../../text/caret';
import { handleInlineLinkClick, handleInlineLinkKeyDown } from '../../text/inlineNavigation';
import { takeBlockFocusRequest } from '../../drag/canvasBlockSpawn';
import { useStore } from '../../../../store/useStore';
import { getNodeById } from '../../../../store/nodeIndex';
import { useStableCallback } from '../../../../utils/useStableCallback';
import { parseAIContent } from '../../text/aiMarkdown';
import { UI_GENERATED_EVENT, type UIGeneratedRequest } from '../../../intelligent-ui/nativeBlocks';

import { useBlockSelection } from '../../hooks/useBlockSelection';
import { useSlashCommand } from '../../hooks/useSlashCommand';
import { useBlockCommands } from '../../hooks/useBlockCommands';
import { useBlockDragAndDrop } from '../../hooks/useBlockDragAndDrop';
import { useEditorDocument } from '../../hooks/useEditorDocument';
import { useBlockFocus } from '../../hooks/useBlockFocus';
import { useInlineFormatting, pageChipBlocks } from '../../hooks/useInlineFormatting';
import { useEditorKeyboard, handleFormattingShortcut } from '../../hooks/useEditorKeyboard';
import { useBlockClipboard } from '../../hooks/useBlockClipboard';
import { useEditorDropZone } from '../../hooks/useEditorDropZone';
import { flushPendingEditorWrites } from '../../../../services/storage/workspace/pendingEditorWrites';

interface BlockEditorProps {
    initialContent?: string | Block[];
    onUpdate?: (blocks: Block[]) => void;
    readOnly?: boolean;
    autoFocus?: boolean;
    minimal?: boolean;
    /** The canvas node this editor belongs to, when it has one. */
    nodeId?: string;
    hideBlockHandles?: boolean;
    disableMediaControls?: boolean;
    /** In a fused note, keep image sizing fixed while offering alignment only. */
    imageAlignmentOnly?: boolean;
    promoteBlockHandles?: boolean;
    /** Legacy host slot; selection actions now stay inside their editor. */
    selectionIslandPortalId?: string;
    /** Push updates straight through, without the typing debounce. */
    syncUpdate?: boolean;
    /** Stable identifier for cross-editor drag and drop. */
    editorId?: string;
    renderBetweenBlocks?: (index: number) => React.ReactNode;
    /** Where this editor's numbered list continues from. */
    globalStartIndex?: number;
    /** Use the ordinal an imported list item carried, for one canvas block. */
    useStoredListNumbers?: boolean;
    /** A standalone canvas text block holds exactly one root block. */
    singleBlockOnly?: boolean;
}

/**
 * The block editor.
 *
 * This component owns the document and wires the parts together; the parts
 * themselves live beside it: `useEditorDocument` (state and saving),
 * `useBlockFocus` (the caret), `useEditorKeyboard` (every key),
 * `useInlineFormatting` (the toolbar), `useBlockClipboard`, `useBlockCommands`,
 * `useBlockSelection` and `useBlockDragAndDrop`.
 *
 * Everything handed to a block is a stable callback, so a keystroke re-renders
 * the line being typed in rather than every block in the note.
 */
export const BlockEditor = memo(function BlockEditor({
    initialContent,
    onUpdate,
    readOnly,
    autoFocus,
    minimal,
    nodeId,
    hideBlockHandles,
    disableMediaControls,
    imageAlignmentOnly,
    promoteBlockHandles,
    syncUpdate,
    editorId,
    renderBetweenBlocks,
    globalStartIndex = 1,
    useStoredListNumbers = false,
    singleBlockOnly = false,
}: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const editorInstanceId = useRef(editorId || `editor-${uuidv4()}`);
    const blockRefs = useRef<Record<string, HTMLElement | null>>({});
    const autoFormatRef = useRef(emptyAutoFormatMemory());

    const { blocks, setBlocks, blocksRef, commit, flush, syncFromOwner } = useEditorDocument({
        initialContent,
        onUpdate,
        syncUpdate,
    });

    /* Indexed lookup, not nodes.find(): this selector re-runs on every store
       change for every mounted editor, so a linear scan costs O(nodes ×
       editors) per update — the single biggest cost of opening a large
       canvas. See store/nodeIndex.ts. */
    const nodeColor = useStore(s => {
        const data = getNodeById(s.nodes, nodeId)?.data;
        return data && 'color' in data ? data.color : undefined;
    });
    const theme = useStore(s => s.theme);

    const [blockMenu, setBlockMenu] = useState<{ x: number; y: number; blockId: string } | null>(null);
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
    const [colorPopoverOpen, setColorPopoverOpen] = useState(false);

    const { focusBlock, setCaret } = useBlockFocus({ blockRefs, blocksRef });
    /* The shape the command hooks expect. They focus a block without saying
       where the caret goes, which is `setCaret`'s job when it matters. */
    const setFocusId = useCallback((id: string | null) => {
        if (id) focusBlock(id, null);
    }, [focusBlock]);

    /** Discrete commands publish before the UI reports the action complete. */
    const publishCommand = useCallback((next: Block[]) => {
        commit(next);
        flush();
    }, [commit, flush]);

    /** Replace the whole document and save it. */
    const writeBlocks = useCallback((next: Block[]) => {
        blocksRef.current = next;
        setBlocks(next);
        publishCommand(next);
    }, [blocksRef, setBlocks, publishCommand]);

    const {
        selectedBlockIds,
        setSelectedBlockIds,
        dragSelection,
        setDragSelection,
        setMouseDownBlock,
        wasDraggingRef,
        handleSelectionMouseDown,
        selectedBlockIdsRef,
    } = useBlockSelection({ editorRef, blocks, blocksRef, blockRefs });

    const { slashMenuState, setSlashMenuState, slashMenuStateRef, convertBlock, handleSlashOpen } = useSlashCommand({
        editorRef,
        blocks,
        blocksRef,
        setBlocks,
        debouncedOnUpdate: publishCommand,
        setFocusId,
        singleBlockOnly,
        nodeId,
    });

    const commands = useBlockCommands({
        editorRef,
        blocks,
        blocksRef,
        setBlocks,
        debouncedOnUpdate: publishCommand,
        setFocusId,
        setSelectedBlockIds,
        selectedBlockIds,
        nodeId,
        singleBlockOnly,
        checkForSplit: useStableCallback((id: string) => {
            if (!nodeId) return;
            if (blocksRef.current.findIndex((block) => block.id === id) > 0) {
                useStore.getState().splitNode(nodeId, id, blocksRef.current);
            }
        }),
    });

    const updateBlock = useStableCallback((
        id: string,
        contentOrPatch: string | Partial<Block>,
        metadata?: BlockMetadata,
        opts?: EditOptions,
    ) => {
        const index = blocksRef.current.findIndex(block => block.id === id);
        if (index < 0) return;
        const previous = blocksRef.current[index];
        if (typeof contentOrPatch === 'string' && contentOrPatch === previous.content
            && (metadata === undefined || metadata === previous.metadata)) return;
        const next = blocksRef.current.slice();
        next[index] = typeof contentOrPatch === 'string'
            ? { ...previous, content: contentOrPatch, metadata: metadata ?? previous.metadata }
            : { ...previous, ...contentOrPatch };
        blocksRef.current = next;
        setBlocks(next);
        commit(next);
        if (!opts?.inputType) flush();

        if (typeof contentOrPatch !== 'string') return;
        const content = contentOrPatch;
        const block = next[index];

        const shortcut = considerAutoFormat(autoFormatRef.current, block, content, opts?.inputType);
        if (shortcut.action === 'convert') {
            // Put the caret where the text now is, minus the marker eaten.
            const host = blockRefs.current[id];
            setCaret(host ? Math.max(0, caretOffsetIn(host) - shortcut.marker.length) : 0);
            convertBlock(id, shortcut.type, shortcut.metadata, shortcut.rest);
            stripMarkerFromHost(autoFormatRef.current, () => blockRefs.current[id], shortcut.marker);
            return;
        }

        // "/" at the start of a line opens the block menu, and anything else
        // closes it again.
        if (content.startsWith('/') && !content.match(/^\/\s/)) {
            if (!slashMenuStateRef.current || slashMenuStateRef.current.blockId !== id) handleSlashOpen(id);
        } else if (slashMenuStateRef.current) {
            setSlashMenuState(null);
        }
    });

    const formatting = useInlineFormatting({ editorRef, blockRefs, updateBlock });
    // URL input focus collapses the document selection. Keep its last anchor
    // while a toolbar row is open, including keyboard-operated controls.
    const [lastToolbarRect, setLastToolbarRect] = useState<DOMRect | null>(null);
    useEffect(() => { if (formatting.selectionRect) setLastToolbarRect(formatting.selectionRect); }, [formatting.selectionRect]);
    const toolbarRect = formatting.selectionRect ?? ((linkPopoverOpen || colorPopoverOpen) ? lastToolbarRect : null);

    const dropZone = useEditorDropZone({
        editorRef,
        blocksRef,
        readOnly,
        onDragOverBlocks: (event) => dragAndDrop.handleDragOver(event),
        onDropBlocks: (event) => dragAndDrop.handleDrop(event),
    });

    const dragAndDrop = useBlockDragAndDrop({
        blocks,
        setBlocks,
        debouncedOnUpdate: publishCommand,
        selectedBlockIds,
        nodeId,
        addBlock: commands.addBlock,
        editorId: editorInstanceId.current,
        pendingDropTarget: dropZone.pendingTargetRef,
    });

    const clipboard = useBlockClipboard({
        editorRef,
        blocksRef,
        selectedBlockIdsRef,
        writeBlocks,
        setSelectedBlockIds,
        focusBlock,
    });

    const handleKeyDown = useEditorKeyboard({
        blocksRef,
        blockRefs,
        editorRef,
        selectedBlockIdsRef,
        autoFormat: autoFormatRef,
        slashMenuStateRef,
        nodeId,
        writeBlocks,
        setSelectedBlockIds,
        focusBlock,
        openBlockMenu: useStableCallback((position, blockId) => setBlockMenu({ ...position, blockId })),
        convertBlock,
        commands: {
            addBlock: commands.addBlock,
            addBlockBelow: commands.addBlockBelow,
            removeBlock: commands.removeBlock,
            indent: commands.handleIndent,
            outdent: commands.handleOutdent,
            moveUp: commands.moveBlockUp,
            moveDown: commands.moveBlockDown,
            duplicate: commands.duplicateBlock,
        },
        formatting: {
            formatSelection: formatting.formatSelection,
            highlightSelection: formatting.highlightSelection,
            openLinkPopover: useStableCallback(() => {
                setColorPopoverOpen(false);
                setLinkPopoverOpen(true);
            }),
        },
    });

    /* Content from elsewhere — fusion, the mind map, the outline reordering
       blocks — is merged with any edits still waiting to be published. */
    useEffect(() => {
        syncFromOwner();
    }, [initialContent, syncFromOwner]);

    useEffect(() => {
        const onForceSync = () => syncFromOwner();
        window.addEventListener('chnk-it-force-editor-sync', onForceSync);
        return () => window.removeEventListener('chnk-it-force-editor-sync', onForceSync);
    }, [syncFromOwner]);

    const autoFocusDone = useRef(false);
    useEffect(() => {
        if (!autoFocus || autoFocusDone.current) return;
        const last = blocksRef.current[blocksRef.current.length - 1];
        if (!last) return;
        autoFocusDone.current = true;
        focusBlock(last.id);
    }, [autoFocus, focusBlock, blocksRef]);

    /* Enter in a canvas block continues the line in a NEW node; this is that
       node's editor claiming the caret as soon as it exists. */
    useLayoutEffect(() => {
        const requested = takeBlockFocusRequest(blocksRef.current.map((block) => block.id));
        if (requested) focusBlock(requested, 'start');
    }, [focusBlock, blocksRef]);

    /* An AI block has finished writing. It announces the text rather than
       writing it, because the block is about to be replaced by what it
       produced — see blocks/AIBlock.tsx. The new blocks inherit its indent, so
       generated text lands at the level it was asked for. */
    useEffect(() => {
        const onGenerated = (event: Event) => {
            const { id, content } = (event as CustomEvent<{ id: string; content: string }>).detail;
            const current = blocksRef.current;
            const index = current.findIndex((block) => block.id === id);
            if (index === -1) return;

            const written = parseAIContent(content);
            if (written.length === 0) return;

            const indent = current[index].indent || 0;
            const next = [...current];
            next.splice(index, 1, ...written.map((block) => ({ ...block, indent })));
            writeBlocks(next);
            focusBlock(written[written.length - 1].id);
        };
        window.addEventListener('chnk-it-ai-generate', onGenerated);
        return () => window.removeEventListener('chnk-it-ai-generate', onGenerated);
    }, [blocksRef, focusBlock, writeBlocks]);

    // Generated prose is inserted as editable siblings of the visual block.
    useEffect(() => {
        if (readOnly) return;
        const onGenerated = (event: Event) => {
            const request = (event as CustomEvent<UIGeneratedRequest>).detail;
            if (request.handled) return;
            const current = blocksRef.current;
            const index = current.findIndex(block => block.id === request.id);
            if (index < 0) return;
            request.handled = true;
            const indent = current[index].indent || 0;
            const next = [...current];
            next.splice(index, 1, ...request.blocks.map(block => ({ ...block, indent })));
            writeBlocks(next);
        };
        window.addEventListener(UI_GENERATED_EVENT, onGenerated);
        return () => window.removeEventListener(UI_GENERATED_EVENT, onGenerated);
    }, [blocksRef, readOnly, writeBlocks]);

    /* Escape and Delete for a block selection live on `document`: selecting
       blocks blurs the editables, so a per-block handler never sees them. */
    useEffect(() => {
        if (selectedBlockIds.size === 0) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setSelectedBlockIds(new Set());
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                editorRef.current?.focus({ preventScroll: true });
                return;
            }
            if (event.key !== 'Backspace' && event.key !== 'Delete') return;
            // Typing owns these keys whenever the caret is in a field.
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            event.preventDefault();
            commands.deleteSelectedBlocks();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [selectedBlockIds.size, setSelectedBlockIds, commands]);

    /** Restore document focus without scrolling or taking native text Undo. */
    useEffect(() => {
        const recentlyHandled = { current: false };

        const onDragCleanup = (event: Event) => {
            if (recentlyHandled.current) return;
            recentlyHandled.current = true;
            setTimeout(() => { recentlyHandled.current = false; }, 300);

            setDragSelection(null);
            setMouseDownBlock(null);
            if (selectedBlockIdsRef.current.size > 0) setSelectedBlockIds(new Set());

            // A drop aimed at another editor is not ours to answer.
            const detail = (event as CustomEvent).detail;
            if (detail?.targetEditorId && detail.targetEditorId !== editorInstanceId.current) return;

            /* If this editor's node was the drag source and is now gone or
               empty, taking focus would jam it on a stale block. */
            const live = nodeId
                ? (getNodeById(useStore.getState().nodes, nodeId)?.data as { content?: unknown } | undefined)?.content
                : blocksRef.current;
            if (!Array.isArray(live) || live.length === 0) return;
            // Structural moves belong to document history, including after the
            // global dragend failsafe has already released the drag lock.
            editorRef.current?.focus({ preventScroll: true });
        };

        window.addEventListener('chnk-it-clear-selection', onDragCleanup);
        return () => window.removeEventListener('chnk-it-clear-selection', onDragCleanup);
    }, [nodeId, setDragSelection, setMouseDownBlock, setSelectedBlockIds, selectedBlockIdsRef, blocksRef]);

    // ---------------------------------------------------------------- render

    const [buildTree] = useState(createRenderTreeBuilder);
    const tree = useMemo(() => buildTree(blocks, globalStartIndex), [buildTree, blocks, globalStartIndex]);

    const onDragStartBlock = useStableCallback((event: React.DragEvent, block: Block) => {
        // Commit what is typed before the document changes shape under it.
        flush();
        flushPendingEditorWrites();
        flushPendingEditorWrites(); // Child flush may enqueue its owning editor.
        dragAndDrop.handleBlockDragStart(event, block);
    });

    const onBlockMenuOpen = useStableCallback((event: React.MouseEvent, id: string) => {
        setMouseDownBlock(null);

        const target = event.target as HTMLElement;
        const inField = target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        if (inField && !target.closest(`.${styles.dragHandle}`)) {
            if (!selectedBlockIdsRef.current.has(id)) {
                if (!promoteBlockHandles) event.stopPropagation();
                return;
            }
        }

        event.preventDefault();
        event.stopPropagation();
        if (!selectedBlockIdsRef.current.has(id)) setSelectedBlockIds(new Set([id]));

        setBlockMenu((prev) => {
            if (prev?.blockId !== id) return { x: event.clientX, y: event.clientY, blockId: id };
            // Toggling the menu shut also drops the selection it implied.
            setTimeout(() => setSelectedBlockIds(new Set()), 0);
            return null;
        });
    });

    const onSelectionClick = useStableCallback(() => {
        if (selectedBlockIdsRef.current.size > 0) setSelectedBlockIds(new Set());
    });

    const onRegisterRef = useCallback((id: string, el: HTMLDivElement | null) => {
        if (el) blockRefs.current[id] = el;
        else delete blockRefs.current[id];
    }, []);

    const onDeleteBlock = useStableCallback((id: string) => commands.removeBlock(id));
    const onBlockPaste = useStableCallback((event: React.ClipboardEvent, id: string) => commands.handleBlockPaste(event, id));
    const onMoveBlock = useStableCallback(dragAndDrop.handleMoveBlock);
    const onEditorClick = useStableCallback((event: React.MouseEvent) => commands.handleEditorClick(event, wasDraggingRef.current));

    const renderOptions = useMemo(() => ({
        useStoredListNumber: useStoredListNumbers,
        deferOffscreen: !minimal && blocks.length >= 200 && import.meta.env.VITE_EDITOR_DEFER_OFFSCREEN !== 'false',
        readOnly, nodeId, hideBlockHandles, promoteBlockHandles, disableMediaControls, imageAlignmentOnly, minimal,
        onUpdateBlock: updateBlock, onKeyDown: handleKeyDown, onPaste: onBlockPaste,
        onMoveBlock, onDragStart: onDragStartBlock, onMenuOpen: onBlockMenuOpen,
        onDeleteBlock, onSelectionClick, onSelectionMouseDown: handleSelectionMouseDown, onRegisterRef,
    }), [blocks.length, useStoredListNumbers, readOnly, nodeId, hideBlockHandles, promoteBlockHandles,
        disableMediaControls, imageAlignmentOnly, minimal, updateBlock, handleKeyDown, onBlockPaste, onMoveBlock,
        onDragStartBlock, onBlockMenuOpen, onDeleteBlock, onSelectionClick, handleSelectionMouseDown, onRegisterRef]);

    const capsule = selectedBlockIds.size > 1 ? (
        <SelectionCapsule
            count={selectedBlockIds.size}
            onClear={() => setSelectedBlockIds(new Set())}
            onDelete={commands.deleteSelectedBlocks}
            onCopy={clipboard.copySelection}
            onCut={clipboard.cutSelection}
        />
    ) : null;

    return (
        <div
            data-chnk-it-block-editor
            data-editor-id={editorInstanceId.current}
            data-block-selection-count={selectedBlockIds.size || undefined}
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            tabIndex={-1}
            onBlurCapture={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !editorRef.current?.contains(next)) flush();
            }}
            onPaste={clipboard.pasteIntoDocument}
            onDrop={(event) => { if (!readOnly) dragAndDrop.handleDrop(event); dropZone.clearIndicators(); }}
            onDragOverCapture={event => {
                // Keep native acceptance alive while the preview moves a
                // sibling away from the stationary pointer.
                if (event.dataTransfer.types.includes('application/reactflow-block-type') && !readOnly) {
                    event.preventDefault(); event.dataTransfer.dropEffect='move';
                }
            }}
            onDragOver={dropZone.onDragOver}
            onDragLeave={dropZone.onDragLeave}
            onClick={event => { if (!handleInlineLinkClick(event)) onEditorClick(event); }}
            onKeyDownCapture={event => {
                if (selectedBlockIdsRef.current.size > 0 && ['Delete','Backspace'].includes(event.key)
                    && (event.target as Element).closest('[data-chnk-it-block-editor]') === editorRef.current) {
                    event.preventDefault(); event.stopPropagation(); setBlockMenu(null); commands.deleteSelectedBlocks(); return;
                }
                if (event.key === 'Escape' && selectedBlockIdsRef.current.size > 0
                    && (event.target as Element).closest('[data-chnk-it-block-editor]') === editorRef.current) {
                    event.preventDefault(); event.stopPropagation();
                    setSelectedBlockIds(new Set()); editorRef.current?.focus({preventScroll:true});
                    return;
                }
                handleInlineLinkKeyDown(event);
                const target = event.target as Element;
                if (!event.defaultPrevented && target.closest('[data-table-row][data-table-column]')
                    && target.closest('[data-chnk-it-block-editor]') === editorRef.current
                    && handleFormattingShortcut({ event, formatting: {
                        formatSelection: formatting.formatSelection,
                        highlightSelection: formatting.highlightSelection,
                        openLinkPopover: () => { setColorPopoverOpen(false); setLinkPopoverOpen(true); },
                    } })) event.stopPropagation();
            }}
            onPointerDown={(event) => {
                if (event.ctrlKey) event.stopPropagation();
            }}
            onMouseDown={(event) => {
                // Ctrl is what starts a marquee selection over blocks.
                if (!event.ctrlKey || event.button !== 0 || !editorRef.current) return;
                event.stopPropagation(); // Not React Flow's canvas selection.
                wasDraggingRef.current = false;
                const box = editorRef.current.getBoundingClientRect();
                const scale = box.width ? box.width / editorRef.current.offsetWidth : 1;
                const x = (event.clientX - box.left) / scale;
                const y = (event.clientY - box.top) / scale;
                setDragSelection({ startX: x, startY: y, currentX: x, currentY: y });
            }}
            onDoubleClick={(event) => {
                const chip = (event.target as HTMLElement).closest(`.${styles.inlinePageChip}`) as HTMLElement | null;
                if (!chip?.dataset.nodeId) return;
                event.preventDefault();
                event.stopPropagation();
                useStore.getState().navigateToNode(chip.dataset.nodeId);
            }}
        >
            {tree.map(node => <EditorRenderNode key={node.block.id} node={node} options={renderOptions}
                selected={selectedBlockIds} count={blocks.length} renderBetween={renderBetweenBlocks} />)}

            {slashMenuState && (
                <SlashMenu
                    anchorRect={slashMenuState.anchorRect}
                    filter={blocksRef.current.find(b => b.id === slashMenuState.blockId)?.content.substring(1) || ''}
                    onSelect={(type, meta) => convertBlock(undefined, type, meta, '')}
                    onClose={() => {
                        const target = slashMenuState.blockId;
                        setSlashMenuState(null);
                        focusBlock(target);
                    }}
                    nodeColor={nodeColor}
                    theme={theme}
                />
            )}

            {blockMenu && (
                <BlockMenu
                    x={blockMenu.x}
                    y={blockMenu.y}
                    currentType={blocks.find(b => b.id === blockMenu.blockId)?.type || 'text'}
                    onClose={() => setBlockMenu((prev) => (prev?.blockId === blockMenu.blockId ? null : prev))}
                    onAction={(action, value) => commands.handleBlockMenuAction(blockMenu.blockId, action, value)}
                />
            )}

            {/* The toolbar follows the live selection, but a click on the
                toolbar itself collapses that selection — so while one of its
                rows is open it stays put on the last known rectangle. */}
            {toolbarRect && !slashMenuState && !blockMenu && (
                <FloatingToolbar
                    selectionRect={toolbarRect}
                    activeFormats={formatting.activeFormats}
                    activeHighlight={formatting.activeHighlight}
                    initialLinkUrl={formatting.activeLinkUrl}
                    onRestoreSelection={formatting.restoreSelection}
                    linkOpen={linkPopoverOpen}
                    onLinkOpenChange={(open) => {
                        setLinkPopoverOpen(open);
                        if (open) setColorPopoverOpen(false); // one row at a time
                    }}
                    colorOpen={colorPopoverOpen}
                    onColorOpenChange={(open) => {
                        setColorPopoverOpen(open);
                        if (open) setLinkPopoverOpen(false);
                    }}
                    onFormat={(format, value) => {
                        if (format === 'createLink') {
                            if (value !== undefined) formatting.applyLink(value);
                        } else if (format === 'createPage') {
                            formatting.createPageChip(splitBlockForPage);
                        } else if (format === 'highlight') {
                            // No value means "clear"; the swatches always send a hue.
                            formatting.highlightSelection(isHighlightHue(value) ? value : null);
                        } else {
                            formatting.formatSelection(format as InlineFormat);
                        }
                    }}
                />
            )}

            {dragSelection && selectedBlockIds.size > 1 && (
                <div
                    className={styles.selectionRect}
                    style={{
                        left: Math.min(dragSelection.startX, dragSelection.currentX),
                        top: Math.min(dragSelection.startY, dragSelection.currentY),
                        width: Math.abs(dragSelection.currentX - dragSelection.startX),
                        height: Math.abs(dragSelection.currentY - dragSelection.startY),
                    }}
                />
            )}

            {capsule}
        </div>
    );

    /** Replaces the selected words with a page chip linking to the new card. */
    function splitBlockForPage(blockId: string, before: string, title: string, after: string, pageNodeId: string) {
        const current = blocksRef.current;
        const index = current.findIndex((block) => block.id === blockId);
        if (index === -1) return;

        const split = pageChipBlocks(current[index], before, title, after, pageNodeId);
        const next = [...current];
        if (split.keepOriginal) {
            next[index] = { ...next[index], content: split.before };
            next.splice(index + 1, 0, ...split.inserted);
        } else {
            next.splice(index, 1, ...split.inserted);
        }
        writeBlocks(next);
        focusBlock(split.focusId, 'start');
    }
});
