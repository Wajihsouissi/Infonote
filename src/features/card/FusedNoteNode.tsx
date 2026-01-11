import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { StickyNote, GripHorizontal } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { EditBar } from '../ui/EditBar';
import { useStore } from '../../store/useStore';
import type { Node } from '@xyflow/react';
import styles from './FusedNoteNode.module.css';

export type FusedNoteNodeData = {
    content: any[];
    color?: string;
};

export const FusedNoteNode = memo(({ id, data, selected }: NodeProps<Node<FusedNoteNodeData>>) => {
    const { updateNodeData, setNodes, getViewport, deleteElements } = useReactFlow();
    const contentRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const activeResize = useRef(false);

    // EditBar state
    const [showEditBar, setShowEditBar] = useState(false);
    const [editBarPosition, setEditBarPosition] = useState({ x: 0, y: 0 });

    // Auto-fit height logic - respecting manual resize if set
    useLayoutEffect(() => {
        setNodes(nodes => nodes.map(n => {
            // Only force auto if height is not set at all (initial state)
            if (n.id === id && !n.style?.height) {
                return { ...n, style: { ...n.style, height: 'auto' } };
            }
            return n;
        }));
    }, [id, setNodes]);

    const handleConvertToCard = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        setNodes((nodes) => nodes.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    type: 'note',
                    data: {
                        ...n.data,
                        label: 'Created Note',
                        viewMode: 'medium',
                        content: data.content,
                        description: '',
                        date: new Date().toISOString()
                    },
                    style: {
                        ...n.style,
                        width: 224,
                        height: 224,
                    }
                };
            }
            return n;
        }));
    }, [id, data.content, setNodes]);

    // Resizing Logic from NoteCard
    const SNAP_Step = 112;
    const GRID_GAP = 16;
    const MIN_SIZE = 112 - GRID_GAP; // 96px (Icon size)

    const getStrictSize = useCallback((rawWidth: number, rawHeight: number) => {
        const normalizedW = rawWidth + GRID_GAP;
        const normalizedH = rawHeight + GRID_GAP;

        let w = Math.round(normalizedW / SNAP_Step) * SNAP_Step;
        let h = Math.round(normalizedH / SNAP_Step) * SNAP_Step;

        w = w - GRID_GAP;
        h = h - GRID_GAP;

        w = Math.max(MIN_SIZE, w);
        h = Math.max(MIN_SIZE, h);

        return { width: w, height: h };
    }, [SNAP_Step, GRID_GAP, MIN_SIZE]);

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

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - startX) / zoom;
            const deltaY = (moveEvent.clientY - startY) / zoom;

            const rawW = startW + deltaX;
            const rawH = startH + deltaY;

            // Strict snap during drag for visual consistency
            const { width, height } = getStrictSize(rawW, rawH);

            setNodes(nodes => nodes.map(n => {
                if (n.id === id) {
                    // Verify change to avoid updates
                    const currentW = n.style?.width;
                    const currentH = n.style?.height;
                    if (currentW !== width || currentH !== height) {
                        return { ...n, style: { ...n.style, width, height } };
                    }
                }
                return n;
            }));
        };

        const onMouseUp = () => {
            activeResize.current = false;
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

    return (
        <div
            className={`${styles.fusedNoteNode} ${selected ? styles.selected : ''}`}
            ref={nodeRef}
            onContextMenu={handleContextMenu}
            style={{
                backgroundColor: data.color || undefined,
            }}
        >
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

            <div className={`${styles.content} nodrag`} ref={contentRef}>
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={false}
                    onUpdate={(blocks) => updateNodeData(id, { content: blocks })}
                    nodeId={id}
                    hideBlockHandles={true}
                />
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
