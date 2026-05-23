import { memo, useState, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';

import { useStore } from '../../store/useStore';

import type { NoteNode } from '../../types';
import styles from './BlockNode.module.css';
import { toPastelColor, darkenColor } from '../../utils/colorUtils';
import { snapMediaDimensions, MIN_EXPANDED_SIZE } from '../../config/layout';
import { v4 as uuidv4 } from 'uuid';

// BlockNode is a "headless" or "chromeless" text unit.
export const BlockNode = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    const { setNodes, getViewport } = useReactFlow();
    const connection = useConnection();
    const isConnecting = connection.inProgress;
    const updateNodeData = useStore(s => s.updateNodeData);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const theme = useStore(s => s.theme);
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const setIsLinkingMode = useStore(s => s.setIsLinkingMode);
    const linkSelectedNodes = useStore(s => s.linkSelectedNodes);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const setNodesStore = useStore(s => s.setNodes);
    const [isHoveredLinking, setIsHoveredLinking] = useState(false);

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    // Convert color to pastel for better readability
    const displayColor = data.color ? toPastelColor(data.color, theme === 'light') : undefined;
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
            '--color-border': `${borderColor}40`, // 40% opacity
            '--glass-border': `${borderColor}40`,
            '--icon-color': darkText,
            '--table-bg': `${displayColor}26`,
            '--table-header-bg': `${displayColor}3d`,
            '--table-row-hover-bg': `${displayColor}33`,
            '--table-cell-focus-bg': `${displayColor}4d`,
            '--table-controls-bg': `${displayColor}22`,
            '--table-btn-hover-bg': `${displayColor}33`,
            '--table-border': `${borderColor}33`,
            '--table-border-strong': `${borderColor}55`,
            '--table-focus-ring': `${borderColor}80`,
        } as React.CSSProperties;
    }, [displayColor]);
    const isSingleMedia = Array.isArray(data.content) && data.content.length === 1 && (data.content[0].type === 'image' || data.content[0].type === 'video' || data.content[0].type === 'file');
    const isSingleLink = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'link';
    const isSingleColor = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'color';
    const isColumns = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'columns';
    const isResizable = isSingleMedia || isSingleLink;

    useLayoutEffect(() => {
        setNodes(nodes => nodes.map(n => {
            if (n.id === id) {
                const needsHeightAuto = n.style?.height !== 'auto';
                const needsWidthAuto = !isResizable && !isColumns && n.style?.width !== 'auto';
                const needsResizableWidthInit = isResizable && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsColumnsWidthInit = isColumns && (n.style?.width === 'auto' || n.style?.width === undefined);
                
                if (needsHeightAuto || needsWidthAuto || needsResizableWidthInit || needsColumnsWidthInit) {
                    return { 
                        ...n, 
                        style: { 
                            ...n.style, 
                            height: 'auto', 
                            ...(needsWidthAuto ? { width: 'auto' } : {}),
                            ...(needsResizableWidthInit ? { width: isSingleLink ? 320 : 208 } : {}),
                            ...(needsColumnsWidthInit ? { width: 550 } : {})
                        } 
                    };
                }
            }
            return n;
        }));
    }, [id, setNodes, isResizable, isColumns, isSingleLink]);





    const handleUpdate = useCallback((blocks: any) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    const handleConvertToCard = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        const { nodes, edges, setNodes, onEdgesChange } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        const blockColor = (thisNode.data as any).color;
        const blockContent = (thisNode.data as any).content;

        const parentId = thisNode.parentId;
        if (!parentId) {
            setNodes((currentNodes) => currentNodes.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        type: 'note',
                        data: {
                            label: (Array.isArray(blockContent) && blockContent[0]?.content) || 'Created Note',
                            viewMode: 'expanded',
                            content: blockContent,
                            description: '',
                            date: new Date().toISOString(),
                            color: blockColor,
                            showMetadata: false
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

        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return;

        const parentContent = (parentNode.data as any).content;
        if (!Array.isArray(parentContent)) return;

        const myBlocks = Array.isArray(blockContent) ? blockContent : [];
        if (myBlocks.length === 0) return;

        const firstBlockId = myBlocks[0].id;
        const startIndex = parentContent.findIndex((b: any) => b.id === firstBlockId);
        if (startIndex === -1) return;

        // Remove edges connected to this block node
        const connectedEdgeIds = edges.filter(e => e.source === id || e.target === id).map(e => e.id);
        if (connectedEdgeIds.length > 0) {
            onEdgesChange(connectedEdgeIds.map(eId => ({ type: 'remove' as const, id: eId })));
        }

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
                color: blockColor,
                showMetadata: false
            },
            style: { width: MIN_EXPANDED_SIZE, height: MIN_EXPANDED_SIZE },
            zIndex: 10
        };

        const pageBlock = {
            id: uuidv4(),
            type: 'page',
            content: myBlocks[0].content || 'New Note',
            metadata: { nodeId: newNodeId }
        };

        setNodes((currentNodes) => {
            const parentNode = currentNodes.find(n => n.id === parentId);
            if (!parentNode) return currentNodes;

            const oldContent = (parentNode.data as any).content || [];
            const newParentContent = [...oldContent];
            const currentStartIndex = newParentContent.findIndex((b: any) => b.id === firstBlockId);

            if (currentStartIndex !== -1) {
                newParentContent.splice(currentStartIndex, myBlocks.length, pageBlock);
            } else {
                return currentNodes;
            }

            return currentNodes.filter(n => n.id !== id && n.id !== parentId).concat([
                { ...parentNode, data: { ...parentNode.data, content: newParentContent } } as any,
                newNode as any
            ]);
        });
    }, [id]);

    const activeResize = useRef(false);
    const nodeRef = useRef<HTMLDivElement>(null);

    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const { zoom } = getViewport();
        const startX = e.clientX;

        if (!nodeRef.current) return;
        const rect = nodeRef.current.getBoundingClientRect();
        const startW = rect.width / zoom;

        activeResize.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.classList.add('chnk-it-resizing-active');

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
            document.body.classList.remove('chnk-it-resizing-active');
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
            className={`${baseClassName} ${(isSingleMedia || isSingleLink) ? styles.mediaBlockNode : ''} ${isSingleLink ? styles.linkBlockNode : ''} ${selected ? styles.selected : ''} ${isMultiSelected ? styles.multiSelected : ''}`}
            style={{
                backgroundColor: displayColor || undefined,
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
                        console.log("[BlockNode Overlay Click] Clicked ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                        linkSelectedNodes(id, Array.from(selectedCanvasNodeIds));
                        setIsLinkingMode(false);
                        clearCanvasSelection();
                        setNodesStore(nds => nds.map(n => n.selected ? { ...n, selected: false } : n));
                    }}
                    onPointerDown={(e) => {
                        console.log("[BlockNode Overlay PointerDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseDown={(e) => {
                        console.log("[BlockNode Overlay MouseDown] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onMouseUp={(e) => {
                        console.log("[BlockNode Overlay MouseUp] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                    onDoubleClick={(e) => {
                        console.log("[BlockNode Overlay DoubleClick] ID:", id);
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                />
            )}

            <button
                className={styles.convertBtn}
                onClick={handleConvertToCard}
                title="Convert to Card"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <StickyNote size={16} />
            </button>

            <div 
                className={styles.content}
            >
                <BlockEditor
                    initialContent={data.content}
                    readOnly={false}
                    minimal={true}
                    onUpdate={handleUpdate}
                    nodeId={id}
                    mode="atomic"
                    hideBlockHandles={false}
                    disableMediaControls={true}
                    promoteBlockHandles={true}
                />
            </div>

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

            {/* Resize Handle for Resizable or Column Blocks */}
            {(isResizable || isColumns) && selected && (
                <div
                    className={styles.resizeHandle}
                    onMouseDown={handleResizeStart}
                />
            )}


        </div>
    );
});
