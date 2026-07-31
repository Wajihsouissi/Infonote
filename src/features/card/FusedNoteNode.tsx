import { memo, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { ConvertCardModal, type ConvertCardResult } from '../card/ConvertCardModal';

import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { Node } from '@xyflow/react';
import styles from './FusedNoteNode.module.css';
import { snapFusedDimensions, MIN_EXPANDED_SIZE, MAX_HEIGHT } from '../../config/layout';
import type { AppNode } from '../../types';
import type { Block } from '../editor/types';

export type FusedNoteNodeData = {
    content: Block[];
    color?: string;
    lastFusedAt?: number;
};

import { v4 as uuidv4 } from 'uuid';

export const FusedNoteNode = memo(({ id, data, selected }: NodeProps<Node<FusedNoteNodeData>>) => {
    const { getViewport } = useReactFlow();
    const connection = useConnection();
    const isConnecting = connection.inProgress;
    const updateNodeData = useStore(s => s.updateNodeData);
    const updateNode = useStore(s => s.updateNode);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const theme = useStore(s => s.theme);
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
    const [convertModalOpen, setConvertModalOpen] = useState(false);
    const [convertInitialTitle, setConvertInitialTitle] = useState('');
    const lastFusedTimeRef = useRef(data.lastFusedAt || 0);

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

    const isMultiSelected = selectedCanvasNodeIds.has(id) && selectedCanvasNodeIds.size > 1;

    // Get the node's style from the store to check if it has been manually resized
    const nodeStyle = useStore(s => getNodeById(s.nodes, id)?.style);
    const hasManualHeight = nodeStyle?.height !== undefined;

    const dynamicStyle: React.CSSProperties = {
        ['--node-accent-color' as string]: data.color || 'var(--block-rail)',
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

        const { nodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        setConvertInitialTitle('');
        setConvertModalOpen(true);
    }, [id, data.content]);

    const confirmConvertToCard = useCallback((result: ConvertCardResult) => {
        setConvertModalOpen(false);
        const { nodes, setNodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);

        if (!thisNode) {
            console.warn("FusedNoteNode: Node not found in store", id);
            return;
        }

        let width = MIN_EXPANDED_SIZE;
        let height = MIN_EXPANDED_SIZE;
        
        if (result.viewMode === 'icon') {
            width = 96; height = 96;
        } else if (result.viewMode === 'titleview') {
            width = 208; height = 56;
        } else if (result.viewMode === 'medium') {
            width = 208; height = 208;
        }

        // If no parent, we can just transform the node type (Root Level Fused Note)
        const parentId = thisNode.parentId;
        if (!parentId) {
            setNodes((currentNodes) => currentNodes.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        type: 'note',
                        data: {
                            label: result.title,
                            viewMode: result.viewMode,
                            content: result.content,
                            description: '',
                            date: new Date().toISOString(),
                            color: result.color,
                            tags: result.tags,
                            showMetadata: result.tags.length > 0
                        },
                        style: {
                            ...n.style,
                            width,
                            height,
                        }
                    } as AppNode;
                }
                return n;
            }));
            return;
        }

        // Nested Fused Note: Must update Parent Content
        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return;

        const parentContent = 'content' in parentNode.data ? parentNode.data.content : undefined;
        if (!Array.isArray(parentContent)) return;

        const myBlocks = data.content;
        if (!myBlocks || myBlocks.length === 0) return;

        // Find blocks in parent
        const firstBlockId = myBlocks[0].id;
        const startIndex = parentContent.findIndex((b) => b.id === firstBlockId);

        if (startIndex === -1) return;

        // 1. Prepare New Node
        const newNodeId = uuidv4();
        const newNode = {
            id: newNodeId,
            type: 'note',
            parentId: parentId,
            position: thisNode.position,
            data: {
                label: result.title,
                content: result.content,
                viewMode: result.viewMode,
                date: new Date().toISOString(),
                color: result.color,
                tags: result.tags,
                showMetadata: result.tags.length > 0
            },
            style: { width, height },
            zIndex: 10
        };

        // 2. Prepare Page Block to replace fused blocks
        const pageBlock: Block = {
            id: uuidv4(),
            type: 'page',
            content: myBlocks[0].content || 'New Note',
            metadata: { nodeId: newNodeId }
        };

        // 3. Update Store Atomically
        setNodes((currentNodes) => {
            const parentNode = currentNodes.find(n => n.id === parentId);
            if (!parentNode) {
                console.error("FusedNoteNode: Parent not found during update");
                return currentNodes;
            }

            const oldContent: Block[] = 'content' in parentNode.data && Array.isArray(parentNode.data.content)
                ? parentNode.data.content : [];
            // Create a shallow copy to modify
            const newParentContent = [...oldContent];

            // Re-find index in authoritative state
            const currentStartIndex = newParentContent.findIndex((b) => b.id === firstBlockId);

            if (currentStartIndex !== -1) {
                console.log("FusedNoteNode: Splicing content at index", currentStartIndex, "replacing", myBlocks.length, "blocks");
                newParentContent.splice(currentStartIndex, myBlocks.length, pageBlock);
            } else {
                console.error("FusedNoteNode: Could not find block sequence in parent content!", firstBlockId);
                // Abort to prevent duplicates/instability
                return currentNodes;
            }

            // FILTER CHECK
            const filteredNodes = currentNodes.filter(n => n.id !== id && n.id !== parentId);
            const removedCount = currentNodes.length - filteredNodes.length;
            // Logging disabled

            if (removedCount < 2) {
                // Check what we missed
                if (currentNodes.some(n => n.id === id)) console.warn("Fused ID still present in filtered?");
                if (currentNodes.some(n => n.id === parentId)) console.warn("Parent ID still present in filtered?");
                // Force strict filter again by ID string?
            }

            console.log("FusedNoteNode: Conversion Successful. Removing fused node, adding note.");

            return filteredNodes.concat([
                // Updated Parent
                {
                    ...parentNode,
                    data: { ...parentNode.data, content: newParentContent }
                } as AppNode,
                // New Node
                newNode as AppNode
            ]);
        });

    }, [id, data.content]);

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
                ${isFusing ? styles.fusing : ''}
            `}
            ref={nodeRef}
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
                        linkSelectedNodes(id, Array.from(selectedCanvasNodeIds));
                        setIsLinkingMode(false);
                        clearCanvasSelection();
                        setNodesStore(nds => nds.map(n => n.selected ? { ...n, selected: false } : n));
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

            {convertModalOpen && (
                <ConvertCardModal
                    initialTitle={convertInitialTitle}
                    initialColor={data.color}
                    content={data.content}
                    onConfirm={confirmConvertToCard}
                    onClose={() => setConvertModalOpen(false)}
                />
            )}


            {/* Conversion Button */}
            <button
                className={styles.convertBtn}
                onClick={handleConvertToCard}
                title="Convert to Card"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <StickyNote size={16} />
            </button>

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
            <div
                className={`${styles.modernResizeHandle} nodrag`}
                onMouseDown={handleResizeStart}
            >
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="arc-gradient-fused" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent)" />
                            <stop offset="100%" stopColor="var(--secondary)" />
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
});
