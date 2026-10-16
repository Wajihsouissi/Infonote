import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, ExternalLink, Loader2, Sparkles } from '../../components/icons';
import styles from './NoteCard.module.css';
import expandedStyles from './NoteExpandedContent.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { IconPicker } from './IconPicker';
import { defaultIconName, CardIcon } from './iconMap';
import type { NoteNode } from '../../types';
import type { Block } from '../editor/types';
import { endBlockDrag } from '../editor/blockDragLock';
import { readDragData } from '../editor/dragSession';
import { useStore } from '../../store/useStore';
import { NoteBody } from './NoteBody';
import { CardTitleInput } from './CardTitleInput';
import { CardCover } from './CardCover';
import { AIProvenanceMark } from '../ai/AIProvenanceMark';
import { CardDescription } from './CardDescription';
import { useAutoSummary } from './useAutoSummary';
import { useCardDraft } from './hooks/useCardDraft';
import { useScheduledMount } from './hooks';

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
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    const sourceContent = sourceNode && Array.isArray(sourceNode.data.content) ? sourceNode.data.content : undefined;
    if (sourceContent) {
        const remaining = sourceContent.filter((b) => !movedIds.includes(b.id));
        updateNodeData(sourceNodeId, { content: remaining });
        if (remaining.length === 0 && sourceNode?.type === 'fused-note') {
            setTimeout(() => setNodes(nds => nds.filter(n => n.id !== sourceNodeId)), 0);
        }
    }

    if (window.chnkItMultiDragCleanup) {
        window.chnkItMultiDragCleanup();
        delete window.chnkItMultiDragCleanup;
    }
    // The source blocks are gone, so the drag source unmounts before `dragend`
    // fires and the drag lock would never be released. Release it here.
    window.chnkItCrossEditorDropHandled = true;
    endBlockDrag();
    window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
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
}: NoteExpandedContentProps) {
    const blocks = useMemo(() => (Array.isArray(data.content) ? data.content : []), [data.content]);
    // A promotion becomes a single, paced mount instead of competing with every
    // other card's editor during a workspace reload.
    const liveEditorMounted = useScheduledMount(showLiveEditor);
    const draft = useCardDraft(id, data, onUpdate);
    const summary = useAutoSummary(id, data, onUpdate);
    const showIconPicker = useStore(s => s.activeIconMenuId === id);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);

    // Blocks dropped on the note area (outside the editor's own drop zones)
    // are appended to the end of the note.
    const handleAreaDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const { blocks: dropped, sourceNodeId } = readDroppedBlocks(e, id);
        if (dropped.length === 0) return;

        const current = Array.isArray(data.content) ? data.content : [];
        onUpdate(id, { content: [...current, ...dropped], lastFusedAt: Date.now() });
        if (sourceNodeId) removeBlocksFromSource(sourceNodeId, dropped.map((b) => b.id));
    }, [data.content, id, onUpdate]);

    const handleContentUpdate = useCallback((next: Block[]) => {
        onUpdate(id, { content: next });
    }, [id, onUpdate]);

    return (
        <div
            className={styles.expandedView}
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

            <CardCover
                cover={data.coverImage}
                onChange={(cover) => onUpdate(id, { coverImage: cover })}
                readOnly={readOnly}
                flatCorners={flatCorners}
            />

            <div className={`${expandedStyles.minimalHeader} custom-drag-handle`} style={flatCorners ? { borderRadius: 0 } : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0 }}>
                    <button
                        type="button"
                        className={`${expandedStyles.minimalIconButton} icon-hover nodrag`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveIconMenuId(id);
                        }}
                        title="Change icon"
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

                <div className={expandedStyles.controlsGroup} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    {onClose && (
                        <button className={expandedStyles.controlBtn} onClick={onClose} title="Close" aria-label="Close">
                            <X size={16} strokeWidth={2.6} />
                        </button>
                    )}
                    {onNavigate && (
                        <button
                            className={expandedStyles.controlBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                onNavigate();
                            }}
                            title="Open Canvas"
                            aria-label="Open Canvas"
                        >
                            <ExternalLink size={16} strokeWidth={2.6} />
                        </button>
                    )}
                </div>
            </div>

            <div className={expandedStyles.descriptionRow}>
                <CardDescription
                    value={draft.valueOf('description')}
                    onChange={(value) => draft.edit('description', value)}
                    onCommit={() => draft.commit('description')}
                    readOnly={readOnly}
                />
                {!readOnly && summary.canSummarize && (
                    <button
                        type="button"
                        className={`${expandedStyles.summarizeBtn} nodrag`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); void summary.summarize(); }}
                        disabled={summary.isSummarizing}
                        title={summary.error ?? 'Summarize this card into its description'}
                        aria-label="Summarize this card"
                    >
                        {summary.isSummarizing ? <Loader2 size={13} className={expandedStyles.summarizeSpin} /> : <Sparkles size={13} />}
                    </button>
                )}
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
                    if (e.target === e.currentTarget && nodeId) {
                        window.dispatchEvent(new CustomEvent('chnk-it-editor-bg-click', { detail: { nodeId } }));
                    }
                }}
                ref={contentRef}
                onDrop={handleAreaDrop}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                }}
            >
                <NoteBody
                    blocks={blocks}
                    showLiveEditor={liveEditorMounted}
                    isEditorPending={showLiveEditor && !liveEditorMounted}
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
