import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../../store/useStore';
import pageStyles from './PageBlock.module.css'; // Import page styles
import { ContainerBlock } from './ContainerBlock'; // Import ContainerBlock
import { ColumnsBlock } from './ColumnsBlock'; // Import ColumnsBlock
export { ContainerBlock, ColumnsBlock };
import type { Block } from './types';
import styles from './BlockEditor.module.css';
import { IconPicker, getIconByName } from '../card/IconPicker';
import { PDFViewer } from '../ui/PDFViewer';
import ReactDOM from 'react-dom';

interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    domRef?: React.Ref<HTMLDivElement>;
}

// Hook to safely handle contentEditable without cursor jumps
const useContentEditable = (content: string, domRef?: React.Ref<HTMLDivElement>) => {
    const internalRef = useRef<HTMLDivElement>(null);

    // Sync internal ref with parent ref
    useEffect(() => {
        if (!domRef) return;

        if (typeof domRef === 'function') {
            domRef(internalRef.current);
        } else {
            (domRef as React.MutableRefObject<HTMLDivElement | null>).current = internalRef.current;
        }
    }, [domRef]);

    // Only update DOM if content truly differs, preserving cursor
    useLayoutEffect(() => {
        if (internalRef.current && internalRef.current.innerText !== content) {
            internalRef.current.innerText = content;
        }
    }, [content]);

    return internalRef;
};

export const TextBlock = ({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const ref = useContentEditable(block.content, domRef);
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
            data-placeholder="Type '/' for commands"
        />
    );
};

export const HeadingBlock = ({ block, level, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps & { level: 1 | 2 | 3 }) => {
    const ref = useContentEditable(block.content, domRef);
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
        />
    );
};

export const TodoBlock = ({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const ref = useContentEditable(block.content, domRef);
    return (
        <div className={styles.todoWrapper}>
            <input type="checkbox" disabled={readOnly} className={styles.todoCheckbox} />
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
            />
        </div>
    );
};

export const QuoteBlock = ({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const ref = useContentEditable(block.content, domRef);
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
            />
        </div>
    );
};

// ... imports
import { MediaPlaceholder } from './MediaPlaceholder';
import { ResizableMediaWrapper } from './ResizableMediaWrapper';

// ... (other blocks)

export const ImageBlock = ({ block, readOnly, onChange }: BlockProps) => {
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
        >
            <div className={styles.mediaWrapper}>
                <img src={block.content} alt="User content" className={styles.mediaImage} />
                {!readOnly && (
                    <button onClick={() => onChange('')} className={styles.removeMediaBtn}>×</button>
                )}
            </div>
        </ResizableMediaWrapper>
    );
}

export const ListBlock = ({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const ref = useContentEditable(block.content, domRef);

    let prefix = null;
    let wrapperClass = styles.listWrapper;

    if (block.type === 'bullet') {
        prefix = <span className={styles.listBullet}>•</span>;
    } else if (block.type === 'numbered') {
        prefix = <span className={styles.listNumber}>1.</span>;
    } else if (block.type === 'toggle') {
        wrapperClass = styles.toggleWrapper;
        prefix = <div className={styles.toggleTriangle} />;
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
            />
        </div>
    );
};

export const CalloutBlock = ({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const ref = useContentEditable(block.content, domRef);
    const [showIconPicker, setShowIconPicker] = React.useState(false);

    // Default to 'Lightbulb' if no icon is set
    const iconName = block.metadata?.icon || 'Lightbulb';
    const Icon = getIconByName(iconName);

    const handleIconSelect = (newIcon: string) => {
        // Create new metadata object preserving other existing metadata
        const newMetadata = { ...block.metadata, icon: newIcon };
        // We need to trigger an update. Since onChange typically takes (content, metadata),
        // we'll pass the current content and the new metadata.
        // NOTE: The current onChange signature in BlockProps is (content: string, metadata?: any) => void
        onChange(block.content, newMetadata);
        setShowIconPicker(false);
    };

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
            />
        </div>
    );
};

export const DividerBlock = () => {
    return (
        <div className={styles.divider} contentEditable={false}></div>
    );
};

export const PageBlock = ({ block }: BlockProps) => {
    const { navigateToNode } = useStore();
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
};

export const VideoBlock = ({ block, readOnly, onChange }: BlockProps) => {
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
        >
            <div className={styles.mediaWrapper}>
                <video src={block.content} controls className={styles.mediaImage} />
                {!readOnly && (
                    <button onClick={() => onChange('')} className={styles.removeMediaBtn}>×</button>
                )}
            </div>
        </ResizableMediaWrapper>
    );
}

export const FileBlock = ({ block, readOnly, onChange }: BlockProps) => {
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
                <PDFViewer
                    fileUrl={block.content}
                    fileName={fileName}
                    onClose={() => setShowPDF(false)}
                />,
                document.body
            )}
        </>
    );
}
