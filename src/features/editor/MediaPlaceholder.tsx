import React, { useState, useCallback, useRef } from 'react';
import { Image as ImageIcon, Video as VideoIcon, FileText } from 'lucide-react';
import styles from './MediaPlaceholder.module.css';

interface MediaPlaceholderProps {
    type: 'image' | 'video' | 'file';
    onUpload: (url: string, metadata?: Record<string, any>) => void;
}

export const MediaPlaceholder = ({ type, onUpload }: MediaPlaceholderProps) => {
    const [activeTab, setActiveTab] = useState<'upload' | 'embed'>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getIcon = () => {
        switch (type) {
            case 'image': return <ImageIcon size={32} className={styles.dropIcon} />;
            case 'video': return <VideoIcon size={32} className={styles.dropIcon} />;
            case 'file': return <FileText size={32} className={styles.dropIcon} />;
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
            }
        };
        reader.readAsDataURL(file);
    };

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
        }
    };

    return (
        <div className={styles.container} onClick={(e) => e.stopPropagation()}>
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
                        {getIcon()}
                        <span className={styles.dropText}>Click to upload or drag and drop</span>
                        <button className={styles.uploadBtn}>Choose File</button>
                    </div>
                ) : (
                    <div className={styles.embedContainer}>
                        <div className={styles.inputWrapper}>
                            <input
                                className={styles.urlInput}
                                placeholder={`Paste ${type} link...`}
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleEmbed();
                                }}
                                autoFocus
                            />
                            <button className={styles.embedBtn} onClick={handleEmbed}>
                                Embed
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
