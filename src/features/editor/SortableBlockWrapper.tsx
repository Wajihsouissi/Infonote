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
    style?: React.CSSProperties;
    // Helper to check if block is media
    isMedia?: boolean;
}

export const SortableBlockWrapper = memo(function SortableBlockWrapper({ id, children, readOnly, block, nodeId, isSelected, onMoveBlock, onDragStart, onMenuOpen, style }: SortableBlockWrapperProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [dropIndication, setDropIndication] = useState<'top' | 'bottom' | null>(null);

    const handleDragStart = (e: React.DragEvent) => {
        if (!block) return;

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

        // Optimize Drag Ghost: Use the row as image but ensure browser handles it well
        if (ref.current) {
            ref.current.style.opacity = '0.4';
        }
    };

    const handleDragEnd = () => {
        if (ref.current) ref.current.style.opacity = '1';
        setDropIndication(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        const newIndication = e.clientY < midY ? 'top' : 'bottom';

        // Optimization: Only update state if it changes
        if (dropIndication !== newIndication) {
            setDropIndication(newIndication);
        }
    };

    const handleDragLeave = () => {
        setDropIndication(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setDropIndication(null);

        const sourceBlockId = e.dataTransfer.getData('application/infonote-block-id');

        if (sourceBlockId && onMoveBlock) {
            // Internal Reorder or External Move
            // Use ID check if we are in the same editor context, or rely on sourceBlockId being present
            if (sourceBlockId === id) return;
            onMoveBlock(sourceBlockId, id, dropIndication || 'bottom', e.dataTransfer);
        }
    };

    const borderStyle = dropIndication === 'top'
        ? { borderTop: '2px solid var(--color-primary)' }
        : dropIndication === 'bottom'
            ? { borderBottom: '2px solid var(--color-primary)' }
            : {};

    const isMedia = block?.type === 'image' || block?.type === 'video';

    return (
        <div
            ref={ref}
            data-block-type={block?.type}
            className={`${styles.sortableWrapper} ${isSelected ? styles.selected : ''} nodrag`}
            style={{ ...borderStyle, ...style, transition: 'border 0.1s' }} // Merged styles
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            id={`block-${id}`}

            // Allow dragging from anywhere on media blocks
            draggable={!readOnly && isMedia}
            onDragStart={(!readOnly && isMedia) ? handleDragStart : undefined}
        >
            {!readOnly && (
                <div
                    className={styles.dragHandle}
                    contentEditable={false}
                    draggable={true}
                    onDragStart={handleDragStart}
                    onClick={(e) => onMenuOpen?.(e, id)}
                >
                    <GripVertical size={14} />
                </div>
            )}
            <div className={styles.blockContent}>
                {children}
            </div>
        </div>
    );
});

