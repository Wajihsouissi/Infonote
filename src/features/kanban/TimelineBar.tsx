import React from 'react';
import styles from './KanbanTimeline.module.css';

interface TimelineBarProps {
    label: string;
    width: number;
    left: number;
    color?: string;
    onMouseDown?: (e: React.MouseEvent, type: 'move' | 'resize-l' | 'resize-r') => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({ label, width, left, color, onMouseDown }) => {
    return (
        <div
            className={styles.timelineBar}
            style={{
                left,
                width: Math.max(width, 24), // Minimum width
                backgroundColor: color || 'var(--accent)',
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
                onMouseDown?.(e, 'move');
            }}
        >
            {/* Left Resize Handle */}
            <div
                className={`${styles.resizeHandle} ${styles.resizeHandleLeft}`}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    onMouseDown?.(e, 'resize-l');
                }}
            />

            <span>{label}</span>

            {/* Right Resize Handle */}
            <div
                className={`${styles.resizeHandle} ${styles.resizeHandleRight}`}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    onMouseDown?.(e, 'resize-r');
                }}
            />
        </div>
    );
};
