import type { LucideIcon } from 'lucide-react';
import styles from './NoteCard.module.css';

interface NoteMetadataSectionProps {
    IconComponent: LucideIcon;
    label: string;
    description: string;
    editedLabel: string;
    editedDescription: string;
    isEditing: boolean;
    onIconClick: (e: React.MouseEvent) => void;
    onLabelChange: (value: string) => void;
    onDescriptionChange: (value: string, element: HTMLTextAreaElement) => void;
    onFocus: () => void;
    onBlur: () => void;
}

/**
 * Metadata section with icon, title, and description.
 * Handles inline editing of note metadata.
 */
export function NoteMetadataSection({
    IconComponent,
    label,
    description,
    editedLabel,
    editedDescription,
    isEditing,
    onIconClick,
    onLabelChange,
    onDescriptionChange,
    onFocus,
    onBlur,
}: NoteMetadataSectionProps) {
    // Textarea auto-resize ref callback
    const textareaRef = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            element.style.height = element.scrollHeight + 'px';
        }
    };

    return (
        <div className={styles.expandedMetadata}>
            {/* Header with Icon and Title */}
            <div className={styles.expandedHeader}>
                <button
                    className={styles.expandedIconButton}
                    onClick={onIconClick}
                    title="Change icon"
                >
                    <IconComponent size={32} />
                </button>
                <div className={styles.titleSection}>
                    <input
                        className={`${styles.expandedTitleInput} nodrag`}
                        value={isEditing ? editedLabel : label}
                        onChange={(e) => onLabelChange(e.target.value)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        placeholder="Untitled Page"
                    />
                </div>
            </div>

            <div className={styles.metaContainer}>
                {/* Description */}
                <div className={styles.expandedDescContainer}>
                    <textarea
                        className={`${styles.expandedDescEdit} nodrag`}
                        ref={textareaRef}
                        value={isEditing ? editedDescription : (description || '')}
                        onChange={(e) => {
                            onDescriptionChange(e.target.value, e.target);
                        }}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        rows={1}
                        placeholder="Add a description..."
                    />
                </div>
            </div>
        </div>
    );
}
