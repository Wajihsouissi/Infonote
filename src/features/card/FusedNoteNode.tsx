import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote } from '../../components/icons';
import { BlockEditor } from '../editor/BlockEditor';

import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import styles from './FusedNoteNode.module.css';
import { snapFusedDimensions, MIN_EXPANDED_SIZE, MAX_HEIGHT } from '../../config/layout';
import type { AppNode, FusedNoteNode as FusedNoteNodeType } from '../../types';
import type { Block } from '../editor/types';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';

import { v4 as uuidv4 } from 'uuid';

export const FusedNoteNode = memo(({ id, data, selected }: NodeProps<FusedNoteNodeType>) => {
    const { getViewport } = useReactFlow();
    const connection = useConnection();
    const isConnecting = connection.inProgress;
    const updateNodeData = useStore(s => s.updateNodeData);
    const updateNode = useStore(s => s.updateNode);
    const isMultiSelected = useStore(s => s.selectedCanvasNodeIds.size > 1 && s.selectedCanvasNodeIds.has(id));
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const linkSelectedNodes = useStore(s => s.linkSelectedNodes);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);

    // Narrow selectors — only re-render when THIS node's status changes
    const isDragging = useStore(s => s.interactionState.draggedNodeId === id && !s.interactionState.isMultiDragging);
    const isDropTarget = useStore(s => s.interactionState.dropTarget?.id === id);
    const dropType = useStore(s => s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget?.type : null);

    // Track fusion event for animation
    const [isFusing, setIsFusing] = useState(false);
    const [isHoveredLinking, setIsHoveredLinking] = useState(false);
    const lastFusedTimeRef = useRef(data.lastFusedAt || 0);

    const isInteractive = selected;
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

    const contentRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const activeResize = useRef(false);

    // Get the node's style from the store to check if it has been manually resized
    const nodeStyle = useStore(s => getNodeById(s.nodes, id)?.style);
    const hasManualHeight = nodeStyle?.height !== undefined;

    const dynamicStyle: React.CSSProperties = {
        /* Two variables, because they answer different questions. The spine is
           always drawn and falls back to the neutral rail; the surface tint is
           only applied when the node has actually been given a colour. Reusing
           one for both tinted every uncoloured fused note with 14% of the rail
           accent. */
        ['--node-accent-color' as string]: data.color || 'var(--block-rail)',
        ...(data.color ? { ['--node-accent' as string]: data.color } : {}),
        display: 'flex',
        flexDirection: 'column',
        ...(hasManualHeight ? {
            height: '100%',
            maxHeight: `${MAX_HEIGHT}px`,
        } : {
            height: 'auto',
            minHeight: '208px', // 4 units
            maxHeight: `${MAX_HEIGHT}px`,
        })
    };

    const contentStyle = {
        flex: hasManualHeight ? '1 1 0%' : '1 1 auto',
        overflowY: 'auto' as const,
        height: hasManualHeight ? '100%' : 'auto',
    };



    const handleConvertToCard = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const { nodes, setNodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        const result = { title: data.label || 'Untitled Card', content: data.content, color: data.color, tags: [] as string[], viewMode: 'expanded' as const };

        const width = MIN_EXPANDED_SIZE;
        const height = MIN_EXPANDED_SIZE;

        const parentId = thisNode.parentId;
        if (!parentId) {
            setNodes((currentNodes) => currentNodes.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        type: 'note',
                        data: { label: result.title, viewMode: result.viewMode, content: result.content, description: '', date: new Date().toISOString(), color: result.color, tags: result.tags, showMetadata: false },
                        style: { ...n.style, width, height }
                    } as AppNode;
                }
                return n;
            }));
            return;
        }

        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return;
        const parentContent = 'content' in parentNode.data ? parentNode.data.content : undefined;
        if (!Array.isArray(parentContent)) return;
        const myBlocks = data.content;
        if (!myBlocks || myBlocks.length === 0) return;
        const firstBlockId = myBlocks[0].id;
        const startIndex = parentContent.findIndex((b) => b.id === firstBlockId);
        if (startIndex === -1) return;

        const newNodeId = uuidv4();
        const newNode = {
            id: newNodeId, type: 'note', parentId, position: thisNode.position,
            data: { label: result.title, content: result.content, viewMode: result.viewMode, date: new Date().toISOString(), color: result.color, tags: result.tags, showMetadata: false },
            style: { width, height }, zIndex: 10
        };
        const pageBlock: Block = { id: uuidv4(), type: 'page', content: myBlocks[0].content || 'New Note', metadata: { nodeId: newNodeId } };

        setNodes((currentNodes) => {
            const pn = currentNodes.find(n => n.id === parentId);
            if (!pn) return currentNodes;
            const oldContent: Block[] = 'content' in pn.data && Array.isArray(pn.data.content) ? pn.data.content : [];
            const newParentContent = [...oldContent];
            const idx = newParentContent.findIndex((b) => b.id === firstBlockId);
            if (idx !== -1) { newParentContent.splice(idx, myBlocks.length, pageBlock); } else { return currentNodes; }
            const filteredNodes = currentNodes.filter(n => n.id !== id && n.id !== parentId);
            return filteredNodes.concat([
                { ...pn, data: { ...pn.data, content: newParentContent } } as AppNode,
                newNode as AppNode
            ]);
        });
    }, [id, data.content, data.label, data.color]);

    // Auto-resize logic has been removed so that fused notes default to 8x8 and scroll if content overflows.

    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const { zoom } = getViewport();
        const startX = e.clientX;
        const startY = e.clientY;

        if (!nodeRef.current) return;
        const rect = nodeRef.current.getBoundingClientRect();
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

            const { width: targetW, height: targetH } = snapFusedDimensions(rawW, rawH);

            // Gate state updates: only write to the store if snapped dimensions actually changed
            const currentStyle = useStore.getState().nodes.find(n => n.id === id)?.style;
            const currentW = currentStyle?.width;
            const currentH = currentStyle?.height;

            if (currentW !== targetW || currentH !== targetH) {
                updateNode(id, { style: { width: targetW, height: targetH } });
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

            const { width: finalW, height: finalH } = snapFusedDimensions(rawW, rawH);
            updateNode(id, { style: { width: finalW, height: finalH } });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleResizeReset = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const node = nodeRef.current;
        if (!node) return;

        const content = node.querySelector('.ProseMirror, .infonote-scrollable, [data-scrollable="true"]') as HTMLElement | null;
        const contentWidth = content
            ? content.scrollWidth
            : Math.max(node.scrollWidth, node.clientWidth);
        const contentHeight = content
            ? content.scrollHeight
            : Math.max(node.scrollHeight, node.clientHeight);
        const chromeWidth = content ? Math.max(0, node.clientWidth - content.clientWidth) : 0;
        const chromeHeight = content ? Math.max(0, node.clientHeight - content.clientHeight) : 0;
        const dimensions = snapFusedDimensions(contentWidth + chromeWidth, contentHeight + chromeHeight);

        updateNode(id, { style: dimensions });
    }, [id, updateNode]);





    const handleContentUpdate = useCallback((blocks: Block[]) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    return (
        <div
            className={`
                custom-drag-handle
                ${styles.fusedNoteNode} 
                ${selected ? styles.selected : ''} 
                ${isMultiSelected ? styles.multiSelected : ''}
                ${isDragging ? styles.dragging : ''}
                ${isDropTarget && dropType === 'nesting' ? styles.dropTarget : ''}
                ${isDropTarget && dropType === 'fusion' ? styles.fusionTarget : ''}
                ${isDropTarget && dropType === 'gallery' ? styles.galleryTarget : ''}
                ${isFusing ? styles.fusing : ''}
            `}
            ref={nodeRef}
            data-accented={data.color ? '' : undefined}
            style={dynamicStyle}
        >
            {/* Interaction Overlay */}
            {!isInteractive && !isLinkingMode && (
                <div
                    className="interaction-overlay custom-drag-handle"
                    ref={(el) => {
                        if (el) {
                            el.onwheel = (e) => {
                                if (!nodeRef.current) return;
                                const scrollArea = nodeRef.current.querySelector('.ProseMirror, .infonote-scrollable, [data-scrollable="true"]');
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
                        zIndex: 10,
                        cursor: 'grab',
                        borderRadius: 'inherit'
                    }}
                />
            )}

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
                        backgroundColor: isHoveredLinking ? 'rgba(var(--secondary-rgb), 0.15)' : 'rgba(var(--secondary-rgb), 0.04)',
                        border: '2px solid transparent',
                        borderColor: isHoveredLinking ? 'var(--secondary)' : 'transparent',
                        boxShadow: isHoveredLinking ? '0 0 15px rgba(var(--secondary-rgb), 0.4)' : 'none',
                        transition: 'all var(--transition-fast)',
                        borderRadius: 'inherit',
                        boxSizing: 'border-box',
                    }}
                    onMouseEnter={() => setIsHoveredLinking(true)}
                    onMouseLeave={() => setIsHoveredLinking(false)}
                    onClick={(e) => {
                        console.log("[FusedNoteNode Overlay Click] Clicked ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                        linkSelectedNodes(id, Array.from(useStore.getState().selectedCanvasNodeIds));
                        setIsLinkingMode(false);
                        clearCanvasSelection();
                    }}
                    onPointerDown={(e) => {
                        console.log("[FusedNoteNode Overlay PointerDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseDown={(e) => {
                        console.log("[FusedNoteNode Overlay MouseDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseUp={(e) => {
                        console.log("[FusedNoteNode Overlay MouseUp] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onDoubleClick={(e) => {
                        console.log("[FusedNoteNode Overlay DoubleClick] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                />
            )}

            {isInteractive && (
                <button
                    className={`${styles.convertBtn} nodrag`}
                    onClick={handleConvertToCard}
                    title="Convert to Card"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <StickyNote size={16} />
                </button>
            )}

            {data.mapRole === 'chapter' && (
                <div className={styles.chapterMeta} aria-label={`Chapter with ${data.content.length} blocks`}>
                    {data.content.length} {data.content.length === 1 ? 'block' : 'blocks'}
                </div>
            )}

            <div 
                className={`${styles.content} nodrag`} 
                data-scrollable="true"
                ref={contentRef}
                onWheelCapture={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        window.dispatchEvent(new CustomEvent('chnk-it-editor-bg-click', { detail: { nodeId: id } }));
                    }
                }}
                style={contentStyle}
            >
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={false}
                    onUpdate={handleContentUpdate}
                    nodeId={id}
                    hideBlockHandles={!isInteractive}
                    disableMediaControls={true}
                    selectionIslandPortalId={`selection-island-${id}`}
                />
            </div>

            {/* Selection Island Container - positioned outside card */}
            <div id={`selection-island-${id}`} className={styles.selectionIslandContainer}>
                {/* SelectionCapsule will render here via portal */}
            </div>

            {/* Resize Handle */}
            {isInteractive && (
                <div
                    className={`${styles.modernResizeHandle} nodrag`}
                    onMouseDown={(e) => {
                        if (e.detail === 2) {
                            handleResizeReset(e);
                            return;
                        }
                        handleResizeStart(e);
                    }}
                    onDoubleClick={handleResizeReset}
                    title="Drag to resize · double-click to fit content"
                >
                    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="arc-gradient-fused" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="var(--resize-handle-start)" />
                                <stop offset="100%" stopColor="var(--resize-handle-end)" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M 8 32 A 24 24 0 0 1 32 8"
                            stroke="url(#arc-gradient-fused)"
                            strokeWidth="6"
                            strokeLinecap="round"
                            className={styles.handlePath}
                        />
                    </svg>
                </div>
            )}

            {/* Universal drop target: covers the entire card so connections from any other node can drop here */}
            <Handle
                type="target"
                position={Position.Top}
                isConnectableStart={false}
                id="in"
                style={{ top: '50%', left: '50%', width: '100%', height: '100%', border: 'none', background: 'transparent', transform: 'translate(-50%, -50%)', zIndex: -1 }}
            />
            {/* Visible top-right source handle (drag connections out from here) */}
            {!isConnecting && (
                <Handle type="source" position={Position.Top} className={styles.handle} isConnectableEnd={false} id="out" />
            )}


        </div>
    );
}, samePropsIgnoringPosition);
