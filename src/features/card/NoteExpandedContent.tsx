import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Eye, X, ExternalLink } from 'lucide-react';
import styles from './NoteCard.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { IconPicker } from './IconPicker';
import { iconMap, defaultIconName } from './iconMap';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { CoverPicker } from './CoverPicker';
import { lightenColor, darkenColor } from '../../utils/colorUtils';
import { SkeletonLoader } from './SkeletonLoader';

// Extracted components and hooks
import { useNoteMetadata, useLazyRender } from './hooks';
import { NoteCoverSection } from './NoteCoverSection';
import { NoteMetadataSection } from './NoteMetadataSection';
import { NoteFooterStats } from './NoteFooterStats';
import { NotePropertiesPanel } from './properties/NotePropertiesPanel';

interface NoteExpandedContentProps {
    id: string;
    data: NoteNode['data'];
    onUpdate: (id: string, data: Partial<NoteNode['data']>) => void;
    contentRef?: React.RefObject<HTMLDivElement | null>;
    nodeId?: string;
    onClose?: () => void;
    onNavigate?: () => void; // Navigate to nested canvas
    selectionIslandPortalId?: string; // Portal target for selection island
}

export function NoteExpandedContent({
    id,
    data,
    onUpdate,
    contentRef,
    nodeId,
    onClose,
    onNavigate,
    selectionIslandPortalId
}: NoteExpandedContentProps) {
    // Use data state (persistent) or fallback to false
    const showMetadata = data.showMetadata ?? false;

    const setShowMetadata = useCallback((show: boolean) => {
        onUpdate(id, { showMetadata: show });
    }, [id, onUpdate]);

    // Lazy rendering hook
    const { hasRendered, containerRef } = useLazyRender();

    // Metadata editing hook
    const {
        editedData,
        setEditedData,
        isEditingMetadata,
        setIsEditingMetadata,
        showCoverPicker,
        setShowCoverPicker,
        showIconPicker,
        handleSaveMetadata,
        handleIconSelect,
        handleIconClick,
        handleCoverSelect,
        setActiveIconMenuId,
    } = useNoteMetadata({ id, data, onUpdate });

    // Area drop handler
    const handleAreaDrop = useCallback((e: React.DragEvent) => {
        if (!data) return;
        console.log("[NoteExpandedContent.handleAreaDrop] START - nodeId:", id);
        e.preventDefault();
        e.stopPropagation();

        let blocksToAdd: any[] = [];
        let sourceNodeId: string | null = null;

        try {
            const rawData = e.dataTransfer.getData('application/infonote-block-data');
            if (rawData) {
                const parsed = JSON.parse(rawData);
                sourceNodeId = parsed.sourceNodeId || null;

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

                    blocksToAdd = [{
                        id: uuidv4(),
                        type,
                        content: '',
                        metadata
                    }];
                }
            }
        } catch (err) { console.error("Drop failed", err); }

        if (blocksToAdd.length > 0) {
            const current = Array.isArray(data.content) ? data.content : [];
            onUpdate(id, {
                content: [...current, ...blocksToAdd],
                lastFusedAt: Date.now()
            });

            if (sourceNodeId && sourceNodeId !== id) {
                const { nodes, updateNodeData, setNodes } = useStore.getState();
                const sourceNode = nodes.find(n => n.id === sourceNodeId);

                if (sourceNode && Array.isArray((sourceNode.data as any).content)) {
                    const blockIds = blocksToAdd.map((b: any) => b.id);
                    const currentContent = (sourceNode.data as any).content;
                    const newContent = currentContent.filter((b: any) => !blockIds.includes(b.id));

                    updateNodeData(sourceNodeId, { content: newContent });

                    if (newContent.length === 0 && sourceNode.type === 'fused-note') {
                        setTimeout(() => {
                            setNodes(nds => nds.filter(n => n.id !== sourceNodeId));
                        }, 0);
                    }
                }

                if ((window as any).infonoteMultiDragCleanup) {
                    (window as any).infonoteMultiDragCleanup();
                    delete (window as any).infonoteMultiDragCleanup;
                }
                window.dispatchEvent(new CustomEvent('infonote-clear-selection'));
            }
        }
    }, [data?.content, id, onUpdate]);

    const handleContentUpdate = useCallback((blocks: any[]) => {
        onUpdate(id, { content: blocks });
    }, [id, onUpdate]);

    // Early return after hooks
    if (!data) {
        return <div>Error: Missing data</div>;
    }

    // Derived state
    const IconComponent = iconMap[data.icon || defaultIconName] || iconMap[defaultIconName];

    // Dynamic color styles
    const dynamicStyles = useMemo(() => {
        if (!data.color) return {};
        const noteAreaBg = lightenColor(data.color, 70); // Very light pastel for note area
        return {
            '--color-text-main': '#1f2937',
            '--color-text-muted': '#6b7280',
            '--color-border': 'rgba(0,0,0,0.2)',
            '--note-bg-dynamic': data.color,
            '--note-area-bg': noteAreaBg, // Pastel background for note area
        } as React.CSSProperties;
    }, [data.color]);

    const headerStyle = useMemo(() => {
        if (!data.color) return {};
        const bg = lightenColor(data.color, 15);
        const darkText = darkenColor(data.color, 50); // Dark shade for icons/labels
        const mutedText = darkenColor(data.color, 35); // Slightly lighter for muted text
        const activeBg = lightenColor(data.color, 40); // Lighter background for active state
        const btnBg = darkenColor(data.color, 15); // Slightly darker background for buttons
        return {
            backgroundColor: bg,
            color: darkText,
            '--color-text-main': darkText,
            '--color-text-muted': mutedText,
            '--color-border': 'rgba(0,0,0,0.2)',
            // Control button default state
            '--control-btn-bg': `${btnBg}40`, // Semi-transparent darker shade
            '--control-btn-border': `${darkText}50`, // Semi-transparent dark border
            '--control-btn-shadow': '0 2px 8px rgba(0, 0, 0, 0.15)',
            // Control button hover state
            '--control-btn-hover-border': darkText,
            '--control-btn-hover-color': darkText,
            // Control button active state
            '--control-btn-active-bg': activeBg,
            '--control-btn-active-border': darkText,
            '--control-btn-active-color': darkText,
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

                    {/* Cover Section */}
                    <NoteCoverSection
                        coverImage={data.coverImage}
                        showMetadata={showMetadata}
                        setShowMetadata={setShowMetadata}
                        onCoverClick={() => setShowCoverPicker(true)}
                        onClose={onClose}
                    />

                    {/* Metadata Section (Icon + Title + Desc) */}
                    <NoteMetadataSection
                        IconComponent={IconComponent}
                        label={data.label}
                        description={data.description || ''}
                        editedLabel={editedData.label}
                        editedDescription={editedData.description}
                        isEditing={isEditingMetadata}
                        onIconClick={handleIconClick}
                        onLabelChange={(value) => setEditedData(prev => ({ ...prev, label: value }))}
                        onDescriptionChange={(value, element) => {
                            setEditedData(prev => ({ ...prev, description: value }));
                            element.style.height = 'auto';
                            element.style.height = element.scrollHeight + 'px';
                        }}
                        onFocus={() => setIsEditingMetadata(true)}
                        onBlur={() => {
                            if (isEditingMetadata) {
                                handleSaveMetadata();
                            }
                        }}
                    />

                    {/* NEW: Properties Panel */}
                    <NotePropertiesPanel
                        data={data}
                        onUpdate={(updates) => onUpdate(id, updates)}
                    />
                </>
            ) : (
                /* Minimal Header (When Hidden) */
                <div className={`${styles.minimalHeader} custom-drag-handle`} style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <IconComponent size={20} />
                        <input
                            type="text"
                            value={editedData.label}
                            onChange={(e) => setEditedData(prev => ({ ...prev, label: e.target.value }))}
                            onBlur={handleSaveMetadata}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`${styles.minimalTitleInput} nodrag`}
                            placeholder="Untitled"
                        />
                    </div>

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
                        {onNavigate && (
                            <button
                                className={styles.controlBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate();
                                }}
                                title="Open Canvas"
                            >
                                <ExternalLink size={20} />
                            </button>
                        )}
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
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
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
                        selectionIslandPortalId={selectionIslandPortalId}
                    />
                ) : (
                    <SkeletonLoader />
                )}
            </div>

            {/* Footer (only when metadata visible) */}
            {showMetadata && (
                <NoteFooterStats content={data.content} date={data.date} />
            )}

            {/* Icon Picker Modal */}
            {showIconPicker && (
                <IconPicker
                    currentIcon={editedData.icon}
                    onSelect={handleIconSelect}
                    onClose={() => setActiveIconMenuId(null)}
                />
            )}

            {/* Cover Picker Modal */}
            {showCoverPicker && (
                <CoverPicker
                    currentCover={data.coverImage || ''}
                    onSelect={handleCoverSelect}
                    onClose={() => setShowCoverPicker(false)}
                />
            )}
        </div>
    );
}
