import { useState, useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
    Trash2, Copy, Palette, Layers, X, ArrowUpRight, ArrowRight, GitBranch,
    Grid3x3, CircleDot, ArrowRightLeft, Columns2, Rows2, Network, Sparkles,
    Search,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Tooltip } from './Tooltip';
import styles from './MultiSelectionToolbar.module.css';

interface MultiSelectionToolbarProps {
    onOpenAI?: () => void;
    onOpenSearch?: () => void;
}

export function MultiSelectionToolbar({ onOpenAI, onOpenSearch }: MultiSelectionToolbarProps) {
    const { screenToFlowPosition } = useReactFlow();
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const bulkDeleteNodes = useStore(s => s.bulkDeleteNodes);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const bulkApplyColor = useStore(s => s.bulkApplyColor);
    const fuseNodes = useStore(s => s.fuseNodes);
    const releaseNodeContentToBlocks = useStore(s => s.releaseNodeContentToBlocks);
    const selectConnectedCanvasNodes = useStore(s => s.selectConnectedCanvasNodes);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showLayoutPopover, setShowLayoutPopover] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const layoutPopoverRef = useRef<HTMLDivElement>(null);
    const arrangeNodes = useStore(s => s.arrangeNodes);
    const setNodes = useStore(s => s.setNodes);

    const selectedCount = selectedCanvasNodeIds.size;

    const clearSelectionFully = useCallback(() => {
        clearCanvasSelection();
        setNodes(nds => nds.map(n => n.selected ? { ...n, selected: false } : n));
    }, [clearCanvasSelection, setNodes]);

    // Close on Escape or click away
    useEffect(() => {
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
            // Otherwise, clear selection
            clearSelectionFully();
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [clearSelectionFully]);

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

    // Get bulk action handlers from store
    const handleBulkDelete = useCallback(() => {
        console.log('[MultiSelectionToolbar] Delete clicked, selected:', Array.from(selectedCanvasNodeIds));
        bulkDeleteNodes(Array.from(selectedCanvasNodeIds));
        clearSelectionFully();
    }, [selectedCanvasNodeIds, bulkDeleteNodes, clearSelectionFully]);

    const handleBulkDuplicate = useCallback(() => {
        console.log('[MultiSelectionToolbar] Duplicate clicked, selected:', Array.from(selectedCanvasNodeIds));
        bulkDuplicateNodes(Array.from(selectedCanvasNodeIds));
        clearSelectionFully();
    }, [selectedCanvasNodeIds, clearSelectionFully, bulkDuplicateNodes]);

    const handleBulkColor = useCallback((color: string) => {
        console.log('[MultiSelectionToolbar] Color clicked, color:', color, 'selected:', Array.from(selectedCanvasNodeIds));
        bulkApplyColor(Array.from(selectedCanvasNodeIds), color);
        setShowColorPicker(false);
    }, [selectedCanvasNodeIds, bulkApplyColor]);

    const handleFuseNodes = useCallback(() => {
        console.log('[MultiSelectionToolbar] Fuse clicked, selected:', Array.from(selectedCanvasNodeIds));
        fuseNodes(Array.from(selectedCanvasNodeIds));
        clearSelectionFully();
    }, [selectedCanvasNodeIds, clearSelectionFully, fuseNodes]);

    const handleRelease = useCallback(() => {
        const selectedId = Array.from(selectedCanvasNodeIds)[0];
        if (!selectedId) return;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowCenter = screenToFlowPosition({ x: centerX, y: centerY });
        releaseNodeContentToBlocks(selectedId, flowCenter);
        clearSelectionFully();
    }, [selectedCanvasNodeIds, releaseNodeContentToBlocks, clearSelectionFully, screenToFlowPosition]);

    const handleSelectConnected = useCallback(() => {
        const selectedId = Array.from(selectedCanvasNodeIds)[0];
        if (!selectedId) return;
        selectConnectedCanvasNodes(selectedId);
    }, [selectedCanvasNodeIds, selectConnectedCanvasNodes]);

    const handleArrange = useCallback((mode: 'grid' | 'circle' | 'flow' | 'horizontal-row' | 'vertical-column' | 'mindmap-horizontal' | 'mindmap-vertical') => {
        arrangeNodes(Array.from(selectedCanvasNodeIds), mode);
        setShowLayoutPopover(false);
    }, [selectedCanvasNodeIds, arrangeNodes]);

    const layoutOptions: { mode: typeof handleArrange extends (mode: infer M) => void ? M : never; label: string; desc: string; icon: React.ReactNode }[] = [
        { mode: 'grid', label: 'Grid', desc: 'Arrange in rows and columns', icon: <Grid3x3 size={18} /> },
        { mode: 'circle', label: 'Circle', desc: 'Arrange in a circular pattern', icon: <CircleDot size={18} /> },
        { mode: 'flow', label: 'Flow', desc: 'Left-to-right reading order', icon: <ArrowRightLeft size={18} /> },
        { mode: 'horizontal-row', label: 'Horizontal Row', desc: 'Evenly spaced in a single row', icon: <Columns2 size={18} /> },
        { mode: 'vertical-column', label: 'Vertical Column', desc: 'Evenly spaced in a single column', icon: <Rows2 size={18} /> },
        { mode: 'mindmap-horizontal', label: 'Mindmap (Horz)', desc: 'Horizontal tree structure', icon: <GitBranch size={18} /> },
        { mode: 'mindmap-vertical', label: 'Mindmap (Vert)', desc: 'Vertical tree structure', icon: <Network size={18} /> },
    ] as const;

    const colors = [
        { name: 'Default', value: 'transparent', displayValue: 'transparent' },
        { name: 'Red', value: '#ef4444', displayValue: '#ef4444' },
        { name: 'Orange', value: '#f97316', displayValue: '#f97316' },
        { name: 'Yellow', value: '#eab308', displayValue: '#eab308' },
        { name: 'Green', value: '#22c55e', displayValue: '#22c55e' },
        { name: 'Blue', value: '#3b82f6', displayValue: '#3b82f6' },
        { name: 'Purple', value: '#a855f7', displayValue: '#a855f7' },
        { name: 'Pink', value: '#ec4899', displayValue: '#ec4899' },
        { name: 'Gray', value: '#6b7280', displayValue: '#6b7280' },
        { name: 'Cyan', value: '#06b6d4', displayValue: '#06b6d4' },
        { name: 'Teal', value: '#14b8a6', displayValue: '#14b8a6' },
        { name: 'Lime', value: '#84cc16', displayValue: '#84cc16' },
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
                        {onOpenAI && (
                            <Tooltip label="Ask AI" desc="Use AI to edit/modify selected cards">
                                <button
                                    className={`${styles.actionBtn} ${styles.aiBtn}`}
                                    onClick={onOpenAI}
                                >
                                    <Sparkles size={16} />
                                </button>
                            </Tooltip>
                        )}

                        {onOpenSearch && (
                            <Tooltip label="AI Search" desc="Search your cards and notes">
                                <button
                                    className={`${styles.actionBtn} ${styles.searchBtn}`}
                                    onClick={onOpenSearch}
                                >
                                    <Search size={16} />
                                </button>
                            </Tooltip>
                        )}

                        <Tooltip label="Duplicate" desc="Duplicate selected items">
                            <button
                                className={styles.actionBtn}
                                onClick={handleBulkDuplicate}
                            >
                                <Copy size={16} />
                            </button>
                        </Tooltip>

                        <div className={styles.colorPickerTrigger} ref={colorPickerRef}>
                            <Tooltip label="Color" desc="Apply color to selected items">
                                <button
                                    className={styles.actionBtn}
                                    onClick={() => setShowColorPicker(!showColorPicker)}
                                >
                                    <Palette size={16} />
                                </button>
                            </Tooltip>

                            {showColorPicker && (
                                <div className={styles.colorPopover}>
                                    <div className={styles.colorLabel}>Apply Color</div>
                                    <div className={styles.colorGrid}>
                                        {colors.map(color => (
                                            <button
                                                key={color.value}
                                                className={`${styles.colorOption} ${color.value === 'transparent' ? styles.transparentOption : ''}`}
                                                style={{ backgroundColor: color.value === 'transparent' ? undefined : color.displayValue }}
                                                onClick={() => handleBulkColor(color.value)}
                                                title={color.name}
                                            >
                                                {color.value === 'transparent' && (
                                                    <span className={styles.transparentSlash} />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedCount > 1 && (
                            <>
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
                                                                onClick={() => handleArrange(opt.mode as any)}
                                                            >
                                                                {opt.icon}
                                                            </button>
                                                        </Tooltip>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {selectedCount === 1 && (
                            <>
                                <Tooltip label="Release" desc="Release node content into blocks on canvas">
                                    <button
                                        className={`${styles.actionBtn} ${styles.primary}`}
                                        onClick={handleRelease}
                                    >
                                        <ArrowRight size={16} />
                                    </button>
                                </Tooltip>

                                <Tooltip label="Connected" desc="Select all nodes connected to this node">
                                    <button
                                        className={styles.actionBtn}
                                        onClick={handleSelectConnected}
                                    >
                                        <GitBranch size={16} />
                                    </button>
                                </Tooltip>
                            </>
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
