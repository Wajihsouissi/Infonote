import { Eye, EyeOff } from '../../components/icons';
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
    /**
     * The compact header: a 40px icon sitting ON the title line, and a
     * description clamped to one line until it is focused.
     *
     * The roomy version spends 77px on a 65px icon tile, a settings pill under
     * it, a 24px title beside it and a padded description block below — which
     * left the note body at 14% of the card. Kept side by side rather than
     * replaced so FEATURES.compactCardMeta can switch back to it.
     */
    compact?: boolean;
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
    compact = false,
}: NoteMetadataSectionProps) {
    // Textarea auto-resize ref callback
    const textareaRef = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            /* Compact and unfocused, the blurb is a single line: a description
               is context, and three lines of it above the note pushes the note
               itself off the card. Focusing grows it to the full text. */
            element.style.height = compact && !isEditing
                ? '20px'
                : element.scrollHeight + 'px';
        }
    };

    if (compact) {
        return (
            <div className={`${styles.expandedMetadata} ${styles.compactMetadata} custom-drag-handle`}>
                <div className={styles.compactHeader}>
                    <button
                        className={`${styles.compactIconButton} icon-hover`}
                        onClick={onIconClick}
                        title="Change icon"
                    >
                        <CardIcon icon={icon || defaultIconName} size={21} />
                    </button>
                    <input
                        className={`${styles.compactTitleInput} nodrag`}
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
                    {/* Showing the icon on the collapsed card is a setting, not
                        metadata — it keeps its control but stops holding a
                        permanent 20px slot under the icon. */}
                    {onToggleShowIcon && (
                        <button
                            className={`${styles.compactIconToggle} nodrag`}
                            onClick={(e) => { e.stopPropagation(); onToggleShowIcon(); }}
                            title={showIcon ? 'Hide the icon on the collapsed card' : 'Show the icon on the collapsed card'}
                            aria-pressed={showIcon}
                        >
                            {showIcon ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                    )}
                </div>

                <textarea
                    className={`${styles.compactDescEdit} nodrag`}
                    ref={textareaRef}
                    value={isEditing ? editedDescription : (description || '')}
                    onChange={(e) => onDescriptionChange(e.target.value, e.target)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDownCapture={(e) => e.stopPropagation()}
                    rows={1}
                    placeholder="Add a description…"
                />
            </div>
        );
    }

    return (
        <div className={`${styles.expandedMetadata} custom-drag-handle`}>
            {/* Header with Icon and Title */}
            <div className={styles.expandedHeader}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <button
                        className={`${styles.expandedIconButton} icon-hover`}
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
