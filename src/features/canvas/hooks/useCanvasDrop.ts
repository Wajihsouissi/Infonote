import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import type { Block, BlockType } from '../../editor/types';
import { endBlockDrag } from '../../editor/blockDragLock';
import { isMediaType } from '../../editor/mediaTypes';
import { mergeIntoGallery, isGalleryType, claimGalleryItem, GALLERY_NODE_WIDTH } from '../../editor/galleryTypes';
import { type AppNode, getNodeBlocks } from '../../../types';
import { BASE_UNIT, MIN_FUSED_SIZE, ICON_SIZE, GRID_GAP } from '../../../config/layout';
import { checkNodeCreationLimits } from '../../../store/nodeLimits';
import { getBlockNodeStyle, HYDRATE_SIZE_PROFILE } from '../../../store/blockNodeStyle';
import { ingestFiles } from '../../../services/assets';
import { parsePlainText } from '../../editor/pasteUtils';
import { CHUNK_IT_MIME, type ChunkItDragPayload } from '../../card/chunkItUtils';
import {
    VIDEO_STUDY_SELECTION_MIME,
    createStudyCardBlocks,
    decodeVideoStudyDragPayload,
    formatTimestamp,
} from '../../youtube/youtubeStudy';

const AI_SECTION_MIME = 'application/chnk-it-ai-sections';

interface UseCanvasDropOptions {
    updateNodeData: (id: string, data: Record<string, unknown>) => void;
    extractPageFromBlock: (block: Block, position: { x: number; y: number }, sourceNodeId?: string) => void;
}

/**
 * Hook that handles drag-over and drop events on the canvas.
 * Manages block drops, node creation, and fusion logic.
 */
export function useCanvasDrop({
    updateNodeData,
    extractPageFromBlock,
}: UseCanvasDropOptions) {
    const { screenToFlowPosition, getIntersectingNodes, deleteElements, getViewport } = useReactFlow<AppNode>();

    const onDragOver = useCallback((event: React.DragEvent) => {
            const { centerPanelId, fullscreenId } = useStore.getState();
            if (centerPanelId || fullscreenId) {
            const isDraggingBlock = event.dataTransfer.types.includes('application/reactflow-block-type') || 
                                    event.dataTransfer.types.includes('application/chnk-it-block-data') ||
                                    event.dataTransfer.types.includes(AI_SECTION_MIME) ||
                                    event.dataTransfer.types.includes(CHUNK_IT_MIME) ||
                                    event.dataTransfer.types.includes(VIDEO_STUDY_SELECTION_MIME);
            if (!isDraggingBlock) return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    /**
     * Turn desktop files into canvas nodes.
     *
     * One file becomes one node — a file card, a picture, a video. Several at
     * once become a board, which is the same answer the app already gives when
     * one piece of media is dropped onto another, so a handful of images landing
     * on the canvas arranges itself instead of scattering.
     */
    const dropFilesOnCanvas = useCallback(
        async (files: FileList, screenPoint: { x: number; y: number }, currentParentId: string | null) => {
            const { files: stored, errors } = await ingestFiles(files);
            if (errors.length) {
                useStore.getState().setLimitNotice({ kind: 'file-rejected', reason: errors[0] });
            }
            if (!stored.length) return;

            const raw = screenToFlowPosition(screenPoint);
            const position = {
                x: Math.round(raw.x / BASE_UNIT) * BASE_UNIT,
                y: Math.round(raw.y / BASE_UNIT) * BASE_UNIT,
            };

            const blocks: Block[] = stored.map((f) => ({
                id: uuidv4(),
                type: f.type,
                content: f.ref,
                metadata: f.metadata,
            }));

            const block = blocks.length > 1 ? (mergeIntoGallery([], blocks) ?? blocks[0]) : blocks[0];
            const size = getBlockNodeStyle(block, HYDRATE_SIZE_PROFILE);
            const targetParentId = currentParentId || undefined;

            const newNode: AppNode = {
                id: uuidv4(),
                type: 'block',
                position: {
                    x: position.x - Math.round(size.width / 2),
                    y: position.y - Math.round(size.height / 2),
                },
                data: { content: [block], isStandaloneBlock: true },
                style: { width: size.width, height: size.height },
                parentId: targetParentId,
            };

            const { nodes, auth, setLimitNotice } = useStore.getState();
            const violation = checkNodeCreationLimits({
                nodes,
                targetParentId,
                newNodeType: 'block',
                isAuthenticated: auth.isAuthenticated,
            });
            if (violation) {
                setLimitNotice(violation);
                return;
            }

            useStore.setState(state => ({ nodes: [...state.nodes, newNode] }));
        },
        [screenToFlowPosition],
    );

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            const { centerPanelId, fullscreenId, currentParentId } = useStore.getState();

            const type = event.dataTransfer.getData('application/reactflow-block-type') as BlockType;
            const blockDataJson = event.dataTransfer.getData('application/chnk-it-block-data');
            const aiSectionsJson = event.dataTransfer.getData(AI_SECTION_MIME);
            const chunkItJson = event.dataTransfer.getData(CHUNK_IT_MIME);
            const videoStudyJson = event.dataTransfer.getData(VIDEO_STUDY_SELECTION_MIME);

            /* Files dropped from the desktop.
             *
             * This used to fall straight through to the bail-out below, which
             * only recognised the two internal drag flavours — so dragging a PDF
             * onto the board did nothing at all, and paste was the only way to
             * get a file onto a canvas. Handled first because a file drag never
             * carries either of those flavours and everything after this point
             * assumes one of them is present.
             */
            if (event.dataTransfer.files?.length && !type && !blockDataJson && !aiSectionsJson && !chunkItJson && !videoStudyJson) {
                event.preventDefault();
                event.stopPropagation();
                if (centerPanelId || fullscreenId) return;
                void dropFilesOnCanvas(event.dataTransfer.files, {
                    x: event.clientX,
                    y: event.clientY,
                }, currentParentId);
                return;
            }

            if (centerPanelId || fullscreenId) {
                if (!type && !blockDataJson && !aiSectionsJson && !chunkItJson && !videoStudyJson) return;
            }

            /* Transcript selections become ordinary notes with durable source
               references. The note and provenance edge are created in the same
               synchronous store turn; if the beta limit rejects the note, no
               dangling edge is added. */
            if (videoStudyJson) {
                event.preventDefault();
                event.stopPropagation();
                if (centerPanelId || fullscreenId) return;
                const payload = decodeVideoStudyDragPayload(videoStudyJson);
                if (!payload) return;
                const sourceNode = useStore.getState().nodes.find((node) => node.id === payload.sourceNodeId && node.type === 'youtube');
                if (!sourceNode) return;
                const raw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const nodeId = uuidv4();
                useStore.getState().addNode(
                    'note',
                    { x: raw.x - 216, y: raw.y - 150 },
                    {
                        label: payload.kind === 'moment'
                            ? `Moment · ${formatTimestamp(payload.startMs)}`
                            : payload.video.title,
                        content: createStudyCardBlocks(payload),
                        coverImage: payload.kind === 'moment' ? payload.video.thumbnailUrl : undefined,
                        sourceRef: {
                            kind: 'youtube',
                            sourceNodeId: payload.sourceNodeId,
                            videoId: payload.video.videoId,
                            url: payload.video.url,
                            title: payload.video.title,
                            startMs: payload.startMs,
                            endMs: payload.kind === 'clip' ? payload.endMs : undefined,
                            segmentIds: payload.segments.map((segment) => segment.id),
                        },
                    },
                    { width: 432, height: 300 },
                    currentParentId || undefined,
                    nodeId,
                );
                if (useStore.getState().nodes.some((node) => node.id === nodeId)) {
                    useStore.getState().onConnect({
                        source: payload.sourceNodeId,
                        target: nodeId,
                        sourceHandle: 'out',
                        targetHandle: null,
                    });
                    window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [nodeId] } }));
                }
                return;
            }

            /* Chunk It intentionally copies rather than moves. The rail sends
               cloned blocks with no source-node identity, so its source card
               can never be modified by the canvas drop cleanup below. */
            if (chunkItJson) {
                event.preventDefault();
                try {
                    const parsed = JSON.parse(chunkItJson) as ChunkItDragPayload;
                    if ((parsed.kind !== 'block' && parsed.kind !== 'section') || !Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return;

                    const raw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    const position = {
                        x: Math.round(raw.x / BASE_UNIT) * BASE_UNIT,
                        y: Math.round(raw.y / BASE_UNIT) * BASE_UNIT,
                    };
                    const isFused = parsed.kind === 'section' || parsed.blocks.length > 1;
                    const height = Math.min(720, Math.max(208, 110 + parsed.blocks.length * 48));
                    const id = uuidv4();
                    useStore.getState().addNode(
                        isFused ? 'fused-note' : 'block',
                        {
                            x: position.x - (isFused ? MIN_FUSED_SIZE : ICON_SIZE) / 2,
                            y: position.y - height / 2,
                        },
                        { content: parsed.blocks, isStandaloneBlock: true },
                        { width: isFused ? MIN_FUSED_SIZE : ICON_SIZE, height: isFused ? height : Math.min(320, height) },
                        currentParentId || undefined,
                        id,
                    );
                    window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
                } catch {
                    // Invalid drag data is ignored and cannot change the canvas.
                }
                return;
            }

            /* A line from an AI response is an ordinary editable block; a full
               selected response section remains a fused node. Neither gets an
               invented “AI response” heading — the dropped text is the truth. */
            if (aiSectionsJson) {
                event.preventDefault();
                try {
                    const parsed = JSON.parse(aiSectionsJson) as { kind?: 'block' | 'fused'; text?: unknown; sections?: unknown[] };
                    const raw = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    const position = {
                        x: Math.round(raw.x / BASE_UNIT) * BASE_UNIT,
                        y: Math.round(raw.y / BASE_UNIT) * BASE_UNIT,
                    };
                    const text = parsed.kind === 'block' && typeof parsed.text === 'string'
                        ? parsed.text.trim()
                        : (parsed.sections ?? []).filter((section): section is string => typeof section === 'string' && section.trim().length > 0).join('\n\n');
                    if (!text) return;
                    const blocks = parsePlainText(text);
                    const id = uuidv4();
                    const height = Math.min(720, Math.max(208, 110 + blocks.length * 48));
                    useStore.getState().addNode(
                        parsed.kind === 'block' ? 'block' : 'fused-note',
                        { x: position.x - MIN_FUSED_SIZE / 2, y: position.y - height / 2 },
                        { content: blocks, isStandaloneBlock: true },
                        { width: MIN_FUSED_SIZE, height: parsed.kind === 'block' ? Math.min(320, height) : height },
                        currentParentId || undefined,
                        id,
                    );
                    window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
                } catch {
                    // A malformed external drag is ignored; it cannot affect a canvas.
                }
                return;
            }

            // Check if the drop landed inside a node's BlockEditor
            const target = event.target as HTMLElement;
            const isInsideBlockEditor = !!target.closest('[data-chnk-it-block-editor]');

            // Parse block data to check if this is a cross-node block transfer
            let hasSourceNode = false;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    hasSourceNode = !!parsed.sourceNodeId;
                } catch {
                    // Parse failed
                }
            }

            const { zoom } = getViewport();
            // Constant 20px screen-space hover checking size, scaled to flow space
            const checkSize = Math.max(10, 20 / zoom);



            // If dropping inside a node's content area AND it's from another node, let BlockEditor handle it
            if (isInsideBlockEditor && hasSourceNode) {
                return;
            }

            event.preventDefault();

            const rawPosition = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Snap drop position to grid
            const position = {
                x: Math.round(rawPosition.x / BASE_UNIT) * BASE_UNIT,
                y: Math.round(rawPosition.y / BASE_UNIT) * BASE_UNIT
            };

            let blocksToAdd: Block[] = [];
            let sourceNodeId: string | null = null;

            if (blockDataJson) {
                try {
                    const parsed = JSON.parse(blockDataJson);
                    if (parsed.blocks && Array.isArray(parsed.blocks)) {
                        blocksToAdd = parsed.blocks;
                        sourceNodeId = parsed.sourceNodeId;
                    } else if (parsed.block) {
                        blocksToAdd = [parsed.block];
                        sourceNodeId = parsed.sourceNodeId;
                    }
                } catch (e) {
                    console.error("Failed to parse block data", e);
                }
            } else if (type) {
                let metadata = undefined;
                try {
                    const metaJson = event.dataTransfer.getData('application/chnk-it-block-metadata');
                    if (metaJson) metadata = JSON.parse(metaJson);
                } catch (e) { console.error("Failed to parse metadata", e); }

                blocksToAdd = [{
                    id: uuidv4(),
                    type: type,
                    content: '',
                    metadata
                }];
            } else {
                return;
            }

            /* What the source card must give up, captured before anything below
               rewrites `blocksToAdd`: folding media into a gallery replaces those
               blocks with a single new one, and cleaning up by the *new* ids
               would leave the originals sitting in the card as duplicates. */
            const draggedBlockIds = blocksToAdd.map(b => b.id);

            const dropRect = {
                x: position.x - checkSize / 2,
                y: position.y - checkSize / 2,
                width: checkSize,
                height: checkSize
            };

            const intersections = getIntersectingNodes(dropRect);
            const targetNode = intersections.find(n =>
                (n.type === 'block' || n.type === 'fused-note' || n.type === 'note') &&
                n.id !== sourceNodeId &&
                n.id !== currentParentId
            );

            if (targetNode) {
                const currentContent = getNodeBlocks(targetNode.data) ?? [];
                // Media landing on media builds a board instead of a stack — the
                // same rule as a node-on-node drop, so the outcome doesn't depend
                // on which of the two ways you happened to drag it.
                const gallery = mergeIntoGallery(currentContent, blocksToAdd);

                if (gallery) {
                    updateNodeData(targetNode.id, {
                        content: [gallery],
                        lastFusedAt: Date.now()
                    });
                    useStore.getState().updateNode(targetNode.id, {
                        type: 'block' as const,
                        style: { ...targetNode.style, width: GALLERY_NODE_WIDTH, height: 'auto' }
                    });
                } else {
                    updateNodeData(targetNode.id, {
                        content: [...currentContent, ...blocksToAdd],
                        lastFusedAt: Date.now()
                    });

                    if (targetNode.type === 'block') {
                        useStore.getState().updateNode(targetNode.id, {
                            type: 'fused-note' as const,
                            style: { ...targetNode.style, width: MIN_FUSED_SIZE, height: 208 }
                        });
                    }
                }

                if (sourceNodeId) {
                    const { nodes: currentNodes } = useStore.getState();
                    const sourceNode = currentNodes.find((n: AppNode) => n.id === sourceNodeId);
                    const sourceBlocks = sourceNode ? getNodeBlocks(sourceNode.data) : undefined;
                    if (sourceNode && sourceBlocks) {
                        const newContent = sourceBlocks.filter((b) => !draggedBlockIds.includes(b.id));
                        console.log("[useCanvasDrop] Source cleanup - removing blocks:", draggedBlockIds);
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && (sourceNode.type === 'fused-note' || sourceNode.type === 'block')) {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }
            } else {
                // Adding new node to canvas
                if (blocksToAdd.length === 1 && blocksToAdd[0].type === 'page') {
                    extractPageFromBlock(blocksToAdd[0], position, sourceNodeId || undefined);
                    if (window.chnkItMultiDragCleanup) {
                        window.chnkItMultiDragCleanup();
                        delete window.chnkItMultiDragCleanup;
                    }
                    window.chnkItCrossEditorDropHandled = true;
                    window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
                    return;
                }

                /* Several pictures dragged out together are a board, not a stack —
                   the same rule as dropping media onto media, applied to the
                   multi-select case. `mergeIntoGallery` needs two sides, so the
                   set is folded against an empty one. */
                const droppedGallery = mergeIntoGallery([], blocksToAdd);
                if (droppedGallery) blocksToAdd = [droppedGallery];

                const isFusedLink = blocksToAdd.length > 1;
                const isSingleMedia = blocksToAdd.length === 1 && isMediaType(blocksToAdd[0].type);
                const isSingleGallery = blocksToAdd.length === 1 && isGalleryType(blocksToAdd[0].type);

                const BLOCK_WIDTH = isSingleGallery
                    ? GALLERY_NODE_WIDTH
                    : isSingleMedia ? ((BASE_UNIT * 4) - GRID_GAP) : MIN_FUSED_SIZE;
                const BLOCK_HEIGHT = isFusedLink ? MIN_FUSED_SIZE : ICON_SIZE;

                const centeredPosition = {
                    x: position.x - (BLOCK_WIDTH / 2),
                    y: position.y - (BLOCK_HEIGHT / 2),
                };

                const nodeId = uuidv4();
                const targetParentId = currentParentId || undefined;

                console.log("[useCanvasDrop] Adding block to store:", {
                    nodeId,
                    parentId: targetParentId,
                    blockCount: blocksToAdd.length
                });

                const newNode: AppNode = {
                    id: nodeId,
                    type: blocksToAdd.length > 1 ? 'fused-note' : 'block',
                    position: centeredPosition,
                    data: {
                        content: blocksToAdd,
                        isStandaloneBlock: true
                    },
                    style: {
                        width: BLOCK_WIDTH,
                        height: blocksToAdd.length > 1 ? 208 : BLOCK_HEIGHT
                    },
                    parentId: targetParentId,
                };

                // Beta creation limits (BETA_SCOPE.md). Abort BEFORE adding the
                // node and before any blocks are removed from the source card.
                {
                    const { nodes, auth, setLimitNotice } = useStore.getState();
                    const violation = checkNodeCreationLimits({
                        nodes,
                        targetParentId,
                        newNodeType: newNode.type,
                        isAuthenticated: auth.isAuthenticated,
                    });
                    if (violation) {
                        setLimitNotice(violation);
                        return;
                    }
                }

                useStore.setState(state => ({
                    nodes: [...state.nodes, newNode]
                }));

                if (sourceNodeId) {
                    const { nodes: freshNodes } = useStore.getState();
                    const sourceNode = freshNodes.find((n: AppNode) => n.id === sourceNodeId);
                    const sourceBlocks = sourceNode ? getNodeBlocks(sourceNode.data) : undefined;
                    if (sourceNode && sourceBlocks) {
                        const newContent = sourceBlocks.filter((b) => !draggedBlockIds.includes(b.id));
                        console.log("[useCanvasDrop] Source cleanup:", draggedBlockIds.length, "blocks");
                        updateNodeData(sourceNodeId, { content: newContent });
                        if (newContent.length === 0 && (sourceNode.type === 'fused-note' || sourceNode.type === 'block')) {
                            setTimeout(() => deleteElements({ nodes: [{ id: sourceNodeId! }] }), 0);
                        }
                    }
                }
            }

            /* If this came out of a gallery, the picture is now on the canvas and
               has to leave the board. Sits on the shared exit path so it covers
               both branches above — dropped onto a node, and dropped on bare
               canvas — and is a no-op for every drag that wasn't a tile. */
            claimGalleryItem(draggedBlockIds);

            if (window.chnkItMultiDragCleanup) {
                window.chnkItMultiDragCleanup();
                delete window.chnkItMultiDragCleanup;
            }
            // Signal SortableBlockWrapper.handleDragEnd that the drop was already handled
            // here so it doesn't double-dispatch chnk-it-clear-selection.
            window.chnkItCrossEditorDropHandled = true;
            endBlockDrag();
            window.dispatchEvent(new CustomEvent('chnk-it-clear-selection'));
        },
        [screenToFlowPosition, updateNodeData, getIntersectingNodes, deleteElements, extractPageFromBlock, getViewport, dropFilesOnCanvas],
    );

    return {
        onDragOver,
        onDrop,
    };
}
