import { useCallback, useEffect, useRef } from 'react';
import type { Block, BlockDropPosition } from '../types';
import { useStableCallback } from '../../../utils/useStableCallback';
import { clearBlockDropIndicator, showBlockDropIndicator } from '../drag/dropIndicator';
import { blockDropPosition } from '../drag/blockReorder';
import { dragHasType, readDragData } from '../drag/dragSession';
import { previewBlockInsertion, clearOwnedBlockInsertionPreview } from '../drag/blockInsertionPreview';
import { pauseReorderPreview, previewReorderAt } from '../drag/reorderPreview';

interface UseEditorDropZoneOptions {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocksRef: React.RefObject<Block[]>;
    readOnly?: boolean;
    /** React Flow's own drag-over bookkeeping (preventDefault + dropEffect). */
    onDragOverBlocks: (event: React.DragEvent) => void;
    onDropBlocks: (event: React.DragEvent) => void;
}

/**
 * Where a drag hovering over the editor would land.
 *
 * The per-block handlers cover the blocks themselves; this covers what they
 * cannot — the gaps between blocks, above the first and below the last — so a
 * drop never silently falls through to the end of the document.
 */
export function useEditorDropZone({ editorRef, blocksRef, readOnly, onDragOverBlocks, onDropBlocks }: UseEditorDropZoneOptions) {
    const targetRef = useRef<{ blockId: string; position: BlockDropPosition } | null>(null);

    const clearIndicators = useCallback(() => {
        clearBlockDropIndicator();
        clearOwnedBlockInsertionPreview(editorRef.current);
        targetRef.current = null;
    }, [editorRef]);

    const onDragOver = useStableCallback((event: React.DragEvent) => {
        if (readOnly) return;
        if (!dragHasType(event, 'application/reactflow-block-type')) {
            if (event.dataTransfer.types.includes('Files')) onDragOverBlocks(event);
            clearIndicators();
            return;
        }
        onDragOverBlocks(event);
        const editor=editorRef.current;
        if(editor&&readDragData(event,'application/chnk-it-editor-id')!==editor.dataset.editorId){
            const slot=previewBlockInsertion(editor,blocksRef.current.map(block=>block.id),event.clientY,document.querySelector('[data-carried-block]')?.getBoundingClientRect().height);
            targetRef.current=slot;return;
        }

        /* Walk the blocks top to bottom: the first one whose bottom edge is
           below the cursor owns it — before its midpoint means "above this
           block", after means "below it". Past the last block, the end. */
        const y = event.clientY;
        let next: { blockId: string; position: BlockDropPosition } | null = previewReorderAt(editorRef.current,y);
        for (const block of next ? [] : blocksRef.current) {
            const el = document.getElementById(`block-${block.id}`);
            if (!el || el.closest('[data-chnk-it-block-editor]') !== editorRef.current || el.getClientRects().length === 0) continue;
            const box = el.getBoundingClientRect();
            if (y < box.bottom) {
                next = { blockId: block.id, position: blockDropPosition(y, box) };
                break;
            }
        }
        if (!next) {
            const last = [...blocksRef.current].reverse().find(block => {
                const el = document.getElementById(`block-${block.id}`);
                return el?.closest('[data-chnk-it-block-editor]') === editorRef.current && el.getClientRects().length > 0;
            });
            if (last) next = { blockId: last.id, position: 'bottom' };
        }
        if (!next) return;

        // Only touch the DOM when the target actually moved.
        const previous = targetRef.current;
        if (previous?.blockId === next.blockId && previous.position === next.position
            && document.getElementById(`block-${next.blockId}`)?.dataset.externalDropTarget === next.position) return;
        if (previous) document.getElementById(`block-${previous.blockId}`)?.removeAttribute('data-external-drop-target');
        targetRef.current = next;
        const element = document.getElementById(`block-${next.blockId}`);
        if (element) showBlockDropIndicator(element, next.position);
    });

    const onDragLeave = useStableCallback((event: React.DragEvent) => {
        // Only when leaving the editor itself, not on entering a child.
        const area = editorRef.current?.closest('.infonote-scrollable') ?? editorRef.current;
        const box = area?.getBoundingClientRect();
        const inside = box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside && !editorRef.current?.contains(event.relatedTarget as Node)) {
            clearIndicators();
            if (editorRef.current) pauseReorderPreview(editorRef.current);
        }
    });

    const onAreaDrop = useStableCallback((event: React.DragEvent) => { onDropBlocks(event); clearIndicators(); });
    useEffect(() => {
        const editor = editorRef.current;
        // The note's padded/empty area belongs to its outer document. A nested
        // editor must never claim that same area and reorder the wrong list.
        if (readOnly || !editor || editor.parentElement?.closest('[data-chnk-it-block-editor]')) return;
        const area = editor.closest('.infonote-scrollable');
        if (!area) return;
        const isGap = (event: DragEvent) => event.target instanceof Node && !editor.contains(event.target)
            && dragHasType(event, 'application/reactflow-block-type');
        const over = (event: DragEvent) => { if (isGap(event)) onDragOver(event as unknown as React.DragEvent); };
        const drop = (event: DragEvent) => { if (isGap(event)) onAreaDrop(event as unknown as React.DragEvent); };
        const leave = (event: DragEvent) => { if (!(event.relatedTarget instanceof Node) || !area.contains(event.relatedTarget)) clearIndicators(); };
        area.addEventListener('dragover', over as EventListener);
        area.addEventListener('drop', drop as EventListener);
        area.addEventListener('dragleave', leave as EventListener);
        return () => {
            area.removeEventListener('dragover', over as EventListener);
            area.removeEventListener('drop', drop as EventListener);
            area.removeEventListener('dragleave', leave as EventListener);
            clearIndicators();
        };
    }, [readOnly, editorRef, onDragOver, onAreaDrop, clearIndicators]);

    return { pendingTargetRef: targetRef, onDragOver, onDragLeave, clearIndicators };
}
