import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud, Sparkles, Paperclip } from '../../components/icons';
import styles from './MediaPlaceholder.module.css';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import type { Block, BlockMetadata } from './types';
import { createGalleryBlock } from './galleryTypes';
import { ingestFiles, MAX_ASSET_BYTES } from '../../services/assets';
import {
    formatBytes,
    resolveMediaTypeFromUrl,
    type ResolvedMediaType,
} from './mediaTypes';

export interface MediaSelection {
    /** `gallery` when several files came in at once — the same board two
     *  pieces of media make when one is dropped on the other. */
    type: ResolvedMediaType | 'gallery';
    content: string;
    metadata?: BlockMetadata;
}

interface MediaPlaceholderProps {
    /** Receives the resolved kind alongside the content — the caller rewrites the
     *  block's type with it, which is how one picker feeds three block types. */
    onSelect: (selection: MediaSelection) => void;
    readOnly?: boolean;
}

/**
 * The single entry point for adding media. It accepts anything — image, video, PDF,
 * any file — by file picker, drag & drop, paste, URL embed, or AI generation, and
 * reports back which kind it turned out to be.
 *
 * Drop and paste work on the inline trigger as well as inside the modal, so the
 * common case (drag a file straight onto the block) never opens the modal at all.
 */
type MediaTab = 'upload' | 'embed' | 'generate';

const MEDIA_TABS: TabItem<MediaTab>[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'embed', label: 'Embed Link' },
    { id: 'generate', label: 'Generate AI', icon: <Sparkles size={14} /> },
];

export const MediaPlaceholder = ({ onSelect, readOnly }: MediaPlaceholderProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<MediaTab>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (input: FileList | File[]) => {
        if (!Array.from(input).length) return;
        setError(null);

        const { files, errors } = await ingestFiles(input);

        if (!files.length) {
            setError(errors[0] ?? 'Could not read that file.');
            setIsOpen(true);
            setActiveTab('upload');
            return;
        }

        if (files.length === 1) {
            const [only] = files;
            onSelect({ type: only.type, content: only.ref, metadata: only.metadata });
        } else {
            // Several at once is the same thing as dropping one piece of media
            // on another: a board, not a stack of loose blocks.
            const items: Block[] = files.map((f) => ({
                id: uuidv4(),
                type: f.type,
                content: f.ref,
                metadata: f.metadata,
            }));
            const gallery = createGalleryBlock(items);
            onSelect({ type: 'gallery', content: gallery.content, metadata: gallery.metadata });
        }

        // Partial success still opens the block; the rejected files are worth
        // saying out loud rather than silently dropping.
        if (errors.length) {
            setError(errors[0]);
            setIsOpen(true);
            setActiveTab('upload');
        } else {
            setIsOpen(false);
        }
    }, [onSelect]);

    const onDrop = useCallback((e: React.DragEvent) => {
        if (readOnly) return;
        // Only claim the event for real files — a block dragged from another card
        // must keep bubbling to the editor's own reorder/move handling.
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles, readOnly]);

    const onDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        if (readOnly) return;
        if (e.clipboardData.files?.length) {
            e.preventDefault();
            handleFiles(e.clipboardData.files);
            return;
        }
        // A pasted URL is an embed — resolve its kind from the extension/host.
        const text = e.clipboardData.getData('text/plain')?.trim();
        if (text && /^(https?:\/\/|data:)/i.test(text)) {
            e.preventDefault();
            onSelect({ type: resolveMediaTypeFromUrl(text), content: text, metadata: {} });
            setIsOpen(false);
        }
    }, [handleFiles, onSelect, readOnly]);

    const handleEmbed = () => {
        const url = urlInput.trim();
        if (!url) return;
        onSelect({ type: resolveMediaTypeFromUrl(url), content: url, metadata: {} });
        setIsOpen(false);
    };

    const handleGenerate = () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        setTimeout(() => {
            const seed = Math.floor(Math.random() * 1000000);
            const generatedUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt.trim())}?seed=${seed}&width=1024&height=768&nologo=true`;
            onSelect({ type: 'image', content: generatedUrl, metadata: { name: `AI Generated: ${aiPrompt}` } });
            setIsGenerating(false);
            setIsOpen(false);
        }, 800);
    };

    // The in-editor representation: a drop target in its own right.
    const trigger = (
        <div
            className={`${styles.trigger} ${isDragging ? styles.triggerDragOver : ''} mediaPlaceholderTrigger`}
            onClick={() => !readOnly && setIsOpen(true)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onPaste={handlePaste}
            tabIndex={readOnly ? -1 : 0}
            role="button"
            onKeyDown={(e) => {
                if (readOnly) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsOpen(true);
                }
            }}
        >
            <div className={styles.triggerContent}>
                <UploadCloud size={24} className={styles.triggerIcon} />
                <span className={styles.triggerText}>
                    {isDragging ? 'Drop to upload' : 'Add media — image, video, or any file'}
                </span>
            </div>
        </div>
    );

    const modalContent = (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
            <div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') setIsOpen(false);
                }}
                onPaste={handlePaste}
                tabIndex={-1}
            >
                <Tabs
                    className={styles.tabs}
                    items={MEDIA_TABS}
                    value={activeTab}
                    onChange={setActiveTab}
                    variant="underlined"
                    color="accent"
                    aria-label="Add media by"
                />

                <div className={styles.contentArea}>
                    {activeTab === 'upload' ? (
                        <>
                            <div className={styles.uploadHeader}>
                                <h3 className={styles.uploadTitle}>Upload your files</h3>
                                <p className={styles.uploadSubtitle}>
                                    Images, video, PDF, documents — any file up to {formatBytes(MAX_ASSET_BYTES)}
                                </p>
                            </div>
                            <div
                                className={`${styles.dropZone} ${isDragging ? styles.dragOver : ''}`}
                                onDrop={onDrop}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        if (e.target.files?.length) handleFiles(e.target.files);
                                        e.target.value = '';
                                    }}
                                />
                                <UploadCloud size={32} className={styles.dropIcon} />
                                <span className={styles.dropText}>
                                    Drag &amp; drop files or <span className={styles.dropBrowse}>Browse</span>
                                </span>
                                <span className={styles.dropHint}>You can also paste from the clipboard</span>
                            </div>
                        </>
                    ) : activeTab === 'embed' ? (
                        <div className={styles.embedContainer}>
                            <div className={styles.inputWrapper}>
                                <input
                                    key="embed-input"
                                    className={`${styles.urlInput} nodrag nopan`}
                                    placeholder="Paste any image, video, or file link..."
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') handleEmbed();
                                    }}
                                    onKeyUp={(e) => e.stopPropagation()}
                                    autoFocus
                                />
                                <button className={styles.embedBtn} onClick={handleEmbed}>
                                    Embed
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.embedContainer}>
                            <div className={styles.inputWrapper}>
                                <input
                                    key="ai-input"
                                    className={`${styles.urlInput} nodrag nopan`}
                                    placeholder="Describe the image you want to generate..."
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') handleGenerate();
                                    }}
                                    onKeyUp={(e) => e.stopPropagation()}
                                    autoFocus
                                    disabled={isGenerating}
                                />
                                <button
                                    className={styles.embedBtn}
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !aiPrompt.trim()}
                                    style={{ opacity: (isGenerating || !aiPrompt.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {isGenerating ? 'Generating...' : 'Generate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className={styles.error} role="alert">
                            <Paperclip size={14} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {trigger}
            {isOpen && createPortal(modalContent, document.body)}
        </>
    );
};
