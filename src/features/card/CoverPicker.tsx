import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Link as LinkIcon, Upload as UploadIcon, X } from '../../components/icons';
import styles from './NoteCard.module.css';

interface CoverPickerProps {
    currentCover: string;
    onSelect: (url: string) => void;
    onClose: () => void;
}

export function CoverPicker({ currentCover, onSelect, onClose }: CoverPickerProps) {
    const [activeTab, setActiveTab] = useState<'upload' | 'link' | 'library'>('upload');
    const [urlInput, setUrlInput] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            alert("Please upload an image file");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                onSelect(e.target.result as string);
                onClose();
            }
        };
        reader.readAsDataURL(file);
    }, [onSelect, onClose]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, [handleFile]);

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

    const handleLinkSubmit = () => {
        if (urlInput.trim()) {
            onSelect(urlInput.trim());
            onClose();
        }
    };

    const libraryCovers = [
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
        'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800&q=80',
        'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&q=80',
        'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80',
        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80',
        'https://images.unsplash.com/photo-1506318137071-a8e063b4bcc0?w=800&q=80',
    ];

    return createPortal(
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.coverPickerModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3>Edit Cover</h3>
                    <button className={styles.closeModalBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.modalTabs}>
                    <button 
                        className={`${styles.modalTab} ${activeTab === 'upload' ? styles.active : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        <UploadIcon size={14} /> Upload
                    </button>
                    <button 
                        className={`${styles.modalTab} ${activeTab === 'link' ? styles.active : ''}`}
                        onClick={() => setActiveTab('link')}
                    >
                        <LinkIcon size={14} /> Link
                    </button>
                    <button 
                        className={`${styles.modalTab} ${activeTab === 'library' ? styles.active : ''}`}
                        onClick={() => setActiveTab('library')}
                    >
                        <ImageIcon size={14} /> Library
                    </button>
                </div>

                <div className={styles.modalContent}>
                    {activeTab === 'upload' && (
                        <div 
                            className={`${styles.modalDropZone} ${isDragging ? styles.dragOver : ''}`}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                                accept="image/*"
                            />
                            <UploadIcon size={32} className={styles.modalDropIcon} />
                            <p>Click or drag and drop image here</p>
                        </div>
                    )}

                    {activeTab === 'link' && (
                        <div className={styles.modalLinkInput}>
                            <input 
                                type="text" 
                                placeholder="Paste image URL..." 
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
                            />
                            <button onClick={handleLinkSubmit} className={styles.modalSubmitBtn}>
                                Set Cover
                            </button>
                        </div>
                    )}

                    {activeTab === 'library' && (
                        <div className={styles.modalLibrary}>
                            {libraryCovers.map((url, i) => (
                                <div 
                                    key={i} 
                                    className={styles.libraryItem}
                                    onClick={() => {
                                        onSelect(url);
                                        onClose();
                                    }}
                                >
                                    <img src={url} alt={`Library cover ${i}`} loading="lazy" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {currentCover && (
                    <div className={styles.modalFooter}>
                        <button 
                            className={styles.removeCoverBtn}
                            onClick={() => {
                                onSelect('');
                                onClose();
                            }}
                        >
                            Remove Cover
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
