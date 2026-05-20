import { useState, useCallback, useEffect, useRef } from 'react';
import { Trash2, Copy, Palette, Layers, X, ArrowUpRight } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './MultiSelectionToolbar.module.css';

export function MultiSelectionToolbar() {
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const bulkDeleteNodes = useStore(s => s.bulkDeleteNodes);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const bulkApplyColor = useStore(s => s.bulkApplyColor);
    const fuseNodes = useStore(s => s.fuseNodes);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);

    const selectedCount = selectedCanvasNodeIds.size;

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

    // Get bulk action handlers from store
    const handleBulkDelete = useCallback(() => {
        console.log('[MultiSelectionToolbar] Delete clicked, selected:', Array.from(selectedCanvasNodeIds));
        setShowDeleteConfirm(true);
    }, [selectedCanvasNodeIds]);

    const confirmDelete = useCallback(() => {
        console.log('[MultiSelectionToolbar] Delete confirmed, calling bulkDeleteNodes with IDs:', Array.from(selectedCanvasNodeIds));
        bulkDeleteNodes(Array.from(selectedCanvasNodeIds));
        clearCanvasSelection();
        setShowDeleteConfirm(false);
        console.log('[MultiSelectionToolbar] Delete completed, selection cleared');
    }, [selectedCanvasNodeIds, bulkDeleteNodes, clearCanvasSelection]);

    const cancelDelete = useCallback(() => {
        console.log('[MultiSelectionToolbar] Delete cancelled by user');
        setShowDeleteConfirm(false);
    }, []);

    const handleBulkDuplicate = useCallback(() => {
        console.log('[MultiSelectionToolbar] Duplicate clicked, selected:', Array.from(selectedCanvasNodeIds));
        bulkDuplicateNodes(Array.from(selectedCanvasNodeIds));
        clearCanvasSelection();
    }, [selectedCanvasNodeIds, clearCanvasSelection, bulkDuplicateNodes]);

    const handleBulkColor = useCallback((color: string) => {
        console.log('[MultiSelectionToolbar] Color clicked, color:', color, 'selected:', Array.from(selectedCanvasNodeIds));
        bulkApplyColor(Array.from(selectedCanvasNodeIds), color);
        setShowColorPicker(false);
    }, [selectedCanvasNodeIds, bulkApplyColor]);

    const handleFuseNodes = useCallback(() => {
        console.log('[MultiSelectionToolbar] Fuse clicked, selected:', Array.from(selectedCanvasNodeIds));
        fuseNodes(Array.from(selectedCanvasNodeIds));
        clearCanvasSelection();
    }, [selectedCanvasNodeIds, clearCanvasSelection, fuseNodes]);



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
            ) : showDeleteConfirm ? (
                // Delete Confirmation UI
                <div className={styles.confirmContainer}>
                    <span className={styles.confirmText}>
                        Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}?
                    </span>
                    <div className={styles.confirmActions}>
                        <button
                            className={`${styles.actionBtn} ${styles.delete}`}
                            onClick={confirmDelete}
                        >
                            <Trash2 size={16} />
                            <span>Confirm</span>
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={cancelDelete}
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
                        <button
                            className={styles.actionBtn}
                            onClick={handleBulkDuplicate}
                            title="Duplicate selected items"
                        >
                            <Copy size={16} />
                            <span>Duplicate</span>
                        </button>

                        <div className={styles.colorPickerTrigger} ref={colorPickerRef}>
                            <button
                                className={styles.actionBtn}
                                onClick={() => setShowColorPicker(!showColorPicker)}
                                title="Apply color to selected items"
                            >
                                <Palette size={16} />
                                <span>Color</span>
                            </button>

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
                                <button
                                    className={`${styles.actionBtn} ${styles.primary}`}
                                    onClick={handleFuseNodes}
                                    title="Fuse selected items into one container"
                                >
                                    <Layers size={16} />
                                    <span>Fuse</span>
                                </button>

                                <button
                                    className={styles.actionBtn}
                                    onClick={() => setIsLinkingMode(true)}
                                    title="Link selected nodes with lines from a main node"
                                >
                                    <ArrowUpRight size={16} />
                                    <span>Link</span>
                                </button>
                            </>
                        )}

                        <div className={styles.separator} />

                        <button
                            className={`${styles.actionBtn} ${styles.delete}`}
                            onClick={handleBulkDelete}
                            title="Delete selected items"
                        >
                            <Trash2 size={16} />
                            <span>Delete</span>
                        </button>
                    </div>

                    <button
                        className={styles.closeBtn}
                        onClick={clearCanvasSelection}
                        title="Clear selection"
                    >
                        <X size={16} />
                    </button>
                </>
            )}
        </div>
    );
}
