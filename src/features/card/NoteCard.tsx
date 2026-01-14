import { memo, useCallback, useRef, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Scan, PanelRight, Monitor } from 'lucide-react';
import styles from './NoteCard.module.css';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { IconPicker } from './IconPicker';
import { iconMap, defaultIconName } from './iconMap';
import { NoteExpandedContent } from './NoteExpandedContent';
import { EditBar } from '../ui/EditBar';

export const NoteCard = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    const { updateNodeData, setNodes, getViewport, deleteElements } = useReactFlow();
    const { navigateToNode, setFullscreenId, setSidePanelId, setCenterPanelId, activeIconMenuId, setActiveIconMenuId } = useStore();
    const viewMode = data.viewMode || 'medium';

    // Editing state
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    // Metadata visibility state for Expanded view
    const [showExpandedMetadata, setShowExpandedMetadata] = useState(false);

    // EditBar state for context menu
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

    // Derived state for icon picker visibility
    const showIconPicker = activeIconMenuId === id;

    // To prevent fighting between auto-grow and manual resize, we can track if resizing is active.
    const activeResize = useRef(false);

    const [editedData, setEditedData] = useState({
        label: data.label,
        icon: data.icon || defaultIconName,
        description: data.description || '',
        category: data.category || '',
        coverImage: data.coverImage || '',
        date: data.date || new Date().toISOString()
    });

    // Get the icon component
    const IconComponent = iconMap[data.icon || defaultIconName] || iconMap[defaultIconName];

    // ... (keep handlers same) ...
    // Metadata editing handlers
    const handleSaveMetadata = useCallback(() => {
        updateNodeData(id, editedData);
        setIsEditingMetadata(false);
    }, [id, editedData, updateNodeData]);

    const handleIconSelect = useCallback((icon: string) => {
        setEditedData(prev => ({ ...prev, icon }));
        if (!isEditingMetadata) {
            updateNodeData(id, { icon });
        }
        setActiveIconMenuId(null);
    }, [id, isEditingMetadata, updateNodeData, setActiveIconMenuId]);

    const handleIconClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIconMenuId(id);
    }, [id, setActiveIconMenuId]);

    const cardRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const SNAP_Step = 112; // 2 * 56
    const GRID_GAP = 16;
    const MAX_HEIGHT_UNITS = 20;
    const MAX_HEIGHT = (MAX_HEIGHT_UNITS * 56) - GRID_GAP; // 1104px
    const MAX_WIDTH_UNITS = 12;
    const MAX_WIDTH = (MAX_WIDTH_UNITS * 56) - GRID_GAP; // 656px
    const MIN_EXPANDED_SIZE = 448 - GRID_GAP; // 432px

    // Helper to calculate strict grid size
    const getStrictSize = useCallback((rawWidth: number, rawHeight: number) => {
        // We add the gap back to 'normalize' input to the grid system
        // e.g. input 96 visual -> 112 logical
        const normalizedW = rawWidth + GRID_GAP;
        const normalizedH = rawHeight + GRID_GAP;
        const largerDim = Math.max(normalizedW, normalizedH);

        let targetWidth = 112 - GRID_GAP;
        let targetHeight = 112 - GRID_GAP;
        let mode = 'icon';

        // Thresholds designed to snap comfortably (using normalized dimensions)
        // 112 (Icon) -> jump to 224 at ~168
        // 224 (Medium) -> jump to 448 (Expanded) at ~336
        // Expanded grows in +112 steps

        if (largerDim < 168) {
            // Icon: 2x2 (112 - 16 = 96)
            targetWidth = 112 - GRID_GAP;
            targetHeight = 112 - GRID_GAP;
            mode = 'icon';
        } else if (largerDim < 336) {
            // Medium: 4x4 (224 - 16 = 208)
            targetWidth = 224 - GRID_GAP;
            targetHeight = 224 - GRID_GAP;
            mode = 'medium';
        } else {
            // Expanded: 8x8 minimum, then +2 steps
            mode = 'expanded';

            // Quantize to 112 steps using normalized values
            let w = Math.round(normalizedW / SNAP_Step) * SNAP_Step;
            let h = Math.round(normalizedH / SNAP_Step) * SNAP_Step;

            // Subtract gap for visual size
            w = w - GRID_GAP;
            h = h - GRID_GAP;

            // Enforce minimum 8x8
            w = Math.max(MIN_EXPANDED_SIZE, w);
            h = Math.max(MIN_EXPANDED_SIZE, h);

            // Enforce maximums
            w = Math.min(w, MAX_WIDTH);
            h = Math.min(h, MAX_HEIGHT);

            targetWidth = w;
            targetHeight = h;
        }

        return { width: targetWidth, height: targetHeight, mode };
    }, [MAX_HEIGHT, MAX_WIDTH, SNAP_Step, MIN_EXPANDED_SIZE, GRID_GAP]);




    // Aggressive Self-Correction for Dimensions
    useEffect(() => {
        if (activeResize.current) return; // Don't fight the user while dragging

        if (!cardRef.current) return;

        // We must normalize to flow coordinates using zoom
        const { zoom } = getViewport();
        const rect = cardRef.current.getBoundingClientRect();
        const currentW = rect.width / zoom;
        const currentH = rect.height / zoom;

        // Check current validity
        const { width: validWidth, height: validHeight, mode: correctMode } = getStrictSize(currentW, currentH);

        // We only correct if significantly off (> 2px) to allow sub-pixel rendering or slight browser variances
        const widthDiff = Math.abs(currentW - validWidth);
        const heightDiff = Math.abs(currentH - validHeight);

        const isWrongSize = widthDiff > 2 || heightDiff > 2;

        if (isWrongSize) {
            setNodes((nodes) => nodes.map(n => {
                if (n.id === id) {
                    return { ...n, style: { ...n.style, width: validWidth, height: validHeight } };
                }
                return n;
            }));
        }

        // Also correct mode if it somehow drifted, though usually size drives mode
        // But if we are in 'expanded' physically but data says 'medium', we should update data.
        if (correctMode !== viewMode) {
            updateNodeData(id, { viewMode: correctMode as any });
        }

    }, [viewMode, id, setNodes, updateNodeData, getStrictSize, getViewport]);


    useEffect(() => {
        // Auto-grow logic ONLY for Expanded mode
        if (viewMode !== 'expanded' || !contentRef.current || !cardRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (activeResize.current) return;

                if (!cardRef.current) return;

                // Dynamic Chrome Height Calculation
                // contentHeight (visible) vs cardHeight (total)
                const currentCardHeight = cardRef.current.offsetHeight;
                const contentVisibleHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                const chromeHeight = currentCardHeight - contentVisibleHeight;

                // Use scrollHeight to see actual content size demands
                const contentScrollHeight = entry.target.scrollHeight;
                const neededHeight = contentScrollHeight + chromeHeight;

                // Calculate required grid units (step of 2 -> 112px)
                // Normalize to logical grid (add gap), snapping, then subtract gap for visual height
                const neededLogicalHeight = neededHeight + GRID_GAP;
                let targetLogicalHeight = Math.ceil(neededLogicalHeight / SNAP_Step) * SNAP_Step;
                let targetHeight = targetLogicalHeight - GRID_GAP;

                // Min 448 (Logical 448 -> Visual 432)
                if (targetHeight < MIN_EXPANDED_SIZE) targetHeight = MIN_EXPANDED_SIZE;
                // Max limits
                if (targetHeight > MAX_HEIGHT) targetHeight = MAX_HEIGHT;

                // Resizing Logic:
                // 1. Grow if content pushes bounds (Normal behavior)
                // 2. Shrink ONLY if significant empty space is detected (e.g. after a Split)
                //    Threshold: > 112px (one grid step) empty space

                const isGrowing = targetHeight > currentCardHeight + 2; // small buffer
                const isShrinkingSignificantly = currentCardHeight - targetHeight > 112;

                if (isGrowing || isShrinkingSignificantly) {
                    // Check if we are already at MAX and want more -> ignore
                    if (isGrowing && currentCardHeight >= MAX_HEIGHT && targetHeight >= MAX_HEIGHT) return;

                    // Debounce slightly to avoid flicker
                    setTimeout(() => {
                        setNodes((nodes) => nodes.map((n) => {
                            if (n.id === id) {
                                return {
                                    ...n,
                                    style: { ...n.style, height: targetHeight },
                                };
                            }
                            return n;
                        }));
                    }, 10);
                }
            }
        });

        observer.observe(contentRef.current);
        return () => observer.disconnect();
    }, [viewMode, id, setNodes, MAX_HEIGHT, SNAP_Step, MIN_EXPANDED_SIZE, showExpandedMetadata]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent ReactFlow from catching it
        navigateToNode(id);
    };

    // Menu Actions
    const handleCenterPeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCenterPanelId(id);
    };

    const handleSidePeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSidePanelId(id);
    };

    const handleFullScreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        document.documentElement.requestFullscreen().catch((err) => {
            console.error("Error attempting to enable full-screen mode:", err);
        });
        setFullscreenId(id);
    };

    // EditBar handlers
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Use clientX/clientY for fixed positioning with small offset
        setEditBarPosition({
            x: e.clientX + 5,
            y: e.clientY + 5
        });
        setShowEditBar(true);
    }, []);

    const handleColorChange = useCallback((color: string) => {
        updateNodeData(id, { color });
    }, [id, updateNodeData]);

    const handleDuplicate = useCallback(() => {
        const { nodes } = useStore.getState();
        const currentNode = nodes.find(n => n.id === id);
        if (!currentNode) return;

        const newNode = {
            ...currentNode,
            id: `${id}-copy-${Date.now()}`,
            position: {
                x: currentNode.position.x + 50,
                y: currentNode.position.y + 50
            }
        };

        setNodes((nds) => [...nds, newNode as any]);
    }, [id, setNodes]);

    const handleDelete = useCallback(() => {
        deleteElements({ nodes: [{ id }] });
    }, [id, deleteElements]);

    return (
        <div
            className={`
        ${styles.card} 
        ${styles[viewMode]} 
        ${selected ? styles.selected : ''}
      `}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            ref={cardRef}
            style={{
                width: '100%',
                height: '100%',
                // Ensure the card fills the resized node area
                boxSizing: 'border-box',
                backgroundColor: data.color || undefined,
            }}
        >
            {/* custom strict resize handle */}
            <div
                className={`${styles.modernResizeHandle} nodrag`}
                onMouseDown={(e) => {
                    e.stopPropagation(); // prevent react flow node drag
                    e.preventDefault();

                    const { zoom } = getViewport();
                    const startX = e.clientX;
                    const startY = e.clientY;

                    if (!cardRef.current) return;
                    // Initial dimensions in FLOW units
                    const rect = cardRef.current.getBoundingClientRect();
                    const startW = rect.width / zoom;
                    const startH = rect.height / zoom;

                    activeResize.current = true;


                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const deltaX = (moveEvent.clientX - startX) / zoom;
                        const deltaY = (moveEvent.clientY - startY) / zoom;

                        const rawW = startW + deltaX;
                        const rawH = startH + deltaY;

                        // Use strict calculator but for visual feedback during drag, we might want to just show the snapped result directly
                        const { width: targetW, height: targetH, mode: targetMode } = getStrictSize(rawW, rawH);

                        setNodes(nodes => nodes.map(n => {
                            if (n.id === id) {
                                // 1. Check Dimensions
                                const currentW = n.style?.width;
                                const currentH = n.style?.height;
                                const dimChanged = currentW !== targetW || currentH !== targetH;

                                // 2. Check ViewMode
                                const currentMode = n.data.viewMode || 'medium';
                                const modeChanged = currentMode !== targetMode;

                                if (!dimChanged && !modeChanged) return n;

                                return {
                                    ...n,
                                    style: { ...n.style, width: targetW, height: targetH },
                                    data: modeChanged ? { ...n.data, viewMode: targetMode as any } : n.data
                                };
                            }
                            return n;
                        }));
                    };

                    const onMouseUp = (upEvent: MouseEvent) => {
                        activeResize.current = false;
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);

                        const deltaX = (upEvent.clientX - startX) / zoom;
                        const deltaY = (upEvent.clientY - startY) / zoom;
                        const rawW = startW + deltaX;
                        const rawH = startH + deltaY;

                        // Final snap and mode update
                        const { width: finalW, height: finalH, mode: finalMode } = getStrictSize(rawW, rawH);

                        setNodes(nodes => nodes.map(n => {
                            if (n.id === id) {
                                return {
                                    ...n,
                                    style: { ...n.style, width: finalW, height: finalH },
                                    data: { ...n.data, viewMode: finalMode as any }
                                };
                            }
                            return n;
                        }));
                        // We removed the separate updateNodeData call here because we handled it in setNodes above.
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                }}
            >
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#A78BFA" />
                            <stop offset="100%" stopColor="#60A5FA" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M 8 32 A 24 24 0 0 1 32 8"
                        stroke="url(#arc-gradient)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        className={styles.handlePath}
                    />
                </svg>
            </div>

            {/* Floating Hover Menu - Hide in Chromeless mode */}
            {/* Floating Hover Menu */}
            <div className={styles.hoverMenu}>
                <button className={styles.menuBtn} onClick={handleFullScreen} title="Full Screen">
                    <Monitor size={16} />
                </button>
                <button className={styles.menuBtn} onClick={handleCenterPeak} title="Center Peak">
                    <Scan size={16} />
                </button>
                <button className={styles.menuBtn} onClick={handleSidePeak} title="Side Panel">
                    <PanelRight size={16} />
                </button>
            </div>

            <Handle type="target" position={Position.Top} className={styles.handle} />

            {/* Icon Picker Modal */}
            {showIconPicker && (
                <IconPicker
                    currentIcon={editedData.icon}
                    onSelect={handleIconSelect}
                    onClose={() => setActiveIconMenuId(null)}
                />
            )}

            {/* View 1: Icon Mode - Icon + Text */}
            {viewMode === 'icon' && (
                <div className={styles.iconView}>
                    <button
                        className={styles.iconButton}
                        onClick={handleIconClick}
                        title="Change icon"
                    >
                        <IconComponent size={32} />
                    </button>
                    <input
                        className={styles.iconTextInput}
                        value={isEditingMetadata ? editedData.label : data.label}
                        onChange={(e) => setEditedData({ ...editedData, label: e.target.value })}
                        onFocus={() => setIsEditingMetadata(true)}
                        onBlur={() => {
                            if (isEditingMetadata) {
                                handleSaveMetadata();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* View 2: Medium Mode - Icon + Title Row, Description Below */}
            {viewMode === 'medium' && (
                <div className={styles.mediumView}>
                    <div className={styles.mediumHeader}>
                        <input
                            className={styles.mediumTitleInput}
                            value={isEditingMetadata ? editedData.label : data.label}
                            onChange={(e) => setEditedData({ ...editedData, label: e.target.value })}
                            onFocus={() => setIsEditingMetadata(true)}
                            onBlur={() => {
                                if (isEditingMetadata) {
                                    handleSaveMetadata();
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                    <textarea
                        className={styles.mediumDescInput}
                        value={isEditingMetadata ? editedData.description : (data.description || 'Add description...')}
                        onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                        onFocus={() => setIsEditingMetadata(true)}
                        onBlur={() => {
                            if (isEditingMetadata) {
                                handleSaveMetadata();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Add description..."
                    />
                </div>
            )}

            {/* View 3: Expanded Mode - Cover + Icon/Title Row + Description + Date + Note Area */}
            {viewMode === 'expanded' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <NoteExpandedContent
                        id={id}
                        data={data}
                        onUpdate={updateNodeData}
                        contentRef={contentRef}
                        nodeId={id}
                        showMetadata={showExpandedMetadata}
                        setShowMetadata={setShowExpandedMetadata}
                    />
                </div>
            )}



            <Handle type="source" position={Position.Bottom} className={styles.handle} />

            {/* EditBar Context Menu */}
            {showEditBar && (
                <EditBar
                    position={editBarPosition}
                    onClose={() => setShowEditBar(false)}
                    onColorChange={handleColorChange}
                    currentColor={data.color}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                />
            )}
        </div>
    );
});
