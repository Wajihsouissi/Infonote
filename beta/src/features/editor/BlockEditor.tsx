import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';

import type { Block, BlockMetadata } from './types';
import styles from './BlockEditor.module.css';

import { SlashMenu } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { FloatingToolbar } from './FloatingToolbar';
import { BlockItem } from './BlockItem';
import type { EditOptions } from './blocks/types';
import { SelectionCapsule } from './ui/SelectionCapsule';
import { isHighlightHue, type InlineFormat } from './inlineFormat';
import { buildRenderTree, type RenderNode } from './blockTree';
import { considerAutoFormat, emptyAutoFormatMemory, stripMarkerFromHost } from './autoFormat';
import { caretOffsetIn } from './caret';
import { takeBlockFocusRequest } from './canvasBlockSpawn';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { useStableCallback } from '../../utils/useStableCallback';
import { parseAIContent } from './text/aiMarkdown';

import { useBlockSelection } from './hooks/useBlockSelection';
import { useSlashCommand } from './hooks/useSlashCommand';
import { useBlockCommands } from './hooks/useBlockCommands';
import { useBlockDragAndDrop } from './hooks/useBlockDragAndDrop';
import { useEditorDocument } from './hooks/useEditorDocument';
import { useBlockFocus } from './hooks/useBlockFocus';
import { useInlineFormatting, pageChipBlocks } from './hooks/useInlineFormatting';
import { useEditorKeyboard } from './hooks/useEditorKeyboard';
import { useBlockClipboard } from './hooks/useBlockClipboard';
import { useEditorDropZone } from './hooks/useEditorDropZone';

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
    promoteBlockHandles?: boolean;
    /** Portal target for the multi-selection capsule. */
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
    promoteBlockHandles,
    selectionIslandPortalId,
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

    const { focusBlock, setCaret } = useBlockFocus({ blockRefs });
    /* The shape the command hooks expect. They focus a block without saying
       where the caret goes, which is `setCaret`'s job when it matters. */
    const setFocusId = useCallback((id: string | null) => {
        if (id) focusBlock(id, null);
    }, [focusBlock]);

    /** Replace the whole document and save it. */
    const writeBlocks = useCallback((next: Block[]) => {
        blocksRef.current = next;
        setBlocks(next);
        commit(next);
    }, [blocksRef, setBlocks, commit]);

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
        debouncedOnUpdate: commit,
        setFocusId,
    });

    const commands = useBlockCommands({
        editorRef,
        blocks,
        blocksRef,
        setBlocks,
        debouncedOnUpdate: commit,
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
        const next = blocksRef.current.map((block) => {
            if (block.id !== id) return block;
            return typeof contentOrPatch === 'string'
                ? { ...block, content: contentOrPatch, metadata: metadata || block.metadata }
                : { ...block, ...contentOrPatch };
        });
        blocksRef.current = next;
        setBlocks(next);
        commit(next);

        if (typeof contentOrPatch !== 'string') return;
        const content = contentOrPatch;
        const block = next.find((b) => b.id === id);

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

    const dropZone = useEditorDropZone({
        editorRef,
        blocksRef,
        onDragOverBlocks: (event) => dragAndDrop.handleDragOver(event),
    });

    const dragAndDrop = useBlockDragAndDrop({
        blocks,
        setBlocks,
        debouncedOnUpdate: commit,
        selectedBlockIds,
        nodeId,
        addBlock: commands.addBlock,
        editorId: editorInstanceId.current,
        pendingDropTarget: dropZone.pendingTargetRef,
    });

    const clipboard = useBlockClipboard({
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
       blocks — is taken as the truth, except for the line being typed in. */
    useEffect(() => {
        if (!initialContent) return;
        syncFromOwner(blockRefs.current);
    }, [initialContent, syncFromOwner]);

    useEffect(() => {
        const onForceSync = () => syncFromOwner(blockRefs.current);
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
    useEffect(() => {
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

    /* Escape and Delete for a block selection live on `document`: selecting
       blocks blurs the editables, so a per-block handler never sees them. */
    useEffect(() => {
        if (selectedBlockIds.size === 0) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
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

    /**
     * A native HTML5 drag blurs whatever had focus, so when one ends the caret
     * is put back into a block the person can actually see — not the first
     * block of the document, which would scroll the note back to the top.
     */
    useEffect(() => {
        const recentlyHandled = { current: false };

        const firstVisibleBlockId = (ids: string[]) => {
            for (const id of ids) {
                const el = blockRefs.current[id];
                if (!el?.isConnected) continue;
                const container = el.closest('[class*="custom-scrollbar"]')
                    || el.closest('[class*="noteArea"]')
                    || el.closest('[style*="overflow-y"]');
                if (!container) return id;
                const box = container.getBoundingClientRect();
                const rect = el.getBoundingClientRect();
                if (rect.bottom > box.top && rect.top < box.bottom) return id;
            }
            return ids[0];
        };

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
            focusBlock(firstVisibleBlockId((live as { id: string }[]).map((block) => block.id)), 'end', { silent: true });
        };

        window.addEventListener('chnk-it-clear-selection', onDragCleanup);
        return () => window.removeEventListener('chnk-it-clear-selection', onDragCleanup);
    }, [nodeId, focusBlock, setDragSelection, setMouseDownBlock, setSelectedBlockIds, selectedBlockIdsRef, blocksRef]);

    // ---------------------------------------------------------------- render

    const tree = useMemo(() => buildRenderTree(blocks, globalStartIndex), [blocks, globalStartIndex]);

    const onDragStartBlock = useStableCallback((event: React.DragEvent, block: Block) => {
        // Commit what is typed before the document changes shape under it.
        flush();
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
        blockRefs.current[id] = el;
    }, []);

    const onDeleteBlock = useStableCallback((id: string) => commands.removeBlock(id));
    const onBlockPaste = useStableCallback((event: React.ClipboardEvent, id: string) => commands.handleBlockPaste(event, id));
    const onMoveBlock = useStableCallback(dragAndDrop.handleMoveBlock);
    const onEditorClick = useStableCallback((event: React.MouseEvent) => commands.handleEditorClick(event, wasDraggingRef.current));

    const renderNode = (node: RenderNode, parentToggleIndent?: number, isFirstChildOfToggle?: boolean): React.ReactNode => {
        const item = (
            <BlockItem
                block={node.block}
                index={node.listIndex}
                hasChildren={node.hasChildren}
                useStoredListNumber={useStoredListNumbers}
                isSelected={selectedBlockIds.has(node.block.id)}
                isFirstChildOfToggle={isFirstChildOfToggle}
                readOnly={readOnly}
                nodeId={nodeId}
                hideBlockHandles={hideBlockHandles}
                promoteBlockHandles={promoteBlockHandles}
                disableMediaControls={disableMediaControls}
                parentToggleIndent={node.kind === 'toggle-group' ? node.block.indent || 0 : parentToggleIndent}
                minimal={minimal}
                onUpdateBlock={updateBlock}
                onKeyDown={handleKeyDown}
                onPaste={onBlockPaste}
                onMoveBlock={onMoveBlock}
                onDragStart={onDragStartBlock}
                onMenuOpen={onBlockMenuOpen}
                onDeleteBlock={onDeleteBlock}
                onSelectionClick={onSelectionClick}
                onSelectionMouseDown={handleSelectionMouseDown}
                onRegisterRef={onRegisterRef}
            />
        );

        const between = renderBetweenBlocks && node.index < blocks.length - 1 && renderBetweenBlocks(node.index);

        if (node.kind === 'block') {
            return (
                <React.Fragment key={node.block.id}>
                    {item}
                    {between}
                </React.Fragment>
            );
        }

        const relativeIndent = Math.max(0, (node.block.indent || 0) - (parentToggleIndent || 0));
        return (
            <React.Fragment key={node.block.id}>
                <div
                    className={styles.toggleGroupContainer}
                    /* A variable, not an inline margin-left: as an inline style
                       it beat every stylesheet rule and flattened the canvas
                       gutter to 0 on the left. */
                    style={{ '--toggle-indent': `${relativeIndent * 24}px` } as React.CSSProperties}
                >
                    {item}
                    {node.children.length > 0 && !node.block.metadata?.isCollapsed && (
                        <div className={styles.toggleChildrenContainer}>
                            {node.children.map((child, i) => renderNode(child, node.block.indent || 0, i === 0))}
                        </div>
                    )}
                </div>
                {between}
            </React.Fragment>
        );
    };

    const capsule = selectedBlockIds.size > 1 ? (
        <SelectionCapsule
            count={selectedBlockIds.size}
            onClear={() => setSelectedBlockIds(new Set())}
            onDelete={commands.deleteSelectedBlocks}
            onCopy={clipboard.copySelection}
            onCut={clipboard.cutSelection}
        />
    ) : null;
    const capsuleTarget = selectionIslandPortalId ? document.getElementById(selectionIslandPortalId) : null;

    return (
        <div
            data-chnk-it-block-editor
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            tabIndex={-1}
            onBlurCapture={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !editorRef.current?.contains(next)) flush();
            }}
            onPaste={clipboard.pasteIntoDocument}
            onDrop={(event) => { dragAndDrop.handleDrop(event); dropZone.clearIndicators(); }}
            onDragOver={dropZone.onDragOver}
            onDragLeave={dropZone.onDragLeave}
            onClick={onEditorClick}
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
            {tree.map((node) => renderNode(node))}

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
            {formatting.selectionRect && !slashMenuState && !blockMenu && (
                <FloatingToolbar
                    selectionRect={formatting.selectionRect}
                    activeFormats={formatting.activeFormats}
                    activeHighlight={formatting.activeHighlight}
                    initialLinkUrl={formatting.activeLinkUrl}
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

            {capsule && (capsuleTarget ? createPortal(capsule, capsuleTarget) : capsule)}
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
