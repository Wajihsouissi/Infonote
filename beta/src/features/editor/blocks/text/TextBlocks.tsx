import React, { memo, useCallback, useState } from 'react';
import { ChevronRight, Clock, FileText } from '../../../../shared/icons';
import { useStore } from '../../../../store/useStore';
import { renderContentWithLinks } from '../../text/pasteUtils';
import { IconPicker } from '../../../card/ui/icons/IconPicker';
import { CardIcon } from '../../../card/iconMap';
import { CustomDateTimePicker } from '../../ui/inputs/date-time/CustomDateTimePicker';
import pageStyles from '../layout/PageBlock.module.css';
import styles from '../../ui/surface/BlockEditor.module.css';
import type { BlockProps } from '../types';
import { useContentEditable } from './useContentEditable';
import { InlineTextSurface } from './InlineTextSurface';

export const TextBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef, minimal }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);
    
    if (readOnly) {
        return (
            <InlineTextSurface block={block}
                dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
            />
        );
    }

    return (
        <InlineTextSurface block={block}
            ref={ref}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder={minimal ? "Text..." : "Type '/' for commands"}
            data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
            {...handlers}
        />
    );
});

export const HeadingBlock = memo(({ block, level, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps & { level: 1 | 2 | 3 }) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);
    
    if (readOnly) {
        return (
            <InlineTextSurface block={block} variant={`heading${level}`}
                dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
            />
        );
    }

    return (
        <InlineTextSurface block={block} variant={`heading${level}`}
            ref={ref}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder={`Heading ${level}...`}
            data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
            {...handlers}
        />
    );
});

export const TodoBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    
    const formatDisplayDate = (dateString: string) => {
        if (!dateString) return '';
        const hasTime = dateString.includes('T');
        
        let date: Date;
        if (!hasTime) {
            const [year, month, day] = dateString.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(dateString);
        }
        
        let result = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (hasTime) {
            result += ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        }
        return result;
    };
    
    if (readOnly) {
        return (
            <div className={styles.todoWrapper}>
                <input type="checkbox" aria-label={block.content || 'To-do item'} disabled className={styles.todoCheckbox} checked={block.metadata?.checked || false} />
                <div
                    className={`${styles.block} ${styles.todo} ${block.metadata?.checked ? styles.todoChecked : ''}`}
                    style={{
                        color: block.metadata?.textColor,
                        backgroundColor: block.metadata?.backgroundColor
                    }}
                    dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
                />
                {block.metadata?.dueDate && (
                    <div className={styles.todoDateWrapper}>
                        <div className={styles.todoDateDisplay}>
                            {formatDisplayDate(block.metadata.dueDate)}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={styles.todoWrapper}>
            <input type="checkbox" aria-label={block.content || 'To-do item'} disabled={readOnly} className={styles.todoCheckbox} checked={block.metadata?.checked || false} onChange={(e) => onChange(block.content, { ...block.metadata, checked: e.target.checked })} />
            <div
                ref={ref}
                className={`${styles.block} ${styles.todo} ${block.metadata?.checked ? styles.todoChecked : ''}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="To-do item"
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
            <div className={styles.todoDateWrapper} contentEditable={false}>
                {block.metadata?.dueDate ? (
                    <div className={styles.todoDateDisplay} onClick={() => setIsPickerOpen(true)}>
                        {formatDisplayDate(block.metadata.dueDate)}
                    </div>
                ) : (
                    <div className={styles.todoDateIcon} title="Set due date" onClick={() => setIsPickerOpen(true)}>
                        <Clock size={14} />
                    </div>
                )}
                {isPickerOpen && (
                    <CustomDateTimePicker 
                        value={block.metadata?.dueDate}
                        taskText={block.content}
                        onChange={(date) => onChange(block.content, { ...block.metadata, dueDate: date })}
                        onClose={() => setIsPickerOpen(false)}
                    />
                )}
            </div>
        </div>
    );
});

export const QuoteBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);
    
    if (readOnly) {
        return (
            <div className={styles.quoteWrapper}>
                <div
                    className={`${styles.block} ${styles.quote}`}
                    style={{
                        color: block.metadata?.textColor,
                        backgroundColor: block.metadata?.backgroundColor
                    }}
                    dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
                />
            </div>
        );
    }

    return (
        <div className={styles.quoteWrapper}>
            <div
                ref={ref}
                className={`${styles.block} ${styles.quote}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="Empty quote"
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});

export const ListBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef, hasChildren, useStoredListNumber, ...rest }: BlockProps & { index?: number, hasChildren?: boolean, useStoredListNumber?: boolean }) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);

    let prefix = null;
    let wrapperClass = styles.listWrapper;

    const isCollapsed = block.metadata?.isCollapsed;

    const toggleCollapse = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(block.content, { ...block.metadata, isCollapsed: !isCollapsed });
    }, [block.content, block.metadata, isCollapsed, onChange]);

    if (block.type === 'bullet') {
        prefix = <span className={styles.listBullet}>•</span>;
    } else if (block.type === 'numbered') {
        // Imported / AI-generated items carry their ordinal so splitting a list
        // into separate canvas cards does not restart every card at "1.".
        // Hand-authored lists still derive their live index from the editor.
        const idx = useStoredListNumber && typeof block.metadata?.listNumber === 'number'
            ? block.metadata.listNumber
            : rest.index ?? block.metadata?.listNumber ?? 1;
        prefix = <span className={styles.listNumber}>{idx}.</span>;
    } else if (block.type === 'toggle') {
        wrapperClass = styles.toggleWrapper;
        prefix = (
            <button type="button" disabled={readOnly}
                className={`
                    ${styles.toggleTriangle}
                    ${!isCollapsed ? styles.expanded : ''}
                    ${(isCollapsed && hasChildren) ? styles.hasContent : ''}
                `}
                onClick={!readOnly ? toggleCollapse : undefined}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? 'Expand toggle' : 'Collapse toggle'}
            >
                <ChevronRight />
            </button>
        );
    }

    const toggleHeaderLevel = block.type === 'toggle' ? block.metadata?.toggleHeaderLevel : undefined;
    // When the toggle has an original heading level, preserve heading typography
    const contentClassName = toggleHeaderLevel
        ? `${styles.block} ${styles[`heading${toggleHeaderLevel}`]} ${styles.toggleHeaderContent}`
        : `${styles.block} ${styles.text}`;

    const placeholder = toggleHeaderLevel
        ? `Heading ${toggleHeaderLevel}...`
        : (block.type === 'toggle' ? "Toggle list item" : "List item");

    if (readOnly) {
        return (
            <div className={wrapperClass}>
                {prefix}
                <div
                    className={contentClassName}
                    role={toggleHeaderLevel ? 'heading' : undefined}
                    aria-level={toggleHeaderLevel}
                    style={{
                        color: block.metadata?.textColor,
                        backgroundColor: block.metadata?.backgroundColor
                    }}
                    dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
                />
            </div>
        );
    }

    return (
        <div className={wrapperClass}>
            {prefix}
            <div
                ref={ref}
                className={contentClassName}
                role={toggleHeaderLevel ? 'heading' : undefined}
                aria-level={toggleHeaderLevel}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder={placeholder}
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
            {block.type === 'toggle' && !readOnly && (
                <div className={styles.toggleHint}>
                    <kbd>↵</kbd> inside
                </div>
            )}
        </div>
    );
});

export const CalloutBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, true, onChange);
    const [showIconPicker, setShowIconPicker] = React.useState(false);

    // Default to 'Lightbulb' if no icon is set
    const iconName = block.metadata?.icon || 'Lightbulb';

    const handleIconSelect = (newIcon: string) => {
        // Create new metadata object preserving other existing metadata
        const newMetadata = { ...block.metadata, icon: newIcon };
        onChange(block.content, newMetadata);
        setShowIconPicker(false);
    };

    if (readOnly) {
        return (
            <div
                className={styles.calloutWrapper}
                // No inline fallback: with no custom colour the stylesheet's
                // --block-hover wash governs, so the callout stays theme-aware.
                style={{ backgroundColor: block.metadata?.backgroundColor || undefined }}
            >
                <div className={styles.calloutIconWrapper}>
                    <CardIcon icon={iconName} size={20} className={styles.calloutIconSvg} />
                </div>
                <div
                    className={`${styles.block} ${styles.text}`}
                    style={{ color: block.metadata?.textColor }}
                    dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
                />
            </div>
        );
    }

    return (
        <div
            className={styles.calloutWrapper}
            style={{ backgroundColor: block.metadata?.backgroundColor || undefined }}
        >
            <button type="button" aria-label="Change callout icon" aria-haspopup="dialog"
                className={`${styles.calloutIconWrapper} ${!readOnly ? `${styles.clickable} icon-hover` : ''}`}
                onClick={!readOnly ? () => setShowIconPicker(true) : undefined}
            >
                <CardIcon icon={iconName} size={20} className={styles.calloutIconSvg} />
            </button>

            {showIconPicker && (
                <div style={{ position: 'absolute', zIndex: 100 }}>
                    <IconPicker
                        currentIcon={iconName}
                        onSelect={handleIconSelect}
                        onClose={() => setShowIconPicker(false)}
                    />
                </div>
            )}

            <div
                ref={ref}
                className={`${styles.block} ${styles.text}`}
                style={{ color: block.metadata?.textColor }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="Callout text..."
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});




export const DividerBlock = memo(() => {
    return (
        <div className={styles.divider} contentEditable={false}></div>
    );
});

export const PageBlock = memo(({ block }: BlockProps) => {
    const navigateToNode = useStore(s => s.navigateToNode);
    const nodeId = block.metadata?.nodeId;
    const title = block.content || "Untitled Page";

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (nodeId) {
            navigateToNode(nodeId);
        }
    };

    return (
        <div
            className={pageStyles.pageBlock}
            contentEditable={false}
            onClick={handleClick}
        >
            <FileText size={16} className={pageStyles.pageIcon} />
            <span className={pageStyles.pageTitle}>{title}</span>
        </div>
    );
});
