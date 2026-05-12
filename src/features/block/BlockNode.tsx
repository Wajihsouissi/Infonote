import { memo, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockEditor } from '../editor/BlockEditor';
import { EditBar } from '../ui/EditBar';
import { useStore } from '../../store/useStore';

import type { NoteNode } from '../../types';
import styles from './BlockNode.module.css';
import { toPastelColor } from '../../utils/colorUtils';
import { snapMediaDimensions } from '../../config/layout';

// BlockNode is a "headless" or "chromeless" text unit.
export const BlockNode = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    const { setNodes, deleteElements } = useReactFlow();
    const updateNodeData = useStore(s => s.updateNodeData);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const theme = useStore(s => s.theme);

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    // Convert color to pastel for better readability
    const displayColor = data.color ? toPastelColor(data.color, theme === 'light') : undefined;

    // EditBar state
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

    const isSingleMedia = Array.isArray(data.content) && data.content.length === 1 && (data.content[0].type === 'image' || data.content[0].type === 'video' || data.content[0].type === 'file');
    const isSingleColor = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'color';

    useLayoutEffect(() => {
        setNodes(nodes => nodes.map(n => {
            if (n.id === id) {
                const needsHeightAuto = n.style?.height !== 'auto';
                const needsWidthAuto = !isSingleMedia && n.style?.width !== 'auto';
                const needsMediaWidthInit = isSingleMedia && (n.style?.width === 'auto' || n.style?.width === undefined);
                
                if (needsHeightAuto || needsWidthAuto || needsMediaWidthInit) {
                    return { 
                        ...n, 
                        style: { 
                            ...n.style, 
                            height: 'auto', 
                            ...(needsWidthAuto ? { width: 'auto' } : {}),
                            ...(needsMediaWidthInit ? { width: 208 } : {})
                        } 
                    };
                }
            }
            return n;
        }));
    }, [id, setNodes, isSingleMedia]);

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

    const handleUpdate = useCallback((blocks: any) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    const activeResize = useRef(false);
    const nodeRef = useRef<HTMLDivElement>(null);

    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Need to use getViewport from ReactFlow state. useReactFlow() doesn't expose getViewport directly, 
        // wait, useStore has zoom, but we can just use the transform from ReactFlow context if we need.
        // Actually, let's just use useReactFlow().getZoom()
        const rf = useReactFlow();
        const zoom = rf.getZoom();
        const startX = e.clientX;

        if (!nodeRef.current) return;
        const rect = nodeRef.current.getBoundingClientRect();
        const startW = rect.width / zoom;

        activeResize.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.classList.add('infonote-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - startX) / zoom;
            const rawW = startW + deltaX;

            const width = snapMediaDimensions(rawW);

            setNodes(nodes => nodes.map(n => {
                if (n.id === id) {
                    return { ...n, style: { ...n.style, width } };
                }
                return n;
            }));
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

    const baseClassName = isSingleColor ? styles.colorBlockNode : styles.blockNode;

    return (
        <div
            ref={nodeRef}
            className={`${baseClassName} ${isSingleMedia ? styles.mediaBlockNode : ''} ${selected ? styles.selected : ''} ${isMultiSelected ? styles.multiSelected : ''}`}
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
            }}
        >
            <div className={`${styles.content}`}>
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={true}
                    onUpdate={handleUpdate}
                    mode="atomic"
                    hideBlockHandles={false}
                    disableMediaControls={true}
                    promoteBlockHandles={true}
                />
            </div>

            <Handle type="source" position={Position.Top} className={styles.handle} id="connection" />

            {/* Resize Handle for Media Blocks */}
            {isSingleMedia && selected && (
                <div
                    className={styles.resizeHandle}
                    onMouseDown={handleResizeStart}
                />
            )}

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
