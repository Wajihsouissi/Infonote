import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { KanbanCardPreview } from './KanbanCardPreview';
import type { NoteNode } from '../../types';
import styles from './SortableCard.module.css';

interface SortableCardProps {
    node: NoteNode;
    onCardClick?: (node: NoteNode) => void;
    onCardDoubleClick?: (node: NoteNode) => void;
}

export const SortableCard = ({ node, onCardClick, onCardDoubleClick }: SortableCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isSorting
    } = useSortable({
        id: node.id,
        data: {
            type: 'card',
            node
        }
    });

    // Use Translate for smoother animation (only x/y, no scale/rotate)
    const style = {
        transform: CSS.Translate.toString(transform),
        transition: isSorting ? transition : undefined,
        willChange: isDragging ? 'transform' : undefined,
    };

    const handleClick = () => {
        if (onCardClick && !isDragging) {
            onCardClick(node);
        }
    };

    const handleDoubleClick = () => {
        if (onCardDoubleClick && !isDragging) {
            onCardDoubleClick(node);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`${styles.wrapper} ${isDragging ? styles.dragging : ''}`}
            {...attributes}
            {...listeners}
        >
            <KanbanCardPreview
                node={node}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                isDragging={isDragging}
            />
        </div>
    );
};

