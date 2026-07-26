import { memo, useState, useLayoutEffect, useCallback, useRef, useMemo, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote, Copy, Check, Loader2 } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { ColorBlockModal } from '../editor/ColorBlockModal';
import { ConvertCardModal, type ConvertCardResult } from '../card/ConvertCardModal';

import { useStore } from '../../store/useStore';

import type { AppNode, NoteNode } from '../../types';
import type { Block } from '../editor/types';
import styles from './BlockNode.module.css';
import { MIN_EXPANDED_SIZE, ICON_SIZE } from '../../config/layout';

const useGlobalListIndex = (nodeId: string, isSingleNumbered: boolean) => {
    return useStore(
        useCallback(
            (state) => {
                if (!isSingleNumbered) return undefined;
                
                const node = state.nodes.find(n => n.id === nodeId);
                if (!node || node.type !== 'block' || !node.data.isStandaloneBlock) return undefined;

                // Get all nodes in the same column that are also standalone blocks
                const siblings = state.nodes.filter(n =>
                    n.type === 'block' &&
                    n.data.isStandaloneBlock &&
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
                    const content = sibling.type === 'block' ? sibling.data.content : undefined;
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
    // Narrow selectors: a block only re-renders when ITS own drop-target status changes
    // (not on every drag tick across all nodes).
    const isDropTarget = useStore(s => s.interactionState.dropTarget?.id === id);
    const dropType = useStore(s => (s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget?.type : null));
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
    const [colorOriginal, setColorOriginal] = useState<string>('');

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

    const isMultiSelected = selectedCanvasNodeIds.has(id) && selectedCanvasNodeIds.size > 1;

    const colorBlocks: Block[] = Array.isArray(data.content) ? data.content : [];
    const singleBlock = colorBlocks.length === 1 ? colorBlocks[0] : undefined;
    const isSingleMedia = singleBlock?.type === 'image' || singleBlock?.type === 'video' || singleBlock?.type === 'file';
    const isSingleLink = singleBlock?.type === 'link';
    // A link renders in one of four ways. The bookmark / embed CARDS bring their
    // own full-bleed surface and are resizable objects (like media), so they sit
    // on a transparent node. The empty "paste a URL" input and the inline text
    // link are lightweight — they should look like every other block: node
    // surface + accent spine + the standard gutter.
    const linkMode = (singleBlock?.metadata?.displayMode || 'bookmark') as 'bookmark' | 'embed' | 'text';
    const isLinkEmpty = isSingleLink && (!singleBlock?.content || singleBlock.content.trim() === '');
    const isLinkCard = isSingleLink && !isLinkEmpty && (linkMode === 'bookmark' || linkMode === 'embed');
    const isSingleColor = singleBlock?.type === 'color';
    const isSingleNumbered = singleBlock?.type === 'numbered';
    const singleColorValue = isSingleColor ? (singleBlock?.content || '#1E944A') : undefined;
    const isColumns = singleBlock?.type === 'columns';
    const standardBlockTypes = ['text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'callout', 'code', 'quote', 'link', 'toggle'];
    // A toggle keeps its nested children in the SAME node, so `singleBlock`
    // (which requires exactly one block) is undefined as soon as it has any
    // content — which silently dropped toggle nodes out of the standard-block
    // sizing/gutter treatment. A toggle-rooted node is still one logical block.
    const isToggleRoot = colorBlocks[0]?.type === 'toggle';
    // Link CARDS (bookmark/embed) are resizable rich objects, not uniform 56px
    // blocks — they must not get the standardBlock footprint. Empty and text
    // links still do, so they match the rest of the blocks.
    const isStandardBlock = (!!singleBlock && standardBlockTypes.includes(singleBlock.type) && !isLinkCard) || isToggleRoot;
    const isWideBlock = false;
    const isAutoWidthText = false;
    // Only the rich link cards resize — the empty input and text link do not.
    const isResizable = isSingleMedia || isLinkCard;

    const isMediaEmpty = isSingleMedia && (!singleBlock?.content || singleBlock.content.trim() === '');

    const globalListIndex = useGlobalListIndex(id, isSingleNumbered);

    const accentColor = singleColorValue || data.color;
    
    const dynamicStyles = useMemo(() => {
        if (!accentColor) return {};
        return {
            '--node-accent-color': accentColor,
        } as React.CSSProperties;
    }, [accentColor]);

    useLayoutEffect(() => {
        setNodes(nodes => {
            let changed = false;
            const newNodes = nodes.map(n => {
                if (n.id === id) {
                    const needsHeightAuto = !isSingleColor && n.style?.height !== 'auto';
                    // Text & headings flow with their content (4 -> 8 units, then wrap) instead of a fixed width.
                    const needsAutoWidthInit = isAutoWidthText && !isResizable && !isColumns && !isSingleColor && !isWideBlock && n.style?.width !== 'fit-content';
                    const needsWidthInit = !isAutoWidthText && !isResizable && !isColumns && !isSingleColor && !isWideBlock && (n.style?.width === 'auto' || n.style?.width === undefined);
                    // A link that just became a card may carry the 260 standard
                    // width from its empty state — widen it to the card default.
                    const needsResizableWidthInit = isResizable && (n.style?.width === 'auto' || n.style?.width === undefined || (isLinkCard && n.style?.width === 260));
                    const shouldForcePlaceholderWidth = isMediaEmpty && n.style?.width !== 208 && n.style?.width !== '208px';
                    const needsColumnsWidthInit = isColumns && (n.style?.width === 'auto' || n.style?.width === undefined);
                    const needsColorInit = isSingleColor && (n.style?.width !== ICON_SIZE || n.style?.height !== ICON_SIZE);
                    // Resizable blocks (media, link cards) own their width — don't
                    // snap them back to the 260 standard footprint every render.
                    const needsStandardInit = isStandardBlock && !isResizable && (n.style?.width !== 260);

                    if (needsHeightAuto || needsAutoWidthInit || needsWidthInit || needsResizableWidthInit || shouldForcePlaceholderWidth || needsColumnsWidthInit || needsColorInit || needsStandardInit) {
                        changed = true;
                        return {
                            ...n,
                            style: {
                                ...n.style,
                                ...(needsHeightAuto ? { height: 'auto' } : {}),
                                ...(needsStandardInit ? { width: 260 } : {}),
                                ...((needsResizableWidthInit || shouldForcePlaceholderWidth) ? { width: isLinkCard ? 432 : 208 } : {}),
                                ...(needsColumnsWidthInit ? { width: 550 } : {}),
                                ...(needsColorInit ? { width: ICON_SIZE, height: ICON_SIZE } : {})
                            }
                        };
                    }
                }
                return n;
            });
            return changed ? newNodes : nodes;
        });
    }, [id, setNodes, isResizable, isColumns, isSingleLink, isLinkCard, isSingleColor, isStandardBlock, isMediaEmpty]);





    const handleUpdate = useCallback((blocks: Block[]) => {
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
                } as AppNode;
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

            const width = Math.max(100, rawW);

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
    const isSkeleton = data.isAISkeleton;

    return (
        <div
            ref={nodeRef}
            className={`
                ${baseClassName} 
                ${selected ? styles.selected : ''} 
                ${isMultiSelected ? styles.multiSelected : ''} 
                ${isMediaEmpty ? styles.mediaPlaceholderBlock : ''}
                ${isSingleMedia ? styles.mediaBlockNode : ''}
                ${isStandardBlock ? styles.standardBlock : ''}
                ${isDropTarget ? styles.dropTarget : ''}
                ${isHoveredLinking ? styles.linkingHover : ''}
                ${dropType === 'fusion' ? styles.fusionTarget : ''}
                ${isDropTarget && dropType === 'nesting' ? styles.dropTarget : ''} 
                custom-drag-handle
            `}
            style={{
                backgroundColor: ((isSingleMedia && !isMediaEmpty) || isLinkCard) ? 'transparent' : (isSingleColor ? singleColorValue : undefined),
                ...dynamicStyles
            }}
        >
            {/* Interaction Overlay: Converts the entire node into a drag handle when unselected */}
            {!isInteractive && !isLinkingMode && !isSingleColor && (
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
                        setColorOriginal(singleColorValue || '#1E944A');
                        setColorModalOpen(true);
                    }}
                    title="Edit color"
                >
                    {/* Solid raised chip, not glass — it must stay legible on top of
                        an arbitrary user-picked colour in both themes. */}
                    <div
                        style={{
                            background: 'var(--bg-rail)',
                            border: '1px solid var(--line-strong)',
                            color: 'var(--text-main)',
                            padding: '4px 10px',
                            borderRadius: 'var(--r-control)',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            alignSelf: 'center',
                            cursor: 'copy',
                            transition: 'opacity var(--transition-fast), transform var(--transition-fast), background var(--transition-fast)',
                            boxShadow: 'var(--shadow-sm)',
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
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-rail)'}
                    >
                        {copiedHex ? <Check size={12} /> : <Copy size={12} />}
                        {copiedHex ? 'Copied!' : (singleColorValue || '#1E944A').toUpperCase()}
                    </div>
                </div>
            )}

            {colorModalOpen && isSingleColor && (
                <ColorBlockModal
                    color={singleColorValue || '#1E944A'}
                    originalColor={colorOriginal}
                    metadata={colorBlocks[0]?.metadata}
                    onChange={(newColor, newMeta) => {
                        const newBlocks = colorBlocks.map((b, i) =>
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
                    initialColor={data.color}
                    content={colorBlocks}
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
                        backgroundColor: isHoveredLinking ? 'var(--secondary-dim)' : 'rgba(var(--secondary-rgb), 0.04)',
                        border: '2px solid transparent',
                        borderColor: isHoveredLinking ? 'var(--secondary)' : 'transparent',
                        transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 'bold', fontSize: '14px' }}>
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
                        hideBlockHandles={!isInteractive}
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
                    className={`${styles.resizeHandle} nodrag`}
                    onMouseDown={handleResizeStart}
                >
                    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="canvas-media-arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="var(--accent)" />
                                <stop offset="100%" stopColor="var(--secondary)" />
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
