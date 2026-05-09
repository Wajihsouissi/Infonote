import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { StickyNote, GripHorizontal } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { EditBar } from '../ui/EditBar';
import { useStore } from '../../store/useStore';
import type { Node } from '@xyflow/react';
import styles from './FusedNoteNode.module.css';
import { snapFusedDimensions, MIN_FUSED_SIZE, MIN_EXPANDED_SIZE, MAX_HEIGHT } from '../../config/layout';
import { toPastelColor, lightenColor } from '../../utils/colorUtils';

export type FusedNoteNodeData = {
    content: any[];
    color?: string;
    lastFusedAt?: number;
};

import { v4 as uuidv4 } from 'uuid';

export const FusedNoteNode = memo(({ id, data, selected }: NodeProps<Node<FusedNoteNodeData>>) => {
    const { setNodes, getViewport, deleteElements } = useReactFlow(); // Added setNodes back
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

    const contentRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const activeResize = useRef(false);

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    // Convert color to pastel for better readability
    const displayColor = data.color ? toPastelColor(data.color, theme === 'light') : undefined;
    const accentColor = data.color ? lightenColor(data.color, 15) : displayColor;

    // EditBar state
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

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
                            color: fusedNodeColor
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
                color: fusedNodeColor
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
        document.body.classList.add('infonote-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - startX) / zoom;
            const deltaY = (moveEvent.clientY - startY) / zoom;
            const rawW = startW + deltaX;
            const rawH = startH + deltaY;

            const { width, height } = snapFusedDimensions(rawW, rawH);

            if (nodeRef.current) {
                updateNode(id, { style: { width, height } });
            }
        };

        const onMouseUp = () => {
            activeResize.current = false;
            document.body.style.cursor = '';
            document.body.classList.remove('infonote-resizing-active');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
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

    const handleContentUpdate = useCallback((blocks: any[]) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    return (
        <div
            className={`
                ${styles.fusedNoteNode} 
                ${selected ? styles.selected : ''} 
                ${isMultiSelected ? styles.multiSelected : ''}
                ${isDragging ? styles.dragging : ''}
                ${isDropTarget && dropType === 'nesting' ? styles.dropTarget : ''}
                ${isDropTarget && dropType === 'fusion' ? styles.fusionTarget : ''}
                ${isFusing ? styles.fusing : ''}
            `}
            ref={nodeRef}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onDrop={(e) => {
                // Stop propagation to prevent ReactFlow's onDrop from catching it
                // The BlockEditor inside handles its own drops
                e.stopPropagation();
            }}
            style={{
                backgroundColor: displayColor || undefined,
                // Force dark text contrast when a custom color is active (pastel background)
                ...(displayColor ? {
                    '--color-text-main': '#1f2937',
                    '--color-text-muted': '#6b7280',
                    '--color-border': 'rgba(0,0,0,0.2)',
                    '--note-bg-dynamic': data.color,
                    color: '#1f2937'
                } : {})
            }}
        >
            {/* Top accent strip using the note color */}
            <div
                className={styles.accentStrip}
                style={{ backgroundColor: accentColor || 'var(--color-primary)' }}
            />

            {/* Floating Handle - Centered Top */}
            <div className={`custom-drag-handle ${styles.floatingHandle}`}>
                <GripHorizontal size={16} />
            </div>

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

            <Handle type="source" position={Position.Top} className={styles.handle} id="connection" />

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
