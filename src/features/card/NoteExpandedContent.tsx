import { useState, useCallback, useEffect, useMemo } from 'react';
import { Image as ImageIcon, StickyNote, Video, FileText, Layers, Eye, X } from 'lucide-react';
import styles from './NoteCard.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { IconPicker } from './IconPicker';
import { iconMap, defaultIconName } from './iconMap';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';

interface NoteExpandedContentProps {
    id: string;
    data: NoteNode['data'];
    onUpdate: (id: string, data: Partial<NoteNode['data']>) => void;
    contentRef?: React.RefObject<HTMLDivElement | null>;
    nodeId?: string;
    showMetadata?: boolean;
    setShowMetadata?: (show: boolean) => void;
    onClose?: () => void;
}

export function NoteExpandedContent({ id, data, onUpdate, contentRef, nodeId, showMetadata: propShowMetadata, setShowMetadata: propSetShowMetadata, onClose }: NoteExpandedContentProps) {
    const { activeIconMenuId, setActiveIconMenuId } = useStore();

    // Internal state for when props are not provided
    const [localShowMetadata, setLocalShowMetadata] = useState(false);

    const showMetadata = propShowMetadata ?? localShowMetadata;
    const setShowMetadata = propSetShowMetadata ?? setLocalShowMetadata;

    // Editing state
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);

    // Derived state
    const showIconPicker = activeIconMenuId === id;

    const [editedData, setEditedData] = useState({
        label: data.label,
        icon: data.icon || defaultIconName,
        description: data.description || '',
        category: data.category || '',
        coverImage: data.coverImage || '',
        date: data.date || new Date().toISOString()
    });

    // Sync state with props
    useEffect(() => {
        setEditedData({
            label: data.label,
            icon: data.icon || defaultIconName,
            description: data.description || '',
            category: data.category || '',
            coverImage: data.coverImage || '',
            date: data.date || new Date().toISOString()
        });
    }, [data]);

    const stats = useMemo(() => {
        if (!Array.isArray(data.content)) return null;

        const content = data.content as any[];
        const total = content.length;
        const cards = content.filter(b => b.type === 'page').length;
        const images = content.filter(b => b.type === 'image').length;
        const videos = content.filter(b => b.type === 'video').length;
        const pdfs = content.filter(b => b.type === 'file').length;

        return { total, cards, images, videos, pdfs };
    }, [data.content]);

    const IconComponent = iconMap[data.icon || defaultIconName] || iconMap[defaultIconName];

    const handleSaveMetadata = useCallback(() => {
        onUpdate(id, editedData);
        setIsEditingMetadata(false);
    }, [id, editedData, onUpdate]);

    const handleIconSelect = useCallback((icon: string) => {
        setEditedData(prev => ({ ...prev, icon }));
        if (!isEditingMetadata) {
            onUpdate(id, { icon });
        }
        setActiveIconMenuId(null);
    }, [id, isEditingMetadata, onUpdate, setActiveIconMenuId]);

    const handleIconClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIconMenuId(id);
    }, [id, setActiveIconMenuId]);

    // Textarea auto-resize logic
    const textareaRef = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            element.style.height = element.scrollHeight + 'px';
        }
    };

    return (
        <div className={styles.expandedView}>

            {showMetadata ? (
                <>
                    {/* Cover Image */}
                    <div className={styles.coverImage}>
                        {data.coverImage ? (
                            <img src={data.coverImage} alt="Cover" />
                        ) : (
                            <div
                                className={styles.coverPlaceholder}
                                onClick={() => setIsEditingMetadata(true)}
                            >
                                {!isEditingMetadata && !editedData.coverImage ? (
                                    <div className={styles.coverEmptyState}>
                                        <ImageIcon size={24} />
                                        <span>Add Cover</span>
                                    </div>
                                ) : (
                                    <input
                                        className={styles.coverUrlInput}
                                        value={isEditingMetadata ? editedData.coverImage : ''}
                                        onChange={(e) => setEditedData({ ...editedData, coverImage: e.target.value })}
                                        onFocus={() => setIsEditingMetadata(true)}
                                        onBlur={() => {
                                            if (isEditingMetadata && !editedData.coverImage) {
                                                setIsEditingMetadata(false);
                                            } else if (isEditingMetadata) {
                                                handleSaveMetadata();
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Paste image URL..."
                                        autoFocus
                                    />
                                )}
                            </div>
                        )}

                        {/* Cover Metadata Chips (Top Right) */}
                        <div className={styles.coverMetadataOverlay}>
                            {/* Metadata Chips */}
                            {data.status && (
                                <span className={styles.metaChip}>
                                    {data.status}
                                </span>
                            )}
                            {data.priority && (
                                <span className={`${styles.metaChip} ${styles.blue}`}>
                                    {data.priority}
                                </span>
                            )}
                            {data.tags && data.tags.map(tag => (
                                <span key={tag} className={`${styles.metaChip} ${styles.purple}`}>
                                    {tag}
                                </span>
                            ))}

                            {/* Top Controls (Expanded Mode - Integrated) */}
                            <div className={styles.controlsGroup} onMouseDown={(e) => e.stopPropagation()}>
                                <button
                                    className={`${styles.controlBtn} ${showMetadata ? styles.active : ''}`}
                                    onClick={() => setShowMetadata(!showMetadata)}
                                    title="Hide Metadata"
                                >
                                    <Eye size={20} />
                                </button>
                                {onClose && (
                                    <button
                                        className={styles.controlBtn}
                                        onClick={onClose}
                                        title="Close"
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Metadata Section */}
                    <div className={styles.expandedMetadata}>
                        {/* Header with Icon and Title */}
                        <div className={styles.expandedHeader}>
                            <button
                                className={styles.expandedIconButton}
                                onClick={handleIconClick}
                                title="Change icon"
                            >
                                <IconComponent size={32} />
                            </button>
                            <div className={styles.titleSection}>
                                <input
                                    className={styles.expandedTitleInput}
                                    value={isEditingMetadata ? editedData.label : data.label}
                                    onChange={(e) => setEditedData({ ...editedData, label: e.target.value })}
                                    onFocus={() => setIsEditingMetadata(true)}
                                    onBlur={() => {
                                        if (isEditingMetadata) {
                                            handleSaveMetadata();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDownCapture={(e) => e.stopPropagation()}
                                    placeholder="Untitled Page"
                                />
                            </div>
                        </div>

                        <div className={styles.metaContainer}>
                            {/* Description */}
                            <div className={styles.expandedDescContainer}>
                                <textarea
                                    className={styles.expandedDescEdit}
                                    ref={textareaRef}
                                    value={isEditingMetadata ? editedData.description : (data.description || '')}
                                    onChange={(e) => {
                                        setEditedData({ ...editedData, description: e.target.value });
                                        e.target.style.height = 'auto'; // Reset to auto to get correct scrollHeight
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    onFocus={() => setIsEditingMetadata(true)}
                                    onBlur={() => {
                                        if (isEditingMetadata) {
                                            handleSaveMetadata();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDownCapture={(e) => e.stopPropagation()}
                                    rows={1}
                                    placeholder="Add a description..."
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* Minimal Header (When Hidden) */
                /* Minimal Header (When Hidden) */
                <div className={styles.minimalHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <IconComponent size={20} />
                        <span className={styles.minimalTitle}>{data.label || 'Untitled'}</span>
                    </div>

                    {/* Top Controls (Collapsed Mode - Integrated) */}
                    <div className={styles.controlsGroup} onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            className={`${styles.controlBtn} ${showMetadata ? styles.active : ''}`}
                            onClick={() => setShowMetadata(!showMetadata)}
                            title="Show Metadata"
                        >
                            <Eye size={20} />
                        </button>
                        {onClose && (
                            <button
                                className={styles.controlBtn}
                                onClick={onClose}
                                title="Close"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Note Area */}
            <div
                className={`${styles.noteArea} nodrag`}
                onWheelCapture={(e) => e.stopPropagation()}
                ref={contentRef}
            >
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={false}
                    onUpdate={useCallback((blocks: any[]) => onUpdate(id, { content: blocks }), [id, onUpdate])}
                    nodeId={nodeId}
                />
            </div>


            {/* Footer with Date (Read-Only) - Only show when metadata is visible */}
            {showMetadata && (
                <div className={styles.expandedFooter}>
                    {/* Left Stats */}
                    <div className={styles.footerStats}>
                        {stats && stats.cards > 0 && (
                            <span className={styles.statItem} title={`${stats.cards} Nested Cards`}>
                                <StickyNote size={14} /> {stats.cards}
                            </span>
                        )}
                        {stats && stats.total > 0 && (
                            <span className={styles.statItem} title={`${stats.total} Total Blocks`}>
                                <Layers size={14} /> {stats.total}
                            </span>
                        )}
                        {stats && stats.images > 0 && (
                            <span className={styles.statItem} title={`${stats.images} Images`}>
                                <ImageIcon size={14} /> {stats.images}
                            </span>
                        )}
                        {stats && stats.videos > 0 && (
                            <span className={styles.statItem} title={`${stats.videos} Videos`}>
                                <Video size={14} /> {stats.videos}
                            </span>
                        )}
                        {stats && stats.pdfs > 0 && (
                            <span className={styles.statItem} title={`${stats.pdfs} PDFs/Files`}>
                                <FileText size={14} /> {stats.pdfs}
                            </span>
                        )}
                    </div>

                    <div className={styles.footerDateBadge}>
                        <span style={{ opacity: 0.5 }}>Created</span>
                        <span>
                            {new Date(data.date || new Date()).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            })}
                        </span>
                    </div>
                </div>
            )}

            {/* Icon Picker Modal */}
            {
                showIconPicker && (
                    <IconPicker
                        currentIcon={editedData.icon}
                        onSelect={handleIconSelect}
                        onClose={() => setActiveIconMenuId(null)}
                    />
                )
            }
        </div >
    );
}
