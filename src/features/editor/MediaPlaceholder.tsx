import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, Sparkles, Paperclip } from 'lucide-react';
import styles from './MediaPlaceholder.module.css';
import type { BlockMetadata } from './types';
import {
    formatBytes,
    MAX_MEDIA_BYTES,
    readMediaFile,
    resolveMediaTypeFromUrl,
    type ResolvedMediaType,
} from './mediaTypes';

export interface MediaSelection {
    type: ResolvedMediaType;
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
export const MediaPlaceholder = ({ onSelect, readOnly }: MediaPlaceholderProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'upload' | 'embed' | 'generate'>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const file = Array.from(files)[0];
        if (!file) return;
        setError(null);
        try {
            const { url, type } = await readMediaFile(file);
            onSelect({
                type,
                content: url,
                metadata: { name: file.name, size: file.size, type: file.type },
            });
            setIsOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read that file.');
            setIsOpen(true);
            setActiveTab('upload');
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
                    {isDragging ? 'Drop to upload' : 'Add media — image, video, or file'}
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
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'upload' ? styles.active : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        Upload
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'embed' ? styles.active : ''}`}
                        onClick={() => setActiveTab('embed')}
                    >
                        Embed Link
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'generate' ? styles.active : ''}`}
                        onClick={() => setActiveTab('generate')}
                    >
                        <Sparkles size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} />
                        Generate AI
                    </button>
                </div>

                <div className={styles.contentArea}>
                    {activeTab === 'upload' ? (
                        <>
                            <div className={styles.uploadHeader}>
                                <h3 className={styles.uploadTitle}>Upload your files</h3>
                                <p className={styles.uploadSubtitle}>
                                    Images, video, PDF, any file up to {formatBytes(MAX_MEDIA_BYTES)}
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
