import { v4 as uuidv4 } from 'uuid';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Block, BlockMetadata, BlockType } from '../types';
import { caretOffsetIn, caretX, isCaretOnFirstLine, isCaretOnLastLine, type CaretTarget } from '../caret';
import { enclosingToggle, isHiddenByCollapsedToggle } from '../blockTree';
import { isCanvasBlockNode, requestBlockFocus, spawnBlockNodeBelow } from '../canvasBlockSpawn';
import {
    DEFAULT_HIGHLIGHT_HUE,
    getActiveHighlightFromSelection,
    type HighlightHue,
    type InlineFormat,
} from '../inlineFormat';
import { rememberRevert, revertableConversion, type AutoFormatMemory } from '../autoFormat';
import { useStableCallback } from '../../../utils/useStableCallback';

/** Block types that carry a caret but no text of their own to merge with. */
const OPAQUE_TYPES = new Set(['media', 'image', 'video', 'file', 'gallery', 'divider', 'columns', 'table', 'page']);
/** Pressing Enter in one of these continues the same kind of line. */
const CONTINUING_TYPES = new Set<BlockType>(['bullet', 'numbered', 'todo', 'toggle']);
/** Backspace in an empty one of these turns it back into plain text. */
const RESET_TO_TEXT = new Set<BlockType>(['bullet', 'numbered', 'todo', 'heading1', 'heading2', 'heading3', 'quote', 'callout', 'code']);

const isBlank = (text: string) => !text || text.trim().replace(/[\n\u200B\u00A0\u200C\uFEFF]/g, '').length === 0;

export interface EditorKeyboardContext {
    blocksRef: React.RefObject<Block[]>;
    blockRefs: React.RefObject<Record<string, HTMLElement | null>>;
    editorRef: React.RefObject<HTMLDivElement | null>;
    selectedBlockIdsRef: React.RefObject<Set<string>>;
    autoFormat: React.RefObject<AutoFormatMemory>;
    /** Truthy while the "/" menu owns the keyboard. */
    slashMenuStateRef: React.RefObject<unknown>;
    nodeId?: string;
    /** Replace the document and commit it. */
    writeBlocks: (next: Block[]) => void;
    setSelectedBlockIds: (ids: Set<string>) => void;
    focusBlock: (id: string, caret?: CaretTarget | null) => void;
    openBlockMenu: (position: { x: number; y: number }, blockId: string) => void;
    convertBlock: (id: string, type: BlockType, metadata?: BlockMetadata, content?: string) => void;
    commands: {
        addBlock: (afterId: string, type?: BlockType) => void;
        addBlockBelow: (id: string) => void;
        removeBlock: (id: string) => void;
        indent: (id: string) => void;
        outdent: (id: string) => void;
        moveUp: (id: string) => void;
        moveDown: (id: string) => void;
        duplicate: (id: string) => void;
    };
    formatting: {
        formatSelection: (format: InlineFormat) => void;
        highlightSelection: (hue: HighlightHue | null) => void;
        openLinkPopover: () => void;
    };
}

/** One keystroke, with everything the handlers need to answer it. */
interface KeyContext extends EditorKeyboardContext {
    event: ReactKeyboardEvent;
    id: string;
    /** The block's live text, as markdown. */
    content: string;
    blocks: Block[];
    index: number;
    block: Block | undefined;
    caretOffset: () => number;
}

/**
 * The editor's keyboard contract, one key at a time.
 *
 * Each handler returns true when it has dealt with the event. They run in the
 * order below, which is the order they were written in the single 700-line
 * handler this replaces — a few of them deliberately shadow each other (a
 * multi-block selection owns Backspace before the single-block rules do).
 */
export function useEditorKeyboard(ctx: EditorKeyboardContext) {
    return useStableCallback((event: ReactKeyboardEvent, id: string, rawContent: string) => {
        // Browsers leave a trailing newline or zero-width space in a
        // contentEditable; neither is part of the block's text.
        const content = rawContent.replace(/[\n\u200B]+$/, '');
        const blocks = ctx.blocksRef.current;
        const index = blocks.findIndex((block) => block.id === id);

        const keyCtx: KeyContext = {
            ...ctx,
            event,
            id,
            content,
            blocks,
            index,
            block: index === -1 ? undefined : blocks[index],
            caretOffset: () => caretOffsetIn(event.target as HTMLElement),
        };

        for (const handle of HANDLERS) {
            if (handle(keyCtx)) return;
        }
    });
}

/**
 * In order: the first handler that answers the key wins. A few of them
 * deliberately shadow later ones — a multi-block selection owns Backspace
 * before the single-block rules do.
 */
const HANDLERS: ((ctx: KeyContext) => boolean)[] = [
    handleFormattingShortcut,
    handleBlockShortcut,
    handleToggleEnter,
    handleEnter,
    handleSelectionDelete,
    handleBackspace,
    handleDelete,
    handleArrows,
    handleSelectAll,
];

/**
 * Bold, italic and friends. These write markdown markers (see inlineFormat)
 * rather than letting the browser inject <b> tags, which would not survive the
 * round trip through stored text.
 */
function handleFormattingShortcut({ event, formatting }: KeyContext): boolean {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return false;
    const key = event.key.toLowerCase();

    const marks: Record<string, InlineFormat> = { b: 'bold', i: 'italic', u: 'underline', e: 'code' };
    if (!event.shiftKey && marks[key]) {
        event.preventDefault();
        formatting.formatSelection(marks[key]);
        return true;
    }
    if (event.shiftKey && key === 's') {
        event.preventDefault();
        formatting.formatSelection('strikeThrough');
        return true;
    }
    if (!event.shiftKey && key === 'k') {
        event.preventDefault();
        formatting.openLinkPopover();
        return true;
    }
    // Ctrl+Shift+H highlights in the default hue, or lifts the one already
    // under the selection. The other nine hues live on the toolbar. Read off
    // the live selection: this handler does not re-run when the toolbar state
    // changes.
    if (event.shiftKey && key === 'h') {
        event.preventDefault();
        formatting.highlightSelection(getActiveHighlightFromSelection() ? null : DEFAULT_HIGHLIGHT_HUE);
        return true;
    }
    return false;
}

/** Moving, duplicating, indenting — the block-level shortcuts. */
function handleBlockShortcut(ctx: KeyContext): boolean {
    const { event, id, commands, blockRefs, openBlockMenu } = ctx;
    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        if (event.key === 'ArrowUp') commands.moveUp(id);
        else commands.moveDown(id);
        return true;
    }
    if (mod && event.key === 'd') {
        event.preventDefault();
        commands.duplicate(id);
        return true;
    }
    if (mod && event.key === '/') {
        event.preventDefault();
        const box = blockRefs.current[id]?.getBoundingClientRect();
        if (box) openBlockMenu({ x: box.left, y: box.bottom }, id);
        return true;
    }
    if (mod && event.key === 'Enter') {
        event.preventDefault();
        commands.addBlockBelow(id);
        return true;
    }
    if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) commands.outdent(id);
        else commands.indent(id);
        return true;
    }
    return false;
}

/**
 * Enter inside a toggle.
 *
 * A toggle is a header plus the indented lines under it, all in one block
 * list, so Enter has to build that body instead of just splitting a line:
 *   - on the header        → the first line inside the toggle
 *   - Shift+Enter inside   → another line inside
 *   - inside the body      → a new line after the whole toggle
 */
function handleToggleEnter(ctx: KeyContext): boolean {
    const { event, content, blocks, index, block, slashMenuStateRef } = ctx;
    if (event.key !== 'Enter' || slashMenuStateRef.current || !block) return false;

    const indent = block.indent || 0;
    const isHeader = block.type === 'toggle';
    const parentToggle = enclosingToggle(blocks, index);
    if (!isHeader && !parentToggle) return false;

    // Shift+Enter on the header keeps the browser's own soft line break.
    if (event.shiftKey && isHeader) return true;

    event.preventDefault();
    const caret = ctx.caretOffset();
    const before = content.substring(0, caret);
    const after = content.substring(caret);
    const newId = uuidv4();

    if (event.shiftKey && parentToggle) {
        // Another line inside the toggle, at the same depth.
        const next = [...blocks];
        next[index] = { ...next[index], content: before };
        next.splice(index + 1, 0, { id: newId, type: 'text', content: after, indent });
        ctx.writeBlocks(next);
    } else if (isHeader) {
        // The first line of the toggle's body, one level in.
        const next = [...blocks];
        next[index] = { ...next[index], content: before, metadata: { ...next[index].metadata, isCollapsed: false } };
        next.splice(index + 1, 0, { id: newId, type: 'text', content: after, indent: indent + 1 });
        ctx.writeBlocks(next);
    } else if (isCanvasBlockNode(ctx.nodeId)) {
        spawnToggleOnCanvas(ctx, before, after, newId);
        return true;
    } else {
        // In a document: a plain line after the toggle's whole body.
        const toggleIndent = parentToggle!.indent || 0;
        const toggleIndex = blocks.findIndex((b) => b.id === parentToggle!.id);
        if (toggleIndex === -1) return true;
        const next = [...blocks];
        if (index !== -1) next[index] = { ...next[index], content: before };
        let end = toggleIndex + 1;
        while (end < next.length && (next[end].indent || 0) > toggleIndent) end++;
        next.splice(end, 0, { id: newId, type: 'text', content: after, indent: toggleIndent });
        ctx.writeBlocks(next);
    }

    ctx.focusBlock(newId, 'start');
    return true;
}

/**
 * On the canvas, the line after a toggle's body is a new toggle node.
 *
 * This node's own text is written first: spawning moves the selection, which
 * unmounts this editor, and an edit committed after that would be lost.
 */
function spawnToggleOnCanvas(ctx: KeyContext, before: string, after: string, newId: string): void {
    const { blocks, index, nodeId } = ctx;
    if (after) {
        const next = [...blocks];
        next[index] = { ...next[index], content: before };
        ctx.writeBlocks(next);
    }
    spawnBlockNodeBelow(nodeId!, { id: newId, type: 'toggle', content: after, indent: 0, metadata: { isCollapsed: false } });
    requestBlockFocus(newId);
}

/** Enter: split the line, or start the next block. */
function handleEnter(ctx: KeyContext): boolean {
    const { event, id, content, blocks, index, block, slashMenuStateRef, nodeId } = ctx;
    if (event.key !== 'Enter' || event.shiftKey) return false;
    if (slashMenuStateRef.current) return true;
    // A code block takes the newline itself.
    if (block?.type === 'code') return true;

    event.preventDefault();
    const caret = ctx.caretOffset();
    const before = content.substring(0, caret);
    const after = content.substring(caret);

    /* On the canvas a standalone block becomes a NODE per line, so Enter
       spawns the next node — unless we are inside a toggle, whose body stays
       in one node (handled above; nested lines land here with indent > 0). */
    const inToggleContext = !!block && (block.type === 'toggle' || (block.indent || 0) > 0);
    if (!inToggleContext && isCanvasBlockNode(nodeId)) {
        const type = block && CONTINUING_TYPES.has(block.type) ? block.type : 'text';
        const newBlockId = uuidv4();
        if (index !== -1) {
            const next = [...blocks];
            next[index] = { ...next[index], content: before };
            ctx.writeBlocks(next);
        }
        spawnBlockNodeBelow(nodeId!, { id: newBlockId, type, content: after, indent: block?.indent || 0 });
        requestBlockFocus(newBlockId);
        return true;
    }

    if (!block) {
        ctx.commands.addBlock(id, 'text');
        return true;
    }

    let type: BlockType = CONTINUING_TYPES.has(block.type) ? block.type : 'text';
    let indent = block.indent || 0;
    // Enter at the end of an open toggle starts its body, indented.
    if (block.type === 'toggle' && !block.metadata?.isCollapsed && caret === content.length) {
        type = 'text';
        indent += 1;
    }

    const newId = uuidv4();
    const next = [...blocks];
    next[index] = { ...next[index], content: before };
    next.splice(index + 1, 0, { id: newId, type, content: after, indent });
    ctx.writeBlocks(next);
    ctx.focusBlock(newId, 'start');
    return true;
}

/** With blocks selected, Backspace and Delete remove those blocks. */
function handleSelectionDelete(ctx: KeyContext): boolean {
    const { event, blocks, selectedBlockIdsRef } = ctx;
    if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
    const selected = selectedBlockIdsRef.current;
    if (selected.size === 0) return false;

    event.preventDefault();
    ctx.writeBlocks(blocks.filter((block) => !selected.has(block.id)));
    ctx.setSelectedBlockIds(new Set());
    return true;
}

/** Backspace: undo a conversion, empty a line, outdent, or merge upwards. */
function handleBackspace(ctx: KeyContext): boolean {
    const { event, id, content, blocks, index, block, commands, autoFormat } = ctx;
    if (event.key !== 'Backspace' || !block) return false;

    /* Undo a markdown conversion that just fired. Checked before the
       empty-line rules below, which would otherwise swallow the keystroke and
       delete the block instead of giving the marker back. */
    const pending = revertableConversion(autoFormat.current, id, content, ctx.caretOffset());
    if (pending) {
        event.preventDefault();
        const restored = rememberRevert(autoFormat.current, pending);
        ctx.writeBlocks(blocks.map((b) => (b.id === id
            ? { ...b, type: pending.prevType, content: restored, metadata: pending.prevMetadata }
            : b)));
        const host = ctx.blockRefs.current[id];
        if (host) host.innerText = restored;
        ctx.focusBlock(id, pending.marker.length);
        return true;
    }

    if (isBlank(content)) {
        event.preventDefault();
        const indent = block.indent || 0;
        const parentToggle = indent > 0 ? enclosingToggle(blocks, index) : null;

        if (parentToggle) {
            // An empty line inside a toggle merges up like any other line.
            commands.removeBlock(id);
        } else if (indent > 0) {
            commands.outdent(id);
        } else if (block.type === 'toggle') {
            /* An empty toggle: in a document it is deleted, but a standalone
               canvas node cannot be, so it becomes plain text instead. */
            if (ctx.nodeId) ctx.convertBlock(id, 'text');
            else commands.removeBlock(id);
        } else if (RESET_TO_TEXT.has(block.type)) {
            ctx.convertBlock(id, 'text');
        } else {
            commands.removeBlock(id);
        }
        return true;
    }

    if (ctx.caretOffset() !== 0) return false;

    if ((block.indent || 0) > 0) {
        event.preventDefault();
        commands.outdent(id);
        return true;
    }
    if (index <= 0) return false;

    event.preventDefault();
    const previous = blocks[index - 1];
    if (OPAQUE_TYPES.has(previous.type)) {
        // Nothing to merge into: step onto it, or drop an empty line.
        if (isBlank(content)) commands.removeBlock(id);
        else ctx.focusBlock(previous.id, 'end');
        return true;
    }

    const next = [...blocks];
    next.splice(index, 1);
    next[index - 1] = { ...previous, content: previous.content + content };
    ctx.writeBlocks(next);
    ctx.focusBlock(previous.id, previous.content.length);
    return true;
}

/** Delete at the end of a line pulls the next one up. */
function handleDelete(ctx: KeyContext): boolean {
    const { event, content, blocks, index, commands } = ctx;
    if (event.key !== 'Delete') return false;
    if (index === -1 || index >= blocks.length - 1) return false;
    if (ctx.caretOffset() !== content.length) return false;

    event.preventDefault();
    const following = blocks[index + 1];
    if (OPAQUE_TYPES.has(following.type)) {
        if (following.type === 'divider') commands.removeBlock(following.id);
        else ctx.focusBlock(following.id, 'start');
        return true;
    }

    const next = [...blocks];
    next.splice(index + 1, 1);
    next[index] = { ...blocks[index], content: blocks[index].content + following.content };
    ctx.writeBlocks(next);
    ctx.focusBlock(ctx.id, content.length);
    return true;
}

/** Up and down move between blocks; with Shift they select whole blocks. */
function handleArrows(ctx: KeyContext): boolean {
    const { event, id, content, blocks, index } = ctx;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
    if (index === -1) return false;
    const up = event.key === 'ArrowUp';

    if (event.shiftKey) {
        const atEdge = up ? ctx.caretOffset() === 0 : ctx.caretOffset() === content.length;
        const neighbour = up ? index - 1 : index + 1;
        if (!atEdge || neighbour < 0 || neighbour >= blocks.length) return false;

        event.preventDefault();
        const selection = new Set(ctx.selectedBlockIdsRef.current);
        selection.add(id);
        selection.add(blocks[neighbour].id);
        ctx.setSelectedBlockIds(selection);
        // Block selection is a manipulation mode: take the caret out of the
        // text so the next arrow extends the selection instead of moving it.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        ctx.editorRef.current?.focus({ preventScroll: true });
        return true;
    }

    const atEdgeLine = content === '' || (up ? isCaretOnFirstLine() : isCaretOnLastLine());
    if (!atEdgeLine) return false;

    let target = up ? index - 1 : index + 1;
    while (target >= 0 && target < blocks.length && isHiddenByCollapsedToggle(blocks, target)) {
        target += up ? -1 : 1;
    }
    if (target < 0 || target >= blocks.length) return false;

    event.preventDefault();
    const x = caretX();
    const fallbackOffset = ctx.caretOffset();
    ctx.focusBlock(blocks[target].id, x !== null ? { x, line: up ? 'last' : 'first', fallbackOffset } : fallbackOffset);
    return true;
}

/**
 * Ctrl+A selects the text of this block; pressing it again escalates to every
 * block, which is what makes "select all then delete" work in a note.
 */
function handleSelectAll(ctx: KeyContext): boolean {
    const { event, content, blocks } = ctx;
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'a') return false;

    const selection = window.getSelection();
    const wholeBlockSelected = selection && selection.toString() === content;
    if (!wholeBlockSelected && content !== '') return false;

    event.preventDefault();
    ctx.setSelectedBlockIds(new Set(blocks.map((block) => block.id)));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    ctx.editorRef.current?.focus({ preventScroll: true });
    return true;
}
