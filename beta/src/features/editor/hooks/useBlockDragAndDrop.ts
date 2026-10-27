import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Block, BlockType, BlockMetadata, BlockDropPosition } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { removeTransferredBlocks, finishBlockTransfer } from '../drag/blockTransfer';
import { ingestFiles } from '../../../services/assets';
import { canAbsorbIntoGallery, mergeIntoGallery, claimGalleryItem, GALLERY_DRAG_MIME } from '../gallery/galleryTypes';
import { startDragSession, readDragData } from '../drag/dragSession';
import { blocksForDrag, reorderBlocks, transferWithinDocument } from '../drag/blockReorder';
import { beginHistoryGesture, endHistoryGesture } from '../../../store/temporalControl';
import { resolveBlockDragPayload } from '../drag/blockDragPayload';
import { currentBlockInsertionRoot, currentBlockInsertionTarget } from '../drag/blockInsertionPreview';

interface DragAndDropProps {
    blocks: Block[];
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    selectedBlockIds: Set<string>;
    nodeId?: string;
    addBlock: (afterId: string, type: BlockType, indent?: number, metadata?: BlockMetadata) => void;
    editorId: string;
    pendingDropTarget?: MutableRefObject<{ blockId: string; position: BlockDropPosition } | null>;
}

export function useBlockDragAndDrop({
    blocks,
    setBlocks,
    debouncedOnUpdate,
    selectedBlockIds,
    pendingDropTarget: pendingDropTargetRef,
    nodeId,
    addBlock,
    editorId
}: DragAndDropProps) {

    // The document adapter retains its same-node guard and graph deletion API.
    const removeBlocksFromSource = useCallback((blockIds: string[], sourceNodeId: string | null) => {
        if (sourceNodeId && sourceNodeId !== nodeId) {
            const { nodes, updateNodeData, setNodes } = useStore.getState();
            removeTransferredBlocks(sourceNodeId, blockIds, {
                nodes, updateNodeData,
                removeNode: id => setNodes(nds => nds.filter(node => node.id !== id)),
            }, 'document');
            finishBlockTransfer();
        }
    }, [nodeId]);

    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: BlockDropPosition, dataTransfer?: DataTransfer) => {
        if (sourceId === targetId || !blocks.some(block => block.id === targetId)) return;
        const rawPayload=dataTransfer?readDragData({dataTransfer},'application/chnk-it-block-data'):'';
        const resolved=rawPayload?resolveBlockDragPayload(rawPayload,useStore.getState().nodes):null;
        if(rawPayload&&!resolved)return;

        // Check for cross-editor or cross-node move via DataTransfer
        let isCrossEditor = false;
        if (dataTransfer) {
            const sourceEditorId = readDragData({ dataTransfer }, 'application/chnk-it-editor-id');
            if (sourceEditorId && sourceEditorId !== editorId) {
                isCrossEditor = true;
            }
        }

        if (isCrossEditor && nodeId && dataTransfer) {
            const raw = readDragData({dataTransfer}, 'application/chnk-it-block-data');
            const payload=resolved;
            if(!raw||!payload)return;
            if (payload.sourceNodeId === nodeId) {
                const state = useStore.getState(), root = state.nodes.find(node=>node.id===nodeId)?.data.content;
                if (!Array.isArray(root)) return;
                const next = transferWithinDocument(root, payload.blocks, targetId, position);
                if (next === root) return;
                beginHistoryGesture(state);
                try { state.updateNodeData(nodeId, {content:next}); }
                finally { endHistoryGesture(useStore.getState()); }
                window.chnkItRemoveDraggedBlocks = null;
                finishBlockTransfer('cross-editor');
                return;
            }
        }

        let sourceNodeToRemove: string | null = null;
        const accepted = { moved:false, ids:[] as string[] };
        if (dataTransfer && !isCrossEditor) {
            try {
                const rawData = readDragData({ dataTransfer }, 'application/chnk-it-block-data');
                if (rawData) {
                    const parsed = resolved!;
                    const sourceNodeId = parsed.sourceNodeId;

                    if (sourceNodeId && sourceNodeId !== nodeId) {

                        let blocksToRemove: string[] = [];
                        if (parsed.blocks) blocksToRemove = parsed.blocks.map((b: { id: string }) => b.id);

                        // If parsing failed to get blocks but we have sourceId, use that
                        if (blocksToRemove.length === 0 && sourceId) blocksToRemove = [sourceId];

                        // Execute removal from source
                        if (blocksToRemove.length) sourceNodeToRemove = sourceNodeId;
                    }
                }
            } catch (e) {
                console.error("Failed to parse cross-node data in handleMoveBlock", e);
            }
        }

        beginHistoryGesture(useStore.getState());
        try {
        setBlocks(prev => {
            let blocksToMove: Block[] = [];
            let sourceIds: string[] = [];

            if (dataTransfer) {
                try {
                    const rawData = readDragData({ dataTransfer }, 'application/chnk-it-block-data');
                    if (rawData) {
                        const parsed = resolved!;
                        if (parsed.blocks) {
                            blocksToMove = parsed.blocks;
                            sourceIds = blocksToMove.map(b => b.id);
                        }
                    }
                } catch (e) { console.error("Failed to parse drop data", e); }
            }

            // Fallback: If no blocks found in dataTransfer, use local lookup
            if (blocksToMove.length === 0) {
                const fromIndex = prev.findIndex(b => b.id === sourceId);
                if (fromIndex !== -1) {
                    blocksToMove = blocksForDrag(prev, selectedBlockIds.has(sourceId) ? selectedBlockIds : new Set([sourceId]));
                    sourceIds = blocksToMove.map(block => block.id);
                }
            }

            // SAFETY: Force include the primary sourceId if it's not in the list
            if (sourceId && !sourceIds.includes(sourceId)) {
                sourceIds.push(sourceId);
            }

            if (blocksToMove.length === 0) return prev;
            // Local state owns the latest text and document order, not the
            // dragstart snapshot. A selected target is a deliberate no-op.
            if (!isCrossEditor && sourceIds.every(id => prev.some(block => block.id === id))) {
                blocksToMove = blocksForDrag(prev, new Set(sourceIds));
                sourceIds = blocksToMove.map(block => block.id);
            }
            if (sourceIds.includes(targetId)) return prev;


            const originalTargetIndex = prev.findIndex(b => b.id === targetId);
            if (originalTargetIndex === -1 && prev.length > 0) {
                return prev;
            }

            /* Dropped INTO a piece of media rather than beside it: the two become
               one board. The target block is replaced in place (keeping its
               position in the document) and the dragged media is consumed.
               `mergeIntoGallery` returning null is the guard — if this pairing
               isn't really a gallery, fall through to ordinary insertion. */
            if (position === 'center' && originalTargetIndex !== -1) {
                const gallery = mergeIntoGallery([prev[originalTargetIndex]], blocksToMove);
                if (gallery) {
                    const merged = prev
                        .filter(b => !sourceIds.includes(b.id))
                        .map(b => (b.id === targetId ? gallery : b));
                    debouncedOnUpdate(merged);

                    accepted.moved = true; accepted.ids = sourceIds;
                    return merged;
                }
            }

            const newBlocks = reorderBlocks(prev, blocksToMove, targetId, position);
            if (newBlocks === prev) return prev;
            debouncedOnUpdate(newBlocks);

            /* Dragged out of a gallery and dropped between blocks: the picture is
               a block in this document now, so the board has to let go of it. */
            accepted.moved = true; accepted.ids = sourceIds;

            return newBlocks;
        });

        if (!accepted.moved) return;
        claimGalleryItem(accepted.ids);
        if (isCrossEditor && typeof window.chnkItRemoveDraggedBlocks === 'function') {
            window.chnkItRemoveDraggedBlocks(accepted.ids);
            window.chnkItRemoveDraggedBlocks = null;
        } else if (sourceNodeToRemove) removeBlocksFromSource(accepted.ids,sourceNodeToRemove);

        if (isCrossEditor) {
            // The source editor just dropped the block from its own state, so the drag
            // source element unmounts before `dragend` fires — and a detached element's
            // dragend never reaches SortableBlockWrapper. Run the end-of-drag cleanup
            // here instead, or the drag lock stays raised and blocks all editing.
            finishBlockTransfer('cross-editor');
        }
        } finally { endHistoryGesture(useStore.getState()); }
    }, [blocks, selectedBlockIds, debouncedOnUpdate, setBlocks, removeBlocksFromSource, nodeId, editorId]);

    const handleBlockDragStart = useCallback((e: React.DragEvent, block: Block) => {
        const isMulti = selectedBlockIds.has(block.id) && selectedBlockIds.size > 1;
        e.dataTransfer.effectAllowed = 'copyMove';

        const blocksToDrag = blocksForDrag(blocks, isMulti ? selectedBlockIds : new Set([block.id]));

        startDragSession(e.dataTransfer, {
            'application/chnk-it-block-id': block.id,
            'application/reactflow-block-type': block.type,
            'application/chnk-it-editor-id': editorId,
            /* Announce that this payload could join a board. Drop targets can
               only read `types` during dragover, so this presence flag is what
               lets a media block offer its merge band before the drop commits. */
            ...(canAbsorbIntoGallery(blocksToDrag) ? { [GALLERY_DRAG_MIME]: '1' } : {}),
            'application/chnk-it-block-data': JSON.stringify({
                block,
                blocks: blocksToDrag,
                sourceNodeId: nodeId || null,
            }),
        });

        window.chnkItRemoveDraggedBlocks = (ids: string[]) => {
            setBlocks(prev => {
                const newBlocks = prev.filter(b => !ids.includes(b.id));
                debouncedOnUpdate(newBlocks);
                return newBlocks;
            });
        };

        // Register global cleanup for multi-block drag operations
        if (isMulti) {
            window.chnkItMultiDragCleanup = () => {
                // Dispatch both events to ensure cleanup
                const event1 = new CustomEvent('chnk-it-clear-selection');
                const event2 = new CustomEvent('chnk-it-multi-drag-clear-selection');
                window.dispatchEvent(event1);
                window.dispatchEvent(event2);
            };
        }
    }, [selectedBlockIds, blocks, nodeId, editorId, debouncedOnUpdate, setBlocks]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // One write for the whole drop. The previous per-file FileReader
            // callbacks each rebuilt `blocks` from their own stale closure, so
            // dropping four files reliably kept only the last to finish — and
            // none of them ever met the size limit.
            const dropped = Array.from(e.dataTransfer.files);
            void ingestFiles(dropped).then(({ files: stored }) => {
                if (!stored.length) return;
                const newBlocks: Block[] = stored.map(f => ({
                    id: uuidv4(),
                    type: f.type,
                    content: f.ref,
                    metadata: f.metadata,
                }));
                setBlocks(prev => {
                    const next = [...prev, ...newBlocks];
                    debouncedOnUpdate(next);
                    return next;
                });
            });
            return;
        }

        const type = readDragData(e, 'application/reactflow-block-type') as BlockType;
        if (type) {
            const sourceBlockId = readDragData(e, 'application/chnk-it-block-id');
            const rawPayload=readDragData(e,'application/chnk-it-block-data');
            const resolved=rawPayload?resolveBlockDragPayload(rawPayload,useStore.getState().nodes):null;
            if(rawPayload&&!resolved)return;

            // Parse block data to get source info
            let sourceNodeId: string | null = null;
            let blocksFromData: Block[] = [];

            try {
                const rawData = readDragData(e, 'application/chnk-it-block-data');
                if (rawData) {
                    const parsed = resolved!;
                    sourceNodeId = parsed.sourceNodeId || null;
                    if (parsed.blocks) {
                        blocksFromData = parsed.blocks;
                    }
                }
            } catch (err) { console.error("Failed to parse drop data", err); }


            if (sourceBlockId) {
                // A preview can move the hovered frame away before release.
                // WebKit may deliver that drop directly to the editor gap,
                // without another dragover to update its legacy target ref.
                const previewRoot = currentBlockInsertionRoot();
                const shown = previewRoot?.dataset.editorId === editorId
                    ? currentBlockInsertionTarget(previewRoot) : null;
                const tracked = shown ?? pendingDropTargetRef?.current;
                if (tracked) {
                    handleMoveBlock(sourceBlockId, tracked.blockId, tracked.position, e.dataTransfer);
                    return;
                }
                if (blocks.length === 0) {
                    // Drop into empty editor
                    if (blocksFromData.length > 0) {
                        setBlocks(blocksFromData);
                        debouncedOnUpdate(blocksFromData);

                        claimGalleryItem(blocksFromData.map(b => b.id));
                        const sourceEditorId = readDragData(e, 'application/chnk-it-editor-id');
                        if (sourceEditorId && sourceEditorId !== editorId && typeof window.chnkItRemoveDraggedBlocks === 'function') {
                            window.chnkItRemoveDraggedBlocks(blocksFromData.map(b => b.id));
                            window.chnkItRemoveDraggedBlocks = null;
                        } else {
                            // Remove from source node if cross-node drop
                            removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
                        }
                    }
                    return;
                }

                // If this is a cross-node drop, handle specially
                if (sourceNodeId && sourceNodeId !== nodeId && blocksFromData.length > 0) {
                    // Add blocks to this node
                    setBlocks(prev => {
                        const newBlocks = [...prev, ...blocksFromData];
                        debouncedOnUpdate(newBlocks);
                        return newBlocks;
                    });

                    // Remove from source node
                    removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
                    return;
                }

                // Same-node move (internal reorder) — use container-tracked target if available
                const lastId = blocks[blocks.length - 1].id;
                handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
                return;
            }

            // External drop (e.g. from menu) - blocks without sourceBlockId
            if (blocksFromData.length > 0) {
                // If we have full block data, insert it at the end
                setBlocks(prev => {
                    const newBlocks = [...prev, ...blocksFromData];
                    debouncedOnUpdate(newBlocks);
                    return newBlocks;
                });

                claimGalleryItem(blocksFromData.map(b => b.id));
                // Remove from source node if cross-node drop
                removeBlocksFromSource(blocksFromData.map(b => b.id), sourceNodeId);
            } else {
                // Fallback to type-based creation (new block from menu)
                let metadata = undefined;
                try {
                    const metaJson = e.dataTransfer.getData('application/chnk-it-block-metadata');
                    if (metaJson) metadata = JSON.parse(metaJson);
                } catch (err) { console.error("Failed to parse drop metadata", err); }

                const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
                // pass 0 as default indent
                addBlock(lastId, type, 0, metadata);
            }
        }
    }, [blocks, addBlock, handleMoveBlock, debouncedOnUpdate, setBlocks, nodeId, removeBlocksFromSource, editorId, pendingDropTargetRef]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    return {
        handleMoveBlock,
        handleBlockDragStart,
        handleDrop,
        handleDragOver
    };
}
