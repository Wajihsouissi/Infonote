import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { Scan, PanelRight, PanelLeft, Monitor, Sparkles, Loader2, ArrowUpRight } from '../../components/icons';
import styles from './NoteCard.module.css';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { IconPicker } from './IconPicker';
import { defaultIconName, CardIcon } from './iconMap';
import { FolderArt } from './FolderArt';
import { NoteExpandedContent } from './NoteExpandedContent';

import { CoverPicker } from './CoverPicker';

import { AISkeletonCard } from './AISkeletonCard';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { calculateNoteLayout } from '../../config/layout';
import { generateText } from '../../services/aiService';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';

export const NoteCard = memo(({ id, data, selected, width, height }: NodeProps<NoteNode>) => {
    const { setNodes, getViewport } = useReactFlow();
    const connection = useConnection();
    const isConnecting = connection.inProgress;

    // Use atomic selectors to prevent unnecessary re-renders when other parts of the store change
    const navigateToNode = useStore(s => s.navigateToNode);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setRightSidePanelId = useStore(s => s.setRightSidePanelId);
    const setLeftSidePanelId = useStore(s => s.setLeftSidePanelId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const activeIconMenuId = useStore(s => s.activeIconMenuId);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const updateNode = useStore(s => s.updateNode);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const linkSelectedNodes = useStore(s => s.linkSelectedNodes);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const setNodesStore = useStore(s => s.setNodes);

    // Narrow selectors — only re-render when THIS node's status changes
    const isDragging = useStore(s => s.interactionState.draggedNodeId === id && !s.interactionState.isMultiDragging);
    const isDropTarget = useStore(s => s.interactionState.dropTarget?.id === id);
    const dropType = useStore(s => s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget?.type : null);

    // Track fusion event for animation
    const [isFusing, setIsFusing] = useState(false);
    const [isHoveredLinking, setIsHoveredLinking] = useState(false);
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

    // Track interactivity based on selection, with a 300ms delay to allow double-clicks on unselected cards to safely navigate without entering edit mode
    const [isInteractive, setIsInteractive] = useState(selected);
    const interactionTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (selected) {
            interactionTimerRef.current = window.setTimeout(() => {
                setIsInteractive(true);
            }, 300);
        } else {
            if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
            setIsInteractive(false);
        }
        return () => {
            if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
        };
    }, [selected]);

    const viewMode = data.viewMode || 'medium';
    const isMultiSelected = selectedCanvasNodeIds.has(id) && selectedCanvasNodeIds.size > 1;

    // Use the raw color without converting to pastel/glow
    const displayColor = data.color;

    /**
     * A recoloured card publishes its accent and lets CSS derive the surfaces.
     *
     * The colour is never painted on directly. A card is a page with text on it,
     * and a full-strength accent behind body copy is unreadable — which is why
     * the old `backgroundColor: displayColor` had to be undone. Instead the hue
     * goes out as a variable and the stylesheet mixes it: a wash for the card,
     * a deeper shade of the same hue for the editor well inside it. See
     * design-system.css §7 for the shade scale this follows.
     */
    const dynamicStyles = useMemo(() => {
        if (!displayColor) return {};
        return {
            '--card-indicator-color': displayColor,
            '--node-accent': displayColor,
        } as React.CSSProperties;
    }, [displayColor]);

    // Editing state
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [showCoverPicker, setShowCoverPicker] = useState(false);

    const [isSummarizing, setIsSummarizing] = useState(false);
    // Metadata visibility state for Expanded view is now derived from data.showMetadata



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

    // Update local state when data changes externally (e.g. from Side Peek)
    useEffect(() => {
        if (!isEditingMetadata) {
            setEditedData({
                label: data.label,
                icon: data.icon || defaultIconName,
                description: data.description || '',
                category: data.category || '',
                coverImage: data.coverImage || '',
                date: data.date || new Date().toISOString()
            });
        }
    }, [data, isEditingMetadata]);

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

    const handleSummarize = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        
        const contentBlocks = Array.isArray(data.content) ? data.content : [];
        if (contentBlocks.length === 0) return;

        const textContent = contentBlocks.map(b => b.content).join('\n');
        if (!textContent.trim()) return;

        setIsSummarizing(true);
        try {
            const prompt = `Summarize the following content in exactly two lines, followed by a few bullet points:\n\n${textContent}`;
            const summary = await generateText(prompt);
            setEditedData(prev => ({ ...prev, description: summary }));
            updateNodeData(id, { description: summary });
        } catch (error) {
            console.error("Failed to summarize:", error);
        } finally {
            setIsSummarizing(false);
        }
    }, [data.content, id, updateNodeData]);

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


    // Auto-resize (via ResizeObserver) was removed so that expanded cards
    // keep their size when content changes. Content overflows with scroll
    // via overflow-y: auto on .noteArea instead.

    // Menu Actions
    const handleCenterPeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCenterPanelId(id);
    };

    const handleSidePeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRightSidePanelId(id);
    };

    const handleLeftSidePeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLeftSidePanelId(id);
    };

    const handleFullScreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        document.documentElement.requestFullscreen().catch((err) => {
            console.error("Error attempting to enable full-screen mode:", err);
        });
        setFullscreenId(id);
    };





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
        custom-drag-handle
      `}
            ref={cardRef}
            data-accented={displayColor ? '' : undefined}
            style={{
                width: '100%',
                height: '100%',
                // Ensure the card fills the resized node area
                boxSizing: 'border-box',
                /* No `backgroundColor` here: the surface is mixed in CSS from
                   `--node-accent` so the card is tinted rather than painted. */
                ...dynamicStyles
            }}
        >
            {isLinkingMode && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        cursor: 'pointer',
                        backgroundColor: isHoveredLinking ? 'rgba(227, 162, 79, 0.15)' : 'rgba(227, 162, 79, 0.04)',
                        border: '2px solid transparent',
                        borderColor: isHoveredLinking ? '#e3a24f' : 'transparent',
                        boxShadow: isHoveredLinking ? '0 0 15px rgba(227, 162, 79, 0.4)' : 'none',
                        transition: 'all 0.2s ease',
                        borderRadius: 'inherit',
                        boxSizing: 'border-box',
                    }}
                    onMouseEnter={() => setIsHoveredLinking(true)}
                    onMouseLeave={() => setIsHoveredLinking(false)}
                    onClick={(e) => {
                        console.log("[NoteCard Overlay Click] Clicked ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                        linkSelectedNodes(id, Array.from(selectedCanvasNodeIds));
                        setIsLinkingMode(false);
                        clearCanvasSelection();
                        setNodesStore(nds => nds.map(n => n.selected ? { ...n, selected: false } : n));
                    }}
                    onPointerDown={(e) => {
                        console.log("[NoteCard Overlay PointerDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseDown={(e) => {
                        console.log("[NoteCard Overlay MouseDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseUp={(e) => {
                        console.log("[NoteCard Overlay MouseUp] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onDoubleClick={(e) => {
                        console.log("[NoteCard Overlay DoubleClick] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                />
            )}

            {/* Interaction Overlay */}
            {!isInteractive && !isLinkingMode && (
                <div
                    className="interaction-overlay custom-drag-handle"
                    ref={(el) => {
                        if (el) {
                            el.onwheel = (e) => {
                                if (!cardRef.current) return;
                                const scrollArea = cardRef.current.querySelector('.infonote-scrollable');
                                if (scrollArea) {
                                    const previousScrollTop = scrollArea.scrollTop;
                                    scrollArea.scrollTop += e.deltaY;
                                    if (Math.abs(scrollArea.scrollTop - previousScrollTop) > 0.5) {
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }
                                }
                            };
                        }
                    }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 10, // Must be above the card content, but below the resize handle and hover menus
                        cursor: 'grab',
                        borderRadius: 'inherit'
                    }}
                    onDoubleClick={(e) => {
                        // Double-click detection on the unselected card to navigate
                        e.preventDefault();
                        e.stopPropagation(); // Stop React Flow from grabbing this double-click
                        navigateToNode(id);
                    }}
                />
            )}

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
                    document.body.style.cursor = 'nwse-resize';
                    document.body.classList.add('chnk-it-resizing-active');


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
                                    ...(modeChanged && { data: { ...data, viewMode: targetMode } })
                                });
                            }
                        }
                    };

                    const onMouseUp = (upEvent: MouseEvent) => {
                        activeResize.current = false;
                        document.body.style.cursor = '';
                        document.body.classList.remove('chnk-it-resizing-active');
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
                            data: { ...data, viewMode: finalMode }
                        });
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                }}
            >
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent)" />
                            <stop offset="100%" stopColor="var(--secondary)" />
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

            {/* Floating Hover Menu - Hide in Chromeless mode or when specifically requested.
                The menu carries `nodrag`: the card root is the drag handle, so without it
                a press on one of these buttons starts a node drag — the card becomes the
                drag source (hidden, pointer-events off), the menu vanishes from under the
                cursor, and pointerup lands elsewhere, so no click ever fires. */}
            {!data.hideHoverMenu && (
                <div className={`${styles.hoverMenu} nodrag`}>
                    <button className={styles.menuBtn} onClick={handleLeftSidePeak} title="Side Panel (Left)">
                        <PanelLeft size={16} />
                    </button>
                    <button className={styles.menuBtn} onClick={handleFullScreen} title="Full Screen">
                        <Monitor size={16} />
                    </button>
                    <button className={styles.menuBtn} onClick={handleCenterPeak} title="Center Peak">
                        <Scan size={16} />
                    </button>
                    <button className={styles.menuBtn} onClick={handleSidePeak} title="Side Panel (Right)">
                        <PanelRight size={16} />
                    </button>
                    <div className={styles.menuDivider} />
                    <button 
                        className="special-primary-btn" 
                        style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigateToNode(id);
                        }} 
                        title="Open Card"
                    >
                        <ArrowUpRight size={16} />
                    </button>
                </div>
            )}


            <Handle 
                type="target" 
                position={Position.Top} 
                isConnectableStart={false}
                style={{ top: '50%', left: '50%', width: '100%', height: '100%', border: 'none', background: 'transparent', transform: 'translate(-50%, -50%)', zIndex: -1 }} 
            />
            {!isConnecting && (
                <Handle 
                    type="source" 
                    position={Position.Right} 
                    className={styles.topRightHandle} 
                    isConnectableEnd={false}
                    id="out" 
                />
            )}

            {/* Icon Picker Modal — in expanded mode NoteExpandedContent renders
                its own against the same `activeIconMenuId`, so rendering here too
                would mount two full pickers over one card. */}
            {showIconPicker && viewMode !== 'expanded' && (
                <IconPicker
                    currentIcon={editedData.icon}
                    onSelect={handleIconSelect}
                    onClose={() => setActiveIconMenuId(null)}
                />
            )}

            {/* View 1: Icon Mode - Icon + Text */}
            {viewMode === 'icon' && (
                <div className={styles.iconView} key="icon">
                    <button
                        className={`${styles.iconButton} icon-hover nodrag`}
                        onClick={handleIconClick}
                        title="Change icon"
                    >
                        <CardIcon icon={(isEditingMetadata ? editedData.icon : data.icon) || defaultIconName} size={32} />
                    </button>
                    <input
                        className={`${styles.iconTextInput} nodrag`}
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
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                        }}
                    />
                </div>
            )}

            {/* View 1.2: Folder View - Folder art + label, at the icon card's size.
                The cover shows as a thumbnail in the folder's exposed top band and
                the icon presses softly into the front flap; with neither, it is
                just a folder. */}
            {viewMode === 'folder' && (
                <div className={styles.folderView} key="folder">
                    <FolderArt
                        coverImage={data.coverImage}
                        icon={isEditingMetadata ? editedData.icon : data.icon}
                        size={92}
                    />
                    <input
                        className={`${styles.folderLabel} nodrag`}
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
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                        }}
                    />
                </div>
            )}

            {/* View 1.5: Title View - Icon + Text (Horizontal) */}
            {viewMode === 'titleview' && (
                <div className={styles.titleView} key="titleview">
                    <button
                        className={`${styles.iconButton} icon-hover nodrag`}
                        onClick={handleIconClick}
                        title="Change icon"
                    >
                        <CardIcon icon={(isEditingMetadata ? editedData.icon : data.icon) || defaultIconName} size={24} />
                    </button>
                    <input
                        className={`${styles.titleViewInput} nodrag`}
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
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                        }}
                    />
                </div>
            )}

            {/* View 2: Medium Mode - Icon + Title Row, Description Below */}
            {viewMode === 'medium' && (
                <div className={styles.mediumView} key="medium">
                    <div className={styles.mediumHeader}>
                        <input
                            className={`${styles.mediumTitleInput} nodrag`}
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
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.select();
                            }}
                        />
                    </div>
                    {/* Tinted by the same rule as the card, from `--node-accent` —
                        not painted with the raw hue, which put body text on a
                        full-strength accent. */}
                    <div className={styles.mediumDescContainer}>
                        <textarea
                            className={`${styles.mediumDescInput} nodrag`}
                            value={isEditingMetadata ? editedData.description : (data.description || '')}
                            onChange={(e) => {
                                setEditedData({ ...editedData, description: e.target.value });
                            }}
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
                            onWheelCapture={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.select();
                            }}
                            placeholder="Add description..."
                        />
                        <button 
                            className={styles.summarizeBtn}
                            onClick={handleSummarize}
                            disabled={isSummarizing || !Array.isArray(data.content) || data.content.length === 0}
                            title="Auto-summarize content"
                        >
                            {isSummarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </button>
                    </div>
                </div>
            )}

            {/* View 3: Expanded Mode - Cover + Icon/Title Row + Description + Date + Note Area */}
            {viewMode === 'expanded' && (
                <div className={styles.expandedView} key="expanded">
                    <ErrorBoundary>
                        {data.isAISkeleton ? (
                            <AISkeletonCard />
                        ) : (
                            <NoteExpandedContent
                                id={id}
                                data={data}
                                onUpdate={updateNodeData}
                                readOnly={false}
                                hideBlockHandles={!isInteractive}
                                contentRef={contentRef}
                                nodeId={id}
                                selectionIslandPortalId={`selection-island-${id}`}
                                zoomAwareBody
                            />
                        )}
                    </ErrorBoundary>
                </div>
            )}

            {/* Selection Island Container - positioned outside card */}
            <div id={`selection-island-${id}`} className={styles.selectionIslandContainer}>
                {/* SelectionCapsule will render here via portal */}
            </div>







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
}, samePropsIgnoringPosition);
