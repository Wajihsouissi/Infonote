import { memo, useState, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote, Copy, Check } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { ColorBlockModal } from '../editor/ColorBlockModal';

import { useStore } from '../../store/useStore';

import type { NoteNode } from '../../types';
import styles from './BlockNode.module.css';
import { toPastelColor, darkenColor } from '../../utils/colorUtils';
import { snapMediaDimensions, MIN_EXPANDED_SIZE, ICON_SIZE } from '../../config/layout';
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
    const [isHoveredColorBlock, setIsHoveredColorBlock] = useState(false);
    const [colorModalOpen, setColorModalOpen] = useState(false);
    const [copiedHex, setCopiedHex] = useState(false);
    const colorOriginalRef = useRef<string>('');

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    const isSingleMedia = Array.isArray(data.content) && data.content.length === 1 && (data.content[0].type === 'image' || data.content[0].type === 'video' || data.content[0].type === 'file');
    const isSingleLink = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'link';
    const isSingleColor = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'color';
    const singleColorValue = isSingleColor ? (data.content?.[0]?.content || '#1E944A') : undefined;
    const isColumns = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'columns';
    const isResizable = isSingleMedia || isSingleLink;

    // Convert color to pastel for better readability
    const displayColor = singleColorValue || (data.color ? toPastelColor(data.color, theme === 'light') : undefined);
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

    useLayoutEffect(() => {
        setNodes(nodes => nodes.map(n => {
            if (n.id === id) {
                const needsHeightAuto = !isSingleColor && n.style?.height !== 'auto';
                const needsWidthAuto = !isResizable && !isColumns && !isSingleColor && n.style?.width !== 'auto';
                const needsResizableWidthInit = isResizable && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsColumnsWidthInit = isColumns && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsColorInit = isSingleColor && (n.style?.width !== ICON_SIZE || n.style?.height !== ICON_SIZE);
                
                if (needsHeightAuto || needsWidthAuto || needsResizableWidthInit || needsColumnsWidthInit || needsColorInit) {
                    return { 
                        ...n, 
                        style: { 
                            ...n.style, 
                            ...(needsHeightAuto ? { height: 'auto' } : {}), 
                            ...(needsWidthAuto ? { width: 'auto' } : {}),
                            ...(needsResizableWidthInit ? { width: isSingleLink ? 320 : 208 } : {}),
                            ...(needsColumnsWidthInit ? { width: 550 } : {}),
                            ...(needsColorInit ? { width: ICON_SIZE, height: ICON_SIZE } : {})
                        } 
                    };
                }
            }
            return n;
        }));
    }, [id, setNodes, isResizable, isColumns, isSingleLink, isSingleColor]);





    const handleUpdate = useCallback((blocks: any) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    const handleConvertToCard = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        const { nodes, setNodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        const blockColor = (thisNode.data as any).color;
        const blockContent = (thisNode.data as any).content;
        
        let label = 'Created Note';
        if (Array.isArray(blockContent) && blockContent[0]?.content && typeof blockContent[0].content === 'string') {
            const stripped = blockContent[0].content.replace(/<[^>]+>/g, '').trim();
            if (stripped) label = stripped;
        }

        setNodes((currentNodes) => currentNodes.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    type: 'note',
                    data: {
                        label,
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
            {/* Canvas color block: transparent click overlay to open modal without fighting ReactFlow drag */}
            {isSingleColor && !isLinkingMode && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        background: 'transparent',
                        cursor: 'pointer',
                        zIndex: 10,
                        borderRadius: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '12px'
                    }}
                    onMouseEnter={() => setIsHoveredColorBlock(true)}
                    onMouseLeave={() => setIsHoveredColorBlock(false)}
                    onMouseDown={(e) => {
                        // Stop propagation so ReactFlow doesn't hijack this as a drag start
                        e.stopPropagation();
                    }}
                    onClick={() => {
                        colorOriginalRef.current = singleColorValue || '#1E944A';
                        setColorModalOpen(true);
                    }}
                    title="Edit color"
                >
                    <div 
                        style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(4px)',
                            color: '#fff',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            alignSelf: 'center',
                            cursor: 'copy',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: isHoveredColorBlock || copiedHex ? 1 : 0,
                            pointerEvents: isHoveredColorBlock || copiedHex ? 'auto' : 'none',
                            transform: isHoveredColorBlock || copiedHex ? 'translateY(0)' : 'translateY(4px)'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(singleColorValue || '#1E944A');
                            setCopiedHex(true);
                            setTimeout(() => setCopiedHex(false), 2000);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)'}
                    >
                        {copiedHex ? <Check size={12} /> : <Copy size={12} />}
                        {copiedHex ? 'Copied!' : (singleColorValue || '#1E944A').toUpperCase()}
                    </div>
                </div>
            )}

            {colorModalOpen && isSingleColor && (
                <ColorBlockModal
                    color={singleColorValue || '#1E944A'}
                    originalColor={colorOriginalRef.current}
                    metadata={(data.content as any[])?.[0]?.metadata}
                    onChange={(newColor, newMeta) => {
                        const newBlocks = (data.content as any[]).map((b: any, i: number) =>
                            i === 0 ? { ...b, content: newColor, metadata: newMeta } : b
                        );
                        updateNodeData(id, { content: newBlocks });
                    }}
                    onClose={() => setColorModalOpen(false)}
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
