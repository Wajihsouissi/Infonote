import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Eye, X, ExternalLink } from 'lucide-react';
import styles from './NoteCard.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { IconPicker } from './IconPicker';
import { defaultIconName, CardIcon } from './iconMap';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { CoverPicker } from './CoverPicker';
import { lightenColor, darkenColor, toPastelColor } from '../../utils/colorUtils';
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
    flatCorners?: boolean; // Remove border radius
    readOnly?: boolean;
    hideBlockHandles?: boolean;
}

export function NoteExpandedContent({
    id,
    data,
    onUpdate,
    contentRef,
    nodeId,
    onClose,
    onNavigate,
    selectionIslandPortalId,
    flatCorners,
    readOnly,
    hideBlockHandles
}: NoteExpandedContentProps) {
    // Use data state (persistent) or fallback to false
    const showMetadata = data?.showMetadata ?? false;

    const setShowMetadata = useCallback((show: boolean) => {
        onUpdate(id, { showMetadata: show });
    }, [id, onUpdate]);

    const theme = useStore(s => s.theme);
    const displayColor = data?.color ? toPastelColor(data.color, theme === 'light') : undefined;

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
            const rawData = e.dataTransfer.getData('application/chnk-it-block-data');
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
                        const metaJson = e.dataTransfer.getData('application/chnk-it-block-metadata');
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

                if ((window as any).chnkItMultiDragCleanup) {
                    (window as any).chnkItMultiDragCleanup();
                    delete (window as any).chnkItMultiDragCleanup;
                }
                window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
            }
        }
    }, [data?.content, id, onUpdate]);

    const handleContentUpdate = useCallback((blocks: any[]) => {
        onUpdate(id, { content: blocks });
    }, [id, onUpdate]);

    // Dynamic color styles
    const dynamicStyles = useMemo(() => {
        if (!data?.color) return {};
        const tableBorderColor = darkenColor(data.color, 55);
        return {
            '--glass-border': `${tableBorderColor}33`,
            '--note-bg-dynamic': data.color,
        } as React.CSSProperties;
    }, [data?.color]);

    const headerStyle = useMemo(() => {
        if (!displayColor) return {};
        const bg = displayColor;
        const darkText = darkenColor(displayColor, 80); // Dark shade for icons/labels
        const mutedText = darkenColor(displayColor, 65); // Slightly lighter for muted text
        const activeBg = darkenColor(displayColor, 15); // Darker background for active state
        return {
            backgroundColor: bg,
            color: darkText,
            caretColor: darkText,
            '--color-text-main': darkText,
            '--color-text-muted': mutedText,
            '--color-border': 'rgba(0,0,0,0.1)',
            // Control button default state
            '--control-btn-bg': `transparent`,
            '--control-btn-border': `${darkText}30`,
            '--control-btn-shadow': 'none',
            // Control button hover state
            '--control-btn-hover-border': darkText,
            '--control-btn-hover-color': darkText,
            // Control button active state
            '--control-btn-active-bg': `${darkText}15`,
            '--control-btn-active-border': darkText,
            '--control-btn-active-color': darkText,
        } as React.CSSProperties;
    }, [displayColor]);

    const noteAreaStyles = useMemo(() => {
        if (!data?.color) return { backgroundColor: 'transparent' };
        
        // Reset the text colors back to the default theme so the block editor
        // looks exactly like an uncolored card, matching global theme.
        const isDark = theme !== 'light';
        return {
            backgroundColor: 'transparent',
            boxShadow: `
                inset 4px 0 12px -6px ${data.color}15,
                inset -4px 0 12px -6px ${data.color}15,
                inset 0 -6px 12px -6px ${data.color}15,
                inset 1px 0 0 0 ${data.color}10,
                inset -1px 0 0 0 ${data.color}10,
                inset 0 -1px 0 0 ${data.color}10
            `.trim().replace(/\s+/g, ' '),
            '--color-text-main': isDark ? '#f3f4f6' : '#1f2937',
            '--color-border': isDark ? '#333645' : '#e5e7eb',
            '--glass-border': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            '--icon-color': isDark ? '#f3f4f6' : '#1f2937',
            caretColor: isDark ? '#f3f4f6' : '#1f2937',
            // Reset links to prevent them from inheriting NoteCard tints
            '--link-bg': 'initial',
            '--link-bg-hover': 'initial',
            '--link-border': 'initial',
            '--link-border-hover': 'initial',
            '--link-shadow': 'initial',
        } as React.CSSProperties;
    }, [data?.color, theme]);

    // Early return AFTER all hooks — a conditional return above any hook
    // makes React throw "Rendered more hooks than during the previous render".
    if (!data) {
        return <div>Error: Missing data</div>;
    }

    return (
        <div
            className={styles.expandedView}
            ref={containerRef}
            style={{
                ...dynamicStyles,
                ...(flatCorners ? { borderRadius: 0 } : {})
            }}
        >
            {showMetadata ? (
                <div style={{ backgroundColor: displayColor || undefined, borderTopLeftRadius: flatCorners ? 0 : '12px', borderTopRightRadius: flatCorners ? 0 : '12px', flexShrink: 0 }}>

                    {/* Cover Section */}
                    <NoteCoverSection
                        coverImage={data.coverImage}
                        showMetadata={showMetadata}
                        setShowMetadata={setShowMetadata}
                        onCoverClick={() => setShowCoverPicker(true)}
                        onClose={onClose}
                        flatCorners={flatCorners}
                    />

                    {/* Metadata Section (Icon + Title + Desc) */}
                    <NoteMetadataSection
                        icon={data.icon || defaultIconName}
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
                </div>
            ) : (
                /* Minimal Header (When Hidden) */
                <div className={`${styles.minimalHeader} custom-drag-handle`} style={{
                    ...headerStyle,
                    ...(flatCorners ? { borderRadius: 0 } : {})
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <div
                            className={`${styles.minimalIconButton} nodrag`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleIconClick(e);
                            }}
                            title="Change Icon"
                        >
                            <CardIcon icon={data.icon || defaultIconName} size={20} />
                        </div>
                        <input
                            type="text"
                            value={editedData.label}
                            onChange={(e) => setEditedData(prev => ({ ...prev, label: e.target.value }))}
                            onFocus={() => setIsEditingMetadata(true)}
                            onBlur={handleSaveMetadata}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.select();
                            }}
                            className={`${styles.minimalTitleInput} nodrag`}
                            placeholder="Untitled"
                        />
                    </div>

                    {/* macOS-style traffic-light window controls: close (red), show metadata (yellow), open canvas (green) */}
                    <div className={`${styles.controlsGroup} ${styles.trafficLights}`} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        {onClose && (
                            <button
                                className={`${styles.controlBtn} ${styles.tlClose}`}
                                onClick={onClose}
                                title="Close"
                                aria-label="Close"
                            >
                                <X size={16} strokeWidth={2.6} />
                            </button>
                        )}
                        <button
                            className={`${styles.controlBtn} ${styles.tlMeta} ${showMetadata ? styles.active : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMetadata(!showMetadata);
                            }}
                            title="Show Metadata"
                            aria-label="Show Metadata"
                        >
                            <Eye size={16} strokeWidth={2.6} />
                        </button>
                        {onNavigate && (
                            <button
                                className={`${styles.controlBtn} ${styles.tlOpen}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate();
                                }}
                                title="Open Canvas"
                                aria-label="Open Canvas"
                            >
                                <ExternalLink size={16} strokeWidth={2.6} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Note Area */}
            <div
                className={`${styles.noteArea} nodrag infonote-scrollable`}
                style={noteAreaStyles}
                onWheelCapture={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget && nodeId) {
                        window.dispatchEvent(new CustomEvent('chnk-it-editor-bg-click', { detail: { nodeId } }));
                    }
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
                        readOnly={readOnly || false}
                        minimal={false}
                        onUpdate={handleContentUpdate}
                        nodeId={nodeId}
                        selectionIslandPortalId={selectionIslandPortalId}
                        hideBlockHandles={hideBlockHandles}
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
