import React, { useRef, useLayoutEffect, memo, useCallback } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { renderContentWithLinks } from './pasteUtils';
import pageStyles from './PageBlock.module.css'; // Import page styles
import { ContainerBlock } from './ContainerBlock'; // Import ContainerBlock
import { ColumnsBlock } from './ColumnsBlock'; // Import ColumnsBlock
export { ContainerBlock, ColumnsBlock };
import type { Block } from './types';
import styles from './BlockEditor.module.css';
import { IconPicker, getIconByName } from '../card/IconPicker';
// Lazy load PDFViewer
const PDFViewer = React.lazy(() => import('../ui/PDFViewer').then(module => ({ default: module.PDFViewer })));
import ReactDOM from 'react-dom';

interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    domRef?: React.Ref<HTMLDivElement>;
    disableMediaControls?: boolean;
    hasChildren?: boolean;
    minimal?: boolean;
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
        onFocus: () => { isFocused.current = true; },
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
            const target = e.target as HTMLElement;
            if (target.tagName === 'A' && target.getAttribute('href')) {
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
            onInput={(e) => onChange(e.currentTarget.innerText)}
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
            onInput={(e) => onChange(e.currentTarget.innerText)}
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
    
    if (readOnly) {
        return (
            <div className={styles.todoWrapper}>
                <input type="checkbox" disabled className={styles.todoCheckbox} checked={block.metadata?.checked || false} />
                <div
                    className={`${styles.block} ${styles.todo}`}
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
        <div className={styles.todoWrapper}>
            <input type="checkbox" disabled={readOnly} className={styles.todoCheckbox} checked={block.metadata?.checked || false} onChange={(e) => onChange(block.content, { ...block.metadata, checked: e.target.checked })} />
            <div
                ref={ref}
                className={`${styles.block} ${styles.todo}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(e.currentTarget.innerText)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="To-do item"
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
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
                onInput={(e) => onChange(e.currentTarget.innerText)}
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
                <img src={block.content} alt="User content" className={styles.mediaImage} loading="lazy" />
                {!readOnly && (
                    <button onClick={() => onChange('')} className={styles.removeMediaBtn}>×</button>
                )}
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
            />
        );
    }

    if (readOnly) {
        return (
            <div className={wrapperClass}>
                {prefix}
                <div
                    className={`${styles.block} ${styles.text}`}
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
                className={`${styles.block} ${styles.text}`}
                style={{
                    color: block.metadata?.textColor,
                    backgroundColor: block.metadata?.backgroundColor
                }}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(e.currentTarget.innerText)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder={block.type === 'toggle' ? "Toggle list item" : "List item"}
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
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
                style={{ backgroundColor: block.metadata?.backgroundColor || 'var(--color-bg-secondary)' }}
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
            style={{ backgroundColor: block.metadata?.backgroundColor || 'var(--color-bg-secondary)' }}
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
                onInput={(e) => onChange(e.currentTarget.innerText)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder="Callout text..."
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});



export const CodeBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, false);

    return (
        <div className={styles.codeBlockWrapper}>
            <div
                ref={ref}
                className={`${styles.block} ${styles.codeBlock}`}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={(e) => onChange(e.currentTarget.innerText)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                spellCheck={false}
                data-placeholder="Code snippet..."
                data-is-empty={!block.content || block.content.trim() === '' ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});

export const TableBlock = memo(({ block, readOnly, onChange }: BlockProps) => {
    const rows: string[][] = block.metadata?.rows || [];

    const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
        const newRows = rows.map((row, ri) =>
            ri === rowIndex
                ? row.map((cell, ci) => (ci === cellIndex ? value : cell))
                : [...row]
        );
        onChange(block.content, { ...block.metadata, rows: newRows });
    };

    const addRow = () => {
        const colCount = rows.length > 0 ? rows[0].length : 2;
        const newRow = Array(colCount).fill('');
        onChange(block.content, { ...block.metadata, rows: [...rows, newRow] });
    };

    const addColumn = () => {
        const newRows = rows.map(row => [...row, '']);
        onChange(block.content, { ...block.metadata, rows: newRows });
    };

    const deleteRow = (rowIndex: number) => {
        if (rows.length <= 1) return;
        const newRows = rows.filter((_, ri) => ri !== rowIndex);
        onChange(block.content, { ...block.metadata, rows: newRows });
    };

    const deleteColumn = (colIndex: number) => {
        if (rows[0].length <= 1) return;
        const newRows = rows.map(row => row.filter((_, ci) => ci !== colIndex));
        onChange(block.content, { ...block.metadata, rows: newRows });
    };

    if (rows.length === 0) {
        // Empty table placeholder: create a 2x2 table
        const defaultRows = [['Header 1', 'Header 2'], ['', '']];
        onChange(block.content, { ...block.metadata, rows: defaultRows });
        return null;
    }

    return (
        <div className={styles.tableWrapper} contentEditable={false}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {rows[0]?.map((cell, ci) => (
                            <th key={ci} className={styles.tableHeader}>
                                <div className={styles.tableHeaderCellWrapper}>
                                    <input
                                        className={styles.tableCell}
                                        value={cell}
                                        readOnly={readOnly}
                                        onChange={(e) => handleCellChange(0, ci, e.target.value)}
                                        placeholder="Header"
                                    />
                                    {!readOnly && rows[0].length > 1 && (
                                        <button
                                            className={styles.deleteColumnBtn}
                                            onClick={() => deleteColumn(ci)}
                                            title="Delete Column"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </th>
                        ))}
                        {!readOnly && <th className={styles.tableHeaderActionCell} />}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(1).map((row, ri) => (
                        <tr key={ri + 1}>
                            {row.map((cell, ci) => (
                                <td key={ci} className={styles.tableData}>
                                    <input
                                        className={styles.tableCell}
                                        value={cell}
                                        readOnly={readOnly}
                                        onChange={(e) => handleCellChange(ri + 1, ci, e.target.value)}
                                        placeholder=""
                                    />
                                </td>
                            ))}
                            {!readOnly && (
                                <td className={styles.tableActionCell}>
                                    {rows.length > 1 && (
                                        <button
                                            className={styles.deleteRowBtn}
                                            onClick={() => deleteRow(ri + 1)}
                                            title="Delete Row"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
            {!readOnly && (
                <div className={styles.tableControls}>
                    <button className={styles.tableControlBtn} onClick={addRow} title="Add Row">+ Row</button>
                    <button className={styles.tableControlBtn} onClick={addColumn} title="Add Column">+ Column</button>
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
                {!readOnly && (
                    <button onClick={() => onChange('')} className={styles.removeMediaBtn}>×</button>
                )}
            </div>
        </ResizableMediaWrapper>
    );
});

export const FileBlock = memo(({ block, readOnly, onChange }: BlockProps) => {
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
        if (isPDF) {
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
                    <FileText size={32} color="#60A5FA" />
                </div>
                <div className={styles.fileInfo}>
                    <span className={styles.fileLink}>{fileName}</span>
                    {block.metadata?.size && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                            {(block.metadata.size / 1024).toFixed(1)} KB
                        </span>
                    )}
                </div>

                {!readOnly && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('');
                        }}
                        className={styles.removeMediaBtn}
                    >×</button>
                )}
            </div>

            {showPDF && ReactDOM.createPortal(
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
