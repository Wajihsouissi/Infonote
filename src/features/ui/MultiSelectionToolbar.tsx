import { useState, useCallback, useEffect, useRef } from 'react';
import { Trash2, Copy, Palette, Layers, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './MultiSelectionToolbar.module.css';
import { toPastelColor } from '../../utils/colorUtils';

export function MultiSelectionToolbar() {
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const bulkDeleteNodes = useStore(s => s.bulkDeleteNodes);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const bulkApplyColor = useStore(s => s.bulkApplyColor);
    const fuseNodes = useStore(s => s.fuseNodes);
    const theme = useStore(s => s.theme);
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

    const isLightMode = theme === 'light';

    const colors = [
        { name: 'Default', value: 'transparent', displayValue: '#1a1a1a' },
        { name: 'Red', value: '#ef4444', displayValue: toPastelColor('#ef4444', isLightMode) },
        { name: 'Orange', value: '#f97316', displayValue: toPastelColor('#f97316', isLightMode) },
        { name: 'Yellow', value: '#eab308', displayValue: toPastelColor('#eab308', isLightMode) },
        { name: 'Green', value: '#22c55e', displayValue: toPastelColor('#22c55e', isLightMode) },
        { name: 'Blue', value: '#3b82f6', displayValue: toPastelColor('#3b82f6', isLightMode) },
        { name: 'Purple', value: '#a855f7', displayValue: toPastelColor('#a855f7', isLightMode) },
        { name: 'Pink', value: '#ec4899', displayValue: toPastelColor('#ec4899', isLightMode) },
        { name: 'Gray', value: '#6b7280', displayValue: toPastelColor('#6b7280', isLightMode) },
        { name: 'Cyan', value: '#06b6d4', displayValue: toPastelColor('#06b6d4', isLightMode) },
        { name: 'Teal', value: '#14b8a6', displayValue: toPastelColor('#14b8a6', isLightMode) },
        { name: 'Lime', value: '#84cc16', displayValue: toPastelColor('#84cc16', isLightMode) },
    ];

    return (
        <div className={styles.toolbar}>
            {showDeleteConfirm ? (
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
                                                className={styles.colorOption}
                                                style={{ backgroundColor: color.displayValue }}
                                                onClick={() => handleBulkColor(color.value)}
                                                title={color.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedCount > 1 && (
                            <button
                                className={`${styles.actionBtn} ${styles.primary}`}
                                onClick={handleFuseNodes}
                                title="Fuse selected items into one container"
                            >
                                <Layers size={16} />
                                <span>Fuse</span>
                            </button>
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
