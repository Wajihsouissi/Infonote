import React, { useState, useRef, useLayoutEffect, useEffect, memo, useCallback } from 'react';
import { FileText, Trash2, Sparkles, Loader2, Clock, Plus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight, GripHorizontal, GripVertical, Eraser, ChevronRight, Copy, Check } from 'lucide-react';
import { FEATURES } from '../../config/featureFlags';
import { useStore } from '../../store/useStore';
import { renderContentWithLinks } from './pasteUtils';
import { serializeInline } from './inlineFormat';
import pageStyles from './PageBlock.module.css'; // Import page styles
import { ContainerBlock } from './ContainerBlock'; // Import ContainerBlock
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
import { MediaPlaceholder } from './MediaPlaceholder';
import { ResizableMediaWrapper } from './ResizableMediaWrapper';

// ... (other blocks)

export const ImageBlock = memo(({ block, readOnly, onChange, disableMediaControls }: BlockProps) => {
    if (!block.content) {
        return (
            <MediaPlaceholder type="image" onUpload={onChange} />
        )
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
            <div className={styles.mediaWrapper}>
                <img
                    src={block.content}
                    alt="User content"
                    className={styles.mediaImage}
                    loading="lazy"
                    style={isEditorMode ? { height: `${imageHeight}px`, width: 'auto', maxWidth: '100%', objectFit: 'contain' } : undefined}
                />
            </div>
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
                    <Icon size={24} className={styles.calloutIconSvg} />
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
                <Icon size={24} className={styles.calloutIconSvg} />
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

export const TableBlock = memo(({ block, readOnly, onChange, disableMediaControls }: BlockProps) => {
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

    const commit = (patch: Partial<BlockMetadata>) => onChange(block.content, { ...block.metadata, ...patch });

    // Grow a textarea cell to fit its content (multi-line, wrapping cells).
    const autosize = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    const setCellRef = (r: number, c: number) => (el: HTMLTextAreaElement | null) => {
        const key = `${r}:${c}`;
        if (el) { cellRefs.current.set(key, el); autosize(el); }
        else cellRefs.current.delete(key);
    };

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

    // Keep every cell sized to its content after any data change (e.g. undo, paste).
    useLayoutEffect(() => {
        cellRefs.current.forEach(el => autosize(el));
    }, [rows]);

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
        if (savedWidths.length > 0) patch.columnWidths = [...savedWidths.slice(0, at), 0, ...savedWidths.slice(at)];
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

    const openMenu = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
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

    const handleColResizeStart = (e: React.MouseEvent, colIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const ths = table.querySelectorAll('thead th');
        const th = ths[colIndex] as HTMLElement;
        if (!th) return;

        const startWidth = th.getBoundingClientRect().width;
        const startX = e.clientX;

        dragData.current = { type: 'col', index: colIndex, startPos: startX, startSize: startWidth };
        setActiveResize({ type: 'col', index: colIndex });

        document.body.style.cursor = 'col-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const data = dragData.current;
            if (!data || data.type !== 'col') return;

            const diff = moveEvent.clientX - data.startPos;
            const newWidth = Math.max(40, data.startSize + diff);

            let colgroup = table.querySelector('colgroup');
            if (!colgroup) {
                colgroup = document.createElement('colgroup');
                const colCount = rows[0]?.length || 2;
                for (let i = 0; i < colCount; i++) {
                    const col = document.createElement('col');
                    colgroup.appendChild(col);
                }
                table.insertBefore(colgroup, table.firstChild);
            }
            const col = colgroup.children[data.index] as HTMLElement;
            if (col) col.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            const data = dragData.current;
            if (data && data.type === 'col' && table) {
                const colgroup = table.querySelector('colgroup');
                if (!colgroup) {
                    const ths = table.querySelectorAll('thead th');
                    const newWidths: number[] = [];
                    ths.forEach(th => {
                        if ((th as HTMLElement).style.display !== 'none') {
                            newWidths.push(Math.round((th as HTMLElement).getBoundingClientRect().width));
                        }
                    });
                    if (newWidths.length > 0) {
                        onChange(block.content, { ...block.metadata, columnWidths: newWidths });
                    }
                } else {
                    const totalCells = rows[0]?.length || 0;
                    const newWidths: number[] = [];
                    for (let i = 0; i < totalCells && i < colgroup.children.length; i++) {
                        const col = colgroup.children[i] as HTMLElement;
                        const w = col.style.width ? parseInt(col.style.width) : 0;
                        newWidths.push(w > 0 ? w : Math.round(col.getBoundingClientRect?.()?.width || 120));
                    }
                    if (newWidths.length > 0) {
                        onChange(block.content, { ...block.metadata, columnWidths: newWidths });
                    }
                }
            }

            dragData.current = null;
            setActiveResize(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const hasWidths = savedWidths.length > 0 && savedWidths.some(w => w > 0);
    const hasHeights = savedHeights.length > 0 && savedHeights.some(h => h > 0);
    const alignOf = (c: number): TableAlign => alignments[c] || 'left';

    const handleResize = (newValue: number) => commit({ width: newValue });
    const handleAlign = (alignment: 'left' | 'center' | 'right') => commit({ alignment });

    if (rowCount === 0) {
        // First paint of a fresh table — the init effect will populate it.
        return <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false} />;
    }

    return (
        <ResizableMediaWrapper
            width={block.metadata?.width}
            resizeMode="width"
            alignment={block.metadata?.alignment}
            readOnly={readOnly}
            onResize={handleResize}
            onAlign={handleAlign}
            disableMediaControls={disableMediaControls}
        >
            <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false}>
            <div className={styles.tableScroll}>
                <div className={styles.tableInner}>
                    <div className={styles.tableMain}>
                        <table className={styles.table} ref={tableRef}>
                            {(hasWidths || hasHeights) && (
                                <colgroup>
                                    {(rows[0] || []).map((_, ci) => (
                                        <col key={ci} style={{ width: savedWidths[ci] && savedWidths[ci] > 0 ? `${savedWidths[ci]}px` : undefined }} />
                                    ))}
                                </colgroup>
                            )}
                            <thead>
                                <tr style={{ minHeight: savedHeights[0] && savedHeights[0] > 0 ? `${savedHeights[0]}px` : undefined }}>
                                    {rows[0]?.map((cell, ci) => {
                                        const colSelected = menu?.type === 'col' && menu.index === ci;
                                        return (
                                            <th key={ci} scope="col" className={`${styles.tableHeader} ${colSelected ? styles.colSelected : ''}`}>
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        className={`${styles.colGrip} ${colSelected ? styles.gripActive : ''}`}
                                                        title="Column options"
                                                        aria-label="Column options"
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
                                            className={rowSelected ? styles.rowSelected : ''}
                                            style={{ minHeight: savedHeights[r] && savedHeights[r] > 0 ? `${savedHeights[r]}px` : undefined }}
                                        >
                                            {row.map((cell, ci) => {
                                                const colSelected = menu?.type === 'col' && menu.index === ci;
                                                return (
                                                    <td key={ci} className={`${styles.tableData} ${colSelected ? styles.colSelected : ''}`}>
                                                        {!readOnly && ci === 0 && (
                                                            <button
                                                                type="button"
                                                                className={`${styles.rowGrip} ${rowSelected ? styles.gripActive : ''}`}
                                                                title="Row options"
                                                                aria-label="Row options"
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
        </ResizableMediaWrapper>
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

export const VideoBlock = memo(({ block, readOnly, onChange, disableMediaControls }: BlockProps) => {
    if (!block.content) {
        return (
            <MediaPlaceholder type="video" onUpload={onChange} />
        )
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
            <div className={styles.mediaWrapper}>
                <video src={block.content} controls className={styles.mediaImage} />
            </div>
        </ResizableMediaWrapper>
    );
});

export const FileBlock = memo(({ block, onChange }: BlockProps) => {
    const fileName = block.metadata?.name || block.content.split('/').pop() || "File";
    const [showPDF, setShowPDF] = React.useState(false);

    // Check if it is a PDF (data URL or file ext)
    const isPDF = block.content?.startsWith('data:application/pdf') ||
        block.metadata?.type === 'application/pdf' ||
        fileName.toLowerCase().endsWith('.pdf');

    if (!block.content) {
        return (
            <MediaPlaceholder type="file" onUpload={onChange} />
        )
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
