import { memo, useState, useCallback } from 'react';
import { Calendar, Clock, Circle, Loader, CheckCircle, CheckSquare } from 'lucide-react';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import styles from './KanbanCardPreview.module.css';

interface KanbanCardPreviewProps {
    node: NoteNode;
    onClick?: () => void;
    onDoubleClick?: () => void;
    isDragging?: boolean;
}

// Helper to format date
const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: 'Overdue', status: 'overdue' };
    if (diffDays === 0) return { text: 'Today', status: 'today' };
    if (diffDays === 1) return { text: 'Tomorrow', status: 'soon' };
    if (diffDays <= 7) return { text: `${diffDays} days`, status: 'upcoming' };

    return {
        text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        status: 'normal'
    };
};

// Priority colors and labels
const priorityConfig: Record<string, { color: string; label: string }> = {
    urgent: { color: '#ef4444', label: 'Urgent' },
    high: { color: '#f97316', label: 'High' },
    medium: { color: '#eab308', label: 'Medium' },
    low: { color: '#22c55e', label: 'Low' },
};

// Status config
const statusConfig: Record<string, { color: string; label: string; icon: typeof Circle }> = {
    'todo': { color: '#6b7280', label: 'To Do', icon: Circle },
    'in-progress': { color: '#eab308', label: 'In Progress', icon: Loader },
    'review': { color: '#8b5cf6', label: 'Review', icon: Clock },
    'done': { color: '#22c55e', label: 'Done', icon: CheckCircle },
};

// Progress bar color based on value
const getProgressColor = (progress: number) => {
    if (progress >= 100) return '#22c55e';
    if (progress >= 75) return '#84cc16';
    if (progress >= 50) return '#eab308';
    if (progress >= 25) return '#f97316';
    return '#6b7280';
};

// Get initials from name
const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
};

export const KanbanCardPreview = memo(({ node, onClick, onDoubleClick, isDragging }: KanbanCardPreviewProps) => {
    const { data } = node;
    const updateNodeData = useStore(s => s.updateNodeData);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(data.label);

    const dueDateInfo = formatDate(data.dueDate);
    const priorityInfo = data.priority ? priorityConfig[data.priority] : null;
    const statusInfo = data.status ? statusConfig[data.status] : null;
    const progress = data.progress;
    const hasProgress = typeof progress === 'number';

    // Subtasks
    const subtasks = data.subtasks || [];
    const hasSubtasks = subtasks.length > 0;
    const completedSubtasks = subtasks.filter(t => t.completed).length;

    const handleTitleSave = useCallback(() => {
        if (titleValue.trim() !== data.label) {
            updateNodeData(node.id, { label: titleValue.trim() });
        }
        setIsEditingTitle(false);
    }, [titleValue, data.label, node.id, updateNodeData]);

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleTitleSave();
        } else if (e.key === 'Escape') {
            setTitleValue(data.label);
            setIsEditingTitle(false);
        }
    };

    return (
        <div
            className={`${styles.card} ${isDragging ? styles.dragging : ''}`}
            onClick={onClick}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick?.();
            }}
        >
            {/* Status Badge - Always show if status exists */}
            {statusInfo && (
                <div className={styles.statusRow}>
                    <span
                        className={styles.statusBadge}
                        style={{
                            backgroundColor: `${statusInfo.color}20`,
                            color: statusInfo.color
                        }}
                    >
                        <statusInfo.icon size={10} />
                        {statusInfo.label}
                    </span>

                    {/* Priority Badge */}
                    {priorityInfo && (
                        <span
                            className={styles.priorityBadge}
                            style={{
                                backgroundColor: `${priorityInfo.color}20`,
                                color: priorityInfo.color
                            }}
                        >
                            <span
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    backgroundColor: priorityInfo.color,
                                    display: 'inline-block'
                                }}
                            />
                            {priorityInfo.label}
                        </span>
                    )}
                </div>
            )}

            {/* Title */}
            <div className={styles.titleRow}>
                {isEditingTitle ? (
                    <input
                        className={styles.titleInput}
                        value={titleValue}
                        onChange={(e) => setTitleValue(e.target.value)}
                        onBlur={handleTitleSave}
                        onKeyDown={handleTitleKeyDown}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span
                        className={styles.title}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setIsEditingTitle(true);
                        }}
                    >
                        {data.label}
                    </span>
                )}
            </div>

            {/* Description preview (if any) */}
            {data.description && (
                <p className={styles.description}>
                    {data.description.length > 60
                        ? data.description.slice(0, 60) + '...'
                        : data.description}
                </p>
            )}

            {/* Progress Bar */}
            {hasProgress && (
                <div className={styles.progressContainer}>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{
                                width: `${progress}%`,
                                background: `linear-gradient(90deg, ${getProgressColor(progress)}, ${getProgressColor(progress)}cc)`
                            }}
                        />
                    </div>
                    <span className={styles.progressText} style={{ color: getProgressColor(progress) }}>
                        {progress}%
                    </span>
                </div>
            )}

            {/* Metadata Row */}
            <div className={styles.metaRow}>
                {/* Due Date Badge */}
                {dueDateInfo && (
                    <span className={`${styles.dueDateBadge} ${styles[dueDateInfo.status]}`}>
                        {dueDateInfo.status === 'overdue' ? (
                            <Clock size={10} />
                        ) : (
                            <Calendar size={10} />
                        )}
                        {dueDateInfo.text}
                    </span>
                )}

                {/* Subtask Counter */}
                {hasSubtasks && (
                    <span className={`${styles.subtaskBadge} ${completedSubtasks === subtasks.length ? styles.subtaskComplete : ''}`}>
                        <CheckSquare size={10} />
                        {completedSubtasks}/{subtasks.length}
                    </span>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Assignee Avatar */}
                {data.assignee && (
                    <span
                        className={styles.assigneeAvatar}
                        title={data.assignee}
                    >
                        {getInitials(data.assignee)}
                    </span>
                )}
            </div>
        </div>
    );
});

