import React, { memo, useCallback } from 'react';
import { Maximize2 } from '../../../components/icons';
import { AssetImage, AssetVideo } from '../../../services/assets';
import { describeFile, FileViewer, getFileView } from '../../file';
import { formatBytes } from '../mediaTypes';
import { MediaPlaceholder, type MediaSelection } from '../MediaPlaceholder';
import { ResizableMediaWrapper } from '../ResizableMediaWrapper';
import { MediaLightbox } from '../../ui/MediaLightbox';
import styles from '../BlockEditor.module.css';
import { CardIcon } from '../../card/iconMap';
import type { BlockProps } from './types';

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
                <AssetImage
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
                <AssetVideo src={block.content} controls className={styles.mediaImage} />
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

/**
 * A file inside a card's content.
 *
 * Two states, the same two the file node has on the canvas: closed is a row —
 * kind glyph, name, weight — and open is the live document. The block's own
 * `metadata.fileView` is what switches between them, so a file opened in a
 * card stays open when that block is released onto the canvas.
 */
export const FileBlock = memo(({ block, readOnly, onChange, onReplace }: BlockProps) => {
    const fileName = block.metadata?.name || block.content.split('/').pop() || 'File';
    const view = getFileView(block);
    const kind = describeFile(block.metadata?.type, fileName);

    const setView = React.useCallback((next: 'file' | 'expandedfile') => {
        onChange(block.content, { ...block.metadata, fileView: next });
    }, [block.content, block.metadata, onChange]);

    if (!block.content) {
        return <MediaBlock block={block} readOnly={readOnly} onChange={onChange} onReplace={onReplace} />;
    }

    if (view === 'expandedfile') {
        return (
            <div className={styles.fileOpen} contentEditable={false}>
                <FileViewer
                    content={block.content}
                    name={fileName}
                    mime={block.metadata?.type}
                    size={block.metadata?.size}
                    variant="peek"
                    onClose={readOnly ? undefined : () => setView('file')}
                />
            </div>
        );
    }

    return (
        <div
            className={styles.fileWrapper}
            contentEditable={false}
            style={{ ['--file-kind' as string]: `var(${kind.hue})` }}
            onClick={(e) => {
                e.preventDefault();
                setView('expandedfile');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setView('expandedfile');
                }
            }}
            title={`Open ${fileName}`}
        >
            <div className={styles.fileIconWrapper}>
                <CardIcon icon={kind.icon} size={26} style={{ color: 'inherit' }} />
            </div>
            <div className={styles.fileInfo}>
                <span className={styles.fileLink}>{fileName}</span>
                <span className={styles.fileMeta}>
                    {kind.label}
                    {typeof block.metadata?.size === 'number' ? ` · ${formatBytes(block.metadata.size)}` : ''}
                </span>
            </div>
        </div>
    );
});
