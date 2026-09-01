import { useState, useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
    Trash2, Copy, Palette, Layers, X, ArrowUpRight, ArrowRight, GitBranch,
    Grid3x3, CircleDot, ArrowRightLeft, Columns2, Rows2, Network, Sparkles,
    Eye, Scissors,
    Square, RectangleHorizontal, StickyNote, PanelTop, Folder
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import { Tooltip } from './Tooltip';
import styles from './MultiSelectionToolbar.module.css';
import type { AppNode } from '../../types';

interface MultiSelectionToolbarProps {
    isActive?: boolean;
}

const getSelectedIds = () => Array.from(useStore.getState().selectedCanvasNodeIds);

export function MultiSelectionToolbar({ isActive = true }: MultiSelectionToolbarProps) {
    const { screenToFlowPosition } = useReactFlow();
    const selectedCount = useStore(s => s.selectedCanvasNodeIds.size);
    const selectedNodeId = useStore(s => s.selectedCanvasNodeIds.size === 1
        ? s.selectedCanvasNodeIds.values().next().value ?? null
        : null);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const requestNodeDeletion = useStore(s => s.requestNodeDeletion);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const bulkApplyColor = useStore(s => s.bulkApplyColor);
    const fuseNodes = useStore(s => s.fuseNodes);
    const releaseNodeContentToBlocks = useStore(s => s.releaseNodeContentToBlocks);
    const selectConnectedCanvasNodes = useStore(s => s.selectConnectedCanvasNodes);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const setNodes = useStore(s => s.setNodes);
    const setChunkItNodeId = useStore(s => s.setChunkItNodeId);
    
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showLayoutPopover, setShowLayoutPopover] = useState(false);
    const [showViewsPopover, setShowViewsPopover] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const layoutPopoverRef = useRef<HTMLDivElement>(null);
    const viewsPopoverRef = useRef<HTMLDivElement>(null);
    const arrangeNodes = useStore(s => s.arrangeNodes);

    const clearSelectionFully = useCallback(() => {
        clearCanvasSelection();
    }, [clearCanvasSelection]);

    useEffect(() => {
        if (isActive) return;
        // The toolbar is being unmounted/hidden by its parent. Defer the local
        // cleanup one frame so React never has to synchronously re-render this
        // component while processing that parent visibility change.
        const frame = requestAnimationFrame(() => {
            setShowColorPicker(false);
            setShowLayoutPopover(false);
            setShowViewsPopover(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [isActive]);

    // Close on Escape or click away
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                clearSelectionFully();
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Ignore if clicking inside the toolbar
            if (target.closest(`.${styles.toolbar}`)) return;
            // Ignore if clicking on a node (React Flow handles selection there)
            if (target.closest('.react-flow__node')) return;
            /* Ignore app chrome — panels, menus and modals docked beside the
               canvas. Selecting cards and then clicking into the AI composer to
               write a prompt *about* them cleared the selection the moment the
               input took focus, so the panel lost its context mid-sentence.
               Acting on a selection is not abandoning it. Same `[data-app-menu]`
               marker SidePeek uses for its own click-away guard. */
            if (target.closest('[data-app-menu]')) return;
            // Otherwise, clear selection
            clearSelectionFully();
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [clearSelectionFully, isActive]);

    // Close color picker when clicking outside
    useEffect(() => {
        if (!showColorPicker) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
                setShowColorPicker(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker]);

    // Close layout popover when clicking outside
    useEffect(() => {
        if (!showLayoutPopover) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (layoutPopoverRef.current && !layoutPopoverRef.current.contains(event.target as Node)) {
                setShowLayoutPopover(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showLayoutPopover]);

    // Close views popover when clicking outside
    useEffect(() => {
        if (!showViewsPopover) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (viewsPopoverRef.current && !viewsPopoverRef.current.contains(event.target as Node)) {
                setShowViewsPopover(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showViewsPopover]);

    // Get bulk action handlers from store
    const handleBulkDelete = useCallback(() => {
        const selectedIds = getSelectedIds();
        requestNodeDeletion(selectedIds);
    }, [requestNodeDeletion]);

    const handleBulkDuplicate = useCallback(() => {
        const selectedIds = getSelectedIds();
        console.log('[MultiSelectionToolbar] Duplicate clicked, selected:', selectedIds);
        bulkDuplicateNodes(selectedIds);
        clearSelectionFully();
    }, [clearSelectionFully, bulkDuplicateNodes]);

    const handleBulkColor = useCallback((color: string) => {
        const selectedIds = getSelectedIds();
        console.log('[MultiSelectionToolbar] Color clicked, color:', color, 'selected:', selectedIds);
        bulkApplyColor(selectedIds, color);
        setShowColorPicker(false);
    }, [bulkApplyColor]);

    const handleFuseNodes = useCallback(() => {
        const selectedIds = getSelectedIds();
        console.log('[MultiSelectionToolbar] Fuse clicked, selected:', selectedIds);
        fuseNodes(selectedIds);
        clearSelectionFully();
    }, [clearSelectionFully, fuseNodes]);

    const handleRelease = useCallback(() => {
        const selectedId = getSelectedIds()[0];
        if (!selectedId) return;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowCenter = screenToFlowPosition({ x: centerX, y: centerY });
        releaseNodeContentToBlocks(selectedId, flowCenter, true);
        clearSelectionFully();
    }, [releaseNodeContentToBlocks, clearSelectionFully, screenToFlowPosition]);

    const handleSelectConnected = useCallback(() => {
        const selectedId = getSelectedIds()[0];
        if (!selectedId) return;
        selectConnectedCanvasNodes(selectedId);
    }, [selectConnectedCanvasNodes]);

    const handleArrange = useCallback((mode: 'grid' | 'circle' | 'flow' | 'horizontal-row' | 'vertical-column' | 'mindmap-horizontal' | 'mindmap-vertical' | 'related-clusters') => {
        arrangeNodes(getSelectedIds(), mode);
        setShowLayoutPopover(false);
    }, [arrangeNodes]);

    const handleSetViewMode = useCallback((mode: string) => {
        const selectedIds = useStore.getState().selectedCanvasNodeIds;
        setNodes(nodes => nodes.map(n => {
            if (selectedIds.has(n.id) && n.type === 'note') {
                let w = n.style?.width; let h = n.style?.height;
                if (mode === 'icon') { w = 96; h = 96; }
                // Folders stand on the canvas with no panel around them, so they
                // carry a larger footprint than the icon card they replace.
                else if (mode === 'folder') { w = 120; h = 120; }
                else if (mode === 'titleview') { w = 208; h = 56; }
                else if (mode === 'medium') { w = 208; h = 208; }
                else if (mode === 'expanded') { w = 432; h = 432; }
                return {
                    ...n,
                    style: { ...n.style, width: w, height: h },
                    data: { ...n.data, viewMode: mode }
                } as AppNode;
            }
            return n;
        }));
        setShowViewsPopover(false);
    }, [setNodes]);

    const layoutOptions: { mode: typeof handleArrange extends (mode: infer M) => void ? M : never; label: string; desc: string; icon: React.ReactNode }[] = [
        { mode: 'related-clusters', label: 'Smart', desc: 'Group related cards into tidy clusters', icon: <Sparkles size={18} /> },
        { mode: 'grid', label: 'Grid', desc: 'Arrange in rows and columns', icon: <Grid3x3 size={18} /> },
        { mode: 'circle', label: 'Circle', desc: 'Arrange in a circular pattern', icon: <CircleDot size={18} /> },
        { mode: 'flow', label: 'Flow', desc: 'Left-to-right reading order', icon: <ArrowRightLeft size={18} /> },
        { mode: 'horizontal-row', label: 'Horizontal Row', desc: 'Evenly spaced in a single row', icon: <Columns2 size={18} /> },
        { mode: 'vertical-column', label: 'Vertical Column', desc: 'Evenly spaced in a single column', icon: <Rows2 size={18} /> },
        { mode: 'mindmap-horizontal', label: 'Mindmap (Horz)', desc: 'Horizontal tree structure', icon: <GitBranch size={18} /> },
        { mode: 'mindmap-vertical', label: 'Mindmap (Vert)', desc: 'Vertical tree structure', icon: <Network size={18} /> },
    ] as const;

    /* The accent palette from design-system.css §7 — the same ten hues a board
       column offers, so "rose" means one colour everywhere in the app rather
       than one per feature. Stored as the `var(--a-…)` reference rather than a
       resolved hex, which is what lets a node keep its identity when the theme
       flips between Ink and Paper. */
    const colors = [
        { name: 'Default', value: 'transparent', displayValue: 'transparent' },
        /* Names say what the swatch actually is. Three of these read "Orange",
           "Pale Orange" and "Deep Orange" while pointing at teal, azure and
           indigo — labels left over from a palette this list no longer uses, so
           picking "Orange" handed you a cyan card. */
        { name: 'Coral red', value: 'var(--a-rose)', displayValue: 'var(--a-rose)' },
        { name: 'Amber', value: 'var(--a-amber)', displayValue: 'var(--a-amber)' },
        { name: 'Yellow amber', value: 'var(--a-citrine)', displayValue: 'var(--a-citrine)' },
        { name: 'Olive', value: 'var(--a-olive)', displayValue: 'var(--a-olive)' },
        { name: 'Jade', value: 'var(--a-jade)', displayValue: 'var(--a-jade)' },
        { name: 'Teal', value: 'var(--a-teal)', displayValue: 'var(--a-teal)' },
        { name: 'Azure', value: 'var(--a-azure)', displayValue: 'var(--a-azure)' },
        { name: 'Indigo', value: 'var(--a-indigo)', displayValue: 'var(--a-indigo)' },
        { name: 'Purple', value: 'var(--a-violet)', displayValue: 'var(--a-violet)' },
        { name: 'Red pink', value: 'var(--a-magenta)', displayValue: 'var(--a-magenta)' },
    ];

    return (
        <div className={styles.toolbar}>
            {isLinkingMode ? (
                // Linking Mode UI
                <div className={styles.confirmContainer}>
                    <span className={styles.confirmText} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={styles.pulseDot} />
                        Choose the central node to link all selected nodes
                    </span>
                    <div className={styles.confirmActions}>
                        <button
                            className={styles.actionBtn}
                            onClick={() => setIsLinkingMode(false)}
                        >
                            <X size={16} />
                            <span>Cancel</span>
                        </button>
                    </div>
                </div>
            ) : (
                // Normal Toolbar UI
                <>
                    <div className={styles.selectionInfo}>
                        <span className={styles.count}>{selectedCount}</span>
                        <span>item{selectedCount > 1 ? 's' : ''} selected</span>
                    </div>

                    <div className={styles.actions}>
                        <div className={styles.actionGroup} aria-label="Appearance actions">
                            <div className={styles.layoutTrigger} ref={viewsPopoverRef}>
                                <Tooltip label="View Mode" desc="Change card view mode">
                                    <button className={styles.actionBtn} onClick={() => setShowViewsPopover(!showViewsPopover)}>
                                        <Eye size={16} />
                                    </button>
                                </Tooltip>

                                {showViewsPopover && (
                                    <div className={styles.layoutPopover} style={{ minWidth: '150px' }}>
                                        <div className={styles.layoutLabel}>View Mode</div>
                                        <div className={styles.layoutGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                            <Tooltip label="Icon" desc="Icon only"><button className={styles.layoutOption} onClick={() => handleSetViewMode('icon')}><Square size={14} /></button></Tooltip>
                                            <Tooltip label="Folder" desc="Folder with cover & icon"><button className={styles.layoutOption} onClick={() => handleSetViewMode('folder')}><Folder size={18} /></button></Tooltip>
                                            <Tooltip label="Title" desc="Icon + Title"><button className={styles.layoutOption} onClick={() => handleSetViewMode('titleview')}><RectangleHorizontal size={18} /></button></Tooltip>
                                            <Tooltip label="Medium" desc="Medium card"><button className={styles.layoutOption} onClick={() => handleSetViewMode('medium')}><StickyNote size={18} /></button></Tooltip>
                                            <Tooltip label="Expanded" desc="Expanded card"><button className={styles.layoutOption} onClick={() => handleSetViewMode('expanded')}><PanelTop size={18} /></button></Tooltip>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={styles.colorPickerTrigger} ref={colorPickerRef}>
                                <Tooltip label="Color" desc="Apply color to selected items">
                                    <button className={styles.actionBtn} onClick={() => setShowColorPicker(!showColorPicker)}>
                                        <Palette size={16} />
                                    </button>
                                </Tooltip>

                                {showColorPicker && (
                                    <div className={styles.colorPopover}>
                                        <div className={styles.colorLabel}>Apply Color</div>
                                        <div className={styles.colorGrid}>
                                            {colors.map(color => (
                                                <button key={color.value} className={`${styles.colorOption} ${color.value === 'transparent' ? styles.transparentOption : ''}`} style={{ backgroundColor: color.value === 'transparent' ? undefined : color.displayValue }} onClick={() => handleBulkColor(color.value)} title={color.name}>
                                                    {color.value === 'transparent' && <span className={styles.transparentSlash} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.actionGroup} aria-label="Content actions">
                            {selectedCount === 1 && selectedNodeId && (
                                <Tooltip label="Chunk it" desc="Split card content into multiple pieces">
                                    <button className={styles.actionBtn} onClick={() => setChunkItNodeId(selectedNodeId)}>
                                        <Scissors size={16} />
                                    </button>
                                </Tooltip>
                            )}
                            <Tooltip label="Duplicate" desc="Duplicate selected items">
                                <button className={styles.actionBtn} onClick={handleBulkDuplicate}>
                                    <Copy size={16} />
                                </button>
                            </Tooltip>
                            {selectedCount === 1 && (
                                <Tooltip label="Release" desc="Release node content into blocks on canvas">
                                    <button className={`${styles.actionBtn} ${styles.primary}`} onClick={handleRelease}>
                                        <ArrowRight size={16} />
                                    </button>
                                </Tooltip>
                            )}
                        </div>

                        {selectedCount > 1 && (
                            <div className={styles.actionGroup} aria-label="Arrange selected items">
                                <Tooltip label="Fuse" desc="Fuse selected items into one container">
                                    <button
                                        className={`${styles.actionBtn} ${styles.primary}`}
                                        onClick={handleFuseNodes}
                                    >
                                        <Layers size={16} />
                                    </button>
                                </Tooltip>

                                <Tooltip label="Link" desc="Link selected nodes with lines from a main node">
                                    <button
                                        className={styles.actionBtn}
                                        onClick={() => setIsLinkingMode(true)}
                                    >
                                        <ArrowUpRight size={16} />
                                    </button>
                                </Tooltip>

                                <div className={styles.layoutTrigger} ref={layoutPopoverRef}>
                                    <Tooltip label="Layout" desc="Arrange selected nodes">
                                        <button
                                            className={styles.actionBtn}
                                            onClick={() => setShowLayoutPopover(!showLayoutPopover)}
                                        >
                                            <Grid3x3 size={16} />
                                        </button>
                                    </Tooltip>

                                    {showLayoutPopover && (
                                        <div className={styles.layoutPopover}>
                                            <div className={styles.layoutLabel}>Arrange Layout</div>
                                            <div className={styles.layoutGrid}>
                                                    {layoutOptions.map(opt => (
                                                        <Tooltip key={opt.mode} label={opt.label} desc={opt.desc}>
                                                            <button
                                                                className={styles.layoutOption}
                                                                onClick={() => handleArrange(opt.mode)}
                                                            >
                                                                {opt.icon}
                                                            </button>
                                                        </Tooltip>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedCount === 1 && (
                            <div className={styles.actionGroup} aria-label="Connection actions">
                                <Tooltip label="Connected" desc="Select all nodes connected to this node">
                                    <button
                                        className={styles.actionBtn}
                                        onClick={handleSelectConnected}
                                    >
                                        <GitBranch size={16} />
                                    </button>
                                </Tooltip>
                            </div>
                        )}

                        <div className={styles.separator} />

                        <Tooltip label="Delete" desc="Delete selected items">
                            <button
                                className={`${styles.actionBtn} ${styles.delete}`}
                                onClick={handleBulkDelete}
                            >
                                <Trash2 size={16} />
                            </button>
                        </Tooltip>
                    </div>

                    <Tooltip label="Close" desc="Clear selection">
                        <button
                            className={styles.closeBtn}
                            onClick={clearSelectionFully}
                        >
                            <X size={16} />
                        </button>
                    </Tooltip>
                </>
            )}
        </div>
    );
}
