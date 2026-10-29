import type { Block, BlockMetadata, BlockType } from '../types';
import { AUTOFORMAT_SOURCE_TYPES, matchMarkerShortcut, stripLeadingChars } from './markdownShortcuts';
import { serializeInline } from './inlineFormat';

/**
 * Typing "# " turns a line into a heading. This is the bookkeeping that makes
 * that reversible, and keeps it reversed.
 *
 * Two states are remembered, both scoped to one block:
 *
 *  - `pending`: a conversion that just happened, which the very next Backspace
 *    undoes. Any other edit closes that window, the way Notion's does.
 *  - `reverted`: the marker the reader asked to keep as literal text. While the
 *    line still starts with it, the shortcut does not fire again — without
 *    this, undoing the conversion was pointless, because the next character
 *    typed converted the line straight back and "# " could never be written.
 */

export interface PendingConversion {
    blockId: string;
    marker: string;
    prevType: BlockType;
    prevMetadata?: BlockMetadata;
    /** The text left after the marker was eaten, as it was at conversion. */
    restAtConversion: string;
}

interface RevertedMarker {
    blockId: string;
    marker: string;
}

export interface AutoFormatMemory {
    pending: PendingConversion | null;
    reverted: RevertedMarker | null;
    /** Cancels the follow-up marker strip scheduled by the last conversion. */
    cancelStrip: (() => void) | null;
}

export const emptyAutoFormatMemory = (): AutoFormatMemory => ({ pending: null, reverted: null, cancelStrip: null });

/** What an edit to a block's text should do about markdown shortcuts. */
export type AutoFormatResult =
    | { action: 'none' }
    | { action: 'convert'; type: BlockType; metadata?: BlockMetadata; rest: string; marker: string };

/**
 * Decides whether an edit triggers a shortcut, and updates `memory` in place.
 *
 * `inputType` is the browser's own account of what caused the edit: only a real
 * insertion may convert, or an undo that restores "# " would instantly convert
 * it again.
 */
export function considerAutoFormat(
    memory: AutoFormatMemory,
    block: Block | undefined,
    content: string,
    inputType: string | undefined,
): AutoFormatResult {
    if (memory.reverted && memory.reverted.blockId === block?.id) {
        // Still showing the marker the reader kept: leave it alone.
        if (content.startsWith(memory.reverted.marker)) return { action: 'none' };
        memory.reverted = null;
    }

    const isInsertion = !inputType || inputType.startsWith('insert');
    const canConvert = !!block && isInsertion && AUTOFORMAT_SOURCE_TYPES.has(block.type);
    const hit = canConvert ? matchMarkerShortcut(content, 'type') : null;

    if (hit && block) {
        memory.pending = {
            blockId: block.id,
            marker: content.slice(0, hit.markerLength),
            prevType: block.type,
            prevMetadata: block.metadata,
            restAtConversion: hit.rest,
        };
        return {
            action: 'convert',
            type: hit.rule.type,
            metadata: hit.metadata,
            rest: hit.rest,
            marker: content.slice(0, hit.markerLength),
        };
    }

    /* Any other edit closes the undo window: it only lasts while the block
       still reads exactly as it did right after the conversion. */
    if (memory.pending && (memory.pending.blockId !== block?.id || content !== memory.pending.restAtConversion)) {
        memory.pending = null;
    }
    return { action: 'none' };
}

/**
 * The conversion the next Backspace should undo, if this is that moment:
 * same block, untouched text, caret at the very start.
 */
export function revertableConversion(
    memory: AutoFormatMemory,
    blockId: string,
    content: string,
    caretOffset: number,
): PendingConversion | null {
    const pending = memory.pending;
    if (!pending || pending.blockId !== blockId) return null;
    if (content !== pending.restAtConversion || caretOffset !== 0) return null;
    return pending;
}

/** Records that `pending` was undone, so the marker stays literal text. */
export function rememberRevert(memory: AutoFormatMemory, pending: PendingConversion): string {
    memory.pending = null;
    memory.reverted = { blockId: pending.blockId, marker: pending.marker };
    /* The conversion left a marker strip queued for the next frame to catch a
       remount. It has to be called off, or under load it lands AFTER this
       revert and eats the marker the reader just asked to keep. */
    memory.cancelStrip?.();
    memory.cancelStrip = null;
    return pending.marker + pending.restAtConversion;
}

/**
 * Takes the marker characters off the live element after a conversion.
 *
 * React may keep the very same DOM node — a heading becoming a bigger heading
 * reuses one component — and the editor deliberately skips re-syncing a focused
 * element so the caret cannot jump mid-typing. The marker would therefore stay
 * on screen and be read straight back into state on the next keystroke.
 *
 * Runs again on the next frame to catch a remount, so it re-checks that the
 * marker is genuinely still there: by then the reader may have typed more, and
 * blindly removing "the first N characters" would eat their text.
 */
export function stripMarkerFromHost(memory: AutoFormatMemory, getHost: () => HTMLElement | null, marker: string): void {
    const strip = () => {
        const el = getHost();
        if (!el?.isConnected) return;
        const live = serializeInline(el);
        if (!live.startsWith(marker)) return;
        stripLeadingChars(el, marker.length, live.slice(marker.length));
    };
    strip();
    const frame = requestAnimationFrame(() => {
        memory.cancelStrip = null;
        strip();
    });
    memory.cancelStrip = () => cancelAnimationFrame(frame);
}
