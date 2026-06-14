import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Video as VideoIcon, FileText, Sparkles } from 'lucide-react';
import styles from './MediaPlaceholder.module.css';

interface MediaPlaceholderProps {
    type: 'image' | 'video' | 'file';
    onUpload: (url: string, metadata?: Record<string, any>) => void;
}

export const MediaPlaceholder = ({ type, onUpload }: MediaPlaceholderProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'upload' | 'embed' | 'generate'>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getIcon = () => {
        switch (type) {
            case 'image': return <ImageIcon size={24} className={styles.triggerIcon} />;
            case 'video': return <VideoIcon size={24} className={styles.triggerIcon} />;
            case 'file': return <FileText size={24} className={styles.triggerIcon} />;
        }
    };

    const handleFile = (file: File) => {
        // Validation (basic)
        if (type === 'image' && !file.type.startsWith('image/')) {
            alert("Please upload an image file");
            return;
        }
        if (type === 'video' && !file.type.startsWith('video/')) {
            alert("Please upload a video file");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                onUpload(e.target.result as string, {
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                setIsOpen(false);
            }
        };
        reader.readAsDataURL(file);
    };

    // Global Drop Handler (works for Trigger AND Modal Dropzone)
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, [type, onUpload]);

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleEmbed = () => {
        if (urlInput.trim()) {
            onUpload(urlInput.trim(), {});
            setIsOpen(false);
        }
    };

    // Trigger is the in-editor representation
    const trigger = (
        <div
            className={`${styles.trigger} ${isDragging ? styles.triggerDragOver : ''}`}
            onClick={() => setIsOpen(true)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
        >
            <div className={styles.triggerContent}>
                {getIcon()}
                <span className={styles.triggerText}>Add {type}</span>
            </div>
        </div>
    );

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            handleFile(e.clipboardData.files[0]);
        }
    }, [handleFile]);

    const handleGenerate = () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        // Simulate a slight delay for realism, though the image itself will take time to load
        setTimeout(() => {
            // Using Pollinations.ai free API which generates images directly from the URL
            const seed = Math.floor(Math.random() * 1000000);
            const generatedUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt.trim())}?seed=${seed}&width=1024&height=768&nologo=true`;
            onUpload(generatedUrl, { name: `AI Generated: ${aiPrompt}` });
            setIsGenerating(false);
            setIsOpen(false);
        }, 800);
    };

    // Modal Content
    const modalContent = (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
            <div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onPaste={handlePaste}
                tabIndex={-1} // Allow focus
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
                    {type === 'image' && (
                        <button
                            className={`${styles.tab} ${activeTab === 'generate' ? styles.active : ''}`}
                            onClick={() => setActiveTab('generate')}
                        >
                            <Sparkles size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} />
                            Generate AI
                        </button>
                    )}
                </div>

                <div className={styles.contentArea}>
                    {activeTab === 'upload' ? (
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
                                    if (e.target.files && e.target.files.length > 0) {
                                        handleFile(e.target.files[0]);
                                    }
                                }}
                                accept={type === 'image' ? "image/*" : type === 'video' ? "video/*" : "*/*"}
                            />
                            {type === 'image' ? <ImageIcon size={32} className={styles.dropIcon} /> :
                                type === 'video' ? <VideoIcon size={32} className={styles.dropIcon} /> :
                                    <FileText size={32} className={styles.dropIcon} />}

                            <span className={styles.dropText}>Click to upload or drag and drop</span>
                            <button className={styles.uploadBtn}>Choose File</button>
                        </div>
                    ) : activeTab === 'embed' ? (
                        <div className={styles.embedContainer}>
                            <div className={styles.inputWrapper}>
                                <input
                                    key="embed-input"
                                    className={`${styles.urlInput} nodrag nopan`}
                                    placeholder={`Paste ${type} link...`}
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') handleEmbed();
                                    }}
                                    onKeyUp={(e) => e.stopPropagation()}
                                    onKeyPress={(e) => e.stopPropagation()}
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
                                    onKeyPress={(e) => e.stopPropagation()}
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
