import { useRef, useState, memo } from 'react';
import { GripVertical } from 'lucide-react';
import type { Block } from './types';
import styles from './BlockEditor.module.css';

interface SortableBlockWrapperProps {
    id: string;
    children: React.ReactNode;
    readOnly?: boolean;
    block?: Block;
    nodeId?: string; // Source Node ID (Note Card ID)
    isSelected?: boolean; // New prop
    onMoveBlock?: (sourceBlockId: string, targetBlockId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => void;
    onDragStart?: (e: React.DragEvent, block: Block) => void; // New prop
    onMenuOpen?: (e: React.MouseEvent, id: string) => void;
    onMouseDown?: (e: React.MouseEvent) => void; // New prop for escalation tracking
    style?: React.CSSProperties;
    // Helper to check if block is media
    // Helper to check if block is media
    isMedia?: boolean;
    promoteBlockHandles?: boolean;
    isFirstChildOfToggle?: boolean;
}

export const SortableBlockWrapper = memo(function SortableBlockWrapper({ id, children, readOnly, block, nodeId, isSelected, onMoveBlock, onDragStart, onMenuOpen, onMouseDown, style, hideHandle, promoteBlockHandles, isFirstChildOfToggle }: SortableBlockWrapperProps & { hideHandle?: boolean, promoteBlockHandles?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const [dropIndication, setDropIndication] = useState<'top' | 'bottom' | null>(null);

    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation();
        // If promoting handles, we don't want internal block dragging
        if (promoteBlockHandles) {
            e.preventDefault();
            return;
        }
        if (!block) return;

        // Register cleanup function for when drag ends
        // This will clear selection in the source editor
        (window as any).chnkItDragCleanup = () => {
            console.log('Executing drag cleanup function');
            // Clear selection in the parent BlockEditor component
            const event = new CustomEvent('chnk-it-clear-selection');
            window.dispatchEvent(event);
        };
        console.log('Registered drag cleanup function for block:', block.id);

        // ... rest of drag start ...
        // Allow parent to override or augment data transfer (for multi-selection)
        if (onDragStart) {
            onDragStart(e, block);
        } else {
            // Fallback (Legacy/Simple behavior)
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('application/chnk-it-block-id', block.id);
            e.dataTransfer.setData('application/reactflow-block-type', block.type);
            if (nodeId) {
                e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify({
                    block,
                    sourceNodeId: nodeId
                }));
            }
        }

        // Optimize Drag Ghost and avoid immediate drag cancellation in Chrome/Firefox.
        // Mutating document.body or the wrapper's styles synchronously inside onDragStart
        // causes the browser to immediately cancel the drag. Delaying layout changes to the
        // next tick allows the browser to successfully start the native drag gesture.
        setTimeout(() => {
            document.body.classList.add('chnk-it-block-dragging');
            (window as any).chnkItBlockDragging = true;
            if (ref.current) {
                ref.current.classList.add(styles.dragging);
            }
        }, 0);
    };

    const handleDragEnd = () => {
        if (ref.current) ref.current.classList.remove(styles.dragging);
        setDropIndication(null);
        document.querySelectorAll('[data-external-drop-target]').forEach(el => {
            el.removeAttribute('data-external-drop-target');
        });
        document.body.classList.remove('chnk-it-block-dragging');

        const regularCleanup = (window as any).chnkItDragCleanup;
        const multiCleanup = (window as any).chnkItMultiDragCleanup;

        // Check if a cross-editor drop already happened (canvas onDrop dispatched the event).
        // If so, skip calling cleanup again to avoid double-dispatch of chnk-it-clear-selection.
        const crossEditorDropAlreadyHandled = (window as any).chnkItCrossEditorDropHandled;
        (window as any).chnkItCrossEditorDropHandled = false;

        if (!crossEditorDropAlreadyHandled) {
            // Only call multiCleanup if present (it handles both single and multi)
            if (multiCleanup) {
                try {
                    console.log('Executing multi-drag cleanup');
                    multiCleanup();
                } catch (error) {
                    console.warn('Error during multi-drag cleanup:', error);
                }
                (window as any).chnkItMultiDragCleanup = undefined;
            } else if (regularCleanup) {
                try {
                    console.log('Executing regular drag cleanup for block:', block?.id);
                    regularCleanup();
                } catch (error) {
                    console.warn('Error during regular drag cleanup:', error);
                }
            }
        } else {
            // Cross-editor drop already handled — just clean up refs
            (window as any).chnkItMultiDragCleanup = undefined;
        }

        (window as any).chnkItDragCleanup = undefined;

        // Clear the dragging flag immediately if a cross-editor drop finished
        // (the drop already happened, so no risk of CanvasBoard stealing focus).
        // Only delay if it was a same-editor reorder so the drop target can
        // receive the pointer-down without being misidentified as a canvas click.
        if (crossEditorDropAlreadyHandled) {
            (window as any).chnkItBlockDragging = false;
        } else {
            setTimeout(() => {
                (window as any).chnkItBlockDragging = false;
            }, 100);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const newIndication = relY < rect.height / 2 ? 'top' : 'bottom';
        if (dropIndication !== newIndication) setDropIndication(newIndication);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Ignore DragLeave events caused by entering a child element — only clear
        // when the cursor truly exits this block's bounding box.
        if (!ref.current?.contains(e.relatedTarget as Node)) {
            setDropIndication(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        if (readOnly) return;

        const sourceBlockId = e.dataTransfer.getData('application/chnk-it-block-id');
        const type = e.dataTransfer.getData('application/reactflow-block-type');

        if ((sourceBlockId || type) && onMoveBlock) {
            e.preventDefault();
            e.stopPropagation();
            setDropIndication(null);
            document.querySelectorAll('[data-external-drop-target]').forEach(el => {
                el.removeAttribute('data-external-drop-target');
            });

            if (sourceBlockId === id) return;
            // Use special ID for external drops to satisfy type but indicate source
            onMoveBlock(sourceBlockId || "EXTERNAL_DROP", id, dropIndication || 'bottom', e.dataTransfer);
        } else {
            // For unhandled types (like files) or missing move handler,
            // let the event bubble to the parent BlockEditor
            setDropIndication(null);
        }
    };

    const isMedia = ['image', 'video', 'file', 'color'].includes(block?.type || '');
    const isWrapperDraggable = isMedia || block?.type === 'table';
    const canDragWrapper = !readOnly && isWrapperDraggable && !promoteBlockHandles;

    const dropClass = dropIndication === 'top' ? styles.dropTargetTop : (dropIndication === 'bottom' ? styles.dropTargetBottom : '');

    return (
        <div
            ref={ref}
            data-block-type={block?.type}
            className={`${styles.sortableWrapper} ${isSelected ? styles.selected : ''} ${hideHandle ? styles.hideHandle : ''} ${promoteBlockHandles ? '' : 'nodrag'} ${dropClass}`}
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
        >
            {!readOnly && !hideHandle && !isMedia && (
                <div
                    className={`${styles.dragHandle} ${promoteBlockHandles ? 'custom-drag-handle' : ''}`}
                    contentEditable={false}
                    draggable={!promoteBlockHandles}
                    onDragStart={!promoteBlockHandles ? handleDragStart : undefined}
                    onClick={(e) => onMenuOpen?.(e, id)}
                >
                    <GripVertical size={14} />
                </div>
            )}
            <div className={`${styles.blockContent} ${(promoteBlockHandles && !isMedia) ? 'nodrag' : ''}`}>
                {children}
                {isFirstChildOfToggle && !readOnly && (
                    <div className={styles.toggleHint}>
                        <kbd>↵</kbd> new toggle <span>•</span> <kbd>⇧</kbd><kbd>↵</kbd> write
                    </div>
                )}
            </div>
        </div>
    );
});
