import { memo, useState, useLayoutEffect, useCallback, useRef, useMemo, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote, Copy, Check, Loader2 } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { ColorBlockModal } from '../editor/ColorBlockModal';
import { ConvertCardModal, type ConvertCardResult } from '../card/ConvertCardModal';

import { useStore } from '../../store/useStore';

import type { NoteNode } from '../../types';
import styles from './BlockNode.module.css';
import { toPastelColor, darkenColor } from '../../utils/colorUtils';
import { snapMediaDimensions, MIN_EXPANDED_SIZE, ICON_SIZE } from '../../config/layout';
import { v4 as uuidv4 } from 'uuid';

const useGlobalListIndex = (nodeId: string, isSingleNumbered: boolean) => {
    return useStore(
        useCallback(
            (state) => {
                if (!isSingleNumbered) return undefined;
                
                const node = state.nodes.find(n => n.id === nodeId);
                if (!node || node.type !== 'block' || !(node.data as any).isStandaloneBlock) return undefined;
                
                // Get all nodes in the same column that are also standalone blocks
                const siblings = state.nodes.filter(n => 
                    n.type === 'block' && 
                    (n.data as any).isStandaloneBlock && 
                    Math.abs(n.position.x - node.position.x) < 50
                );
                
                // Sort by Y position
                siblings.sort((a, b) => a.position.y - b.position.y);
                
                // Find our node and calculate its list index by walking backwards
                const ourIndex = siblings.findIndex(n => n.id === nodeId);
                if (ourIndex === -1) return 1;
                
                let count = 1;
                for (let i = ourIndex - 1; i >= 0; i--) {
                    const sibling = siblings[i];
                    const content = (sibling.data as any).content;
                    const isNumbered = Array.isArray(content) && content.length === 1 && content[0].type === 'numbered';
                    
                    if (isNumbered) {
                        count++;
                    } else {
                        // The chain is broken by a non-numbered block
                        break;
                    }
                }
                
                return count;
            },
            [nodeId, isSingleNumbered]
        )
    );
};

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
    const [convertModalOpen, setConvertModalOpen] = useState(false);
    const [convertInitialTitle, setConvertInitialTitle] = useState('');
    const [copiedHex, setCopiedHex] = useState(false);
    const colorOriginalRef = useRef<string>('');

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

    const isMultiSelected = selectedCanvasNodeIds.has(id);

    const isSingleMedia = Array.isArray(data.content) && data.content.length === 1 && (data.content[0].type === 'image' || data.content[0].type === 'video' || data.content[0].type === 'file');
    const isSingleLink = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'link';
    const isSingleColor = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'color';
    const isSingleNumbered = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'numbered';
    const singleColorValue = isSingleColor ? (data.content?.[0]?.content || '#1E944A') : undefined;
    const isColumns = Array.isArray(data.content) && data.content.length === 1 && data.content[0].type === 'columns';
    const isWideBlock = Array.isArray(data.content) && data.content.length === 1 && ['callout', 'code', 'quote', 'link'].includes(data.content[0].type);
    // Text, headings & lists size to their content: start at 4 units (208px) and grow to a max of 8 units (432px), then wrap.
    const isAutoWidthText = Array.isArray(data.content) && data.content.length === 1 && ['text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo'].includes(data.content[0].type);
    const isResizable = isSingleMedia || isSingleLink;

    const globalListIndex = useGlobalListIndex(id, isSingleNumbered);

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
                // Text & headings flow with their content (4 -> 8 units, then wrap) instead of a fixed width.
                const needsAutoWidthInit = isAutoWidthText && !isResizable && !isColumns && !isSingleColor && !isWideBlock && n.style?.width !== 'fit-content';
                const needsWidthInit = !isAutoWidthText && !isResizable && !isColumns && !isSingleColor && !isWideBlock && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsResizableWidthInit = isResizable && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsColumnsWidthInit = isColumns && (n.style?.width === 'auto' || n.style?.width === undefined);
                const needsColorInit = isSingleColor && (n.style?.width !== ICON_SIZE || n.style?.height !== ICON_SIZE);
                const needsWideBlockInit = isWideBlock && (n.style?.width !== MIN_EXPANDED_SIZE);

                if (needsHeightAuto || needsAutoWidthInit || needsWidthInit || needsResizableWidthInit || needsColumnsWidthInit || needsColorInit || needsWideBlockInit) {
                    return {
                        ...n,
                        style: {
                            ...n.style,
                            ...(needsHeightAuto ? { height: 'auto' } : {}),
                            ...(needsAutoWidthInit ? { width: 'fit-content' } : {}),
                            ...(needsWidthInit ? { width: MIN_EXPANDED_SIZE } : {}),
                            ...(needsWideBlockInit ? { width: MIN_EXPANDED_SIZE } : {}),
                            ...(needsResizableWidthInit ? { width: isSingleLink ? 432 : 208 } : {}),
                            ...(needsColumnsWidthInit ? { width: 550 } : {}),
                            ...(needsColorInit ? { width: ICON_SIZE, height: ICON_SIZE } : {})
                        }
                    };
                }
            }
            return n;
        }));
    }, [id, setNodes, isResizable, isColumns, isSingleLink, isSingleColor, isWideBlock, isAutoWidthText]);





    const handleUpdate = useCallback((blocks: any) => {
        updateNodeData(id, { content: blocks });
    }, [id, updateNodeData]);

    const handleConvertToCard = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        const { nodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        setConvertInitialTitle('');
        setConvertModalOpen(true);
    }, [id]);

    const confirmConvertToCard = useCallback((result: ConvertCardResult) => {
        setConvertModalOpen(false);
        
        const { nodes, setNodes } = useStore.getState();
        const thisNode = nodes.find(n => n.id === id);
        if (!thisNode) return;

        setNodes((currentNodes) => currentNodes.map(n => {
            if (n.id === id) {
                let width = 432;
                let height = 432;
                
                if (result.viewMode === 'icon') {
                    width = 96; height = 96;
                } else if (result.viewMode === 'titleview') {
                    width = 208; height = 56;
                } else if (result.viewMode === 'medium') {
                    width = 208; height = 208;
                }

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
    const isSkeleton = (data as any).isAISkeleton;

    return (
        <div
            ref={nodeRef}
            className={`${baseClassName} ${(isSingleMedia || isSingleLink) ? styles.mediaBlockNode : ''} ${isSingleLink ? styles.linkBlockNode : ''} ${isWideBlock ? styles.wideBlock : ''} ${isAutoWidthText ? styles.autoWidth : ''} ${selected ? styles.selected : ''} ${isMultiSelected ? styles.multiSelected : ''} custom-drag-handle`}
            style={{
                backgroundColor: (isSingleMedia || isSingleLink) ? 'transparent' : (displayColor || undefined),
                ...dynamicStyles
            }}
        >
            {/* Interaction Overlay: Converts the entire node into a drag handle when unselected */}
            {!isInteractive && !isLinkingMode && !isSingleColor && (
                <div
                    className="interaction-overlay"
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

            {convertModalOpen && (
                <ConvertCardModal
                    initialTitle={convertInitialTitle}
                    initialColor={(data as any).color}
                    content={data.content as any[]}
                    onConfirm={confirmConvertToCard}
                    onClose={() => setConvertModalOpen(false)}
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
                style={isSkeleton ? { 
                    opacity: 0.8, 
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100%'
                } : undefined}
            >
                {isSkeleton ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary, #8b5cf6)', fontWeight: 'bold', fontSize: '14px' }}>
                        <Loader2 className="animate-spin" size={16} /> 
                        {Array.isArray(data.content) ? data.content[0]?.content : 'Generating...'}
                    </div>
                ) : (
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
                        globalStartIndex={globalListIndex}
                    />
                )}
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
            {(isResizable || isColumns) && (
                <div
                    className={styles.resizeHandle}
                    onMouseDown={handleResizeStart}
                >
                    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="canvas-media-arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#A78BFA" />
                                <stop offset="100%" stopColor="#60A5FA" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M 8 32 A 24 24 0 0 1 32 8"
                            stroke="url(#canvas-media-arc-gradient)"
                            strokeWidth="6"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            )}


        </div>
    );
});
