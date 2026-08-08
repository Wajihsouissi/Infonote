import { memo, useState, useLayoutEffect, useCallback, useRef, useMemo, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useConnection } from '@xyflow/react';
import { StickyNote, Copy, Check, Loader2 } from 'lucide-react';
import { BlockEditor } from '../editor/BlockEditor';
import { ColorBlockModal } from '../editor/ColorBlockModal';
import { ConvertCardModal, type ConvertCardResult } from '../card/ConvertCardModal';

import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';

import type { AppNode, NoteNode } from '../../types';
import type { Block } from '../editor/types';
import styles from './BlockNode.module.css';
import { MIN_EXPANDED_SIZE, ICON_SIZE, MAX_HEIGHT } from '../../config/layout';
import { isMediaType } from '../editor/mediaTypes';
import { isGalleryType, GALLERY_NODE_WIDTH, GALLERY_MIN_ROW } from '../editor/galleryTypes';
import { useCanvasDetail } from '../canvas/hooks/useCanvasDetail';
import { useScheduledMount } from '../card/hooks/useScheduledMount';
import { BlockLodBody } from './BlockLodBody';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { MIN_COL_W } from '../editor/tableLayout';

/* Resize bounds for a standard block. These mirror --block-node-w and
   --block-node-max-user in design-system.css §5; the drag clamps to them and
   CSS enforces the same floor, so the two can't disagree. A block grows to
   --block-node-max (432) on its own — dragging is what takes it past that. */
const BLOCK_MIN_W = 260;
const BLOCK_MAX_USER_W = 800;
const BLOCK_MIN_H = 56;
/* Narrowest a table node may be dragged. */
const TABLE_MIN_W = 240;
/* Taking a hand-size is a one-way door out of intrinsic sizing, so it has to be
   a deliberate drag: a plain click on the handle (mousedown + a pixel of
   tremor + mouseup) must leave the block sizing itself. */
const RESIZE_THRESHOLD_PX = 3;

const useGlobalListIndex = (nodeId: string, isSingleNumbered: boolean) => {
    return useStore(
        useCallback(
            (state) => {
                if (!isSingleNumbered) return undefined;
                
                const node = getNodeById(state.nodes, nodeId);
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
    const detailTier = useCanvasDetail(id);
    // Full detail is the only tier that pays for the block editor. Anything
    // below renders a static wireframe via BlockLodBody — at the default
    // zoomed-out view a whole workspace is on screen at once, and mounting
    // one editor per visible block node is what stalls the first LOD. The
    // rising edge is paced by the shared frame budget so a zoom-in that flips
    // a whole row to full detail builds them over a few frames, not one.
    const showEditor = useScheduledMount(detailTier === 'full');
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
    /** Where a press on an empty media node started, to tell a click from a drag. */
    const mediaPressRef = useRef<{ x: number; y: number } | null>(null);

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
    const isDragging = useStore(s => s.interactionState.draggedNodeId === id && !s.interactionState.isMultiDragging);

    const colorBlocks: Block[] = Array.isArray(data.content) ? data.content : [];
    const singleBlock = colorBlocks.length === 1 ? colorBlocks[0] : undefined;
    const isSingleMedia = isMediaType(singleBlock?.type);
    // A board is a wide object like a table or a column set: it owns its width,
    // sits on a transparent node so the tiles read edge to edge, and resizes.
    const isSingleGallery = isGalleryType(singleBlock?.type);
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
    // A table is a wide object like a column set: it gets its own default width
    // and the drag handle, and resizes in width only (rows set the height).
    const isSingleTable = singleBlock?.type === 'table';
    /* Once every column has a hand-set width, the TABLE owns the width and the
       node shrink-wraps to it (CSS: .blockNode:has([data-table-sized])). A
       pinned px width here would leave node background stranded beside a
       narrowed table — the gap this state exists to prevent. "Fit columns to
       width" in the column menu clears the widths and hands control back. */
    const tableColCount = isSingleTable ? (singleBlock?.metadata?.rows?.[0]?.length ?? 0) : 0;
    const tableWidths = isSingleTable ? singleBlock?.metadata?.columnWidths : undefined;
    const isTableSized = tableColCount > 0
        && Array.isArray(tableWidths)
        && tableWidths.length === tableColCount
        && tableWidths.every((w) => typeof w === 'number' && w > 0);
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
    const isResizable = isSingleMedia || isLinkCard || isSingleGallery;

    // A standard block sizes itself to its text until the user drags the resize
    // handle; from then on it keeps whatever they set. Width lives on the React
    // Flow node style (RF needs it for edges and selection bounds); height is a
    // CSS floor rather than a fixed value, so content longer than the dragged
    // height still expands the block instead of being clipped.
    const userWidth = typeof data.userWidth === 'number' ? data.userWidth : undefined;
    const userHeight = typeof data.userHeight === 'number' ? data.userHeight : undefined;
    const isUserSized = userWidth !== undefined || userHeight !== undefined;

    const isMediaEmpty = isSingleMedia && (!singleBlock?.content || singleBlock.content.trim() === '');

    const globalListIndex = useGlobalListIndex(id, isSingleNumbered);

    const accentColor = singleColorValue || data.color;
    
    const dynamicStyles = useMemo(() => {
        const vars: Record<string, string> = {};
        if (accentColor) vars['--node-accent-color'] = accentColor;
        // Applied by CSS as min-height, so a dragged height is a floor the
        // content can still push past rather than a lid that clips it.
        if (userHeight !== undefined) vars['--block-user-h'] = `${userHeight}px`;
        return vars as React.CSSProperties;
    }, [accentColor, userHeight]);

    useLayoutEffect(() => {
        setNodes(nodes => {
            let changed = false;
            let newStyle: Record<string, string | number> = {};
            
            const newNodes = nodes.map(n => {
                if (n.id === id) {
                    const needsHeightAuto = !isSingleColor && n.style?.height !== 'auto';
                    // Text & headings flow with their content (4 -> 8 units, then wrap) instead of a fixed width.
                    const needsAutoWidthInit = isAutoWidthText && !isResizable && !isColumns && !isSingleColor && !isWideBlock && n.style?.width !== 'fit-content';
                    const needsWidthInit = !isStandardBlock && !isAutoWidthText && !isResizable && !isColumns && !isSingleTable && !isSingleColor && !isWideBlock && (n.style?.width === 'auto' || n.style?.width === undefined);
                    // A link that just became a card may carry the 260 standard
                    // width from its empty state — widen it to the card default.
                    const needsResizableWidthInit = isResizable && (n.style?.width === 'auto' || n.style?.width === undefined || (isLinkCard && n.style?.width === 260));
                    const shouldForcePlaceholderWidth = isMediaEmpty && n.style?.width !== 208 && n.style?.width !== '208px';
                    const needsColumnsWidthInit = isColumns && (n.style?.width === 'auto' || n.style?.width === undefined);
                    // 260 (the generic block default) cuts a three-column table in
                    // half; match the hydration profile's table footprint instead.
                    const needsTableWidthInit = isSingleTable && !isTableSized && (n.style?.width === 'auto' || n.style?.width === undefined);
                    // Hand-sized columns: hand the width back to CSS max-content.
                    const needsTableAutoWidth = isTableSized && n.style?.width !== 'auto';
                    const needsColorInit = isSingleColor && (n.style?.width !== ICON_SIZE || n.style?.height !== ICON_SIZE);
                    // A standard block leaves width unset so CSS max-content can
                    // grow it with its text (260 → --block-node-max, then wrap).
                    // Pinning 260 here would defeat that. Hand-resized blocks own
                    // their width and are left alone.
                    const needsStandardInit = isStandardBlock && !isAutoWidthText && !isResizable && !isUserSized && (n.style?.width !== 'auto');

                    if (needsHeightAuto || needsAutoWidthInit || needsWidthInit || needsResizableWidthInit || shouldForcePlaceholderWidth || needsColumnsWidthInit || needsTableWidthInit || needsTableAutoWidth || needsColorInit || needsStandardInit) {
                        changed = true;
                        newStyle = {
                            ...(needsHeightAuto ? { height: 'auto' } : {}),
                            ...(needsStandardInit ? { width: 'auto' } : {}),
                            ...(needsAutoWidthInit ? { width: 'fit-content' } : {}),
                            ...(needsWidthInit ? { width: 260 } : {}),
                            ...((needsResizableWidthInit || shouldForcePlaceholderWidth) ? { width: isSingleGallery ? GALLERY_NODE_WIDTH : isLinkCard ? 432 : 208 } : {}),
                            ...(needsColumnsWidthInit ? { width: 550 } : {}),
                            ...(needsTableWidthInit ? { width: 450 } : {}),
                            ...(needsTableAutoWidth ? { width: 'auto' } : {}),
                            ...(needsColorInit ? { width: ICON_SIZE, height: ICON_SIZE } : {})
                        };
                        return {
                            ...n,
                            style: {
                                ...n.style,
                                ...newStyle
                            }
                        };
                    }
                }
                return n;
            });
            
            // Synchronously update the store so that CanvasBoard doesn't overwrite our initialization 
            // on its next render (which caused an infinite render loop when ResizeObserver fired).
            if (changed) {
                const storeNodes = useStore.getState().nodes;
                const storeNode = storeNodes.find(node => node.id === id);
                if (storeNode) {
                    let needsSync = false;
                    for (const key in newStyle) {
                        if (storeNode.style?.[key as keyof typeof storeNode.style] !== newStyle[key]) {
                            needsSync = true;
                            break;
                        }
                    }
                    if (needsSync) {
                        setNodesStore(nodes => nodes.map(node => 
                            node.id === id 
                                ? { ...node, style: { ...node.style, ...newStyle } } 
                                : node
                        ));
                    }
                }
            }
            
            return changed ? newNodes : nodes;
        });
    }, [id, setNodes, setNodesStore, isResizable, isColumns, isSingleTable, isTableSized, isSingleLink, isLinkCard, isSingleGallery, isSingleColor, isStandardBlock, isMediaEmpty, isUserSized]);





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

    /* Node handle on a hand-sized table: the node is shrink-wrapped to the
       columns, so there is no node width to drag — instead the drag scales
       every column by the same ratio and the node follows them. That closes
       the loop: resize the table and the container follows (max-content),
       resize the container and the table follows (this). */
    const handleTableScaleStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const table = nodeRef.current?.querySelector('table') as HTMLTableElement | null;
        const colgroup = table?.querySelector('colgroup');
        if (!table || !colgroup) return;

        const { zoom } = getViewport();
        const cols = [...colgroup.children] as HTMLElement[];
        const ths = [...table.querySelectorAll('thead th')] as HTMLElement[];
        const startWidths = ths.map((th) => Math.round(th.offsetWidth));
        const startTotal = startWidths.reduce((a, b) => a + b, 0);
        if (startTotal <= 0) return;

        const startX = e.clientX;
        let nextWidths = [...startWidths];

        activeResize.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - startX) / zoom;
            // Floor the ratio so no column can be squeezed under MIN_COL_W.
            const minTotal = startWidths.length * MIN_COL_W;
            const total = Math.max(minTotal, startTotal + deltaX);
            const ratio = total / startTotal;
            nextWidths = startWidths.map((w) => Math.max(MIN_COL_W, Math.round(w * ratio)));
            cols.forEach((col, i) => { col.style.width = `${nextWidths[i]}px`; });
        };

        const onMouseUp = () => {
            activeResize.current = false;
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const blocks = Array.isArray(data.content) ? (data.content as Block[]) : [];
            updateNodeData(id, {
                content: blocks.map((b, i) => (
                    i === 0 ? { ...b, metadata: { ...b.metadata, columnWidths: nextWidths } } : b
                )),
            });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        if (isTableSized) { handleTableScaleStart(e); return; }

        e.stopPropagation();
        e.preventDefault();

        const { zoom } = getViewport();
        const startX = e.clientX;
        const startY = e.clientY;

        if (!nodeRef.current) return;
        const rect = nodeRef.current.getBoundingClientRect();
        // Screen pixels -> flow units, or the block outruns the cursor at any
        // zoom other than 100%.
        const startW = rect.width / zoom;
        const startH = rect.height / zoom;

        /* A board's height is stored on the BOARD, not the node — it's the grid
           that has to re-solve its tiles to fill it. The user drags the whole
           node though, so measure the difference once: everything that isn't
           grid (toolbar, node padding) is chrome the drag must not hand to the
           board, or the node would grow by the toolbar's height on every drag. */
        const gridEl = isSingleGallery
            ? nodeRef.current.querySelector<HTMLElement>('[data-gallery-grid]')
            : null;
        const galleryChrome = gridEl
            ? Math.max(0, startH - gridEl.getBoundingClientRect().height / zoom)
            : 0;

        activeResize.current = true;
        document.body.style.cursor = (isStandardBlock || isSingleGallery) ? 'nwse-resize' : 'ew-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < RESIZE_THRESHOLD_PX) return;

            const deltaX = (moveEvent.clientX - startX) / zoom;
            const rawW = startW + deltaX;

            const width = isStandardBlock
                ? Math.min(BLOCK_MAX_USER_W, Math.max(BLOCK_MIN_W, rawW))
                // A table narrower than this is unreadable — even two columns
                // collapse to a stack of single characters.
                : Math.max(isSingleTable ? TABLE_MIN_W : 100, rawW);
            const height = Math.min(MAX_HEIGHT, Math.max(BLOCK_MIN_H, startH + (moveEvent.clientY - startY) / zoom));

            // Size and data must move in ONE store write: as two (setNodes then
            // updateNodeData) they raced, and the node ended a drag with a
            // stale userWidth that disagreed with its rendered width.
            setNodes(nodes => nodes.map(n => {
                if (n.id !== id) return n;
                const style = { ...n.style, width };

                if (isSingleGallery) {
                    /* Both axes, and both meaningful: width re-columns the board,
                       height re-sizes its tiles. The height rides on the block so
                       the grid can solve against it; the node then auto-heights
                       around the result, which is why style.height stays alone. */
                    const boardHeight = Math.max(GALLERY_MIN_ROW, height - galleryChrome);
                    const content = Array.isArray(n.data.content) ? (n.data.content as Block[]) : [];
                    const data = {
                        ...n.data,
                        content: content.map((b, i) => (
                            i === 0 ? { ...b, metadata: { ...b.metadata, galleryHeight: boardHeight } } : b
                        )),
                    } as typeof n.data;
                    return { ...n, style, data };
                }

                if (!isStandardBlock) return { ...n, style };
                // userHeight lands in CSS as a min-height floor, not style.height.
                const data = { ...n.data, userWidth: width, userHeight: height } as typeof n.data;
                return { ...n, style, data };
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

    // Double-clicking the handle hands the block back to intrinsic sizing —
    // the only way out of a drag you didn't want.
    const handleResizeReset = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (isSingleGallery) {
            // Clearing the stored height is what returns the board to sizing
            // itself; the width goes back to the default board footprint.
            setNodes(nodes => nodes.map(n => {
                if (n.id !== id) return n;
                const content = Array.isArray(n.data.content) ? (n.data.content as Block[]) : [];
                return {
                    ...n,
                    style: { ...n.style, width: GALLERY_NODE_WIDTH },
                    data: {
                        ...n.data,
                        content: content.map((b, i) => (
                            i === 0 ? { ...b, metadata: { ...b.metadata, galleryHeight: undefined } } : b
                        )),
                    },
                } as typeof n;
            }));
            return;
        }

        setNodes(nodes => nodes.map(n => (
            n.id === id ? { ...n, style: { ...n.style, width: 'auto' } } : n
        )));
        updateNodeData(id, { userWidth: undefined, userHeight: undefined });
    }, [id, setNodes, updateNodeData, isSingleGallery]);

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
                ${isSingleGallery ? styles.galleryNode : ''}
                ${/* Lets the board's own stylesheet see a hover on the NODE. Until
                      a node is selected an overlay covers it to keep it draggable,
                      and that overlay swallows the pointer — so the board's
                      floating panel never appeared until you'd clicked it first. */
                  isSingleGallery ? 'chnk-it-board-host' : ''}
                ${/* Selection is drawn by the board around its frame, not by the
                      node: the node also contains the title, so a ring here
                      enclosed the caption and put it back inside the container
                      the moment you clicked. */
                  isSingleGallery && selected ? 'chnk-it-board-selected' : ''}
                ${isStandardBlock ? styles.standardBlock : ''}
                ${isDropTarget ? styles.dropTarget : ''}
                ${isHoveredLinking ? styles.linkingHover : ''}
                ${dropType === 'fusion' ? styles.fusionTarget : ''}
                ${dropType === 'gallery' ? styles.galleryTarget : ''}
                ${isDropTarget && dropType === 'nesting' ? styles.dropTarget : ''} 
                ${isDragging ? styles.dragging : ''}
                custom-drag-handle
            `}
            data-user-sized={isUserSized ? 'true' : undefined}
            style={{
                backgroundColor: ((isSingleMedia && !isMediaEmpty) || isLinkCard || isSingleGallery) ? 'transparent' : (isSingleColor ? singleColorValue : undefined),
                ...dynamicStyles
            }}
        >
            {/* Interaction Overlay: Converts the entire node into a drag handle when unselected */}
            {!isInteractive && !isLinkingMode && !isSingleColor && (
                <div
                    className="interaction-overlay custom-drag-handle"
                    // An empty media node is nothing but a call to action, yet this overlay
                    // owns its whole surface until the node has been selected for 300ms —
                    // so the first click only selected the node and the picker never opened.
                    // The overlay has to stay (it is what lets the node be dragged without
                    // the editor underneath swallowing the press), so instead it hands a
                    // press that never moved down to the picker. A real drag moves the
                    // pointer, so it fails the threshold and is left alone.
                    onPointerDown={isMediaEmpty ? (e) => { mediaPressRef.current = { x: e.clientX, y: e.clientY }; } : undefined}
                    onClick={isMediaEmpty ? (e) => {
                        const start = mediaPressRef.current;
                        mediaPressRef.current = null;
                        if (!start) return;
                        if (Math.abs(e.clientX - start.x) > 4 || Math.abs(e.clientY - start.y) > 4) return;
                        nodeRef.current?.querySelector<HTMLElement>('.mediaPlaceholderTrigger')?.click();
                    } : undefined}
                    // Files dropped on the node would otherwise land on this overlay and be
                    // lost; hand them to the picker's own drop handling. The picker is not
                    // an ancestor of the overlay, so the forwarded event cannot re-enter.
                    onDragOver={isMediaEmpty ? (e) => {
                        if (!e.dataTransfer.types.includes('Files')) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                    } : undefined}
                    onDrop={isMediaEmpty ? (e) => {
                        if (!e.dataTransfer.files?.length) return;
                        e.preventDefault();
                        e.stopPropagation();
                        nodeRef.current?.querySelector('.mediaPlaceholderTrigger')?.dispatchEvent(
                            new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: e.dataTransfer })
                        );
                    } : undefined}
                    // Filled media: double-click opens it full screen, without having to
                    // select the node first and hunt for the hover button through the
                    // 300ms interactive delay. Same forwarding trick — the media is not an
                    // ancestor of this overlay, so the event cannot come back around.
                    onDoubleClick={isSingleMedia && !isMediaEmpty ? (e) => {
                        e.stopPropagation();
                        nodeRef.current?.querySelector('.mediaViewTarget')?.dispatchEvent(
                            new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                        );
                    } : undefined}
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
                        // Must beat every piece of block chrome, not tie with it:
                        // at 10 it drew level with .alignmentContainer and lost on
                        // DOM order, so tables (and media) swallowed the drag and
                        // the node couldn't be moved at all.
                        zIndex: 20,
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

            {showEditor && (
                <button
                    className={styles.convertBtn}
                    onClick={handleConvertToCard}
                    title="Convert to Card"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <StickyNote size={16} />
                </button>
            )}

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
                ) : showEditor ? (
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
                ) : (
                    <BlockLodBody blocks={colorBlocks} />
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

            {/* Resize Handle for Resizable, Column, or standard text blocks */}
            {showEditor && (isResizable || isColumns || isStandardBlock || isSingleTable) && (
                <div
                    className={`${styles.resizeHandle} nodrag`}
                    onMouseDown={handleResizeStart}
                    onDoubleClick={(isStandardBlock || isSingleGallery) ? handleResizeReset : undefined}
                    title={(isStandardBlock || isSingleGallery) ? 'Drag to resize · double-click to fit content' : undefined}
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
}, samePropsIgnoringPosition);
