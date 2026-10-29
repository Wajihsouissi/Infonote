import { useRef, memo } from 'react';
import { GripVertical } from '../../../../shared/icons';
import type { Block, BlockDropPosition } from '../../types';
import { beginBlockDrag, endBlockDrag } from '../../drag/blockDragLock';
import { isGalleryMember, GALLERY_DRAG_MIME } from '../../gallery/galleryTypes';
import { dragHasType, readDragData, startDragSession } from '../../drag/dragSession';
import styles from './BlockEditor.module.css';
import { BlockFrame } from './BlockFrame';
import { blockDropPosition } from '../../drag/blockReorder';
import { clearBlockDropIndicator, showBlockDropIndicator } from '../../drag/dropIndicator';
import { beginReorderPreview, pauseReorderPreview, previewReorderAt } from '../../drag/reorderPreview';
import { startBlockDragVisual } from '../../drag/blockDragVisual';
import { previewBlockInsertion, currentBlockInsertionTarget } from '../../drag/blockInsertionPreview';

interface SortableBlockWrapperProps {
    id: string;
    children: React.ReactNode;
    readOnly?: boolean;
    block?: Block;
    nodeId?: string; // Source Node ID (Note Card ID)
    isSelected?: boolean; // New prop
    onMoveBlock?: (sourceBlockId: string, targetBlockId: string, position: BlockDropPosition, dataTransfer?: DataTransfer) => void;
    onDragStart?: (e: React.DragEvent, block: Block) => void; // New prop
    onMenuOpen?: (e: React.MouseEvent, id: string) => void;
    onMouseDown?: (e: React.MouseEvent) => void; // New prop for escalation tracking
    style?: React.CSSProperties;
    // Helper to check if block is media
    // Helper to check if block is media
    isMedia?: boolean;
    promoteBlockHandles?: boolean;
    isFirstChildOfToggle?: boolean;
    deferOffscreen?: boolean;
}

export const SortableBlockWrapper = memo(function SortableBlockWrapper({ id, children, readOnly, block, nodeId, isSelected, onMoveBlock, onDragStart, onMenuOpen, onMouseDown, style, hideHandle, promoteBlockHandles, isFirstChildOfToggle, deferOffscreen }: SortableBlockWrapperProps & { hideHandle?: boolean, promoteBlockHandles?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);

    /* This block can swallow what's being dragged into a gallery: both sides are
       media (or already boards). Only then does the middle of the block become a
       third drop zone — everywhere else, top/bottom insertion is the only
       meaning a drop can have. */
    const canMergeWith = (e: React.DragEvent) =>
        isGalleryMember(block) && dragHasType(e, GALLERY_DRAG_MIME);

    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation();
        // If promoting handles, we don't want internal block dragging
        if (promoteBlockHandles) {
            e.preventDefault();
            return;
        }
        if (!block) return;

        /* A board is dragged by its frame. Without this, dragging to select text
           in the title, or a slipped press on the floating panel, starts a block
           drag and flings the whole board into another card. Tiles guard
           themselves — they stop this handler seeing their drag at all. */
        if ((block.type === 'gallery' || block.type === 'intelligent-ui') && (e.target as HTMLElement).closest('input, textarea, button, select')) {
            e.preventDefault();
            return;
        }

        // Register cleanup function for when drag ends
        // This will clear selection in the source editor
        window.chnkItDragCleanup = () => {
            // Clear selection in the parent BlockEditor component
            const event = new CustomEvent('chnk-it-clear-selection');
            window.dispatchEvent(event);
        };

        // ... rest of drag start ...
        // Allow parent to override or augment data transfer (for multi-selection)
        if (onDragStart) {
            onDragStart(e, block);
        } else {
            // Fallback (Legacy/Simple behavior)
            e.dataTransfer.effectAllowed = 'copyMove';
            startDragSession(e.dataTransfer, {
                'application/chnk-it-block-id': block.id,
                'application/reactflow-block-type': block.type,
                ...(isGalleryMember(block) ? { [GALLERY_DRAG_MIME]: '1' } : {}),
                ...(nodeId ? { 'application/chnk-it-block-data': JSON.stringify({ block, sourceNodeId: nodeId }) } : {}),
            });
        }

        let draggedIds = [block.id];
        try {
            const dragged = JSON.parse(readDragData(e, 'application/chnk-it-block-data')).blocks as Block[] | undefined;
            draggedIds = dragged?.map(block=>block.id) ?? draggedIds;
        } catch { /* Single-block fallback. */ }
        if (ref.current) startBlockDragVisual(e.nativeEvent,ref.current,draggedIds);
        if (ref.current) beginReorderPreview(ref.current,draggedIds);

        // Optimize Drag Ghost and avoid immediate drag cancellation in Chrome/Firefox.
        // Mutating document.body or the wrapper's styles synchronously inside onDragStart
        // causes the browser to immediately cancel the drag. Delaying layout changes to the
        // next tick allows the browser to successfully start the native drag gesture.
        setTimeout(() => {
            beginBlockDrag();
            if (ref.current) {
                ref.current.classList.add(styles.dragging);
            }
        }, 0);
    };

    const handleDragEnd = () => {
        if (ref.current) ref.current.classList.remove(styles.dragging);
        clearBlockDropIndicator();
        const regularCleanup = window.chnkItDragCleanup;
        const multiCleanup = window.chnkItMultiDragCleanup;

        // Check if a cross-editor drop already happened (canvas onDrop dispatched the event).
        // If so, skip calling cleanup again to avoid double-dispatch of chnk-it-clear-selection.
        const crossEditorDropAlreadyHandled = window.chnkItCrossEditorDropHandled;
        window.chnkItCrossEditorDropHandled = false;

        if (!crossEditorDropAlreadyHandled) {
            // Only call multiCleanup if present (it handles both single and multi)
            if (multiCleanup) {
                try {
                    multiCleanup();
                } catch (error) {
                    console.warn('Error during multi-drag cleanup:', error);
                }
                window.chnkItMultiDragCleanup = undefined;
            } else if (regularCleanup) {
                try {
                    regularCleanup();
                } catch (error) {
                    console.warn('Error during regular drag cleanup:', error);
                }
            }
        } else {
            // Cross-editor drop already handled — just clean up refs
            window.chnkItMultiDragCleanup = undefined;
        }

        window.chnkItDragCleanup = undefined;

        // Clear the dragging flag immediately if a cross-editor drop finished
        // (the drop already happened, so no risk of CanvasBoard stealing focus).
        // Only delay if it was a same-editor reorder so the drop target can
        // receive the pointer-down without being misidentified as a canvas click.
        if (crossEditorDropAlreadyHandled) {
            endBlockDrag();
        } else {
            setTimeout(endBlockDrag, 100);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (readOnly || !dragHasType(e, 'application/reactflow-block-type')) return;
        e.preventDefault();
        e.stopPropagation();

        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        e.dataTransfer.dropEffect = 'move';
        const editor = ref.current.closest('[data-chnk-it-block-editor]');
        const foreign=editor instanceof HTMLElement&&readDragData(e,'application/chnk-it-editor-id')!==editor.dataset.editorId;
        if(foreign&&!canMergeWith(e)){
            const ids=[...editor.querySelectorAll<HTMLElement>('[data-block-id]')].filter(frame=>frame.closest('[data-chnk-it-block-editor]')===editor).map(frame=>frame.dataset.blockId!);
            previewBlockInsertion(editor,ids,e.clientY,document.querySelector('[data-carried-block]')?.getBoundingClientRect().height);
            return;
        }
        if (Number(ref.current.dataset.blockIndent) > 0 && editor) pauseReorderPreview(editor);
        const target = !canMergeWith(e) && Number(ref.current.dataset.blockIndent) === 0 ? previewReorderAt(editor,e.clientY) : null;
        const frame = target ? document.getElementById(`block-${target.blockId}`) : ref.current;
        if (frame) showBlockDropIndicator(frame, target?.position ?? blockDropPosition(e.clientY, rect, canMergeWith(e)));
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // The editor owns genuine exits. Animated siblings can dispatch leave
        // with a null relatedTarget while the pointer remains stationary.
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        if (readOnly) return;

        const sourceBlockId = readDragData(e, 'application/chnk-it-block-id');
        const type = readDragData(e, 'application/reactflow-block-type');

        if ((sourceBlockId || type) && onMoveBlock) {
            e.preventDefault();
            e.stopPropagation();
            clearBlockDropIndicator();

            const editor=ref.current?.closest('[data-chnk-it-block-editor]');
            const target=(editor?currentBlockInsertionTarget(editor):null)??(!canMergeWith(e) && Number(ref.current?.dataset.blockIndent) === 0 ? previewReorderAt(editor??null,e.clientY) : null);
            if (sourceBlockId === (target?.blockId ?? id)) return;
            // Use special ID for external drops to satisfy type but indicate source
            const box = ref.current?.getBoundingClientRect();
            onMoveBlock(sourceBlockId || "EXTERNAL_DROP", target?.blockId ?? id, target?.position ?? (box ? blockDropPosition(e.clientY, box, canMergeWith(e)) : 'bottom'), e.dataTransfer);
        } else {
            // For unhandled types (like files) or missing move handler,
            // let the event bubble to the parent BlockEditor
            clearBlockDropIndicator();
        }
    };

    const isMedia = ['media', 'image', 'video', 'file', 'color'].includes(block?.type || '');
    /* A board owns its whole footprint and carries its own controls. A grip rail
       beside it would hang off a deliberately frameless object and read as
       belonging to nothing, so it's dragged by its surface like media instead. */
    const isBoard = block?.type === 'gallery';
    const isIntelligentUI = block?.type === 'intelligent-ui';
    const isWrapperDraggable = isMedia || isBoard || block?.type === 'table' || isIntelligentUI;
    const canDragWrapper = !readOnly && isWrapperDraggable && !promoteBlockHandles;

    return (
        <BlockFrame
            ref={ref}
            data-block-id={id}
            data-block-type={block?.type}
            data-block-indent={block?.indent ?? 0}
            data-defer-offscreen={deferOffscreen && ['text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'quote', 'callout'].includes(block?.type || '') ? 'true' : undefined}
            data-toggle-heading={block?.type === 'toggle' ? block.metadata?.toggleHeaderLevel : undefined}
            className={`${styles.sortableWrapper} ${isSelected ? styles.selected : ''} ${hideHandle ? styles.hideHandle : ''} ${promoteBlockHandles ? '' : 'nodrag'}`}
            style={style}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onMouseDown={onMouseDown} // Linked prop
            onContextMenu={(e) => onMenuOpen?.(e, id)}
            id={`block-${id}`}

            // Allow dragging from anywhere on media blocks only
            draggable={canDragWrapper}
            onDragStart={canDragWrapper ? handleDragStart : undefined}
            contentClassName={(promoteBlockHandles && !isMedia && !isBoard) ? 'nodrag' : ''}
            controls={!readOnly && !hideHandle && !isMedia && !isBoard && !isIntelligentUI && (
                <button
                    type="button"
                    aria-label="Move block or open menu"
                    title="Drag to move · Alt+↑/↓ to reorder · Click for menu"
                    className={`${styles.dragHandle} ${promoteBlockHandles ? 'custom-drag-handle' : ''}`}
                    contentEditable={false}
                    draggable={!promoteBlockHandles}
                    onDragStart={!promoteBlockHandles ? handleDragStart : undefined}
                    onClick={(e) => onMenuOpen?.(e, id)}
                    onKeyDown={e => {
                        if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key) || promoteBlockHandles) return;
                        e.preventDefault(); e.stopPropagation();
                        const editor = ref.current?.closest('[data-chnk-it-block-editor]');
                        const siblings = [...editor?.querySelectorAll<HTMLElement>('[data-block-id]') ?? []]
                            .filter(el => el.closest('[data-chnk-it-block-editor]') === editor);
                        const index = siblings.findIndex(el => el === ref.current);
                        const target = siblings[index + (e.key === 'ArrowUp' ? -1 : 1)];
                        if (target?.dataset.blockId) onMoveBlock?.(id, target.dataset.blockId, e.key === 'ArrowUp' ? 'top' : 'bottom');
                    }}
                >
                    <GripVertical size={14} />
                </button>
            )}
        >
                <span className={styles.dropMarker} data-block-drop-marker aria-hidden="true" />
                {children}
                {isFirstChildOfToggle && !readOnly && (
                    <div className={styles.toggleHint}>
                        <kbd>↵</kbd> new toggle <span>•</span> <kbd>⇧</kbd><kbd>↵</kbd> write
                    </div>
                )}
        </BlockFrame>
    );
});
