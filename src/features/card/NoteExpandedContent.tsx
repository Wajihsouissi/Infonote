import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Image as ImageIcon, StickyNote, Video, FileText, Layers, Eye, EyeOff, X } from 'lucide-react';
import styles from './NoteCard.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { IconPicker } from './IconPicker';
import { iconMap, defaultIconName } from './iconMap';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { CoverPicker } from './CoverPicker';
import { lightenColor } from '../../utils/colorUtils';
import { SkeletonLoader } from './SkeletonLoader';

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
    // Atomic Selectors
    const activeIconMenuId = useStore(s => s.activeIconMenuId);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);

    // Internal state for when props are not provided
    const [localShowMetadata, setLocalShowMetadata] = useState(false);

    const showMetadata = propShowMetadata ?? localShowMetadata;
    const setShowMetadata = propSetShowMetadata ?? setLocalShowMetadata;

    // Editing state
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [showCoverPicker, setShowCoverPicker] = useState(false);

    // CRITICAL: Lazy render - only render content when visible
    const [hasRendered, setHasRendered] = useState(false);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [editedData, setEditedData] = useState({
        label: data?.label || 'Untitled',
        icon: data?.icon || defaultIconName,
        description: data?.description || '',
        category: data?.category || '',
        coverImage: data?.coverImage || '',
        date: data?.date || new Date().toISOString()
    });

    useEffect(() => {
        if (!containerRef.current) return;

        // Intersection observer for lazy rendering
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !hasRendered) {
                        setHasRendered(true);
                    }
                });
            },
            { rootMargin: '400px' } // Pre-render 400px before entering viewport
        );

        observerRef.current.observe(containerRef.current);

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasRendered]);

    // Sync state with props
    useEffect(() => {
        if (data) {
            setEditedData({
                label: data.label,
                icon: data.icon || defaultIconName,
                description: data.description || '',
                category: data.category || '',
                coverImage: data.coverImage || '',
                date: data.date || new Date().toISOString()
            });
        }
    }, [data]);

    const stats = useMemo(() => {
        // Defensive check for data.content
        if (!data || !data.content || !Array.isArray(data.content)) {
            return null;
        }

        const content = data.content as any[];
        const total = content.length;
        const cards = content.filter(b => b && b.type === 'page').length;
        const images = content.filter(b => b && b.type === 'image').length;
        const videos = content.filter(b => b && b.type === 'video').length;
        const pdfs = content.filter(b => b && b.type === 'file').length;

        return { total, cards, images, videos, pdfs };
    }, [data?.content, id]);

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

    const handleAreaDrop = useCallback((e: React.DragEvent) => {
        if (!data) return;
        console.log("[NoteExpandedContent.handleAreaDrop] START - Event triggered, nodeId:", id);
        // Allow dropping on the empty area to append to end
        // Only if block editor didn't catch it (bubbled up, but noteArea is container)
        // Check if target is not inside editor?
        // Actually, preventing default here is fine.
        e.preventDefault();
        e.stopPropagation();

        let blocksToAdd: any[] = [];
        let sourceNodeId: string | null = null;

        try {
            const rawData = e.dataTransfer.getData('application/infonote-block-data');
            if (rawData) {
                const parsed = JSON.parse(rawData);
                sourceNodeId = parsed.sourceNodeId || null;

                console.log("[NoteExpandedContent.handleAreaDrop] Parsed data - sourceNodeId:", sourceNodeId, "currentId:", id);

                // Handle external drops (menu) or cross-node drops
                if (sourceNodeId === null || sourceNodeId !== id) {
                    if (parsed.blocks) blocksToAdd = parsed.blocks;
                    else if (parsed.block) blocksToAdd = [parsed.block];
                }
            } else {
                const type = e.dataTransfer.getData('application/reactflow-block-type');
                if (type) {
                    let metadata = undefined;
                    try {
                        const metaJson = e.dataTransfer.getData('application/infonote-block-metadata');
                        if (metaJson) metadata = JSON.parse(metaJson);
                    } catch (e) { }

                    // Generate new block for type-only drop
                    blocksToAdd = [{
                        id: uuidv4(),
                        type,
                        content: '',
                        metadata
                    }];
                }
            }
        } catch (err) { console.error("Drop failed", err); }

        console.log("[NoteExpandedContent.handleAreaDrop] blocksToAdd count:", blocksToAdd.length);

        if (blocksToAdd.length > 0) {
            const current = Array.isArray(data.content) ? data.content : [];
            console.log("[NoteExpandedContent.handleAreaDrop] Adding blocks to node:", id);
            onUpdate(id, { content: [...current, ...blocksToAdd] });

            // Remove blocks from source node if cross-node drop
            if (sourceNodeId && sourceNodeId !== id) {
                console.log("[NoteExpandedContent.handleAreaDrop] Removing blocks from source node:", sourceNodeId);
                const { nodes, updateNodeData, setNodes } = useStore.getState();
                const sourceNode = nodes.find(n => n.id === sourceNodeId);

                if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                    const blockIds = blocksToAdd.map((b: any) => b.id);
                    const currentContent = (sourceNode.data as any).content;
                    const newContent = currentContent.filter((b: any) => !blockIds.includes(b.id));

                    console.log("[NoteExpandedContent.handleAreaDrop] Source content before:", currentContent.length, "after:", newContent.length);

                    updateNodeData(sourceNodeId, { content: newContent });

                    // If source node is now empty and is a fused-note, delete it
                    if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                        setTimeout(() => {
                            setNodes(nds => nds.filter(n => n.id !== sourceNodeId));
                        }, 0);
                    }
                }

                // Trigger cleanup events
                if ((window as any).infonoteMultiDragCleanup) {
                    (window as any).infonoteMultiDragCleanup();
                    delete (window as any).infonoteMultiDragCleanup;
                }
                window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
            }
        }
    }, [data.content, id, onUpdate]);

    // Textarea auto-resize logic
    const textareaRef = (element: HTMLTextAreaElement | null) => {
        if (element) {
            element.style.height = 'auto';
            element.style.height = element.scrollHeight + 'px';
        }
    };

    const handleContentUpdate = useCallback((blocks: any[]) => {
        onUpdate(id, { content: blocks });
    }, [id, onUpdate]);

    // Late early return - MUST BE AFTER ALL HOOKS
    if (!data) {
        return <div>Error: Missing data</div>;
    }

    // Derived state
    const showIconPicker = activeIconMenuId === id;
    const IconComponent = iconMap[data.icon || defaultIconName] || iconMap[defaultIconName];

    // Dynamic Color Logic
    const dynamicStyles = useMemo(() => {
        if (!data.color) return {};

        // User requested dark text for ALL colors (sticky note style)
        return {
            '--color-text-main': '#1f2937',
            '--color-text-muted': '#6b7280',
            '--color-border': 'rgba(0,0,0,0.1)',
            '--note-bg-dynamic': data.color
        } as React.CSSProperties;
    }, [data.color]);

    const headerStyle = useMemo(() => {
        if (!data.color) return {};
        const bg = lightenColor(data.color, 15); // Lighten by 15%
        return {
            backgroundColor: bg,
            color: '#1f2937', // Force dark text
            // Override variables within header scope
            '--color-text-main': '#1f2937',
            '--color-text-muted': '#6b7280',
            '--color-border': 'rgba(0,0,0,0.1)',
        } as React.CSSProperties;
    }, [data.color]);





    return (
        <div
            className={styles.expandedView}
            ref={containerRef}
            style={dynamicStyles}
        >

            {showMetadata ? (
                <>
                    {/* Cover Image */}
                    <div className={styles.coverImage} onClick={() => setShowCoverPicker(true)}>
                        {data.coverImage ? (
                            <img src={data.coverImage} alt="Cover" loading="lazy" />
                        ) : (
                            <div className={styles.coverPlaceholder}>
                                <div className={styles.coverEmptyState}>
                                    <ImageIcon size={24} />
                                    <span>Add Cover</span>
                                </div>
                            </div>
                        )}

                        {/* Cover Metadata Chips (Top Right) */}
                        <div className={styles.coverMetadataOverlay}>
                            {/* Metadata Chips */}
                            {data.status && (
                                <span className={styles.metaChip} onClick={(e) => e.stopPropagation()}>
                                    {data.status}
                                </span>
                            )}
                            {data.priority && (
                                <span className={`${styles.metaChip} ${styles.blue}`} onClick={(e) => e.stopPropagation()}>
                                    {data.priority}
                                </span>
                            )}
                            {data.tags && data.tags.map(tag => (
                                <span key={tag} className={`${styles.metaChip} ${styles.purple}`} onClick={(e) => e.stopPropagation()}>
                                    {tag}
                                </span>
                            ))}

                            {/* Top Controls (Expanded Mode - Integrated) */}
                            <div className={styles.controlsGroup} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                <button
                                    className={`${styles.controlBtn} ${showMetadata ? styles.active : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowMetadata(!showMetadata);
                                    }}
                                    title="Hide Metadata"
                                >
                                    <EyeOff size={20} />
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
                <div className={styles.minimalHeader} style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <IconComponent size={20} />
                        <span className={styles.minimalTitle}>{data.label || 'Untitled'}</span>
                    </div>

                    {/* Top Controls (Collapsed Mode - Integrated) */}
                    <div className={styles.controlsGroup} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <button
                            className={`${styles.controlBtn} ${showMetadata ? styles.active : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMetadata(!showMetadata);
                            }}
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
                onDrop={handleAreaDrop}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                }}
            >
                {hasRendered ? (
                    <BlockEditor
                        initialContent={Array.isArray(data.content) ? data.content : []}
                        readOnly={false}
                        minimal={false}
                        onUpdate={handleContentUpdate}
                        nodeId={nodeId}
                    />
                ) : (
                    <SkeletonLoader />
                )}
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

            {showCoverPicker && (
                <CoverPicker
                    currentCover={data.coverImage || ''}
                    onSelect={(url) => {
                        onUpdate(id, { coverImage: url });
                        setShowCoverPicker(false);
                    }}
                    onClose={() => setShowCoverPicker(false)}
                />
            )}
        </div >
    );
}
