import { useState, useRef, useEffect } from 'react';
import {
    Trash2,
    Copy,
    Layers,
    X,
    Zap,
    Type,
    Spline,
    Workflow,
    Minus,
    Activity
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './EdgeEditingToolbar.module.css';

export function EdgeEditingToolbar() {
    const selectedEdgeId = useStore((s) => s.selectedEdgeId);
    const selectedEdgeIds = useStore((s) => s.selectedEdgeIds);
    const edges = useStore((s) => s.edges);
    const updateEdge = useStore((s) => s.updateEdge);
    const deleteEdge = useStore((s) => s.deleteEdge);
    const duplicateEdge = useStore((s) => s.duplicateEdge);
    const bringEdgeToFront = useStore((s) => s.bringEdgeToFront);
    const setSelectedEdgeId = useStore((s) => s.setSelectedEdgeId);

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);

    // Find all currently selected edges
    const selectedEdges = edges.filter(
        (e) => (selectedEdgeIds && selectedEdgeIds.has(e.id)) || e.id === selectedEdgeId
    );

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

    if (selectedEdges.length === 0) return null;

    const isMultiSelect = selectedEdges.length > 1;

    // Helper to get common value or empty/fallback if mixed
    const getCommonValue = <T,>(key: string, fallback: T): T => {
        if (selectedEdges.length === 0) return fallback;
        const firstVal = (selectedEdges[0].data as any)?.[key] ?? fallback;
        const allSame = selectedEdges.every((e) => ((e.data as any)?.[key] ?? fallback) === firstVal);
        return allSame ? firstVal : ('' as any);
    };

    // Retrieve active edge styles with robust fallbacks
    const edgeType = getCommonValue<'bezier' | 'smoothstep' | 'straight' | 'step'>('edgeType', 'bezier');
    const lineStyle = getCommonValue<'solid' | 'dashed' | 'dotted'>('lineStyle', 'solid');
    const strokeWidth = getCommonValue<number>('strokeWidth', 1.75);
    const markerEndType = getCommonValue<'none' | 'arrow' | 'circle'>('markerEndType', 'arrow');
    const isAnimated = selectedEdges.every((e) => e.animated || (e.data as any)?.animated);
    const label = getCommonValue<string>('label', '');
    const activeColor = getCommonValue<string>('color', 'transparent');

    // Premium Color Swatches
    const colors = [
        { name: 'Default', value: 'transparent', displayValue: '#94a3b8' },
        { name: 'Red', value: '#ef4444', displayValue: '#ef4444' },
        { name: 'Orange', value: '#f97316', displayValue: '#f97316' },
        { name: 'Yellow', value: '#eab308', displayValue: '#eab308' },
        { name: 'Green', value: '#22c55e', displayValue: '#22c55e' },
        { name: 'Blue', value: '#3b82f6', displayValue: '#3b82f6' },
        { name: 'Purple', value: '#8b5cf6', displayValue: '#8b5cf6' },
        { name: 'Pink', value: '#ec4899', displayValue: '#ec4899' },
        { name: 'Gray', value: '#64748b', displayValue: '#64748b' }
    ];

    // Live-Update property handlers (batch updates across all selected edges)
    const handleColorChange = (color: string) => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, color: color === 'transparent' ? undefined : color }
            });
        });
        setShowColorPicker(false);
    };

    const handleWidthChange = (width: number) => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, strokeWidth: width }
            });
        });
    };

    const handleCurveChange = (type: 'bezier' | 'smoothstep' | 'straight' | 'step') => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, edgeType: type }
            });
        });
    };

    const handleLineStyleChange = (styleName: 'solid' | 'dashed' | 'dotted') => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, lineStyle: styleName }
            });
        });
    };

    const handleMarkerChange = (type: 'none' | 'arrow' | 'circle') => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, markerEndType: type }
            });
        });
    };

    const handleAnimationToggle = () => {
        const nextAnimated = !isAnimated;
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                animated: nextAnimated,
                data: { ...edge.data, animated: nextAnimated }
            });
        });
    };

    const handleLabelChange = (text: string) => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                label: text,
                data: { ...edge.data, label: text }
            });
        });
    };

    const handleDuplicate = () => {
        selectedEdges.forEach(edge => {
            duplicateEdge(edge.id);
        });
        setSelectedEdgeId(null);
    };

    const handleBringToFront = () => {
        selectedEdges.forEach(edge => {
            bringEdgeToFront(edge.id);
        });
    };

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        selectedEdges.forEach(edge => {
            deleteEdge(edge.id);
        });
        setSelectedEdgeId(null);
        setShowDeleteConfirm(false);
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
    };

    return (
        <div className={styles.toolbar}>
            {showDeleteConfirm ? (
                // Delete Confirmation Overlay
                <div className={styles.confirmContainer}>
                    <span className={styles.confirmText}>
                        Delete this connection?
                    </span>
                    <div className={styles.confirmActions}>
                        <button
                            className={`${styles.actionBtn} ${styles.delete}`}
                            onClick={confirmDelete}
                        >
                            <Trash2 size={15} />
                            <span>Confirm</span>
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={cancelDelete}
                        >
                            <X size={15} />
                            <span>Cancel</span>
                        </button>
                    </div>
                </div>
            ) : (
                // Full glassmorphic edge editor controls
                <>
                    <div className={styles.selectionInfo}>
                        <div className={styles.glowDot} style={{ backgroundColor: activeColor && activeColor !== 'transparent' ? activeColor : 'var(--color-primary)' } as React.CSSProperties} />
                        <span>{isMultiSelect ? `${selectedEdges.length} Edges Selected` : 'Edge Selected'}</span>
                    </div>

                    <div className={styles.actions}>
                        {/* 1. Curve Type Segment Selector */}
                        <div className={styles.segmentControl} title="Curve type">
                            <button
                                className={`${styles.segmentBtn} ${edgeType === 'bezier' ? styles.active : ''}`}
                                onClick={() => handleCurveChange('bezier')}
                                title="Bezier Curve"
                            >
                                <Spline size={14} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${edgeType === 'smoothstep' ? styles.active : ''}`}
                                onClick={() => handleCurveChange('smoothstep')}
                                title="Smooth Corners"
                            >
                                <Workflow size={14} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${edgeType === 'straight' ? styles.active : ''}`}
                                onClick={() => handleCurveChange('straight')}
                                title="Straight Line"
                            >
                                <Minus size={14} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${edgeType === 'step' ? styles.active : ''}`}
                                onClick={() => handleCurveChange('step')}
                                title="Orthogonal Steps"
                            >
                                <Activity size={14} />
                            </button>
                        </div>

                        {/* 2. Line Style Selector (Solid, Dashed, Dotted) */}
                        <div className={styles.segmentControl} title="Line Style">
                            <button
                                className={`${styles.segmentBtn} ${lineStyle === 'solid' ? styles.active : ''}`}
                                onClick={() => handleLineStyleChange('solid')}
                                title="Solid Line"
                            >
                                <span className={styles.lineIndicatorSolid} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${lineStyle === 'dashed' ? styles.active : ''}`}
                                onClick={() => handleLineStyleChange('dashed')}
                                title="Dashed Line"
                            >
                                <span className={styles.lineIndicatorDashed} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${lineStyle === 'dotted' ? styles.active : ''}`}
                                onClick={() => handleLineStyleChange('dotted')}
                                title="Dotted Line"
                            >
                                <span className={styles.lineIndicatorDotted} />
                            </button>
                        </div>

                        {/* 3. Stroke Thickness Selector */}
                        <div className={styles.segmentControl} title="Stroke Width">
                            <button
                                className={`${styles.segmentBtn} ${strokeWidth === 1.75 ? styles.active : ''}`}
                                onClick={() => handleWidthChange(1.75)}
                                title="Thin"
                            >
                                <span className={styles.widthIndicatorThin} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${strokeWidth === 3 ? styles.active : ''}`}
                                onClick={() => handleWidthChange(3)}
                                title="Medium"
                            >
                                <span className={styles.widthIndicatorMedium} />
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${strokeWidth === 5 ? styles.active : ''}`}
                                onClick={() => handleWidthChange(5)}
                                title="Thick"
                            >
                                <span className={styles.widthIndicatorThick} />
                            </button>
                        </div>

                        {/* 4. End Marker Arrow Selector */}
                        <div className={styles.segmentControl} title="End Marker">
                            <button
                                className={`${styles.segmentBtn} ${markerEndType === 'none' ? styles.active : ''}`}
                                onClick={() => handleMarkerChange('none')}
                                title="None"
                            >
                                <span className={styles.markerNone}>—</span>
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${markerEndType === 'arrow' ? styles.active : ''}`}
                                onClick={() => handleMarkerChange('arrow')}
                                title="Arrow"
                            >
                                <span className={styles.markerArrow}>➔</span>
                            </button>
                            <button
                                className={`${styles.segmentBtn} ${markerEndType === 'circle' ? styles.active : ''}`}
                                onClick={() => handleMarkerChange('circle')}
                                title="Circle"
                            >
                                <span className={styles.markerCircle}>●</span>
                            </button>
                        </div>

                        {/* 5. Custom Color Picker Trigger */}
                        <div className={styles.colorPickerTrigger} ref={colorPickerRef}>
                            <button
                                className={`${styles.actionBtn} ${activeColor && activeColor !== 'transparent' ? styles.coloredBorder : ''}`}
                                style={activeColor && activeColor !== 'transparent' ? { borderColor: activeColor } as React.CSSProperties : undefined}
                                onClick={() => setShowColorPicker(!showColorPicker)}
                                title="Connection Color"
                            >
                                <div
                                    className={styles.colorIndicator}
                                    style={{ backgroundColor: activeColor && activeColor !== 'transparent' ? activeColor : 'var(--color-text-muted)' } as React.CSSProperties}
                                />
                                <span>Color</span>
                            </button>

                            {showColorPicker && (
                                <div className={styles.colorPopover}>
                                    <div className={styles.colorLabel}>Connection Color</div>
                                    <div className={styles.colorGrid}>
                                        {colors.map(color => (
                                            <button
                                                key={color.value}
                                                className={`${styles.colorOption} ${activeColor === color.value ? styles.selectedColor : ''}`}
                                                style={{ backgroundColor: color.displayValue }}
                                                onClick={() => handleColorChange(color.value)}
                                                title={color.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 6. Label Text Input */}
                        <div className={styles.inputWrapper}>
                            <Type size={14} className={styles.inputIcon} />
                            <input
                                type="text"
                                className={styles.labelInput}
                                placeholder={isMultiSelect ? "Add label to all..." : "Add label..."}
                                value={label || ''}
                                onChange={(e) => handleLabelChange(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        <div className={styles.separator} />

                        {/* 7. Glowing Animation Toggle */}
                        <button
                            className={`${styles.actionBtn} ${isAnimated ? styles.animationActive : ''}`}
                            onClick={handleAnimationToggle}
                            title="Toggle flow animation"
                        >
                            <Zap size={14} className={isAnimated ? styles.pulsingIcon : ''} />
                            <span>Animate</span>
                        </button>

                        {/* 8. Layer Arrangement: Bring to Front */}
                        <button
                            className={styles.actionBtn}
                            onClick={handleBringToFront}
                            title="Bring connection to front"
                        >
                            <Layers size={14} />
                            <span>Bring Front</span>
                        </button>

                        {/* 9. Duplicate connection */}
                        <button
                            className={styles.actionBtn}
                            onClick={handleDuplicate}
                            title="Duplicate connection"
                        >
                            <Copy size={14} />
                            <span>Duplicate</span>
                        </button>

                        <div className={styles.separator} />

                        {/* 10. Delete Edge */}
                        <button
                            className={`${styles.actionBtn} ${styles.delete}`}
                            onClick={handleDeleteClick}
                            title="Delete connection"
                        >
                            <Trash2 size={14} />
                            <span>Delete</span>
                        </button>
                    </div>

                    {/* 11. Close Panel */}
                    <button
                        className={styles.closeBtn}
                        onClick={() => setSelectedEdgeId(null)}
                        title="Close Toolbar"
                    >
                        <X size={15} />
                    </button>
                </>
            )}
        </div>
    );
}
