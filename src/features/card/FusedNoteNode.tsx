import { memo, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';

import { useStore } from '../../store/useStore';
import type { Node } from '@xyflow/react';
import styles from './FusedNoteNode.module.css';
import { snapFusedDimensions, MIN_EXPANDED_SIZE } from '../../config/layout';
import { toPastelColor, lightenColor, darkenColor } from '../../utils/colorUtils';

export type FusedNoteNodeData = {
    content: any[];
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
    const interactionState = useStore(s => s.interactionState);
    const theme = useStore(s => s.theme);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const linkSelectedNodes = useStore(s => s.linkSelectedNodes);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const setNodesStore = useStore(s => s.setNodes);

    const isDragging = interactionState.draggedNodeId === id;
    const isDropTarget = interactionState.dropTarget?.id === id;
    const dropType = isDropTarget ? interactionState.dropTarget?.type : null;

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

    const contentRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const activeResize = useRef(false);

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    // Convert color to pastel for better readability
    const displayColor = data.color ? toPastelColor(data.color, theme === 'light') : undefined;
    const accentColor = data.color ? lightenColor(data.color, 15) : displayColor;

    // Dynamic styles for contrast
    const dynamicStyles = useMemo(() => {
        if (!displayColor) return {};

        // Smart high-contrast colors derived from the bg color for exceptional readability
        const darkText = darkenColor(displayColor, 80); // 80% darken for main text (flawless readability)
        const mutedText = darkenColor(displayColor, 65); // 65% darken for secondary text
        const borderColor = darkenColor(displayColor, 40); // 40% darken for borders

        return {
            '--color-text-main': darkText,
            '--color-text-muted': mutedText,
            '--color-border': `${borderColor}40`,
            '--glass-border': `${borderColor}40`,
            '--icon-color': darkText,
            '--note-bg-dynamic': data.color,
            '--table-bg': `${displayColor}26`,
            '--table-header-bg': `${displayColor}3d`,
            '--table-row-hover-bg': `${displayColor}33`,
            '--table-cell-focus-bg': `${displayColor}4d`,
            '--table-controls-bg': `${displayColor}22`,
            '--table-btn-hover-bg': `${displayColor}33`,
            '--table-border': `${borderColor}33`,
            '--table-border-strong': `${borderColor}55`,
            '--table-focus-ring': `${borderColor}80`,
            '--link-bg': `${borderColor}15`,
            '--link-bg-hover': `${borderColor}25`,
            '--link-border': `${borderColor}25`,
            '--link-border-hover': `${borderColor}40`,
            '--link-shadow': `${darkText}1a`,
            color: darkText,
            caretColor: darkText,
        } as React.CSSProperties;
    }, [displayColor, data.color]);

    // Get the node's style from the store to check if it has been manually resized
    const nodeStyle = useStore(s => s.nodes.find(n => n.id === id)?.style);
    const hasManualHeight = nodeStyle?.height !== undefined;

    const dynamicStyle = {
        backgroundColor: displayColor || undefined,
        ...dynamicStyles,
        display: 'flex',
        flexDirection: 'column' as const,
        ...(hasManualHeight ? {
            height: '100%',
        } : {
            height: 'auto',
            minHeight: '208px', // 4 units
            maxHeight: '432px', // 8 units
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

        if (!thisNode) {
            console.warn("FusedNoteNode: Node not found in store", id);
            return;
        }

        // Get color from the actual node data in store
        const fusedNodeColor = (thisNode.data as any).color;

        // If no parent, we can just transform the node type (Root Level Fused Note)
        const parentId = thisNode.parentId;
        if (!parentId) {
            setNodes((currentNodes) => currentNodes.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        type: 'note',
                        data: {
                            label: (data.content[0]?.content) || 'Created Note',
                            viewMode: 'expanded',
                            content: data.content,
                            description: '',
                            date: new Date().toISOString(),
                            color: fusedNodeColor,
                            showMetadata: false // Default to hidden metadata
                        },
                        style: {
                            ...n.style,
                            width: MIN_EXPANDED_SIZE,
                            height: MIN_EXPANDED_SIZE,
                        }
                    } as any;
                }
                return n;
            }));
            return;
        }

        // Nested Fused Note: Must update Parent Content
        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return;

        const parentContent = (parentNode.data as any).content;
        if (!Array.isArray(parentContent)) return;

        const myBlocks = data.content;
        if (!myBlocks || myBlocks.length === 0) return;

        // Find blocks in parent
        const firstBlockId = myBlocks[0].id;
        const startIndex = parentContent.findIndex((b: any) => b.id === firstBlockId);

        if (startIndex === -1) return;

        // 1. Prepare New Node
        const newNodeId = uuidv4();
        const newNode = {
            id: newNodeId,
            type: 'note',
            parentId: parentId,
            position: thisNode.position,
            data: {
                label: myBlocks[0].content || 'New Note',
                content: myBlocks,
                viewMode: 'expanded',
                date: new Date().toISOString(),
                color: fusedNodeColor,
                showMetadata: false // Default to hidden metadata
            },
            style: { width: MIN_EXPANDED_SIZE, height: MIN_EXPANDED_SIZE },
            zIndex: 10
        };

        // 2. Prepare Page Block to replace fused blocks
        const pageBlock = {
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

            const oldContent = (parentNode.data as any).content || [];
            // Create a shallow copy to modify
            const newParentContent = [...oldContent];

            // Re-find index in authoritative state
            const currentStartIndex = newParentContent.findIndex((b: any) => b.id === firstBlockId);

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
                } as any,
                // New Node
                newNode as any
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





    const handleContentUpdate = useCallback((blocks: any[]) => {
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
                        backgroundColor: isHoveredLinking ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.04)',
                        border: '2px solid transparent',
                        borderColor: isHoveredLinking ? '#06b6d4' : 'transparent',
                        boxShadow: isHoveredLinking ? '0 0 15px rgba(6, 182, 212, 0.4)' : 'none',
                        transition: 'all 0.2s ease',
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
                ref={contentRef}
                onWheelCapture={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                style={contentStyle}
            >
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={false}
                    onUpdate={handleContentUpdate}
                    nodeId={id}
                    hideBlockHandles={false}
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
                            <stop offset="0%" stopColor="#A78BFA" />
                            <stop offset="100%" stopColor="#60A5FA" />
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
