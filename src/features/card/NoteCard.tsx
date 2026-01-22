import { memo, useCallback, useRef, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Scan, PanelRight, Monitor, Image as ImageIcon } from 'lucide-react';
import styles from './NoteCard.module.css';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { IconPicker } from './IconPicker';
import { iconMap, defaultIconName } from './iconMap';
import { NoteExpandedContent } from './NoteExpandedContent';
import { EditBar } from '../ui/EditBar';
import { CoverPicker } from './CoverPicker';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { calculateNoteLayout, MIN_EXPANDED_SIZE, MAX_HEIGHT, MAX_WIDTH, SNAP_STEP } from '../../config/layout';
import { toPastelColor } from '../../utils/colorUtils';

export const NoteCard = memo(({ id, data, selected, width, height }: NodeProps<NoteNode>) => {
    const { setNodes, getViewport, deleteElements } = useReactFlow();

    // Use atomic selectors to prevent unnecessary re-renders when other parts of the store change
    const navigateToNode = useStore(s => s.navigateToNode);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setSidePanelId = useStore(s => s.setSidePanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const activeIconMenuId = useStore(s => s.activeIconMenuId);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const updateNode = useStore(s => s.updateNode);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const interactionState = useStore(s => s.interactionState);
    const theme = useStore(s => s.theme);

    const isDragging = interactionState.draggedNodeId === id;
    const isDropTarget = interactionState.dropTarget?.id === id;
    const dropType = isDropTarget ? interactionState.dropTarget?.type : null;

    // Track fusion event for animation
    const [isFusing, setIsFusing] = useState(false);
    const lastFusedTimeRef = useRef(data.lastFusedAt || 0);

    useEffect(() => {
        if (data.lastFusedAt && data.lastFusedAt > lastFusedTimeRef.current) {
            setIsFusing(true);
            const timer = setTimeout(() => setIsFusing(false), 500);
            lastFusedTimeRef.current = data.lastFusedAt;
            return () => clearTimeout(timer);
        }
        // Sync ref if data is older or same (e.g. init)
        if (data.lastFusedAt) lastFusedTimeRef.current = data.lastFusedAt;
    }, [data.lastFusedAt]);

    const viewMode = data.viewMode || 'medium';
    const isMultiSelected = selectedCanvasNodeIds.has(id);

    // Convert color to pastel for better readability
    const displayColor = data.color ? toPastelColor(data.color, theme === 'light') : undefined;

    // Editing state
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [showCoverPicker, setShowCoverPicker] = useState(false);
    // Metadata visibility state for Expanded view
    const [showExpandedMetadata, setShowExpandedMetadata] = useState(false);

    // EditBar state for context menu
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

    // Performance: Visibility tracking for heavy features (ResizeObserver, etc.)
    const [isVisible, setIsVisible] = useState(true);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (!cardRef.current) return;

        observerRef.current = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                setIsVisible(entry.isIntersecting);
            },
            { rootMargin: '200px' } // Buffer to start heavy logic just before entering viewport
        );

        observerRef.current.observe(cardRef.current);

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, []);

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

    // Aggressive Self-Correction for Dimensions
    useEffect(() => {
        /* DISABLED FOR DEBUGGING INFINITE LOOP
        if (activeResize.current) return; // Don't fight the user while dragging

        // We use measured dimensions from React Flow if available
        const currentW = width;
        const currentH = height;

        if (!currentW || !currentH) return;

        // Check current validity
        const { width: validWidth, height: validHeight, mode: correctMode } = calculateNoteLayout(currentW, currentH);

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
        if (correctMode !== viewMode) {
            updateNodeData(id, { viewMode: correctMode as any });
        }
        */
    }, [viewMode, id, setNodes, updateNodeData, width, height]);


    useEffect(() => {
        // Auto-grow logic ONLY for Expanded mode and ONLY when visible
        if (viewMode !== 'expanded' || !contentRef.current || !cardRef.current || !isVisible) return;

        // Track if this resize is due to metadata toggle to prevent unwanted height changes
        let isMetadataToggling = false;
        const metadataToggleTimeout = setTimeout(() => {
            isMetadataToggling = false;
        }, 50);

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (activeResize.current) return;
                if (isMetadataToggling) return; // Prevent resize during metadata toggle

                if (!cardRef.current) return;

                // Dynamic Chrome Height Calculation
                const currentCardHeight = cardRef.current.offsetHeight;
                const contentVisibleHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                const chromeHeight = currentCardHeight - contentVisibleHeight;

                // Use scrollHeight to see actual content size demands
                const contentScrollHeight = entry.target.scrollHeight;
                const neededHeight = contentScrollHeight + chromeHeight;

                // Calculate required grid units using centralized layout logic
                const { height: targetHeight } = calculateNoteLayout(cardRef.current.offsetWidth, neededHeight);

                // Resizing Logic:
                const isGrowing = targetHeight > currentCardHeight + 2; // small buffer
                const isShrinkingSignificantly = currentCardHeight - targetHeight > SNAP_STEP;

                // CRITICAL: Prevent Micro-Oscillations or Loops
                // We compare the actual rendered height (offsetHeight) with the target.
                // If they are close enough, we assume we reached the target.
                if (Math.abs(currentCardHeight - targetHeight) <= 4) return;

                if (isGrowing || isShrinkingSignificantly) {
                    // Check if we are already at MAX and want more -> ignore
                    if (isGrowing && currentCardHeight >= MAX_HEIGHT && targetHeight >= MAX_HEIGHT) return;

                    // Debounce slightly to avoid flicker
                    // Debounce slightly to avoid flicker
                    // Debounce slightly to avoid flicker
                    setTimeout(() => {
                        updateNode(id, {
                            style: { width: cardRef.current?.offsetWidth || width || 300, height: targetHeight }
                        });
                    }, 10);
                }
            }
        });

        // Mark that metadata is toggling at the start of this effect
        isMetadataToggling = true;

        observer.observe(contentRef.current);
        return () => {
            observer.disconnect();
            clearTimeout(metadataToggleTimeout);
        };
    }, [viewMode, id, updateNode, showExpandedMetadata]);

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
        ${isMultiSelected ? styles.multiSelected : ''}
        ${isDragging ? styles.dragging : ''}
        ${isDropTarget && dropType === 'nesting' ? styles.dropTarget : ''}
        ${isDropTarget && dropType === 'fusion' ? styles.fusionTarget : ''}
        ${isFusing ? styles.fusing : ''}
      `}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => {
                // Only intercept in expanded mode where we have content to drop into
                if (viewMode === 'expanded') {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
            onDrop={(e) => {
                // Only intercept in expanded mode
                // The NoteExpandedContent/BlockEditor inside will handle its own drops
                if (viewMode === 'expanded') {
                    e.stopPropagation();
                }
            }}
            ref={cardRef}
            style={{
                width: '100%',
                height: '100%',
                // Ensure the card fills the resized node area
                boxSizing: 'border-box',
                backgroundColor: displayColor || undefined,
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
                        const { width: targetW, height: targetH, mode: targetMode } = calculateNoteLayout(rawW, rawH);

                        if (cardRef.current) {
                            // Check against current visual to avoid thrashing? 
                            // Actually, props.width/height update via store.
                            // We calculate 'target' based on absolute delta.

                            // Check if changed from current props
                            const currentW = width;
                            const currentH = height;
                            const dimChanged = currentW !== targetW || currentH !== targetH;

                            const currentMode = data.viewMode || 'medium';
                            const modeChanged = currentMode !== targetMode;

                            if (dimChanged || modeChanged) {
                                updateNode(id, {
                                    style: { width: targetW, height: targetH },
                                    ...(modeChanged && { data: { ...data, viewMode: targetMode as any } })
                                });
                            }
                        }
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
                        const { width: finalW, height: finalH, mode: finalMode } = calculateNoteLayout(rawW, rawH);

                        updateNode(id, {
                            style: { width: finalW, height: finalH },
                            data: { ...data, viewMode: finalMode as any }
                        });
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
                            onFocus={(e) => {
                                e.stopPropagation();
                                setIsEditingMetadata(true);
                            }}
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
                        value={isEditingMetadata ? editedData.description : (data.description || '')}
                        onChange={(e) => {
                            setEditedData({ ...editedData, description: e.target.value });
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onFocus={(e) => {
                            e.stopPropagation();
                            setIsEditingMetadata(true);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
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
                    <ErrorBoundary>
                        <NoteExpandedContent
                            id={id}
                            data={data}
                            onUpdate={updateNodeData}
                            contentRef={contentRef}
                            nodeId={id}
                            showMetadata={showExpandedMetadata}
                            setShowMetadata={setShowExpandedMetadata}
                        />
                    </ErrorBoundary>
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

            {showCoverPicker && (
                <CoverPicker
                    currentCover={data.coverImage || ''}
                    onSelect={(url) => {
                        updateNodeData(id, { coverImage: url });
                        setShowCoverPicker(false);
                    }}
                    onClose={() => setShowCoverPicker(false)}
                />
            )}
        </div>
    );
});
