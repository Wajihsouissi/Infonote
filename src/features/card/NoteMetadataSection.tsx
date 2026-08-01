import { CardIcon, defaultIconName } from './iconMap';
import styles from './NoteCard.module.css';

interface NoteMetadataSectionProps {
    icon: string;
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
    showIcon?: boolean;
    onToggleShowIcon?: () => void;
}

/**
 * Metadata section with icon, title, and description.
 * Handles inline editing of note metadata.
 */
export function NoteMetadataSection({
    icon,
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
    showIcon = false,
    onToggleShowIcon,
}: NoteMetadataSectionProps) {
    // Textarea auto-resize ref callback
    const textareaRef = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            element.style.height = element.scrollHeight + 'px';
        }
    };

    return (
        <div className={`${styles.expandedMetadata} custom-drag-handle`}>
            {/* Header with Icon and Title */}
            <div className={styles.expandedHeader}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <button
                        className={styles.expandedIconButton}
                        onClick={onIconClick}
                        title="Change icon"
                    >
                        <CardIcon icon={icon || defaultIconName} size={32} />
                    </button>
                    {onToggleShowIcon && (
                        <button 
                            className={styles.toggleIconBtn}
                            onClick={(e) => { e.stopPropagation(); onToggleShowIcon(); }}
                            title={showIcon ? "Hide Icon in Card Header" : "Show Icon in Card Header"}
                            style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: showIcon ? 'var(--active-wash)' : 'transparent',
                                border: '1px solid var(--line)',
                                color: showIcon ? 'var(--color-text-main)' : 'var(--color-text-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            {showIcon ? 'Shown' : 'Hidden'}
                        </button>
                    )}
                </div>
                <div className={styles.titleSection}>
                    <input
                        className={`${styles.expandedTitleInput} nodrag`}
                        value={isEditing ? editedLabel : label}
                        onChange={(e) => onLabelChange(e.target.value)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                        }}
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
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                        }}
                        rows={1}
                        placeholder="Add a description..."
                    />
                </div>
            </div>
        </div>
    );
}
