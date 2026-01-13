import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NoteCard } from '../card/NoteCard';
import type { NoteNode } from '../../types';
import type { CSSProperties } from 'react';

interface SortableCardProps {
    node: NoteNode;
    style?: CSSProperties;
}

export const SortableCard = ({ node, style }: SortableCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: node.id,
        data: {
            type: 'card',
            node
        }
    });

    const dndStyle: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        height: style?.height,
        ...style // Allow passing external styles
    };

    return (
        <div
            ref={setNodeRef}
            style={dndStyle}
            {...attributes}
            {...listeners}
        >
            <NoteCard
                {...node}
                selected={false}
                zIndex={0}
                isConnectable={false}
                selectable={false}
                deletable={true}
                draggable={false} // Important: Disable RF drag
                dragging={isDragging} // Pass dragging state for styling if needed
                positionAbsoluteX={0}
                positionAbsoluteY={0}
            />
        </div>
    );
};
