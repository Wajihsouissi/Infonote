import { useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { X, ExternalLink } from '../../../../shared/icons';
import styles from '../node/NoteCard.module.css';
import expandedStyles from './NoteExpandedContent.module.css';
import { BlockEditor } from '../../../editor/ui/surface/BlockEditor';
import { IconPicker } from '../icons/IconPicker';
import { defaultIconName, CardIcon } from '../../iconMap';
import type { NoteNode } from '../../../../types';
import type { Block } from '../../../editor/types';
import { removeTransferredBlocks, finishBlockTransfer } from '../../../editor/drag/blockTransfer';
import { readDragData, dragHasType } from '../../../editor/drag/dragSession';
import { clearBlockDropIndicator, nearestBlockDropTarget, showBlockDropIndicator } from '../../../editor/drag/dropIndicator';
import { reorderBlocks } from '../../../editor/drag/blockReorder';
import { claimGalleryItem } from '../../../editor/gallery/galleryTypes';
import { beginHistoryGesture, endHistoryGesture } from '../../../../store/temporalControl';
import { useStore } from '../../../../store/useStore';
import { NoteBody } from './NoteBody';
import { CardTitleInput } from '../node/CardTitleInput';
import { CardCover } from '../cover/CardCover';
import { AIProvenanceMark } from '../../../ai/ui/citations/AIProvenanceMark';
import { useCardDraft } from '../../hooks/useCardDraft';
import { useScheduledMount } from '../../hooks';
import { continueReadingSelection, focusReadingDestination } from './activateReadingSurface';
import { patchReadingBlock } from '../../../editor/document/patchReadingBlock';
import { useEditingSession } from '../../../editor/hooks/useEditingSession';

interface NoteExpandedContentProps {
    id: string;
    data: NoteNode['data'];
    onUpdate: (id: string, data: Partial<NoteNode['data']>) => void;
    contentRef?: React.RefObject<HTMLDivElement | null>;
    nodeId?: string;
    onClose?: () => void;
    onNavigate?: () => void; // Navigate to nested canvas
    selectionIslandPortalId?: string; // Portal target for selection island
    flatCorners?: boolean; // Remove border radius
    readOnly?: boolean;
    hideBlockHandles?: boolean;
    /** Canvas cards promote their editor only when the user selects them.
     * Omit this outside the canvas (peek/fullscreen) to keep those views live. */
    showLiveEditor?: boolean;
    /** Off when a NoteCard already paints the ambient around this content. On
     *  the canvas the card is the outer frame and owns it; standalone in a
     *  panel there is no card, so this renders its own. */
    renderAmbient?: boolean;
    /** Canvas readers defer rich content until it is legible and in view. */
    canvas?: boolean;
}

/** Blocks carried by a drag, and the card they came from (null = a new block). */
function readDroppedBlocks(e: React.DragEvent, targetId: string): { blocks: Block[]; sourceNodeId: string | null } {
    const none = { blocks: [], sourceNodeId: null };
    try {
        const rawData = readDragData(e, 'application/chnk-it-block-data');
        if (rawData) {
            const parsed = JSON.parse(rawData) as { sourceNodeId?: string; blocks?: Block[]; block?: Block };
            const sourceNodeId = parsed.sourceNodeId || null;
            if (sourceNodeId === targetId) return none; // moved within itself: the editor handles it
            return { blocks: parsed.blocks ?? (parsed.block ? [parsed.block] : []), sourceNodeId };
        }
        const type = readDragData(e, 'application/reactflow-block-type');
        if (!type) return none;
        let metadata;
        try {
            const metaJson = readDragData(e, 'application/chnk-it-block-metadata');
            if (metaJson) metadata = JSON.parse(metaJson);
        } catch { /* malformed drag metadata — proceed without it */ }
        return { blocks: [{ id: uuidv4(), type: type as Block['type'], content: '', metadata }], sourceNodeId: null };
    } catch (err) {
        console.error('[NoteExpandedContent] Drop failed', err);
        return none;
    }
}

/** Blocks moved out of another card leave it; an emptied fused note goes too. */
function removeBlocksFromSource(sourceNodeId: string, movedIds: string[]) {
    const { nodes, updateNodeData, setNodes } = useStore.getState();
    removeTransferredBlocks(sourceNodeId, movedIds, {
        nodes, updateNodeData,
        removeNode: id => setNodes(nds => nds.filter(node => node.id !== id)),
    }, 'document');
    finishBlockTransfer();
}

export function NoteExpandedContent({
    id,
    data,
    onUpdate,
    contentRef,
    nodeId,
    onClose,
    onNavigate,
    selectionIslandPortalId,
    flatCorners,
    readOnly,
    hideBlockHandles,
    showLiveEditor = true,
    renderAmbient = true,
    canvas = false,
}: NoteExpandedContentProps) {
    const blocks = useMemo(() => (Array.isArray(data.content) ? data.content : []), [data.content]);
    // A promotion becomes a single, paced mount instead of competing with every
    // other card's editor during a workspace reload.
    const { wantsEditor, immediate, requestEditing, beginComposition, endComposition } = useEditingSession(id, showLiveEditor);
    const liveEditorMounted = useScheduledMount(wantsEditor, immediate);
    const localContentRef = useRef<HTMLDivElement>(null);
    const scrollRef = contentRef ?? localContentRef;
    const draft = useCardDraft(id, data, onUpdate);
    const showIconPicker = useStore(s => s.activeIconMenuId === id);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);

    // Blocks dropped on the note area (outside the editor's own drop zones)
    // are appended to the end of the note.
    const handleAreaDrop = useCallback((e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const { blocks: dropped, sourceNodeId } = readDroppedBlocks(e, id);
        if (dropped.length === 0) return;

        const current = Array.isArray(data.content) ? data.content : [];
        const target = nearestBlockDropTarget(e.currentTarget,current.map(block=>block.id),e.clientY);
        const next = target ? reorderBlocks(current,dropped,target.blockId,target.position) : [...current,...dropped];
        beginHistoryGesture(useStore.getState());
        try {
            onUpdate(id, { content: next, lastFusedAt: Date.now() });
            const ids = dropped.map(block=>block.id);
            claimGalleryItem(ids);
            if (readDragData(e,'application/chnk-it-editor-id') && window.chnkItRemoveDraggedBlocks) {
                window.chnkItRemoveDraggedBlocks(ids); window.chnkItRemoveDraggedBlocks=null;
                finishBlockTransfer('cross-editor');
            } else if (sourceNodeId) removeBlocksFromSource(sourceNodeId,ids);
        } finally { endHistoryGesture(useStore.getState()); clearBlockDropIndicator(); }
    }, [readOnly,data.content, id, onUpdate]);

    const handleContentUpdate = useCallback((next: Block[]) => {
        onUpdate(id, { content: next });
    }, [id, onUpdate]);
    const handleReadingChange = useCallback((blockId: string, patch: Partial<Block>) => {
        if (!readOnly) onUpdate(id, { content: patchReadingBlock(blocks, blockId, patch) });
    }, [blocks, id, onUpdate, readOnly]);

    return (
        <div
            className={`${styles.expandedView} ${expandedStyles.expandedContent}`}
            data-accented={data.color ? '' : undefined}
            style={{
                ...(flatCorners ? { borderRadius: 0 } : {}),
                ...(data.color ? { '--node-accent': data.color } as React.CSSProperties : {})
            }}
        >
            {/* Same ambient field as the collapsed card — see .coverAmbient. */}
            {renderAmbient && data.color && (
                <div className={styles.coverAmbientClip} aria-hidden="true">
                    <span className={styles.coverAmbientHue} />
                </div>
            )}

            <div className={`${expandedStyles.minimalHeader} custom-drag-handle`}>
                {data.coverImage && (
                    <CardCover
                        variant="thumbnail"
                        cover={data.coverImage}
                        onChange={(cover) => onUpdate(id, { coverImage: cover })}
                        readOnly={readOnly}
                    />
                )}
                <div className={expandedStyles.headerCopy}>
                    <div className={expandedStyles.titleRow}>
                        <button
                            type="button"
                            className={`${expandedStyles.minimalIconButton} icon-hover nodrag`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveIconMenuId(id);
                            }}
                            title="Change icon"
                            aria-label="Change icon"
                        >
                            <CardIcon icon={data.icon || defaultIconName} size={22} />
                        </button>
                        <CardTitleInput
                            className={expandedStyles.minimalTitleInput}
                            value={draft.valueOf('label')}
                            onChange={(value) => draft.edit('label', value)}
                            onCommit={() => draft.commit('label')}
                        />
                        {/* Sits beside the title rather than in the window
                            controls: it describes the CARD, not the frame around
                            it. */}
                        {data.aiProvenance && (
                            <span className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
                                <AIProvenanceMark provenance={data.aiProvenance} />
                            </span>
                        )}
                    </div>

                </div>
                <div className={expandedStyles.headerActions} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    {!data.coverImage && !readOnly && (
                        <CardCover variant="thumbnail" onChange={(cover) => onUpdate(id, { coverImage: cover })} />
                    )}
                    {(onClose || onNavigate) && (
                        <div className={expandedStyles.controlsGroup}>
                            {onNavigate && (
                                <button type="button" className={expandedStyles.controlBtn} onClick={onNavigate} title="Open Canvas" aria-label="Open Canvas">
                                    <ExternalLink size={16} strokeWidth={2.6} />
                                </button>
                            )}
                            {onClose && (
                                <button type="button" className={expandedStyles.controlBtn} onClick={onClose} title="Close" aria-label="Close">
                                    <X size={16} strokeWidth={2.6} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Note Area */}
            <div
                className={`${styles.noteArea} nodrag infonote-scrollable`}
                // Keep the wheel for the note only when it has something to
                // scroll; otherwise (and for pinches) let the canvas zoom.
                onWheelCapture={(e) => {
                    const el = e.currentTarget;
                    if (!e.ctrlKey && el.scrollHeight > el.clientHeight + 1) e.stopPropagation();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.target === e.currentTarget && nodeId) {
                        window.dispatchEvent(new CustomEvent('chnk-it-editor-bg-click', { detail: { nodeId } }));
                    }
                }}
                ref={scrollRef}
                onCompositionStartCapture={beginComposition}
                onCompositionEndCapture={endComposition}
                onKeyDownCapture={(event) => {
                    if (liveEditorMounted || readOnly || !nodeId || event.key !== 'Enter'
                        || !(event.target as HTMLElement).matches('[data-complete-reader]')) return;
                    event.preventDefault();
                    flushSync(requestEditing);
                    if (scrollRef.current) focusReadingDestination(scrollRef.current, undefined, undefined, undefined);
                }}
                onMouseDownCapture={(event) => {
                    if (liveEditorMounted || readOnly || !nodeId || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
                    const target = event.target as HTMLElement;
                    if (target.closest('a, button, input, textarea, select, [role="button"], [role="link"], iframe')) return;
                    const text = target.closest<HTMLElement>('[data-reader-text]');
                    if (!text || !scrollRef.current) return;
                    // The original text host is about to leave the DOM. Its
                    // default mousedown would clear focus on the new host.
                    event.preventDefault();
                    // Stop the original gesture before replacing its target;
                    // otherwise the canvas can receive it as a pan start.
                    event.stopPropagation();
                    const blockId = text.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
                    flushSync(requestEditing);
                    const root = scrollRef.current;
                    if (!root) return;
                    focusReadingDestination(root, blockId, text.dataset.tableRow, text.dataset.tableColumn, event.clientX, event.clientY);
                    continueReadingSelection(root);
                }}
                onDrop={handleAreaDrop}
                onDragOver={(e) => {
                    if (readOnly || !dragHasType(e,'application/reactflow-block-type')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    const target = nearestBlockDropTarget(e.currentTarget,blocks.map(block=>block.id),e.clientY);
                    const frame = target && e.currentTarget.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(target.blockId)}"]`);
                    if (frame && target) showBlockDropIndicator(frame,target.position);
                }}
                onDragLeave={event => {
                    const box=event.currentTarget.getBoundingClientRect();
                    if(event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) clearBlockDropIndicator();
                }}
            >
                <NoteBody
                    canvas={canvas}
                    blocks={blocks}
                    showLiveEditor={liveEditorMounted}
                    onBlockChange={readOnly ? undefined : handleReadingChange}
                    reserveHandles={!readOnly && !hideBlockHandles}
                    renderEditor={() => (
                        <BlockEditor
                            initialContent={blocks}
                            readOnly={readOnly || false}
                            minimal={false}
                            onUpdate={handleContentUpdate}
                            nodeId={nodeId}
                            selectionIslandPortalId={selectionIslandPortalId}
                            hideBlockHandles={hideBlockHandles}
                        />
                    )}
                />
            </div>

            {showIconPicker && (
                <IconPicker
                    currentIcon={data.icon || defaultIconName}
                    onSelect={(icon) => {
                        onUpdate(id, { icon });
                        setActiveIconMenuId(null);
                    }}
                    onClose={() => setActiveIconMenuId(null)}
                />
            )}
        </div>
    );
}
