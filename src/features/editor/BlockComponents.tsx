import React, { useState, useRef, useLayoutEffect, memo, useCallback } from 'react';
import { FileText, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { renderContentWithLinks } from './pasteUtils';
import pageStyles from './PageBlock.module.css'; // Import page styles
import { ContainerBlock } from './ContainerBlock'; // Import ContainerBlock
import { ColumnsBlock } from './ColumnsBlock'; // Import ColumnsBlock
export { ContainerBlock, ColumnsBlock };
import type { Block } from './types';
import styles from './BlockEditor.module.css';
import { IconPicker, getIconByName } from '../card/IconPicker';
import { generateText } from '../../services/aiService';
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
                onInput={(e) => onChange(e.currentTarget.innerText)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                data-placeholder={placeholder}
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
    const savedWidths: number[] = block.metadata?.columnWidths || [];
    const savedHeights: number[] = block.metadata?.rowHeights || [];

    const tableRef = useRef<HTMLTableElement>(null);
    const [activeResize, setActiveResize] = useState<{ type: 'col' | 'row'; index: number } | null>(null);
    const dragData = useRef<{ type: 'col' | 'row'; index: number; startPos: number; startSize: number } | null>(null);

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
        const newHeights = savedHeights.length > 0 ? [...savedHeights, 0] : undefined;
        onChange(block.content, { ...block.metadata, rows: [...rows, newRow], rowHeights: newHeights });
    };

    const addColumn = () => {
        const newRows = rows.map(row => [...row, '']);
        const newWidths = savedWidths.length > 0 ? [...savedWidths, 0] : undefined;
        onChange(block.content, { ...block.metadata, rows: newRows, columnWidths: newWidths });
    };

    const deleteRow = (rowIndex: number) => {
        if (rows.length <= 1) return;
        const newRows = rows.filter((_, ri) => ri !== rowIndex);
        const newHeights = savedHeights.length > 0 ? savedHeights.filter((_, ri) => ri !== rowIndex) : undefined;
        onChange(block.content, { ...block.metadata, rows: newRows, rowHeights: newHeights });
    };

    const deleteColumn = (colIndex: number) => {
        if (rows[0].length <= 1) return;
        const newRows = rows.map(row => row.filter((_, ci) => ci !== colIndex));
        const newWidths = savedWidths.length > 0 ? savedWidths.filter((_, ci) => ci !== colIndex) : undefined;
        onChange(block.content, { ...block.metadata, rows: newRows, columnWidths: newWidths });
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
                let colgroup = table.querySelector('colgroup');
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
                        newWidths.push(w > 0 ? w : Math.round((col as any).getBoundingClientRect?.()?.width || 120));
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

    const handleRowResizeStart = (e: React.MouseEvent, rowIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const allRows = table.querySelectorAll('thead tr, tbody tr');
        const tr = allRows[rowIndex] as HTMLElement;
        if (!tr) return;

        const startHeight = tr.getBoundingClientRect().height;
        const startY = e.clientY;

        dragData.current = { type: 'row', index: rowIndex, startPos: startY, startSize: startHeight };
        setActiveResize({ type: 'row', index: rowIndex });

        document.body.style.cursor = 'row-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const data = dragData.current;
            if (!data || data.type !== 'row') return;

            const diff = moveEvent.clientY - data.startPos;
            const newHeight = Math.max(30, data.startSize + diff);

            const rows = table.querySelectorAll('thead tr, tbody tr');
            const tr = rows[data.index] as HTMLElement;
            if (tr) tr.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            const data = dragData.current;
            if (data && data.type === 'row' && table) {
                const allRows = table.querySelectorAll('thead tr, tbody tr');
                const newHeights: number[] = [];
                allRows.forEach(row => {
                    const h = (row as HTMLElement).style.height;
                    const parsed = parseInt(h);
                    newHeights.push(!isNaN(parsed) && parsed > 0 ? parsed : Math.round((row as HTMLElement).getBoundingClientRect().height));
                });
                if (newHeights.length > 0) {
                    onChange(block.content, { ...block.metadata, rowHeights: newHeights });
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

    if (rows.length === 0) {
        const defaultRows = [['Header 1', 'Header 2'], ['', '']];
        onChange(block.content, { ...block.metadata, rows: defaultRows });
        return null;
    }

    return (
        <div className={styles.tableWrapper} contentEditable={false}>
            <table className={styles.table} ref={tableRef}>
                {(hasWidths || hasHeights) && (
                    <colgroup>
                        {(rows[0] || []).map((_, ci) => (
                            <col key={ci} style={{ width: savedWidths[ci] && savedWidths[ci] > 0 ? `${savedWidths[ci]}px` : undefined }} />
                        ))}
                    </colgroup>
                )}
                <thead>
                    <tr style={{ height: savedHeights[0] && savedHeights[0] > 0 ? `${savedHeights[0]}px` : undefined }}>
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
                                {!readOnly && (
                                    <div
                                        className={`${styles.colResizeHandle} ${activeResize?.type === 'col' && activeResize?.index === ci ? styles.resizeActive : ''}`}
                                        onMouseDown={(e) => handleColResizeStart(e, ci)}
                                    />
                                )}
                            </th>
                        ))}
                        {!readOnly && (
                            <th className={styles.tableHeaderActionCell}>
                                <div
                                    className={`${styles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === 0 ? styles.resizeActive : ''}`}
                                    onMouseDown={(e) => handleRowResizeStart(e, 0)}
                                />
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(1).map((row, ri) => (
                        <tr key={ri + 1} style={{ height: savedHeights[ri + 1] && savedHeights[ri + 1] > 0 ? `${savedHeights[ri + 1]}px` : undefined }}>
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
                                    <div
                                        className={`${styles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === ri + 1 ? styles.resizeActive : ''}`}
                                        onMouseDown={(e) => handleRowResizeStart(e, ri + 1)}
                                    />
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

export const AIBlock = memo(({ block, readOnly }: BlockProps) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setError(null);
        try {
            const systemPrompt = `You are a writing assistant in an infinite canvas note-taking app. The user wants you to write something inline in their note.
Respond with raw markdown only. Do not wrap it in a code block. Keep it concise, high-quality, and directly address the prompt: ${prompt}`;
            
            const response = await generateText(systemPrompt);
            
            window.dispatchEvent(new CustomEvent('chnk-it-ai-generate', { detail: { id: block.id, content: response } }));
        } catch (e) {
            setError('Failed to generate. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.3)', margin: '8px 0' }} contentEditable={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontSize: '13px', fontWeight: 600 }}>
                <Sparkles size={16} /> AI Generation
            </div>
            {error && <div style={{ color: '#ef4444', fontSize: '12px' }}>{error}</div>}
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
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--color-text-main)', outline: 'none', fontSize: '14px' }}
                    disabled={isGenerating || readOnly}
                />
                {isGenerating ? <Loader2 size={16} className="animate-spin" color="#c084fc" /> : null}
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
