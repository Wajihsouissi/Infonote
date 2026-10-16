import { memo, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps, useConnection } from '@xyflow/react';
import { StickyNote, Maximize2, ChevronsDownUp } from '../../components/icons';
import { ResizeArc } from '../../components/ui/ResizeArc';
import { BlockEditor } from '../editor/BlockEditor';
import { useStore } from '../../store/useStore';
import type { NoteNode } from '../../types';
import type { Block } from '../editor/types';
import { FileCard, FileViewer, type FileView } from '../file';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { PeekMenu } from '../ui/PeekMenu';
import { LinkTargetOverlay } from '../canvas/LinkTargetOverlay';
import { BLOCK_MIN_H, describeBlockNode } from './blockNodeShape';
import { useBlockNodeSizing } from './useBlockNodeSizing';
import { useBlockNodeResize } from './useBlockNodeResize';
import { useGlobalListIndex } from './useGlobalListIndex';
import { convertBlockToCard } from './convertBlockToCard';
import { ColorSwatchSurface } from './ColorSwatchSurface';
import { BlockDragOverlay } from './BlockDragOverlay';
import styles from './BlockNode.module.css';

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');

const selectConnecting = (c: { inProgress: boolean }) => c.inProgress;

/* The whole node accepts an incoming link. Inline, because it has to beat
   React Flow's own positioning of a top handle. */
const FULL_TARGET_HANDLE: CSSProperties = {
    top: '50%', left: '50%', width: '100%', height: '100%',
    border: 'none', background: 'transparent', transform: 'translate(-50%, -50%)', zIndex: -1,
};

/** A single block living directly on the canvas, without a card around it. */
export const BlockNode = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    // Only whether a link is being drawn, not every pointer move while it is.
    const isConnecting = useConnection(selectConnecting);
    const updateNodeData = useStore((s) => s.updateNodeData);
    const isMultiSelected = useStore((s) => s.selectedCanvasNodeIds.size > 1 && s.selectedCanvasNodeIds.has(id));
    // Narrow selectors: a block re-renders only when ITS drop-target status
    // changes, not on every drag tick across all nodes.
    const dropType = useStore((s) => (s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget.type : null));
    const isDragging = useStore((s) => s.interactionState.draggedNodeId === id && !s.interactionState.isMultiDragging);
    const isLinkingMode = useStore((s) => s.isLinkingMode);
    const nodeRef = useRef<HTMLDivElement>(null);

    const blocks = useMemo<Block[]>(() => (Array.isArray(data.content) ? data.content : []), [data.content]);
    const shape = useMemo(() => describeBlockNode(blocks), [blocks]);
    const {
        singleBlock, isSingleMedia, isMediaEmpty, isSingleGallery, isLinkCard, isSingleFile, isFileClosed,
        isFileOpen, isSingleColor, swatch, isSingleNumbered, isSingleTable, isColumns, isToggleRoot,
        isStandardBlock, isResizable,
    } = shape;

    // Part of a multi-selection stays in drag-handle mode rather than opening
    // for editing — otherwise grabbing one selected block to move the group
    // landed on its editable content instead of dragging anything.
    const isInteractive = selected && !isMultiSelected;

    // A standard block sizes itself to its text until the user drags the resize
    // handle; from then on it keeps whatever they set. Width lives on the React
    // Flow node style (RF needs it for edges and selection bounds); height is a
    // CSS floor, so longer content still expands the block instead of clipping.
    const userWidth = typeof data.userWidth === 'number' ? data.userWidth : undefined;
    const userHeight = typeof data.userHeight === 'number' ? data.userHeight : undefined;
    const isUserSized = userWidth !== undefined || userHeight !== undefined;
    // Vertical centering returns once the height is back at the block baseline.
    const isUserTall = userHeight !== undefined && userHeight > BLOCK_MIN_H + 1;

    useBlockNodeSizing(id, shape, isUserSized);
    const { onResizeStart, onResizeReset } = useBlockNodeResize(id, nodeRef, shape);
    const globalListIndex = useGlobalListIndex(id, isSingleNumbered);

    const accentColor = swatch || data.color;
    const surfaceStyle = useMemo(() => {
        const style: Record<string, string> = {};
        if (accentColor) style['--node-accent-color'] = accentColor;
        // Applied by CSS as min-height: a floor the content can push past.
        if (userHeight !== undefined) style['--block-user-h'] = `${userHeight}px`;
        const clearSurface = (isSingleMedia && !isMediaEmpty) || isLinkCard || isSingleGallery;
        if (clearSurface) style.backgroundColor = 'transparent';
        else if (swatch) style.backgroundColor = swatch;
        return style as CSSProperties;
    }, [accentColor, userHeight, isSingleMedia, isMediaEmpty, isLinkCard, isSingleGallery, swatch]);

    /** Switch a file between its closed card and the live document. */
    const setFileView = useCallback((fileView: FileView) => {
        if (!singleBlock) return;
        updateNodeData(id, {
            content: [{ ...singleBlock, metadata: { ...singleBlock.metadata, fileView } }],
            // Reopening returns to the page default rather than inheriting the
            // 120px square a closed card was last dragged to.
            userWidth: undefined,
            userHeight: undefined,
        });
    }, [id, singleBlock, updateNodeData]);

    const setFileName = useCallback((name: string) => {
        if (!singleBlock) return;
        updateNodeData(id, { content: [{ ...singleBlock, metadata: { ...singleBlock.metadata, name } }] });
    }, [id, singleBlock, updateNodeData]);

    const toggleFile = useCallback(() => setFileView(isFileOpen ? 'file' : 'expandedfile'), [setFileView, isFileOpen]);

    /* Filled media opens full screen on double-click, without first selecting
       the node and hunting for the hover button. The media is not an ancestor
       of the overlay, so the forwarded event cannot come back around. */
    const openMedia = useCallback(() => {
        nodeRef.current?.querySelector('.mediaViewTarget')?.dispatchEvent(
            new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
        );
    }, []);

    const handleUpdate = useCallback((next: Block[]) => {
        // The final data-boundary guard for drops and rich pastes: no path may
        // persist a second root block in a standalone text node.
        updateNodeData(id, { content: isStandardBlock && !isToggleRoot ? next.slice(0, 1) : next });
    }, [id, isStandardBlock, isToggleRoot, updateNodeData]);

    const selfSizing = isStandardBlock || isSingleGallery;

    return (
        <div
            ref={nodeRef}
            className={cx(
                isSingleColor ? styles.colorBlockNode : styles.blockNode,
                selected && styles.selected,
                isMultiSelected && styles.multiSelected,
                isMediaEmpty && styles.mediaPlaceholderBlock,
                isSingleMedia && styles.mediaBlockNode,
                isFileClosed && styles.fileCardNode,
                isFileOpen && styles.fileOpenNode,
                isSingleGallery && styles.galleryNode,
                /* Lets the board's own stylesheet see a hover on the NODE: until
                   it is selected the drag overlay covers it and swallows the
                   pointer. Selection is drawn by the board around its frame,
                   never by the node, which also holds the caption. */
                isSingleGallery && 'chnk-it-board-host',
                isSingleGallery && selected && 'chnk-it-board-selected',
                isStandardBlock && styles.standardBlock,
                dropType !== null && styles.dropTarget,
                dropType === 'fusion' && styles.fusionTarget,
                dropType === 'gallery' && styles.galleryTarget,
                isDragging && styles.dragging,
                'custom-drag-handle',
            )}
            data-user-sized={isUserSized ? 'true' : undefined}
            data-user-tall={isUserTall ? 'true' : undefined}
            data-accented={accentColor && !isSingleColor ? '' : undefined}
            style={surfaceStyle}
        >
            {/* Unselected, the whole node is one drag surface. A board keeps
                that too: you can throw it around the canvas without catching a
                picture, and selecting it is what arms the tiles. */}
            {!isInteractive && !isLinkingMode && !isSingleColor && (
                <BlockDragOverlay
                    nodeRef={nodeRef}
                    isMediaEmpty={isMediaEmpty}
                    onDoubleClick={isSingleFile ? toggleFile : isSingleMedia && !isMediaEmpty ? openMedia : undefined}
                />
            )}

            {swatch && !isLinkingMode && <ColorSwatchSurface nodeId={id} swatch={swatch} blocks={blocks} />}

            <LinkTargetOverlay nodeId={id} />

            {!isSingleFile && (
                <button
                    type="button"
                    className={`${styles.convertBtn} nodrag`}
                    onClick={(e) => {
                        e.stopPropagation();
                        convertBlockToCard(id, nodeRef.current?.offsetWidth);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Convert to Card"
                    aria-label="Convert to card"
                >
                    <StickyNote size={16} />
                </button>
            )}

            {/* A file gets the card's own hover bar, in the card's own place:
                the same peeks plus the open/close toggle. */}
            {isSingleFile && !isLinkingMode && (
                <div className={`${styles.fileMenu} nodrag`}>
                    <PeekMenu nodeId={id} buttonClassName={styles.fileMenuBtn} />
                    <div className={styles.fileMenuDivider} />
                    <button
                        type="button"
                        className={styles.fileMenuBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFile();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={isFileOpen ? 'Close the file' : 'Open the file'}
                        aria-label={isFileOpen ? 'Close the file' : 'Open the file'}
                    >
                        {isFileOpen ? <ChevronsDownUp size={16} /> : <Maximize2 size={16} />}
                    </button>
                </div>
            )}

            <div className={styles.content}>
                {isFileClosed ? (
                    <FileCard
                        name={singleBlock?.metadata?.name}
                        mime={singleBlock?.metadata?.type}
                        size={singleBlock?.metadata?.size}
                        poster={singleBlock?.metadata?.poster}
                        onOpen={() => setFileView('expandedfile')}
                        onRename={setFileName}
                    />
                ) : isFileOpen ? (
                    <FileViewer
                        content={singleBlock?.content ?? ''}
                        name={singleBlock?.metadata?.name}
                        mime={singleBlock?.metadata?.type}
                        size={singleBlock?.metadata?.size}
                        poster={singleBlock?.metadata?.poster}
                        live
                        onClose={() => setFileView('file')}
                        onRename={setFileName}
                    />
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
                        useStoredListNumbers={isSingleNumbered}
                        singleBlockOnly={isStandardBlock && !isToggleRoot}
                    />
                )}
            </div>

            <Handle
                type="target"
                position={Position.Top}
                isConnectableStart={false}
                style={FULL_TARGET_HANDLE}
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

            {(isResizable || isColumns || isStandardBlock || isSingleTable) && (
                <div
                    className={`${styles.resizeHandle} nodrag`}
                    onMouseDown={onResizeStart}
                    onDoubleClick={selfSizing ? onResizeReset : undefined}
                    title={selfSizing ? 'Drag to resize · double-click to fit content' : undefined}
                >
                    <ResizeArc />
                </div>
            )}
        </div>
    );
}, samePropsIgnoringPosition);
