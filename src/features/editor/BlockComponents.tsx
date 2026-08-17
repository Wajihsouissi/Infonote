import React, { useState, useRef, useLayoutEffect, useEffect, memo, useCallback } from 'react';
import { FileText, Trash2, Sparkles, Loader2, Clock, Plus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight, GripHorizontal, GripVertical, Eraser, ChevronRight, Copy, Check, Columns3, Maximize2 } from 'lucide-react';
import { FEATURES } from '../../config/featureFlags';
import { useStore } from '../../store/useStore';
import { renderContentWithLinks } from './pasteUtils';
import { serializeInline } from './inlineFormat';
import pageStyles from './PageBlock.module.css'; // Import page styles
import { ContainerBlock } from './ContainerBlock'; // Import ContainerBlock
import {
    MIN_COL_W, MIN_ROW_H, NEW_COL_W, REORDER_THRESHOLD_PX,
    elementScale, moveItem, columnAt, rowAt,
} from './tableLayout';
import { ColumnsBlock } from './ColumnsBlock'; // Import ColumnsBlock
export { ContainerBlock, ColumnsBlock };
import type { Block, BlockMetadata } from './types';
import styles from './BlockEditor.module.css';
import { IconPicker, getIconByName } from '../card/IconPicker';
import { generateText, FREEFORM_SYSTEM_PROMPT } from '../../services/aiService';
// Lazy load PDFViewer
const PDFViewer = React.lazy(() => import('../ui/PDFViewer').then(module => ({ default: module.PDFViewer })));
import ReactDOM from 'react-dom';
import { CustomDateTimePicker } from './CustomDateTimePicker';

interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: BlockMetadata) => void;
    /** Patch the whole block, including its `type` — the media picker resolves an
     *  unresolved `media` block into `image`/`video`/`file` through this. */
    onReplace?: (patch: Partial<Block>) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    domRef?: (el: HTMLDivElement | null) => void;
    disableMediaControls?: boolean;
    minimal?: boolean;
    onDeleteBlock?: () => void;
}

// Hook to safely handle contentEditable without cursor jumps and IME breaks
const useContentEditable = (content: string, domRef?: React.Ref<HTMLDivElement>, renderLinks = true) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);
    const isComposing = useRef(false);
    const contentRef = useRef(content);

    // Sync contentRef to avoid stale closures in callbacks
    useLayoutEffect(() => {
        contentRef.current = content;
    });

    // Sync internal ref with parent ref (useLayoutEffect ensures refs are available before focus effects)
    useLayoutEffect(() => {
        if (!domRef) return;

        if (typeof domRef === 'function') {
            domRef(internalRef.current);
        } else {
            (domRef as React.MutableRefObject<HTMLDivElement | null>).current = internalRef.current;
        }
    }, [domRef]);

    // Only update DOM if content truly differs AND we are not actively typing
    useLayoutEffect(() => {
        if (!internalRef.current) return;
        
        const currentText = internalRef.current.innerText.replace(/[\n\u200B]$/, '');
        const targetContent = content.replace(/[\n\u200B]$/, '');

        if (!isFocused.current && !isComposing.current) {
            if (renderLinks) {
                const expectedHTML = renderContentWithLinks(content);
                if (internalRef.current.innerHTML !== expectedHTML) {
                    internalRef.current.innerHTML = expectedHTML;
                }
            } else if (currentText !== targetContent) {
                internalRef.current.innerText = content;
            }
        }
    }, [content, renderLinks]);

    const handlers = {
        onFocus: () => {
            isFocused.current = true;
            // Notion-style live editing: the block stays visually formatted while
            // you edit (real <strong>/<em>/… remain in the DOM). No source-mode
            // marker swap — onInput serializes the HTML back to markdown instead.
        },
        onBlur: () => {
            isFocused.current = false; 
            if (internalRef.current) {
                const currentContent = contentRef.current;
                if (renderLinks) {
                    const expectedHTML = renderContentWithLinks(currentContent);
                    if (internalRef.current.innerHTML !== expectedHTML) {
                        internalRef.current.innerHTML = expectedHTML;
                    }
                } else {
                    const currentText = internalRef.current.innerText.replace(/[\n\u200B]$/, '');
                    const targetContent = currentContent.replace(/[\n\u200B]$/, '');
                    if (currentText !== targetContent) {
                        internalRef.current.innerText = currentContent;
                    }
                }
            }
        },
        onCompositionStart: () => { isComposing.current = true; },
        onCompositionEnd: () => { isComposing.current = false; },
        onClick: (e: React.MouseEvent) => {
            if (!renderLinks) return;
            const target = (e.target as HTMLElement).closest('a');
            if (!target) return;
            
            // Only follow links if Ctrl (Windows/Linux) or Cmd (Mac) is held
            if (!e.ctrlKey && !e.metaKey) return;

            // Inline page chip -> open the linked note instead of navigating.
            const pageId = target.getAttribute('data-page-id');
            if (pageId) {
                e.preventDefault();
                e.stopPropagation();
                const store = useStore.getState();
                (store.setFullscreenId ?? store.navigateToNode)?.(pageId);
                return;
            }
            if (target.getAttribute('href')) {
                window.open(target.getAttribute('href')!, '_blank', 'noopener,noreferrer');
                e.preventDefault();
                e.stopPropagation();
            }
        }
    };

    return { ref: internalRef, handlers, isComposing };
};

export const TextBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef, minimal }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef);
    
    if (readOnly) {
        return (
            <div
                className={`${styles.block} ${styles.text}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
            />
        );
    }

    return (
        <div
            ref={ref}
            className={`${styles.block} ${styles.text}`}
            style={{
                color: block.metadata?.textColor,
                backgroundColor: block.metadata?.backgroundColor
            }}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onInput={(e) => onChange(serializeInline(e.currentTarget))}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder={minimal ? "Text..." : "Type '/' for commands"}
            data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
            {...handlers}
        />
    );
});

export const HeadingBlock = memo(({ block, level, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps & { level: 1 | 2 | 3 }) => {
    const { ref, handlers } = useContentEditable(block.content, domRef);
    
    if (readOnly) {
        return (
            <div
                className={`${styles.block} ${styles[`heading${level}`]}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                dangerouslySetInnerHTML={{ __html: renderContentWithLinks(block.content) }}
            />
        );
    }

    return (
        <div
            ref={ref}
            className={`${styles.block} ${styles[`heading${level}`]}`}
            style={{
                color: block.metadata?.textColor,
                backgroundColor: block.metadata?.backgroundColor
            }}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onInput={(e) => onChange(serializeInline(e.currentTarget))}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder={`Heading ${level}...`}
            data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
            {...handlers}
        />
    );
});

export const TodoBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef);
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
                <input type="checkbox" disabled className={styles.todoCheckbox} checked={block.metadata?.checked || false} />
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
            <input type="checkbox" disabled={readOnly} className={styles.todoCheckbox} checked={block.metadata?.checked || false} onChange={(e) => onChange(block.content, { ...block.metadata, checked: e.target.checked })} />
            <div
                ref={ref}
                className={`${styles.block} ${styles.todo} ${block.metadata?.checked ? styles.todoChecked : ''}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(serializeInline(e.currentTarget))}
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
    const { ref, handlers } = useContentEditable(block.content, domRef);
    
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
                onInput={(e) => onChange(serializeInline(e.currentTarget))}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="Empty quote"
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});

// ... imports
import { MediaPlaceholder, type MediaSelection } from './MediaPlaceholder';
import { ResizableMediaWrapper } from './ResizableMediaWrapper';
import { MediaLightbox } from '../ui/MediaLightbox';

// ... (other blocks)

/**
 * "Open full screen" affordance on a piece of media. Media renders small — 180px tall
 * in the editor, node-width on the canvas — so there has to be a way to actually look
 * at it. It sits on the media itself and only shows on hover, so it costs no layout.
 * Double-clicking the media does the same thing.
 */
const MediaExpandButton = ({ onOpen }: { onOpen: () => void }) => (
    <button
        type="button"
        className={`${styles.mediaExpandBtn} nodrag`}
        title="Open full screen"
        aria-label="Open full screen"
        contentEditable={false}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
    >
        <Maximize2 size={14} />
    </button>
);

/**
 * The unresolved media block: one picker for every kind of media. It has no rendered
 * form of its own — the first file, link, or generated image through it rewrites the
 * block into `image`, `video` or `file`, and that resolved block renders from then on.
 *
 * The three resolved types fall back to this same picker while empty, so a legacy
 * `image` block with no content is no longer locked to images.
 */
export const MediaBlock = memo(({ block, readOnly, onReplace }: BlockProps) => {
    const handleSelect = useCallback((sel: MediaSelection) => {
        onReplace?.({ type: sel.type, content: sel.content, metadata: { ...block.metadata, ...sel.metadata } });
    }, [onReplace, block.metadata]);

    return <MediaPlaceholder onSelect={handleSelect} readOnly={readOnly} />;
});

export const ImageBlock = memo(({ block, readOnly, onChange, onReplace, disableMediaControls }: BlockProps) => {
    const [showLightbox, setShowLightbox] = React.useState(false);

    if (!block.content) {
        return <MediaBlock block={block} readOnly={readOnly} onChange={onChange} onReplace={onReplace} />;
    }

    // In the editor, images default to a fixed 180px height (resized via the bottom-right
    // handle). On the canvas (disableMediaControls) they keep filling the node width.
    const isEditorMode = !disableMediaControls;
    const imageHeight = block.metadata?.height || 180;

    const handleResize = (newValue: number) => {
        if (isEditorMode) {
            onChange(block.content, { ...block.metadata, height: newValue });
        } else {
            onChange(block.content, { ...block.metadata, width: newValue });
        }
    };

    const handleAlign = (alignment: 'left' | 'center' | 'right') => {
        onChange(block.content, { ...block.metadata, alignment });
    };

    return (
        <ResizableMediaWrapper
            width={block.metadata?.width}
            height={isEditorMode ? imageHeight : undefined}
            resizeMode={isEditorMode ? 'height' : 'width'}
            alignment={block.metadata?.alignment}
            readOnly={readOnly}
            onResize={handleResize}
            onAlign={handleAlign}
            disableMediaControls={disableMediaControls}
        >
            <div className={`${styles.mediaWrapper} mediaViewTarget`} onDoubleClick={() => setShowLightbox(true)}>
                <img
                    src={block.content}
                    alt="User content"
                    className={styles.mediaImage}
                    loading="lazy"
                    style={isEditorMode ? { height: `${imageHeight}px`, width: 'auto', maxWidth: '100%', objectFit: 'contain' } : undefined}
                />
                <MediaExpandButton onOpen={() => setShowLightbox(true)} />
            </div>
            {showLightbox && (
                <MediaLightbox
                    src={block.content}
                    type="image"
                    name={block.metadata?.name}
                    onClose={() => setShowLightbox(false)}
                />
            )}
        </ResizableMediaWrapper>
    );
});

export const ListBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef, hasChildren, ...rest }: BlockProps & { index?: number, hasChildren?: boolean }) => {
    const { ref, handlers } = useContentEditable(block.content, domRef);

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
        // Use index from props (passed via BlockItem), fallback to 1 if undefined
        const idx = rest.index || 1;
        prefix = <span className={styles.listNumber}>{idx}.</span>;
    } else if (block.type === 'toggle') {
        wrapperClass = styles.toggleWrapper;
        prefix = (
            <div
                className={`
                    ${styles.toggleTriangle}
                    ${!isCollapsed ? styles.expanded : ''}
                    ${(isCollapsed && hasChildren) ? styles.hasContent : ''}
                `}
                onClick={!readOnly ? toggleCollapse : undefined}
                role="button"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? 'Expand toggle' : 'Collapse toggle'}
            >
                <ChevronRight />
            </div>
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
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(serializeInline(e.currentTarget))}
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
    const { ref, handlers } = useContentEditable(block.content, domRef);
    const [showIconPicker, setShowIconPicker] = React.useState(false);

    // Default to 'Lightbulb' if no icon is set
    const iconName = block.metadata?.icon || 'Lightbulb';
    const Icon = getIconByName(iconName);

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
                    <Icon size={20} className={styles.calloutIconSvg} />
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
            <div
                className={`${styles.calloutIconWrapper} ${!readOnly ? styles.clickable : ''}`}
                onClick={!readOnly ? () => setShowIconPicker(true) : undefined}
            >
                <Icon size={20} className={styles.calloutIconSvg} />
            </div>

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
                onInput={(e) => onChange(serializeInline(e.currentTarget))}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="Callout text..."
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});



/** Languages offered in the code block's header. `text` = no highlighting intent. */
const CODE_LANGUAGES = [
    'text', 'bash', 'c', 'cpp', 'csharp', 'css', 'go', 'html', 'java',
    'javascript', 'json', 'jsx', 'kotlin', 'markdown', 'php', 'python',
    'ruby', 'rust', 'sql', 'swift', 'tsx', 'typescript', 'yaml',
] as const;

const CODE_INDENT = '  '; // 2 spaces — matches the block's own source style

/**
 * Copy without depending on navigator.clipboard, which is unavailable on
 * insecure origins and can be permission-denied inside embedded webviews.
 * Falling back here keeps the copy button from being silently dead.
 */
const legacyCopy = (text: string): boolean => {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
};

export const CodeBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, false);
    const [copied, setCopied] = useState(false);
    const copyTimer = useRef<number | undefined>(undefined);

    const language: string = block.metadata?.language || 'text';
    const isEmpty = !block.content || block.content.trim() === '';
    const lineCount = block.content ? block.content.split('\n').length : 0;

    useEffect(() => () => window.clearTimeout(copyTimer.current), []);

    const handleCopy = useCallback(async () => {
        if (!block.content) return;
        let ok = false;
        try {
            await navigator.clipboard.writeText(block.content);
            ok = true;
        } catch {
            ok = legacyCopy(block.content);
        }
        // Only confirm on a real copy — never flash "Copied" over a failure.
        if (!ok) return;
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    }, [block.content]);

    const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(block.content, { ...block.metadata, language: e.target.value });
    }, [block.content, block.metadata, onChange]);

    /**
     * Tab must indent, not escape the block. In a contentEditable, Tab is a
     * focus move by default, which makes writing code here effectively
     * impossible. Shift+Tab outdents one level from the line start.
     */
    const handleCodeKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            if (!e.shiftKey) {
                document.execCommand('insertText', false, CODE_INDENT);
            } else {
                // Outdent: drop up to CODE_INDENT worth of leading whitespace
                // before the caret on the current line.
                const range = sel.getRangeAt(0);
                const node = range.startContainer;
                const offset = range.startOffset;
                const text = node.textContent || '';
                const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
                const indent = text.slice(lineStart, offset);
                const strip = indent.endsWith(CODE_INDENT)
                    ? CODE_INDENT.length
                    : (indent.endsWith(' ') ? 1 : 0);
                if (strip > 0) {
                    const r = document.createRange();
                    r.setStart(node, offset - strip);
                    r.setEnd(node, offset);
                    sel.removeAllRanges();
                    sel.addRange(r);
                    document.execCommand('delete');
                }
            }
            return;
        }
        onKeyDown?.(e);
    }, [onKeyDown]);

    return (
        <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader} contentEditable={false}>
                {readOnly ? (
                    <span className={styles.codeLangStatic}>{language}</span>
                ) : (
                    <select
                        className={styles.codeLangSelect}
                        value={language}
                        onChange={handleLanguageChange}
                        aria-label="Code language"
                    >
                        {CODE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                )}

                <span className={styles.codeMeta}>
                    {lineCount > 0 && `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
                </span>

                <button
                    type="button"
                    className={styles.codeCopyBtn}
                    onClick={handleCopy}
                    disabled={isEmpty}
                    aria-label={copied ? 'Copied' : 'Copy code'}
                    data-copied={copied ? 'true' : 'false'}
                >
                    {copied ? <Check /> : <Copy />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>

            <div
                ref={ref}
                className={`${styles.block} ${styles.codeBlock}`}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(serializeInline(e.currentTarget))}
                onKeyDown={handleCodeKeyDown}
                onPaste={onPaste}
                spellCheck={false}
                data-placeholder="Write or paste code…"
                data-is-empty={isEmpty ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});

type TableAlign = 'left' | 'center' | 'right';

export const TableBlock = memo(({ block, readOnly, onChange }: BlockProps) => {
    const rows: string[][] = block.metadata?.rows || [];
    const savedWidths: number[] = block.metadata?.columnWidths || [];
    const savedHeights: number[] = block.metadata?.rowHeights || [];
    const alignments: TableAlign[] = block.metadata?.alignments || [];

    const colCount = rows[0]?.length || 0;
    const rowCount = rows.length;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const cellRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
    const pendingFocus = useRef<{ key: string; toEnd: boolean } | null>(null);

    const [activeResize, setActiveResize] = useState<{ type: 'col' | 'row'; index: number } | null>(null);
    const [menu, setMenu] = useState<{ type: 'col' | 'row'; index: number; x: number; y: number } | null>(null);
    const dragData = useRef<{ type: 'col' | 'row'; index: number; startPos: number; startSize: number } | null>(null);
    /* Grip drag = reorder. `moved` is what tells a reorder from a click: the
       grip's click handler opens the options menu, so it has to stand down
       when the same gesture was a drag. */
    const [reorder, setReorder] = useState<{ type: 'col' | 'row'; from: number; to: number } | null>(null);
    const reorderRef = useRef<{ type: 'col' | 'row'; from: number; to: number; moved: boolean } | null>(null);
    /* Click suppression is a SEPARATE flag, not a leftover `reorderRef`: the
       ref is the live drag, and deferring its teardown to clear it later let a
       stale timer wipe the next drag's state mid-gesture. This one is only
       ever written `false` by the timer, so it can't eat a live drag. */
    const suppressGripClick = useRef(false);

    const commit = (patch: Partial<BlockMetadata>) => onChange(block.content, { ...block.metadata, ...patch });

    /* Grow a textarea cell to fit its content (multi-line, wrapping cells).
       Reading scrollHeight right after writing style.height forces a synchronous
       layout of the whole document, so this must only ever be called for ONE
       cell (a keystroke). Sizing many cells goes through autosizeAll, which
       batches the writes and reads instead — see the note there. */
    const autosize = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    /* Size every cell in two layout passes instead of one per cell.
       The naive loop (write height, read scrollHeight, write height — per cell)
       makes the browser re-lay-out the entire document once per cell: a 300-cell
       table cost ~2.5s and scaled quadratically with the rest of the canvas.
       Grouping the writes and reads makes it ~30ms. */
    const autosizeAll = () => {
        const cells = [...cellRefs.current.values()];
        if (cells.length === 0) return;
        if (cells.length === 1) { autosize(cells[0]); return; }
        for (const el of cells) el.style.height = 'auto';        // all writes
        const heights = cells.map((el) => el.scrollHeight);      // all reads (one layout)
        cells.forEach((el, i) => { el.style.height = `${heights[i]}px`; }); // all writes
    };

    /* Cells register here and are sized together by the layout effect below.
       The callback per cell is cached by key: returning a fresh `(el) => …` each
       render would make React detach and re-attach every cell ref on every
       render, so the whole table would re-register (and previously re-size)
       constantly instead of just on mount. */
    const cellRefCallbacks = useRef<Map<string, (el: HTMLTextAreaElement | null) => void>>(new Map());
    const setCellRef = useCallback((r: number, c: number) => {
        const key = `${r}:${c}`;
        let cb = cellRefCallbacks.current.get(key);
        if (!cb) {
            cb = (el: HTMLTextAreaElement | null) => {
                if (el) cellRefs.current.set(key, el);
                else cellRefs.current.delete(key);
            };
            cellRefCallbacks.current.set(key, cb);
        }
        return cb;
    }, []);

    const focusCell = (r: number, c: number, toEnd = true) => {
        const key = `${r}:${c}`;
        const el = cellRefs.current.get(key);
        if (el) {
            el.focus();
            const pos = toEnd ? el.value.length : 0;
            el.setSelectionRange(pos, pos);
        } else {
            // Cell doesn't exist yet (just inserted) — focus once it mounts.
            pendingFocus.current = { key, toEnd };
        }
    };

    /* A cell can be taller than its own text — a hand-resized row, or a row
       stretched by a neighbour that wrapped. Clicking that empty space should
       start editing rather than do nothing, so the whole cell is the edit
       target, matching the highlight. Only fires for the cell itself: clicks
       on the textarea, the grips or the resize handles are theirs to keep. */
    const focusCellFromShell = (e: React.MouseEvent, r: number, c: number) => {
        if (readOnly || e.target !== e.currentTarget) return;
        e.preventDefault();
        focusCell(r, c);
    };

    // Apply a focus queued before its target cell existed.
    useLayoutEffect(() => {
        const pending = pendingFocus.current;
        if (!pending) return;
        const el = cellRefs.current.get(pending.key);
        if (el) {
            el.focus();
            const pos = pending.toEnd ? el.value.length : 0;
            el.setSelectionRange(pos, pos);
        }
        pendingFocus.current = null;
    });

    /* Size every cell on mount and after any data change (e.g. undo, paste).
       Column widths count as a data change: narrowing a column re-wraps its
       text onto more lines, and without a re-measure the row keeps its old
       height and clips. Keyed on the joined widths because `savedWidths` is a
       fresh array literal whenever the metadata has none. */
    const widthKey = savedWidths.join(',');
    useLayoutEffect(() => {
        autosizeAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, widthKey]);

    // Seed an empty table without mutating state during render.
    useLayoutEffect(() => {
        if (rowCount === 0) {
            commit({ rows: [['Column 1', 'Column 2'], ['', '']], alignments: ['left', 'left'] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowCount]);

    // Dismiss the row/column menu on outside click or Escape.
    useEffect(() => {
        if (!menu) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            // Grips toggle the menu themselves — don't pre-close on their mousedown.
            if (t.closest(`.${styles.colGrip}`) || t.closest(`.${styles.rowGrip}`)) return;
            const m = wrapperRef.current?.querySelector(`.${styles.tableMenu}`);
            if (m && !m.contains(t)) setMenu(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
        const newRows = rows.map((row, ri) =>
            ri === rowIndex ? row.map((cell, ci) => (ci === cellIndex ? value : cell)) : [...row]
        );
        commit({ rows: newRows });
    };

    const insertRow = (at: number) => {
        const newRow = Array(colCount || 2).fill('');
        const newRows = [...rows.slice(0, at), newRow, ...rows.slice(at)];
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedHeights.length > 0) patch.rowHeights = [...savedHeights.slice(0, at), 0, ...savedHeights.slice(at)];
        commit(patch);
        focusCell(at, 0, false);
    };

    const insertColumn = (at: number) => {
        const newRows = rows.map(row => [...row.slice(0, at), '', ...row.slice(at)]);
        const patch: Partial<BlockMetadata> = {
            rows: newRows,
            alignments: [...alignments.slice(0, at), 'left' as TableAlign, ...alignments.slice(at)],
        };
        // A hand-sized table stays hand-sized: a 0 here would drop the whole
        // table back to auto layout and throw away every column the user set.
        if (savedWidths.length > 0) patch.columnWidths = [...savedWidths.slice(0, at), NEW_COL_W, ...savedWidths.slice(at)];
        commit(patch);
        focusCell(0, at, false);
    };

    const deleteRow = (rowIndex: number) => {
        if (rowCount <= 2) return; // keep the header plus at least one body row
        const newRows = rows.filter((_, ri) => ri !== rowIndex);
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedHeights.length > 0) patch.rowHeights = savedHeights.filter((_, ri) => ri !== rowIndex);
        commit(patch);
        setMenu(null);
    };

    const deleteColumn = (colIndex: number) => {
        if (colCount <= 1) return;
        const newRows = rows.map(row => row.filter((_, ci) => ci !== colIndex));
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedWidths.length > 0) patch.columnWidths = savedWidths.filter((_, ci) => ci !== colIndex);
        if (alignments.length > 0) patch.alignments = alignments.filter((_, ci) => ci !== colIndex);
        commit(patch);
        setMenu(null);
    };

    const clearRow = (rowIndex: number) => {
        commit({ rows: rows.map((row, ri) => ri === rowIndex ? row.map(() => '') : row) });
        setMenu(null);
    };

    /* Reorder. Every per-column array has to travel with its column, or the
       widths and alignments end up describing the wrong data. */
    const moveColumn = (from: number, to: number) => {
        if (from === to) return;
        const patch: Partial<BlockMetadata> = { rows: rows.map(row => moveItem(row, from, to)) };
        if (alignments.length === colCount) patch.alignments = moveItem(alignments, from, to);
        if (savedWidths.length === colCount) patch.columnWidths = moveItem(savedWidths, from, to);
        commit(patch);
    };

    /* Body rows only — the header is row 0 and stays there. */
    const moveRow = (from: number, to: number) => {
        if (from === to || from < 1 || to < 1) return;
        const body = rows.slice(1);
        const patch: Partial<BlockMetadata> = { rows: [rows[0], ...moveItem(body, from - 1, to - 1)] };
        if (savedHeights.length === rowCount) {
            patch.rowHeights = [savedHeights[0], ...moveItem(savedHeights.slice(1), from - 1, to - 1)];
        }
        commit(patch);
    };

    /* The way back out of hand-sized columns: drops every stored width so the
       table returns to filling whatever holds it (and, on canvas, gives the
       node its own resize handle back). */
    const resetColumnWidths = () => {
        commit({ columnWidths: undefined });
        setMenu(null);
    };

    const clearColumn = (colIndex: number) => {
        commit({ rows: rows.map(row => row.map((cell, ci) => ci === colIndex ? '' : cell)) });
        setMenu(null);
    };

    const setColumnAlign = (colIndex: number, align: TableAlign) => {
        const next: TableAlign[] = Array.from({ length: colCount }, (_, i) => alignments[i] || 'left');
        next[colIndex] = align;
        commit({ alignments: next });
        setMenu(null);
    };

    /* Grip drag → reorder. Starts on mousedown but only commits to a reorder
       once the pointer has actually travelled, so a plain click still falls
       through to openMenu below. */
    const startReorder = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
        if (readOnly) return;
        e.stopPropagation();
        const table = tableRef.current;
        if (!table) return;

        const startX = e.clientX;
        const startY = e.clientY;
        reorderRef.current = { type, from: index, to: index, moved: false };

        const onMouseMove = (moveEvent: MouseEvent) => {
            const d = reorderRef.current;
            if (!d) return;
            if (!d.moved) {
                if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < REORDER_THRESHOLD_PX) return;
                d.moved = true;
                setMenu(null);
                document.body.style.cursor = 'grabbing';
            }
            d.to = type === 'col' ? columnAt(table, moveEvent.clientX) : rowAt(table, moveEvent.clientY);
            setReorder({ type, from: d.from, to: d.to });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKey);
            document.body.style.cursor = '';

            const d = reorderRef.current;
            reorderRef.current = null;
            setReorder(null);
            if (!d?.moved) return;

            // Swallow the click this mouseup is about to produce, so the grip's
            // options menu doesn't pop open at the end of a drag.
            suppressGripClick.current = true;
            window.setTimeout(() => { suppressGripClick.current = false; }, 0);

            if (type === 'col') moveColumn(d.from, d.to);
            else moveRow(d.from, d.to);
        };

        const onKey = (keyEvent: KeyboardEvent) => {
            if (keyEvent.key !== 'Escape') return;
            if (reorderRef.current) reorderRef.current.to = reorderRef.current.from;
            onMouseUp();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKey);
    };

    const openMenu = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (suppressGripClick.current) { suppressGripClick.current = false; return; } // end of a drag
        if (menu && menu.type === type && menu.index === index) { setMenu(null); return; }
        const wrap = wrapperRef.current;
        if (!wrap) return;
        const gripRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (type === 'col') {
            setMenu({ type, index, x: gripRect.left - wrapRect.left, y: gripRect.bottom - wrapRect.top + 4 });
        } else {
            setMenu({ type, index, x: gripRect.right - wrapRect.left + 4, y: gripRect.top - wrapRect.top });
        }
    };

    const handleCellKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
        const el = e.currentTarget;
        const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                if (c > 0) focusCell(r, c - 1);
                else if (r > 0) focusCell(r - 1, colCount - 1);
            } else if (c < colCount - 1) {
                focusCell(r, c + 1);
            } else if (r < rowCount - 1) {
                focusCell(r + 1, 0);
            } else {
                insertRow(rowCount); // last cell → grow the table and step into it
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (r < rowCount - 1) {
                focusCell(r + 1, c);
            } else {
                insertRow(rowCount);
                pendingFocus.current = { key: `${rowCount}:${c}`, toEnd: false }; // stay in the same column
            }
            return;
        }

        if (e.key === 'ArrowDown' && atEnd && r < rowCount - 1) { e.preventDefault(); focusCell(r + 1, c); return; }
        if (e.key === 'ArrowUp' && atStart && r > 0) { e.preventDefault(); focusCell(r - 1, c); return; }
        if (e.key === 'ArrowRight' && atEnd && c < colCount - 1) { e.preventDefault(); focusCell(r, c + 1, false); return; }
        if (e.key === 'ArrowLeft' && atStart && c > 0) { e.preventDefault(); focusCell(r, c - 1); return; }
        if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
    };

    /* Column resize.
       Two rules make this behave, and breaking either is what made the old
       version drift (the last column worst of all, since with `table-layout:
       auto` it absorbed every rounding error in the row):
         1. Work in LAYOUT px, never screen px. On the canvas the table is
            inside a scaled React Flow viewport, so a client-rect width at
            zoom 2 is double the width we store — feed that back in and every
            drag doubles the column. `offsetWidth` is transform-free, and the
            pointer delta is divided by the same scale.
         2. Pin EVERY column, not just the dragged one. A single sized column
            leaves the rest auto, so the browser re-solves the whole row and
            the neighbours (and the table's own width) move under the cursor. */
    const handleColResizeStart = (e: React.MouseEvent, colIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const ths = [...table.querySelectorAll('thead th')] as HTMLElement[];
        if (!ths[colIndex]) return;

        const scale = elementScale(table);
        const startWidths = ths.map(th => Math.round(th.offsetWidth));
        const startX = e.clientX;
        // The colgroup is always rendered, so there is exactly one and its
        // cols line up with the header cells.
        const cols = [...(table.querySelector('colgroup')?.children || [])] as HTMLElement[];
        let nextWidths = [...startWidths];
        let moved = false;

        // Pin the current widths before the table flips to fixed layout, so the
        // first frame of the drag looks exactly like the last frame before it.
        cols.forEach((col, i) => { if (startWidths[i] > 0) col.style.width = `${startWidths[i]}px`; });

        dragData.current = { type: 'col', index: colIndex, startPos: startX, startSize: startWidths[colIndex] };
        setActiveResize({ type: 'col', index: colIndex });

        document.body.style.cursor = 'col-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = (moveEvent.clientX - startX) / scale;
            if (delta !== 0) moved = true;
            nextWidths = [...startWidths];
            nextWidths[colIndex] = Math.round(Math.max(MIN_COL_W, startWidths[colIndex] + delta));
            cols.forEach((col, i) => {
                if (nextWidths[i] > 0) col.style.width = `${nextWidths[i]}px`;
            });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            /* A click that never moved must not commit: it would pin every
               column at its current width and silently flip the whole table
               into hand-sized mode, which is not what clicking a divider asks
               for. Same reasoning as the row handle below. */
            if (moved) {
                // Commit the numbers the drag painted, so the re-render is a no-op.
                onChange(block.content, { ...block.metadata, columnWidths: nextWidths });
            } else {
                // Undo the widths pinned on mousedown for the fixed-layout flip.
                cols.forEach((col, i) => {
                    col.style.width = savedWidths[i] > 0 ? `${savedWidths[i]}px` : '';
                });
            }

            dragData.current = null;
            setActiveResize(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /* Row resize.
       A stored row height is a FLOOR, not a fixed height: it lands on the <tr>
       as `height`, which table layout treats as a minimum, so a row you made
       tall stays tall and a row whose text outgrows the drag still expands
       instead of clipping. That is also why untouched rows keep a 0 here —
       writing every row's current height would freeze them all at whatever
       their content happened to need at the moment of one drag. */
    const handleRowResizeStart = (e: React.MouseEvent, rowIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const trs = [...table.querySelectorAll('tr')] as HTMLElement[];
        const tr = trs[rowIndex];
        if (!tr) return;

        const scale = elementScale(table);
        const startHeight = Math.round(tr.offsetHeight);
        const startY = e.clientY;
        let nextHeight = startHeight;
        let moved = false;

        dragData.current = { type: 'row', index: rowIndex, startPos: startY, startSize: startHeight };
        setActiveResize({ type: 'row', index: rowIndex });

        document.body.style.cursor = 'row-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = (moveEvent.clientY - startY) / scale;
            if (delta !== 0) moved = true;
            nextHeight = Math.round(Math.max(MIN_ROW_H, startHeight + delta));
            tr.style.height = `${nextHeight}px`;
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            /* A grab zone runs along every row divider, so a plain click lands
               on one often. It must be a no-op, not a commit that pins the row
               at whatever height its text happened to need. */
            if (moved) {
                const next = savedHeights.length === rowCount ? [...savedHeights] : Array(rowCount).fill(0);
                next[rowIndex] = nextHeight;
                onChange(block.content, { ...block.metadata, rowHeights: next });
            } else {
                tr.style.height = savedHeights[rowIndex] > 0 ? `${savedHeights[rowIndex]}px` : '';
            }

            dragData.current = null;
            setActiveResize(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /* Every column sized ⇒ the table owns its width (fixed layout, horizontal
       scroll past the container). Anything else ⇒ auto layout, and the table
       is exactly as wide as whatever holds it. */
    const hasWidths = savedWidths.length === colCount && colCount > 0 && savedWidths.every(w => w > 0);
    /* Mid-drag counts as sized even before the commit: under auto layout the
       table can't exceed its container, so dragging a column wider silently
       squeezed its neighbours and the handle drifted away from the cursor. */
    const isSized = hasWidths || activeResize?.type === 'col';
    const alignOf = (c: number): TableAlign => alignments[c] || 'left';

    /* Reorder feedback: the column/row being dragged fades, and the one it
       would land on takes an accent edge on the side it is arriving from. */
    const colClass = (ci: number): string => {
        if (!reorder || reorder.type !== 'col' || reorder.from === reorder.to) return '';
        if (ci === reorder.from) return styles.reorderSource;
        if (ci !== reorder.to) return '';
        return reorder.to > reorder.from ? styles.dropAfterCol : styles.dropBeforeCol;
    };

    const rowClass = (r: number): string => {
        if (!reorder || reorder.type !== 'row' || reorder.from === reorder.to) return '';
        if (r === reorder.from) return styles.reorderSource;
        if (r !== reorder.to) return '';
        return reorder.to > reorder.from ? styles.dropAfterRow : styles.dropBeforeRow;
    };

    if (rowCount === 0) {
        // First paint of a fresh table — the init effect will populate it.
        return <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false} />;
    }

    return (
        /* data-table-sized is read by the canvas node (BlockNode.module.css):
           once the columns own the width, the node shrink-wraps to them so no
           gap can open up between the table's edge and the node's ring. Keyed
           off the COMMITTED widths, not the in-flight drag, so a column drag
           doesn't re-lay-out the canvas on every frame. */
        <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false} data-table-sized={hasWidths ? 'true' : undefined}>
            <div className={styles.tableScroll}>
                <div className={`${styles.tableInner} ${isSized ? styles.tableInnerSized : ''}`}>
                    <div className={styles.tableMain}>
                        <table className={`${styles.table} ${isSized ? styles.tableSized : ''}`} ref={tableRef}>
                            {/* Always present: the resize drag writes straight to
                                these cols, and a second colgroup created on the
                                fly would fight the one React renders. */}
                            <colgroup>
                                {(rows[0] || []).map((_, ci) => (
                                    <col key={ci} style={{ width: savedWidths[ci] && savedWidths[ci] > 0 ? `${savedWidths[ci]}px` : undefined }} />
                                ))}
                            </colgroup>
                            <thead>
                                {/* `height` on a row, not `min-height`: table layout ignores
                                    min-height on rows entirely (which is why the stored
                                    heights used to do nothing) and treats height as a floor. */}
                                <tr
                                    className={rowClass(0)}
                                    style={{ height: savedHeights[0] && savedHeights[0] > 0 ? `${savedHeights[0]}px` : undefined }}
                                >
                                    {rows[0]?.map((cell, ci) => {
                                        const colSelected = menu?.type === 'col' && menu.index === ci;
                                        return (
                                            <th
                                                key={ci}
                                                scope="col"
                                                className={`${styles.tableHeader} ${colSelected ? styles.colSelected : ''} ${colClass(ci)}`}
                                                onMouseDown={(e) => focusCellFromShell(e, 0, ci)}
                                            >
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        className={`${styles.colGrip} ${colSelected ? styles.gripActive : ''}`}
                                                        title="Drag to reorder · click for column options"
                                                        aria-label="Column options"
                                                        onMouseDown={(e) => startReorder('col', ci, e)}
                                                        onClick={(e) => openMenu('col', ci, e)}
                                                    >
                                                        <GripHorizontal size={11} />
                                                    </button>
                                                )}
                                                <textarea
                                                    ref={setCellRef(0, ci)}
                                                    className={styles.tableCell}
                                                    style={{ textAlign: alignOf(ci) }}
                                                    rows={1}
                                                    value={cell}
                                                    readOnly={readOnly}
                                                    onChange={(e) => { handleCellChange(0, ci, e.target.value); autosize(e.currentTarget); }}
                                                    onKeyDown={(e) => handleCellKeyDown(e, 0, ci)}
                                                    placeholder="Header"
                                                />
                                                {!readOnly && (
                                                    <div
                                                        className={`${styles.colResizeHandle} ${activeResize?.type === 'col' && activeResize?.index === ci ? styles.resizeActive : ''}`}
                                                        onMouseDown={(e) => handleColResizeStart(e, ci)}
                                                    />
                                                )}
                                                {/* Every cell carries one, so the bar joins up across the
                                                    row and the divider is grabbable along its whole length. */}
                                                {!readOnly && (
                                                    <div
                                                        className={`${styles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === 0 ? styles.resizeActive : ''}`}
                                                        onMouseDown={(e) => handleRowResizeStart(e, 0)}
                                                    />
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(1).map((row, ri) => {
                                    const r = ri + 1;
                                    const rowSelected = menu?.type === 'row' && menu.index === r;
                                    return (
                                        <tr
                                            key={r}
                                            className={`${rowSelected ? styles.rowSelected : ''} ${rowClass(r)}`}
                                            style={{ height: savedHeights[r] && savedHeights[r] > 0 ? `${savedHeights[r]}px` : undefined }}
                                        >
                                            {row.map((cell, ci) => {
                                                const colSelected = menu?.type === 'col' && menu.index === ci;
                                                return (
                                                    <td
                                                        key={ci}
                                                        className={`${styles.tableData} ${colSelected ? styles.colSelected : ''} ${colClass(ci)}`}
                                                        onMouseDown={(e) => focusCellFromShell(e, r, ci)}
                                                    >
                                                        {!readOnly && ci === 0 && (
                                                            <button
                                                                type="button"
                                                                className={`${styles.rowGrip} ${rowSelected ? styles.gripActive : ''}`}
                                                                title="Drag to reorder · click for row options"
                                                                aria-label="Row options"
                                                                onMouseDown={(e) => startReorder('row', r, e)}
                                                                onClick={(e) => openMenu('row', r, e)}
                                                            >
                                                                <GripVertical size={11} />
                                                            </button>
                                                        )}
                                                        <textarea
                                                            ref={setCellRef(r, ci)}
                                                            className={styles.tableCell}
                                                            style={{ textAlign: alignOf(ci) }}
                                                            rows={1}
                                                            value={cell}
                                                            readOnly={readOnly}
                                                            onChange={(e) => { handleCellChange(r, ci, e.target.value); autosize(e.currentTarget); }}
                                                            onKeyDown={(e) => handleCellKeyDown(e, r, ci)}
                                                            placeholder=""
                                                        />
                                                        {!readOnly && (
                                                            <div
                                                                className={`${styles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === r ? styles.resizeActive : ''}`}
                                                                onMouseDown={(e) => handleRowResizeStart(e, r)}
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {!readOnly && (
                            <button type="button" className={styles.addColBtn} onClick={() => insertColumn(colCount)} title="Add column" aria-label="Add column">
                                <Plus size={14} />
                            </button>
                        )}
                    </div>
                    {!readOnly && (
                        <button type="button" className={styles.addRowBtn} onClick={() => insertRow(rowCount)} title="Add row" aria-label="Add row">
                            <Plus size={14} />
                        </button>
                    )}
                </div>
            </div>

            {!readOnly && menu && (
                <div className={styles.tableMenu} style={{ top: menu.y, left: menu.x }} role="menu">
                    {menu.type === 'col' ? (
                        <>
                            <button type="button" className={styles.menuItem} onClick={() => { insertColumn(menu.index); setMenu(null); }}><ArrowLeft size={14} /> Insert left</button>
                            <button type="button" className={styles.menuItem} onClick={() => { insertColumn(menu.index + 1); setMenu(null); }}><ArrowRight size={14} /> Insert right</button>
                            <div className={styles.menuDivider} />
                            <div className={styles.menuAlignRow}>
                                <button type="button" className={`${styles.alignBtn} ${alignOf(menu.index) === 'left' ? styles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'left')} title="Align left" aria-label="Align left"><AlignLeft size={14} /></button>
                                <button type="button" className={`${styles.alignBtn} ${alignOf(menu.index) === 'center' ? styles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'center')} title="Align center" aria-label="Align center"><AlignCenter size={14} /></button>
                                <button type="button" className={`${styles.alignBtn} ${alignOf(menu.index) === 'right' ? styles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'right')} title="Align right" aria-label="Align right"><AlignRight size={14} /></button>
                            </div>
                            <div className={styles.menuDivider} />
                            <button type="button" className={styles.menuItem} onClick={resetColumnWidths} disabled={!hasWidths}><Columns3 size={14} /> Fit columns to width</button>
                            <button type="button" className={styles.menuItem} onClick={() => clearColumn(menu.index)}><Eraser size={14} /> Clear contents</button>
                            <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => deleteColumn(menu.index)} disabled={colCount <= 1}><Trash2 size={14} /> Delete column</button>
                        </>
                    ) : (
                        <>
                            <button type="button" className={styles.menuItem} onClick={() => { insertRow(menu.index); setMenu(null); }}><ArrowUp size={14} /> Insert above</button>
                            <button type="button" className={styles.menuItem} onClick={() => { insertRow(menu.index + 1); setMenu(null); }}><ArrowDown size={14} /> Insert below</button>
                            <div className={styles.menuDivider} />
                            <button type="button" className={styles.menuItem} onClick={() => clearRow(menu.index)}><Eraser size={14} /> Clear contents</button>
                            <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => deleteRow(menu.index)} disabled={rowCount <= 2}><Trash2 size={14} /> Delete row</button>
                        </>
                    )}
                </div>
            )}
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

export const AIBlock = memo(({ block, readOnly }: BlockProps) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setError(null);
        try {
            // Inline writing: append a short instruction to the shared assistant
            // persona so length/formatting adapt to the ask (no raw code-block wrapper).
            const inlineSystem = `${FREEFORM_SYSTEM_PROMPT}\n\nYou are writing inline inside the user's note. Respond with raw markdown only — do not wrap the whole answer in a code block.`;

            const response = await generateText(prompt, inlineSystem);

            window.dispatchEvent(new CustomEvent('chnk-it-ai-generate', { detail: { id: block.id, content: response } }));
        } catch {
            setError('Failed to generate. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--block-marker-gap)', padding: 'var(--block-inset)', background: 'var(--accent-dim)', borderRadius: 'var(--block-radius-lg)', border: '1px solid rgba(var(--accent-rgb), 0.3)', margin: 'var(--block-marker-gap) 0' }} contentEditable={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--block-marker-gap)', color: 'var(--accent-ink)', fontSize: '0.8125rem', fontWeight: 600 }}>
                <Sparkles size={16} /> AI Generation
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                    autoFocus
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleGenerate();
                        }
                    }}
                    placeholder="Tell AI what to write..."
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit', fontSize: '0.875rem' }}
                    disabled={isGenerating || readOnly}
                />
                {isGenerating ? <Loader2 size={16} className="animate-spin" color="var(--accent-ink)" /> : null}
            </div>
        </div>
    );
});

export const VideoBlock = memo(({ block, readOnly, onChange, onReplace, disableMediaControls }: BlockProps) => {
    const [showLightbox, setShowLightbox] = React.useState(false);

    if (!block.content) {
        return <MediaBlock block={block} readOnly={readOnly} onChange={onChange} onReplace={onReplace} />;
    }

    const handleResize = (newWidth: number) => {
        onChange(block.content, { ...block.metadata, width: newWidth });
    };

    const handleAlign = (alignment: 'left' | 'center' | 'right') => {
        onChange(block.content, { ...block.metadata, alignment });
    };

    return (
        <ResizableMediaWrapper
            width={block.metadata?.width}
            alignment={block.metadata?.alignment}
            readOnly={readOnly}
            onResize={handleResize}
            onAlign={handleAlign}
            disableMediaControls={disableMediaControls}
        >
            <div className={`${styles.mediaWrapper} mediaViewTarget`} onDoubleClick={() => setShowLightbox(true)}>
                <video src={block.content} controls className={styles.mediaImage} />
                <MediaExpandButton onOpen={() => setShowLightbox(true)} />
            </div>
            {showLightbox && (
                <MediaLightbox
                    src={block.content}
                    type="video"
                    name={block.metadata?.name}
                    onClose={() => setShowLightbox(false)}
                />
            )}
        </ResizableMediaWrapper>
    );
});

export const FileBlock = memo(({ block, readOnly, onChange, onReplace }: BlockProps) => {
    const fileName = block.metadata?.name || block.content.split('/').pop() || "File";
    const [showPDF, setShowPDF] = React.useState(false);

    // Check if it is a PDF (data URL or file ext)
    const isPDF = block.content?.startsWith('data:application/pdf') ||
        block.metadata?.type === 'application/pdf' ||
        fileName.toLowerCase().endsWith('.pdf');

    if (!block.content) {
        return <MediaBlock block={block} readOnly={readOnly} onChange={onChange} onReplace={onReplace} />;
    }

    const handleClick = (e: React.MouseEvent) => {
        if (isPDF && FEATURES.pdfBlock) {
            e.preventDefault();
            setShowPDF(true);
        }
        // Else let default link behavior happen (download/open tab)
    };

    return (
        <>
            <div
                className={styles.fileWrapper}
                contentEditable={false}
                onClick={handleClick}
            >
                <div className={styles.fileIconWrapper}>
                    <FileText size={32} />
                </div>
                <div className={styles.fileInfo}>
                    <span className={styles.fileLink}>{fileName}</span>
                    {block.metadata?.size && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                            {(block.metadata.size / 1024).toFixed(1)} KB
                        </span>
                    )}
                </div>

            </div>

            {showPDF && FEATURES.pdfBlock && ReactDOM.createPortal(
                <React.Suspense fallback={null}>
                    <PDFViewer
                        fileUrl={block.content}
                        fileName={fileName}
                        onClose={() => setShowPDF(false)}
                    />
                </React.Suspense>,
                document.body
            )}
        </>
    );
});
