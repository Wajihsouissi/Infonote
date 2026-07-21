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
    Activity,
    Sliders
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
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const styleMenuRef = useRef<HTMLDivElement>(null);

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

    // Close style menu when clicking outside
    useEffect(() => {
        if (!showStyleMenu) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (styleMenuRef.current && !styleMenuRef.current.contains(event.target as Node)) {
                setShowStyleMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showStyleMenu]);

    if (selectedEdges.length === 0) return null;

    const isMultiSelect = selectedEdges.length > 1;

    // Helper to get common value or empty/fallback if mixed
    const getCommonValue = <T,>(key: string, fallback: T): T => {
        if (selectedEdges.length === 0) return fallback;
        const readKey = (e: (typeof selectedEdges)[number]) =>
            ((e.data as Record<string, unknown> | undefined)?.[key] as T) ?? fallback;
        const firstVal = readKey(selectedEdges[0]);
        const allSame = selectedEdges.every((e) => readKey(e) === firstVal);
        return allSame ? firstVal : ('' as unknown as T);
    };

    // Retrieve active edge styles with robust fallbacks
    const edgeType = getCommonValue<'bezier' | 'smoothstep' | 'straight' | 'step'>('edgeType', 'bezier');
    const lineStyle = getCommonValue<'solid' | 'dashed' | 'dotted'>('lineStyle', 'solid');
    const strokeWidth = getCommonValue<number>('strokeWidth', 1.75);
    const markerStartType = getCommonValue<'none' | 'arrow' | 'circle'>('markerStartType', 'none');
    const markerEndType = getCommonValue<'none' | 'arrow' | 'circle'>('markerEndType', 'none');
    const isAnimated = selectedEdges.every((e) => e.animated || (e.data as Record<string, unknown> | undefined)?.animated);
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

    const handleMarkerStartChange = (type: 'none' | 'arrow' | 'circle') => {
        selectedEdges.forEach(edge => {
            updateEdge(edge.id, {
                data: { ...edge.data, markerStartType: type }
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
        selectedEdges.forEach(edge => {
            deleteEdge(edge.id);
        });
        setSelectedEdgeId(null);
    };

    return (
        <div className={styles.toolbar}>
            {/* Full glassmorphic edge editor controls */}
            <>
                    <div className={styles.selectionInfo}>
                        <div className={styles.glowDot} style={{ backgroundColor: activeColor && activeColor !== 'transparent' ? activeColor : 'var(--color-primary)' } as React.CSSProperties} />
                        <span>{isMultiSelect ? `${selectedEdges.length} Edges Selected` : 'Edge Selected'}</span>
                    </div>

                    <div className={styles.actions}>
                        {/* Style Selector Popover Trigger */}
                        <div className={styles.stylePickerTrigger} ref={styleMenuRef}>
                            <button
                                className={`${styles.actionBtn} ${showStyleMenu ? styles.activeStyleBtn : ''}`}
                                onClick={() => setShowStyleMenu(!showStyleMenu)}
                                title="Connection Style"
                            >
                                <Sliders size={14} />
                                <span>Style</span>
                            </button>

                            {showStyleMenu && (
                                <div className={styles.stylePopover}>
                                    {/* Curve Style */}
                                    <div className={styles.popoverSection}>
                                        <div className={styles.sectionTitle}>Curve Style</div>
                                        <div className={styles.popoverGrid}>
                                            <button
                                                className={`${styles.popoverOption} ${edgeType === 'bezier' ? styles.activeOption : ''}`}
                                                onClick={() => handleCurveChange('bezier')}
                                            >
                                                <Spline size={14} />
                                                <span>Bezier</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${edgeType === 'smoothstep' ? styles.activeOption : ''}`}
                                                onClick={() => handleCurveChange('smoothstep')}
                                            >
                                                <Workflow size={14} />
                                                <span>Smooth</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${edgeType === 'straight' ? styles.activeOption : ''}`}
                                                onClick={() => handleCurveChange('straight')}
                                            >
                                                <Minus size={14} />
                                                <span>Straight</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${edgeType === 'step' ? styles.activeOption : ''}`}
                                                onClick={() => handleCurveChange('step')}
                                            >
                                                <Activity size={14} />
                                                <span>Step</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Line Pattern */}
                                    <div className={styles.popoverSection}>
                                        <div className={styles.sectionTitle}>Pattern</div>
                                        <div className={styles.popoverGrid}>
                                            <button
                                                className={`${styles.popoverOption} ${lineStyle === 'solid' ? styles.activeOption : ''}`}
                                                onClick={() => handleLineStyleChange('solid')}
                                            >
                                                <span className={styles.lineIndicatorSolid} />
                                                <span>Solid</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${lineStyle === 'dashed' ? styles.activeOption : ''}`}
                                                onClick={() => handleLineStyleChange('dashed')}
                                            >
                                                <span className={styles.lineIndicatorDashed} />
                                                <span>Dashed</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${lineStyle === 'dotted' ? styles.activeOption : ''}`}
                                                onClick={() => handleLineStyleChange('dotted')}
                                            >
                                                <span className={styles.lineIndicatorDotted} />
                                                <span>Dotted</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Thickness */}
                                    <div className={styles.popoverSection}>
                                        <div className={styles.sectionTitle}>Thickness</div>
                                        <div className={styles.popoverGrid}>
                                            <button
                                                className={`${styles.popoverOption} ${strokeWidth === 1.75 ? styles.activeOption : ''}`}
                                                onClick={() => handleWidthChange(1.75)}
                                            >
                                                <span className={styles.widthIndicatorThin} />
                                                <span>Thin</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${strokeWidth === 3 ? styles.activeOption : ''}`}
                                                onClick={() => handleWidthChange(3)}
                                            >
                                                <span className={styles.widthIndicatorMedium} />
                                                <span>Medium</span>
                                            </button>
                                            <button
                                                className={`${styles.popoverOption} ${strokeWidth === 5 ? styles.activeOption : ''}`}
                                                onClick={() => handleWidthChange(5)}
                                            >
                                                <span className={styles.widthIndicatorThick} />
                                                <span>Thick</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Start & End Pointers */}
                                    <div className={styles.popoverSectionRow}>
                                        <div className={styles.popoverSectionHalf}>
                                            <div className={styles.sectionTitle}>Start Pointer</div>
                                            <div className={styles.popoverGridStacked}>
                                                <button
                                                    className={`${styles.popoverOption} ${markerStartType === 'none' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerStartChange('none')}
                                                >
                                                    <span className={styles.markerNone}>—</span>
                                                    <span>None</span>
                                                </button>
                                                <button
                                                    className={`${styles.popoverOption} ${markerStartType === 'arrow' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerStartChange('arrow')}
                                                >
                                                    <span className={styles.markerArrow}>➔</span>
                                                    <span>Arrow</span>
                                                </button>
                                                <button
                                                    className={`${styles.popoverOption} ${markerStartType === 'circle' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerStartChange('circle')}
                                                >
                                                    <span className={styles.markerCircle}>●</span>
                                                    <span>Circle</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className={styles.popoverSectionHalf}>
                                            <div className={styles.sectionTitle}>End Pointer</div>
                                            <div className={styles.popoverGridStacked}>
                                                <button
                                                    className={`${styles.popoverOption} ${markerEndType === 'none' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerChange('none')}
                                                >
                                                    <span className={styles.markerNone}>—</span>
                                                    <span>None</span>
                                                </button>
                                                <button
                                                    className={`${styles.popoverOption} ${markerEndType === 'arrow' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerChange('arrow')}
                                                >
                                                    <span className={styles.markerArrow}>➔</span>
                                                    <span>Arrow</span>
                                                </button>
                                                <button
                                                    className={`${styles.popoverOption} ${markerEndType === 'circle' ? styles.activeOption : ''}`}
                                                    onClick={() => handleMarkerChange('circle')}
                                                >
                                                    <span className={styles.markerCircle}>●</span>
                                                    <span>Circle</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
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
        </div>
    );
}
