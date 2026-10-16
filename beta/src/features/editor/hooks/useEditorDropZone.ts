import { useCallback, useRef } from 'react';
import type { Block, BlockDropPosition } from '../types';
import { useStableCallback } from '../../../utils/useStableCallback';

interface UseEditorDropZoneOptions {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocksRef: React.RefObject<Block[]>;
    /** React Flow's own drag-over bookkeeping (preventDefault + dropEffect). */
    onDragOverBlocks: (event: React.DragEvent) => void;
}

/**
 * Where a drag hovering over the editor would land.
 *
 * The per-block handlers cover the blocks themselves; this covers what they
 * cannot — the gaps between blocks, above the first and below the last — so a
 * drop never silently falls through to the end of the document.
 */
export function useEditorDropZone({ editorRef, blocksRef, onDragOverBlocks }: UseEditorDropZoneOptions) {
    const targetRef = useRef<{ blockId: string; position: BlockDropPosition } | null>(null);

    const clearIndicators = useCallback(() => {
        document.querySelectorAll('[data-external-drop-target]').forEach((el) => {
            el.removeAttribute('data-external-drop-target');
        });
        targetRef.current = null;
    }, []);

    const onDragOver = useStableCallback((event: React.DragEvent) => {
        onDragOverBlocks(event);

        /* Walk the blocks top to bottom: the first one whose bottom edge is
           below the cursor owns it — before its midpoint means "above this
           block", after means "below it". Past the last block, the end. */
        const y = event.clientY;
        let next: { blockId: string; position: BlockDropPosition } | null = null;
        for (const block of blocksRef.current) {
            const el = document.getElementById(`block-${block.id}`);
            if (!el) continue;
            const box = el.getBoundingClientRect();
            if (y < box.bottom) {
                next = { blockId: block.id, position: y < box.top + box.height / 2 ? 'top' : 'bottom' };
                break;
            }
        }
        const blocks = blocksRef.current;
        if (!next && blocks.length > 0) next = { blockId: blocks[blocks.length - 1].id, position: 'bottom' };
        if (!next) return;

        // Only touch the DOM when the target actually moved.
        const previous = targetRef.current;
        if (previous?.blockId === next.blockId && previous.position === next.position) return;
        if (previous) document.getElementById(`block-${previous.blockId}`)?.removeAttribute('data-external-drop-target');
        targetRef.current = next;
        document.getElementById(`block-${next.blockId}`)?.setAttribute('data-external-drop-target', next.position);
    });

    const onDragLeave = useStableCallback((event: React.DragEvent) => {
        // Only when leaving the editor itself, not on entering a child.
        if (!editorRef.current?.contains(event.relatedTarget as Node)) clearIndicators();
    });

    return { pendingTargetRef: targetRef, onDragOver, onDragLeave, clearIndicators };
}
