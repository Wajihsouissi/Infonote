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
}

export const SortableBlockWrapper = memo(function SortableBlockWrapper({ id, children, readOnly, block, nodeId, isSelected, onMoveBlock, onDragStart, onMenuOpen, onMouseDown, style, hideHandle, promoteBlockHandles }: SortableBlockWrapperProps & { hideHandle?: boolean, promoteBlockHandles?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const [dropIndication, setDropIndication] = useState<'top' | 'bottom' | null>(null);

    const handleDragStart = (e: React.DragEvent) => {
        // If promoting handles, we don't want internal block dragging
        if (promoteBlockHandles) {
            e.preventDefault();
            return;
        }
        if (!block) return;

        // Register cleanup function for when drag ends
        // This will clear selection in the source editor
        (window as any).infonoteDragCleanup = () => {
            console.log('Executing drag cleanup function');
            // Clear selection in the parent BlockEditor component
            const event = new CustomEvent('infonote-clear-selection');
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
            e.dataTransfer.setData('application/infonote-block-id', block.id);
            e.dataTransfer.setData('application/reactflow-block-type', block.type);
            if (nodeId) {
                e.dataTransfer.setData('application/infonote-block-data', JSON.stringify({
                    block,
                    sourceNodeId: nodeId
                }));
            }
        }

        // Optimize Drag Ghost: Delay styling so browser captures full opacity image first
        setTimeout(() => {
            if (ref.current) {
                ref.current.classList.add(styles.dragging);
            }
        }, 0);
    };

    const handleDragEnd = () => {
        if (ref.current) ref.current.classList.remove(styles.dragging);
        setDropIndication(null);

        // Execute both regular and multi-block cleanup
        const regularCleanup = (window as any).infonoteDragCleanup;
        const multiCleanup = (window as any).infonoteMultiDragCleanup;

        if (regularCleanup) {
            try {
                console.log('Executing regular drag cleanup for block:', block?.id);
                regularCleanup();
            } catch (error) {
                console.warn('Error during regular drag cleanup:', error);
            }
            (window as any).infonoteDragCleanup = undefined;
        }

        if (multiCleanup) {
            try {
                console.log('Executing multi-drag cleanup');
                multiCleanup();
            } catch (error) {
                console.warn('Error during multi-drag cleanup:', error);
            }
            (window as any).infonoteMultiDragCleanup = undefined;
        }

        if (!regularCleanup && !multiCleanup) {
            console.log('No drag cleanup functions found for block:', block?.id);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        const newIndication = e.clientY < midY ? 'top' : 'bottom';
        if (dropIndication !== newIndication) setDropIndication(newIndication);
    };

    const handleDragLeave = () => {
        setDropIndication(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (readOnly) return;

        const sourceBlockId = e.dataTransfer.getData('application/infonote-block-id');
        const type = e.dataTransfer.getData('application/reactflow-block-type');

        if ((sourceBlockId || type) && onMoveBlock) {
            e.preventDefault();
            e.stopPropagation();
            setDropIndication(null);

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
    const canDragWrapper = !readOnly && isMedia && !promoteBlockHandles;

    const dropClass = dropIndication === 'top' ? styles.dropTargetTop : (dropIndication === 'bottom' ? styles.dropTargetBottom : '');

    return (
        <div
            ref={ref}
            data-block-type={block?.type}
            className={`${styles.sortableWrapper} ${isSelected ? styles.selected : ''} ${hideHandle ? styles.hideHandle : ''} ${(!canDragWrapper && !promoteBlockHandles) ? 'nodrag' : ''} ${dropClass}`}
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
            </div>
        </div>
    );
});

