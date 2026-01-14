import { memo, useLayoutEffect, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockEditor } from '../editor/BlockEditor';
import { EditBar } from '../ui/EditBar';
import { useStore } from '../../store/useStore';

import type { NoteNode } from '../../types';
import styles from './BlockNode.module.css';

// BlockNode is a "headless" or "chromeless" text unit.
export const BlockNode = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    const { updateNodeData, setNodes, deleteElements } = useReactFlow();

    // EditBar state
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

    useLayoutEffect(() => {
        setNodes(nodes => nodes.map(n => {
            if (n.id === id && n.style?.height !== 'auto') {
                return { ...n, style: { ...n.style, height: 'auto' } };
            }
            return n;
        }));
    }, [id, setNodes]);

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

    const isSingleMedia = Array.isArray(data.content) && data.content.length === 1 && (data.content[0].type === 'image' || data.content[0].type === 'video' || data.content[0].type === 'file');

    return (
        <div
            className={`${styles.blockNode} ${isSingleMedia ? styles.mediaBlockNode : ''} ${selected ? styles.selected : ''}`}
            onContextMenu={handleContextMenu}
            style={{
                backgroundColor: data.color || undefined,
            }}
        >
            <div className={`${styles.content}`}>
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={true} // Keep it clean
                    onUpdate={(blocks) => updateNodeData(id, { content: blocks })}
                    mode="atomic"
                    hideBlockHandles={false}
                    disableMediaControls={true}
                    promoteBlockHandles={true}
                />
            </div>

            <Handle type="target" position={Position.Top} className={styles.handle} />
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
