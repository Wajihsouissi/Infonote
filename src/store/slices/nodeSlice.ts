import type { StateCreator } from 'zustand';
import {
    type Edge,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    reconnectEdge,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, type AppNodeData, getNodeBlocks, getNodeLabel } from '../../types';
import type { Block } from '../../features/editor/types';
import { cloneBlocks, type NodesPayload } from '../../features/clipboard/clipboardPayload';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue, ICON_SIZE } from '../../config/layout';
import {
    createKanbanData,
    KANBAN_DEFAULT_WIDTH,
    KANBAN_DEFAULT_HEIGHT,
} from '../../features/kanban/kanbanTypes';
import { computeCanvasContentReconciliation, computeParentContentUpdate } from '../contentSync';
import {
    isCanvasHydratableBlock,
    planHydration,
    layoutChunks,
    layoutDocumentTree,
    layoutCanvasBento,
    computeSmartHierarchy,
    computeRelatednessHierarchy,
    type HydrationChunk,
} from '../contentHydration';
import { withoutHistory } from '../temporalControl';
import { checkNodeCreationLimits } from '../nodeLimits';
import {
    normalizeText,
    blockText,
    getBlockNodeStyle,
    createBlockNode as createStandaloneBlockNode,
    buildRadialCluster as buildRadialClusterFromCenter,
    RELEASE_SIZE_PROFILE,
    HYDRATE_SIZE_PROFILE,
} from '../blockNodeStyle';
import type { AppState, NodeSlice } from '../types';
import { createYouTubeStudyData } from '../../features/youtube/youtubeStudy';

// Debug flag - set to false in production
const DEBUG = import.meta.env.DEV;

// DEBUG-log helper: standalone flag only exists on block/fused-note payloads
const isStandalone = (data: AppNodeData): boolean | undefined =>
    'isStandaloneBlock' in data ? data.isStandaloneBlock : undefined;

// Debounce map for parent content sync to prevent thrashing
const pendingSyncTimers = new Map<string, number>();

// Helper to schedule debounced sync
function scheduleParentSync(parentId: string, syncFn: () => void, delayMs: number = 250) {
    // Clear existing timer for this parent
    const existingTimer = pendingSyncTimers.get(parentId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    
    // Schedule new sync
    const timerId = window.setTimeout(() => {
        pendingSyncTimers.delete(parentId);
        syncFn();
    }, delayMs);
    
    pendingSyncTimers.set(parentId, timerId);
}

/** Return a selected branch in document order, including every descendant.
 *
 * Canvas membership is represented by `parentId`, not by React Flow's visual
 * tree. Treating a selected parent as a single record leaves cards in its
 * nested canvases permanently orphaned after a delete or duplicate.
 */
function collectNodeBranch(nodes: AppNode[], rootIds: Iterable<string>): AppNode[] {
    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
        if (!node.parentId) continue;
        const children = childrenByParent.get(node.parentId) ?? [];
        children.push(node.id);
        childrenByParent.set(node.parentId, children);
    }

    const ids = new Set<string>();
    const pending = [...rootIds];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        childrenByParent.get(id)?.forEach((childId) => pending.push(childId));
    }

    return nodes.filter((node) => ids.has(node.id));
}

/** Update page-block links after cloning a nested canvas branch.
 *
 * Page links can occur inside any supported nested block container, so the
 * remap intentionally walks metadata rather than only top-level blocks.
 */
function remapNodeReferences(value: unknown, idMap: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map((item) => remapNodeReferences(item, idMap));
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key,
            key === 'nodeId' && typeof item === 'string' ? (idMap.get(item) ?? item) : remapNodeReferences(item, idMap),
        ]),
    );
}

function remapBlockNodeReferences(blocks: Block[], idMap: Map<string, string>): Block[] {
    return blocks.map((block) => ({
        ...block,
        ...(block.metadata
            ? { metadata: remapNodeReferences(block.metadata, idMap) as typeof block.metadata }
            : {}),
    }));
}

// Default initial state (will be replaced by loadGraph if storage has data)
const getInitialNodes = (): AppNode[] => {
    // Check if we should skip defaults (storage will load)
    return [
        {
            id: '1',
            type: 'note',
            position: { x: 100, y: 100 },
            data: {
                label: 'Project Goal',
                content: [],
                viewMode: 'expanded',
                icon: 'Target',
                description: 'A comprehensive note-taking application with infinite canvas capabilities',
                category: 'Planning',
                date: new Date().toISOString()
            },
            style: { width: 432, height: 432 },
            parentId: undefined,
        },
        {
            id: '2',
            type: 'note',
            position: { x: 600, y: 100 },
            data: {
                label: 'Features',
                content: [{ id: 'b1', type: 'text', content: 'Atomic notes, infinite canvas, linking.' }],
                viewMode: 'medium',
                icon: 'Sparkles',
                description: 'Core features include atomic notes, infinite canvas, and smart linking between notes',
                category: 'Features'
            },
            style: { width: 208, height: 208 },
            parentId: undefined,
        },
        {
            id: '3',
            type: 'note',
            position: { x: 600, y: 300 },
            data: {
                label: 'Tech Stack',
                content: [],
                viewMode: 'icon',
                icon: 'Settings'
            },
            style: { width: 96, height: 96 },
            parentId: undefined,
        },
    ];
};

const initialEdges: Edge[] = [];

export const createNodeSlice: StateCreator<AppState, [], [], NodeSlice> = (set, get) => ({
    nodes: getInitialNodes(),
    edges: initialEdges,
    pendingNodeDeletion: null,
    lastNodeDeletion: null,

    onNodesChange: (changes) => {
        // Only build detailed logging for non-trivial changes to reduce console noise
        if (DEBUG) {
            /* Live drag frames are excluded on purpose. React Flow emits a
               position change per node per frame while dragging, and building
               + logging that object every frame is itself enough to make the
               drag stutter in dev — the console was measuring the thing it was
               supposed to be observing. Only the final, settled position and
               genuine structural changes are worth a line. */
            const importantChanges = changes.filter(c =>
                c.type !== 'select' && c.type !== 'dimensions' &&
                !(c.type === 'position' && c.dragging)
            );
            if (importantChanges.length > 0) {
                console.log("[onNodesChange] Received changes:", importantChanges.map(c => {
                    const detail: Record<string, unknown> = { type: c.type, id: 'id' in c ? c.id : undefined };
                    if (c.type === 'remove') detail.removing = c.id;
                    else if (c.type === 'position') { detail.position = c.position; detail.dragging = c.dragging; }
                    return detail;
                }));
            }
        }

        // CRITICAL FIX: Preserve parentId for nodes during 'replace' and other changes
        const filteredChanges = changes.map(change => {
            if (change.type === 'replace') {
                const existingNode = get().nodes.find(n => n.id === change.id);
                if (existingNode && existingNode.parentId) {
                    if (DEBUG) console.log("[onNodesChange] Preserving parentId for node during replace:", change.id);
                    return {
                        ...change,
                        item: {
                            ...change.item,
                            parentId: existingNode.parentId
                        }
                    };
                }
            }
            return change;
        });
        /* Position changes are NOT filtered while dragging, however tempting
           that is. React Flow runs as a controlled component here: it does not
           keep its own copy of the nodes, so a change it emits and we drop is a
           frame the card does not move. Dropping them left the card pinned in
           place until some unrelated re-render happened to flush the mutated
           position through — which is the trailing, lurching drag this was
           meant to cure. The cost it was avoiding is real, but it lives
           downstream (culling, persistence, sync), and that is where it is
           now held back: see useCanvasViewport and StorageManager. */

        if (filteredChanges.length === 0) return;

        const nodesBefore = get().nodes.length;

        set({
            nodes: applyNodeChanges(filteredChanges, get().nodes) as AppNode[],
        });

        const nodesAfter = get().nodes.length;

        if (nodesBefore !== nodesAfter) {
            if (DEBUG) {
                console.log("[onNodesChange] Nodes count changed:", {
                    before: nodesBefore,
                    after: nodesAfter
                });
            }
        }

        // Mark cloud dirty on structural or position changes (not select/dimensions)
        const hasMeaningfulChange = filteredChanges.some(
            (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace' ||
                (c.type === 'position' && c.dragging === false)
        );
        if (hasMeaningfulChange) {
            get().setCloudDirty?.(true);
        }

        // Optimization: Sync parent content on structural changes OR position changes (to update order)
        const hasStructuralChange = filteredChanges.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'dimensions');
        const hasFinishedDragging = filteredChanges.some(c => c.type === 'position' && c.dragging === false);

        const { currentParentId } = get();
        if (currentParentId && (hasStructuralChange || hasFinishedDragging)) {
            if (DEBUG) console.log("[onNodesChange] Scheduling syncParentContent for:", currentParentId);
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    setNodes: (nodesOrUpdater) => {
        const nextNodes = typeof nodesOrUpdater === 'function'
            ? nodesOrUpdater(get().nodes)
            : nodesOrUpdater;

        set({ nodes: nextNodes });
        get().setCloudDirty?.(true);
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
        // Mark dirty on edge removal/addition
        const hasMeaningfulEdgeChange = changes.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'replace');
        if (hasMeaningfulEdgeChange) {
            get().setCloudDirty?.(true);
        }
    },

    onConnect: (connection) => {
        // Prevent self-connections: a node cannot connect to itself
        if (connection.source === connection.target) return;

        const { currentParentId } = get();
        // Capture the active context from navigationSlice so edges only render
        // inside the canvas where they were created (parent-scoped visibility).
        const parentIdForEdge = currentParentId ?? null;

        const newEdge: Edge = {
            ...connection,
            id: uuidv4(),
            type: 'centered',
            data: { parentId: parentIdForEdge },
        } as Edge;

        set({
            edges: addEdge(newEdge, get().edges),
        });
        get().setCloudDirty?.(true);
    },

    onReconnect: (oldEdge, newConnection) => {
        set({
            edges: reconnectEdge(oldEdge, newConnection, get().edges),
        });
        get().setCloudDirty?.(true);
    },

    addNode: (type, position, initialData, style, parentId, customId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        // Beta creation limits (BETA_SCOPE.md). Creation-only — loads are never trimmed.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId,
            newNodeType: type,
            isAuthenticated: get().auth.isAuthenticated,
        });
        if (violation) {
            get().setLimitNotice(violation);
            return;
        }

        const snappedPosition = {
            x: snapToGridValue(position.x),
            y: snapToGridValue(position.y)
        };

        /* A board is not a note that happens to hold cards, so it takes none of
           the note defaults below — `content`, `viewMode` and `icon` are all
           meaningless on it, and leaving them on the payload is what makes a
           node type drift into being half of another one. */
        const isKanban = type === 'kanban';
        const isYouTube = type === 'youtube';

        const defaultStyle = isKanban
            ? { width: KANBAN_DEFAULT_WIDTH, height: KANBAN_DEFAULT_HEIGHT }
            : isYouTube
                ? { width: 360, height: 304 }
                : (type === 'fused-note' ? { width: MIN_FUSED_SIZE } : { width: 432, height: 432 });

        const createdAt = new Date().toISOString();
        const defaultData = isKanban
            ? { ...createKanbanData((initialData?.label as string) || 'Board'), ...initialData }
            : isYouTube
                ? { ...createYouTubeStudyData(), ...initialData }
            : {
                label: (initialData?.label as string) || 'New Note',
                content: '',
                viewMode: 'expanded',
                icon: 'FileText',
                createdAt,
                updatedAt: createdAt,
                ...initialData
            };

        const newNode = {
            id: customId || uuidv4(),
            type,
            position: snappedPosition,
            style: style || defaultStyle,
            data: defaultData as AppNode['data'],
            parentId: targetParentId,
        } as AppNode;

        if (DEBUG) {
            console.log("[addNode] Creating node:", {
                id: newNode.id,
                type: newNode.type,
                parentId: targetParentId,
                isStandalone: isStandalone(newNode.data),
                currentParentId
            });
        }

        set((state) => {
            if (state.nodes.some(n => n.id === newNode.id)) {
                if (DEBUG) console.warn(`[Store] Duplicate node ID detected: ${newNode.id}. Skipping add.`);
                return {};
            }
            const startsSyncedCanvas = Boolean(targetParentId) && (type === 'block' || type === 'fused-note');
            return {
                nodes: [
                    ...state.nodes.map((node) => (
                        startsSyncedCanvas && node.id === targetParentId && node.type === 'note'
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    hasNestedCanvasSync: true,
                                    nestedCanvasSync: 'synced',
                                    nestedCanvasSyncMessage: 'The note and its canvas are synced.',
                                },
                            } as AppNode
                            : node
                    )),
                    newNode,
                ],
            };
        });
        get().setCloudDirty?.(true);

        if (targetParentId) {
            if (DEBUG) console.log("[addNode] Scheduling syncParentContent for:", targetParentId);
            scheduleParentSync(targetParentId, () => get().syncParentContent(targetParentId));
        }
    },

    updateNodeData: (id, data) => {
        const updatedAt = new Date().toISOString();
        set({
            nodes: get().nodes.map((node) => {
                if (node.id !== id) return node;
                const next = { ...node, data: { ...node.data, ...data, updatedAt } } as AppNode;
                return next;
            }),
        });
        get().setCloudDirty?.(true);

        const { currentParentId } = get();
        
        // Sync parent content if we're updating a child node
        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }

        // BIDIRECTIONAL SYNC: once a note has been intentionally mapped, a
        // written edit updates the existing map cards by block identity and
        // gives genuinely new ideas their own card. This is kept outside the
        // active child canvas to avoid responding to our own upward sync.
        if (data.content && Array.isArray(data.content)) {
            const parentContent = data.content as Block[];
            const updatedNode = get().nodes.find(n => n.id === id);

            if (updatedNode && updatedNode.type === 'note' && currentParentId !== id) {
                const reconciliation = computeCanvasContentReconciliation(id, get().nodes);

                if (reconciliation) {
                    const directChildren = get().nodes.filter((node) => node.parentId === id);
                    const remainingChildren = directChildren.filter((node) => !reconciliation.nodeIdsToRemove.includes(node.id));
                    const limitViolation = reconciliation.missingBlocks.length > 0
                        ? checkNodeCreationLimits({
                            nodes: get().nodes,
                            targetParentId: id,
                            isAuthenticated: get().auth.isAuthenticated,
                            addedCount: reconciliation.missingBlocks.length,
                        })
                        : null;

                    const maxY = remainingChildren.reduce((largest, node) => {
                        const height = typeof node.style?.height === 'number' ? node.style.height : 208;
                        return Math.max(largest, node.position.y + height);
                    }, BASE_UNIT);

                    // New writing is never allowed to land on an existing map
                    // card. Place it in a measured review lane below the tree;
                    // tall media/table/code cards cannot overlap a later row.
                    let additionY = snapToGridValue(maxY + BASE_UNIT * 2);
                    const additions: AppNode[] = limitViolation ? [] : reconciliation.missingBlocks.map((block) => {
                        const style = getBlockNodeStyle(block, HYDRATE_SIZE_PROFILE);
                        const node = {
                            id: uuidv4(),
                            type: 'block',
                            position: {
                                x: BASE_UNIT,
                                y: additionY,
                            },
                            style,
                            data: {
                                content: [block],
                                isStandaloneBlock: true,
                            },
                            parentId: id,
                        } as AppNode;
                        additionY = snapToGridValue(additionY + style.height + BASE_UNIT);
                        return node;
                    });

                    // Do not reshuffle a tree a person has arranged. A new
                    // written idea stays as a clear, unclassified peer until
                    // the person decides which section it belongs beneath.
                    const additionEdges: Edge[] = [];
                    const hasNewMapIdeaToReview = additions.length > 0;

                    const updatesById = new Map(reconciliation.nodesToUpdate.map((update) => [update.id, update.data]));
                    const removals = new Set(reconciliation.nodeIdsToRemove);
                    const hasDerivedChange = reconciliation.shouldUpdate || additions.length > 0 || !updatedNode.data.hasNestedCanvasSync;
                    const syncNeedsReview = Boolean(limitViolation) || hasNewMapIdeaToReview;
                    const syncMessage = limitViolation
                        ? `Your note changed, but ${reconciliation.missingBlocks.length} idea${reconciliation.missingBlocks.length === 1 ? '' : 's'} could not be added to this canvas because it is full.`
                        : hasNewMapIdeaToReview
                            ? `Your note and map are synced. ${additions.length} new idea${additions.length === 1 ? ' is' : 's are'} ready to organize on the map.`
                        : 'The note and its canvas are synced.';

                    if (hasDerivedChange) {
                        // This is the other half of the writer's same edit, not
                        // a second undo step. Undo returns both views together.
                        withoutHistory(() => {
                            set((state) => ({
                                nodes: [
                                    ...state.nodes
                                        .filter((node) => !removals.has(node.id))
                                        .map((node) => {
                                            if (node.id === id) {
                                                return {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        hasNestedCanvasSync: true,
                                                        nestedCanvasSync: syncNeedsReview ? 'needs-review' : 'synced',
                                                        nestedCanvasSyncMessage: syncMessage,
                                                    },
                                                } as AppNode;
                                            }
                                            const update = updatesById.get(node.id);
                                            return update ? { ...node, data: update } as AppNode : node;
                                        }),
                                    ...additions,
                                ],
                                edges: [
                                    ...state.edges.filter((edge) => !removals.has(edge.source) && !removals.has(edge.target)),
                                    ...additionEdges,
                                ],
                            }));
                        });
                    }
                }
            }

            // Update linked page block labels
            const linkedUpdates: { id: string, label: string }[] = [];
            parentContent.forEach((b) => {
                if (b.type === 'page' && b.metadata?.nodeId) {
                    linkedUpdates.push({ id: b.metadata.nodeId, label: b.content });
                }
            });

            if (linkedUpdates.length > 0) {
                set((state) => {
                    const nodesToUpdate = state.nodes.filter(n => {
                        const update = linkedUpdates.find(u => u.id === n.id);
                        return update && getNodeLabel(n.data) !== update.label;
                    });

                    if (nodesToUpdate.length === 0) return state;

                    return {
                        nodes: state.nodes.map(n => {
                            const update = linkedUpdates.find(u => u.id === n.id);
                            if (update && getNodeLabel(n.data) !== update.label) {
                                return { ...n, data: { ...n.data, label: update.label } };
                            }
                            return n;
                        }) as AppNode[]
                    };
                });
            }
        }
    },

    updateNode: (id, updates) => {
        set((state) => ({
            nodes: state.nodes.map((node) =>
                node.id === id ? { ...node, ...updates } as AppNode : node
            ),
        }));
        get().setCloudDirty?.(true);
    },

    applyRemoteNodeUpdate: (id, updates) => {
        // Remote (collaborator) changes must not enter THIS user's undo stack.
        withoutHistory(() => {
            set((state) => ({
                nodes: state.nodes.map((node) =>
                    node.id === id ? { ...node, ...updates } as AppNode : node
                ),
            }));
        });
        // DO NOT setCloudDirty(true) to avoid infinite sync loops
    },

    applyRemoteEdgeUpdate: (id, updates) => {
        withoutHistory(() => {
            set((state) => ({
                edges: state.edges.map((edge) =>
                    edge.id === id ? { ...edge, ...updates } as Edge : edge
                ),
            }));
        });
        // DO NOT setCloudDirty(true)
    },

    releaseNodeContentToBlocks: (nodeId: string, centerPosition?: { x: number; y: number }, skipConfirm?: boolean) => {

        const { nodes, edges, currentParentId } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;

        const rawContent = 'content' in sourceNode.data ? sourceNode.data.content : undefined;
        const isEmptyBlock = (b: Block | null | undefined) => {
            if (!b) return true;
            if (b.type === 'divider') return true;
            if (b.type === 'table') {
                const rows = b.metadata?.rows;
                if (!Array.isArray(rows) || rows.length === 0) return true;
                return rows.every((row) =>
                    Array.isArray(row) && row.every((cell) => normalizeText(String(cell)).length === 0)
                );
            }
            if (b.type === 'columns') {
                const cols = b.metadata?.columns;
                return !Array.isArray(cols) || cols.length === 0;
            }
            // A board's content is its title, which is usually blank — judge it
            // by its pictures, or every gallery would be released as empty.
            if (b.type === 'gallery') {
                const items = b.metadata?.items;
                return !Array.isArray(items) || items.length === 0;
            }
            return normalizeText(b.content).length === 0;
        };
        const blocks: Block[] = Array.isArray(rawContent)
            ? rawContent.filter((b) => !isEmptyBlock(b))
            : (typeof rawContent === 'string' && rawContent.trim().length > 0)
                ? [{ id: uuidv4(), type: 'text', content: rawContent }]
                : [];

        if (blocks.length === 0) return;

        if (!skipConfirm && !window.confirm(
            'Release this note\'s content into separate blocks? The original note will be removed. This can be undone via undo.'
        )) return;

        const parentId = currentParentId || undefined;
        const parentIdForEdge = currentParentId ?? null;

        const resolvedCenterX = centerPosition?.x ?? sourceNode.position.x;
        const resolvedCenterY = centerPosition?.y ?? sourceNode.position.y;
        const baseCenter = { x: snapToGridValue(resolvedCenterX), y: snapToGridValue(resolvedCenterY) };

        // --- Split into sections by heading boundaries ---
        const headingTypes = new Set(['heading1', 'heading2', 'heading3']);
        const isHeadingBlock = (b: Block | null | undefined) => !!b && headingTypes.has(b.type);
        interface Section { heading: Block | null; blocks: Block[] }
        const sections: Section[] = [];

        const headingIndices = blocks
            .map((b, i) => (isHeadingBlock(b) ? i : -1))
            .filter((i) => i >= 0);

        if (headingIndices.length === 0) {
            sections.push({ heading: null, blocks });
        } else {
            // Capture content before the first heading
            if (headingIndices[0] > 0) {
                sections.push({ heading: null, blocks: blocks.slice(0, headingIndices[0]) });
            }
            for (let i = 0; i < headingIndices.length; i++) {
                const startIdx = headingIndices[i];
                const endIdx = i + 1 < headingIndices.length ? headingIndices[i + 1] : blocks.length;
                sections.push({
                    heading: blocks[startIdx],
                    blocks: blocks.slice(startIdx + 1, endIdx)
                });
            }
        }

        // --- Smart node sizing & cluster builders (shared: blockNodeStyle.ts) ---
        const getNodeStyle = (block: Block, isHeading: boolean) =>
            getBlockNodeStyle(block, RELEASE_SIZE_PROFILE, isHeading);
        const createBlockNode = (block: Block, position: { x: number; y: number }, style: { width: number; height: number }) =>
            createStandaloneBlockNode(block, position, style, parentId);
        const buildRadialCluster = (centerNode: AppNode, outerBlocks: Block[], centerPos: { x: number; y: number }) =>
            buildRadialClusterFromCenter(centerNode, outerBlocks, centerPos, { parentId, parentIdForEdge });

        const newNodes: AppNode[] = [];
        const newEdges: Edge[] = [];

        if (sections.length === 1) {
            const section = sections[0];
            if (section.heading) {
                const headingStyle = getNodeStyle(section.heading, true);
                const centerNode = createBlockNode(section.heading, baseCenter, headingStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks, baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            } else if (section.blocks.length > 0) {
                const centerBlock = section.blocks[0];
                const centerStyle = getNodeStyle(centerBlock, false);
                const centerNode = createBlockNode(centerBlock, baseCenter, centerStyle);
                const cluster = buildRadialCluster(centerNode, section.blocks.slice(1), baseCenter);
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);
            }
        } else {
            // Multiple sections are packed from their measured footprints. The
            // old radius estimate was based on one card width, which let long
            // sections collide with the next cluster.
            const clusters: ReturnType<typeof buildRadialCluster>[] = [];

            for (const section of sections) {
                let centerNode: AppNode;
                if (section.heading) {
                    const headingStyle = getNodeStyle(section.heading, true);
                    centerNode = createBlockNode(section.heading, { x: 0, y: 0 }, headingStyle);
                } else if (section.blocks.length > 0) {
                    const centerStyle = getNodeStyle(section.blocks[0], false);
                    centerNode = createBlockNode(section.blocks[0], { x: 0, y: 0 }, centerStyle);
                    section.blocks = section.blocks.slice(1);
                } else {
                    continue;
                }
                const cluster = buildRadialCluster(centerNode, section.blocks, { x: 0, y: 0 });
                clusters.push(cluster);
            }

            const maxRowWidth = BASE_UNIT * 32;
            let offsetX = baseCenter.x;
            let offsetY = baseCenter.y;
            let rowHeight = 0;
            for (let ci = 0; ci < clusters.length; ci++) {
                const cluster = clusters[ci];
                const clusterWidth = cluster.bounds.maxX - cluster.bounds.minX;
                const clusterHeight = cluster.bounds.maxY - cluster.bounds.minY;
                if (offsetX > baseCenter.x && offsetX + clusterWidth > baseCenter.x + maxRowWidth) {
                    offsetX = baseCenter.x;
                    offsetY += rowHeight + BASE_UNIT * 3;
                    rowHeight = 0;
                }
                for (const node of cluster.nodes) {
                    node.position.x += offsetX - cluster.bounds.minX;
                    node.position.y += offsetY - cluster.bounds.minY;
                }
                newNodes.push(...cluster.nodes);
                newEdges.push(...cluster.edges);

                // Separate heading sections are peers in the original note,
                // not a causal chain. Linking their centres would draw a line
                // through the earlier section's outward cards, so each section
                // keeps only the direct edges to its own released content.

                offsetX += clusterWidth + BASE_UNIT * 3;
                rowHeight = Math.max(rowHeight, clusterHeight);
            }
        }

        const newEdgesBase = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
        const newNodesBase = nodes.filter(n => n.id !== nodeId);

        set({
            nodes: [...newNodesBase, ...newNodes],
            edges: [...newEdgesBase, ...newEdges]
        });
        get().setCloudDirty?.(true);

        if (currentParentId) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    splitNode: (nodeId, splitBlockId, currentBlocks, skipConfirm) => {
        const { nodes, edges } = get();
        const sourceNode = nodes.find(n => n.id === nodeId);
        const sourceBlocks = sourceNode ? getNodeBlocks(sourceNode.data) : undefined;

        if (!sourceNode || !sourceBlocks) return;

        if (!skipConfirm && !window.confirm(
            'Split this node at the selected block? Content will be moved to a new fused note.'
        )) return;

        // Use caller-provided blocks if available (avoids stale store state from debounce),
        // otherwise fall back to store data
        const blocks = (currentBlocks && currentBlocks.length > 0)
            ? currentBlocks as Block[]
            : sourceBlocks;
        const splitIndex = blocks.findIndex(b => b.id === splitBlockId);

        if (splitIndex === -1 || splitIndex === 0) return;

        const blocksToStay = blocks.slice(0, splitIndex);
        const blocksToMove = blocks.slice(splitIndex);

        if (blocksToMove.length === 0) return;

        const currentHeight = sourceNode.style?.height && typeof sourceNode.style.height === 'number'
            ? sourceNode.style.height
            : 400;

        const newPostion = {
            x: sourceNode.position.x,
            y: sourceNode.position.y + Number(currentHeight) + 50
        };

        const newNodeId = uuidv4();

        const newNode: AppNode = {
            id: newNodeId,
            type: 'fused-note',
            position: newPostion,
            data: {
                content: blocksToMove,
                isStandaloneBlock: true
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: sourceNode.parentId
        };

        const newEdge: Edge = {
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            type: 'centered',
            data: { parentId: sourceNode.parentId ?? null }
        };

        set({
            nodes: [
                ...nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, content: blocksToStay } } : n) as AppNode[],
                newNode
            ],
            edges: [...edges, newEdge]
        });
        get().setCloudDirty?.(true);

        // Sync parent content if we are splitInside a child canvas
        if (sourceNode.parentId) {
            const pid = sourceNode.parentId;
            scheduleParentSync(pid, () => get().syncParentContent(pid));
        }
    },

    extractPageFromBlock: (block, position, sourceNodeId) => {
        const { nodes, currentParentId } = get();
        const linkedNodeId = (block.metadata as { nodeId?: string } | undefined)?.nodeId;

        let nodesToUpdate = nodes;
        if (sourceNodeId) {
            nodesToUpdate = nodesToUpdate.map(n => {
                const nBlocks = getNodeBlocks(n.data);
                if (n.id === sourceNodeId && nBlocks) {
                    const newContent = nBlocks.filter((b) => b.id !== block.id);
                    return { ...n, data: { ...n.data, content: newContent } };
                }
                return n;
            }) as AppNode[];
        }

        const iconStyle = { width: ICON_SIZE, height: ICON_SIZE };
        const iconViewMode = 'icon';
        const centeredPos = { 
            x: snapToGridValue(position.x - ICON_SIZE / 2), 
            y: snapToGridValue(position.y - ICON_SIZE / 2) 
        };

        const existingNode = linkedNodeId ? nodesToUpdate.find(n => n.id === linkedNodeId) : null;

        if (existingNode) {
            set({
                nodes: nodesToUpdate.map(n => {
                    if (n.id === linkedNodeId) {
                        return {
                            ...n,
                            parentId: currentParentId || undefined,
                            position: centeredPos,
                            extent: undefined,
                            zIndex: 10,
                            style: { ...n.style, ...iconStyle },
                            data: { ...n.data, viewMode: iconViewMode }
                        };
                    }
                    return n;
                }) as AppNode[]
            });
            get().setCloudDirty?.(true);
        } else {
            const newNode: AppNode = {
                id: uuidv4(),
                type: 'note',
                position: centeredPos,
                style: iconStyle,
                data: {
                    label: (block.content as string) || 'Untitled Page',
                    content: [],
                    viewMode: iconViewMode,
                    icon: 'FileText',
                    date: new Date().toISOString()
                } as AppNode['data'],
                parentId: currentParentId || undefined,
            } as AppNode;

            set({
                nodes: [...nodesToUpdate, newNode]
            });
            get().setCloudDirty?.(true);
        }
    },

    createPageFromText: (text, position) => {
        const { nodes, currentParentId } = get();
        const newId = uuidv4();
        const pos = position ? {
            x: snapToGridValue(position.x),
            y: snapToGridValue(position.y)
        } : { x: 112, y: 112 };

        const newNode: AppNode = {
            id: newId,
            type: 'note',
            position: pos,
            style: { width: ICON_SIZE, height: ICON_SIZE },
            data: {
                label: text || 'Untitled Page',
                content: [],
                viewMode: 'icon',
                icon: 'FileText',
                date: new Date().toISOString()
            },
            parentId: currentParentId || undefined,
        };

        set({
            nodes: [...nodes, newNode]
        });
        get().setCloudDirty?.(true);

        return newId;
    },

    savePageContent: (parentId, content, transientNodeIds) => {
        set((state) => ({
            nodes: state.nodes
                .map((node) => node.id === parentId ? { ...node, data: { ...node.data, content } } : node)
                .filter((node) => !transientNodeIds.includes(node.id))
        }) as Partial<AppState>);
        get().setCloudDirty?.(true);
    },

    syncParentContent: (parentId: string) => {
        const { nodes } = get();
        if (DEBUG) {
            console.log("[syncParentContent] Before sync - nodes with parentId", parentId, ":",
                nodes.filter(n => n.parentId === parentId).map(n => ({
                    id: n.id,
                    type: n.type,
                    isStandalone: isStandalone(n.data)
                }))
            );
        }

        const result = computeParentContentUpdate(parentId, nodes);

        const parent = nodes.find((node) => node.id === parentId);
        const hasContentCanvasChild = nodes.some((node) => (
            node.parentId === parentId && (node.type === 'block' || node.type === 'fused-note')
        ));
        const shouldMarkSynced = Boolean(
            parent?.type === 'note'
            && hasContentCanvasChild
            && parent.data.nestedCanvasSync !== 'needs-review'
            && (parent.data.nestedCanvasSync !== 'synced' || !parent.data.hasNestedCanvasSync),
        );

        if (result && (result.shouldUpdate || shouldMarkSynced)) {
            if (DEBUG) {
                console.log("[syncParentContent] Updating nodes:", {
                    parentId,
                    nodesToUpdate: result.nodesToUpdate.map(u => u.id)
                });
            }

            // Derived reconciliation that rides along with the user action that
            // triggered it — not a standalone undo step.
            withoutHistory(() => {
                set((state) => ({
                    nodes: state.nodes.map(n => {
                        if (n.id === parentId) {
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    ...(result.shouldUpdate ? { content: result.parentContent } : {}),
                                    ...(shouldMarkSynced
                                        ? {
                                            hasNestedCanvasSync: true,
                                            nestedCanvasSync: 'synced',
                                            nestedCanvasSyncMessage: 'The note and its canvas are synced.',
                                        }
                                        : {}),
                                },
                            } as AppNode;
                        }
                        const update = result.nodesToUpdate.find(u => u.id === n.id);
                        if (update) {
                            return { ...n, data: update.data } as AppNode;
                        }
                        return n;
                    })
                }));
            });

            if (DEBUG) {
                console.log("[syncParentContent] After sync - nodes with parentId", parentId, ":",
                    get().nodes.filter(n => n.parentId === parentId).map(n => ({
                        id: n.id,
                        type: n.type,
                        isStandalone: isStandalone(n.data)
                    }))
                );
            }
        } else {
            if (DEBUG) console.log("[syncParentContent] No update needed for:", parentId);
        }
    },

    requestNodeDeletion: (nodeIds: string[]) => {
        const { nodes } = get();
        const requested = new Set(nodeIds);
        const byId = new Map(nodes.map((node) => [node.id, node]));

        // A selected descendant is already covered by a selected ancestor.
        // Walk the full path rather than only checking the immediate parent so
        // a mixed selection cannot inflate the branch impact in the dialog.
        const roots = nodes.filter((node) => {
            if (!requested.has(node.id)) return false;
            let parentId = node.parentId;
            while (parentId) {
                if (requested.has(parentId)) return false;
                parentId = byId.get(parentId)?.parentId;
            }
            return true;
        });
        if (roots.length === 0) return;

        const branch = collectNodeBranch(nodes, roots.map((node) => node.id));
        set({
            pendingNodeDeletion: {
                nodeIds: roots.map((node) => node.id),
                selectedCount: roots.length,
                nestedCount: Math.max(0, branch.length - roots.length),
                totalCount: branch.length,
            },
        });
    },

    cancelNodeDeletion: () => set({ pendingNodeDeletion: null }),

    confirmNodeDeletion: () => {
        const pending = get().pendingNodeDeletion;
        if (!pending) return;
        get().bulkDeleteNodes(pending.nodeIds, true);
        set({ pendingNodeDeletion: null });
    },

    undoLastNodeDeletion: () => {
        const deletion = get().lastNodeDeletion;
        if (!deletion) return;

        // Never roll back work made after the delete. The toast turns into a
        // normal history action as soon as anything else changes.
        if (get().nodes !== deletion.afterNodes || get().edges !== deletion.afterEdges) {
            set({ lastNodeDeletion: null });
            return;
        }

        set({
            nodes: deletion.beforeNodes,
            edges: deletion.beforeEdges,
            lastNodeDeletion: null,
        });
        get().setCloudDirty?.(true);
    },

    dismissLastNodeDeletion: () => set({ lastNodeDeletion: null }),

    bulkDeleteNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        if (nodeIds.length === 0) return;
        const { nodes, edges, currentParentId } = get();
        const selectedIds = new Set(nodeIds);
        const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
        if (selectedNodes.length === 0) return;

        const deletedNodes = collectNodeBranch(nodes, selectedNodes.map((node) => node.id));
        const deletedIds = new Set(deletedNodes.map((node) => node.id));
        const nestedCount = deletedNodes.length - selectedNodes.length;

        if (!skipConfirm && !window.confirm(
            `Delete ${selectedNodes.length} node${selectedNodes.length === 1 ? '' : 's'}?${nestedCount > 0 ? ` This also deletes ${nestedCount} nested card${nestedCount === 1 ? '' : 's'}.` : ''} This can be undone via undo (up to 200 steps).`
        )) return;

        if (DEBUG) {
            console.log("[bulkDeleteNodes] Input nodeIds:", nodeIds);
            console.log("[bulkDeleteNodes] Total nodes before:", nodes.length);
        }

        // Delete an entire nested branch, including every edge that touches it.
        const newNodes = nodes.filter((node) => !deletedIds.has(node.id));
        const newEdges = edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target));
        const survivingParentIds = new Set(
            deletedNodes
                .map((node) => node.parentId)
                .filter((parentId): parentId is string => !!parentId && !deletedIds.has(parentId)),
        );
        const deletedCurrentCanvas = !!currentParentId && deletedIds.has(currentParentId);
        const remainingSelectionIds = new Set(
            Array.from(get().selectedCanvasNodeIds).filter((id) => !deletedIds.has(id)),
        );

        if (DEBUG) {
            console.log("[bulkDeleteNodes] Total nodes after:", newNodes.length);
            console.log("[bulkDeleteNodes] Deleted count:", nodes.length - newNodes.length);
        }

        set({
            nodes: newNodes,
            edges: newEdges,
            selectedCanvasNodeIds: remainingSelectionIds,
            ...(deletedCurrentCanvas
                ? { currentParentId: null, lastExitedNodeId: null, breadcrumbs: [{ id: null, label: 'Home' }] }
                : {}),
        });
        if (deletedCurrentCanvas && typeof window !== 'undefined') {
            localStorage.removeItem('chnk-it-current-parent-id');
        }
        // Parent page blocks are a derived view of their immediate children.
        // Reconcile every surviving parent that lost a child so reopening it
        // cannot resurrect a deleted card from stale page-block content.
        survivingParentIds.forEach((parentId) => get().syncParentContent(parentId));
        const restoredCurrentNodes = get().nodes;
        const restoredCurrentEdges = get().edges;
        set({
            lastNodeDeletion: {
                beforeNodes: nodes,
                beforeEdges: edges,
                afterNodes: restoredCurrentNodes,
                afterEdges: restoredCurrentEdges,
                message: `Deleted ${deletedNodes.length} card${deletedNodes.length === 1 ? '' : 's'}${nestedCount > 0 ? `, including ${nestedCount} nested` : ''}.`,
            },
        });
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[bulkDeleteNodes] Completed");
    },

    bulkDuplicateNodes: (nodeIds: string[]) => {
        const { nodes } = get();
        const requestedIds = new Set(nodeIds);
        const requestedNodes = nodes.filter((node) => requestedIds.has(node.id));
        // A parent already brings its descendants with it. If both are
        // selected, clone the branch once rather than producing a second,
        // unrelated copy of the selected child.
        const roots = requestedNodes.filter((node) => !node.parentId || !requestedIds.has(node.parentId));
        const nodesToDuplicate = collectNodeBranch(nodes, roots.map((node) => node.id));

        if (DEBUG) {
            console.log("[bulkDuplicateNodes] Input nodeIds:", nodeIds);
            console.log("[bulkDuplicateNodes] Found nodes to duplicate:", nodesToDuplicate.length);
        }

        if (nodesToDuplicate.length === 0) {
            if (DEBUG) console.log("[bulkDuplicateNodes] No nodes found to duplicate!");
            return;
        }

        const OFFSET = BASE_UNIT; // Offset by one grid cell (56px) for duplicated nodes to keep them aligned
        const newNodes: AppNode[] = [];
        const newIds = new Set<string>();
        const rootIds = new Set(roots.map((node) => node.id));
        /** old node id -> new node id, so the copied edges can be rewired. */
        const idMap = new Map<string, string>();

        // Allocate every id before cloning content: a parent can contain a
        // page block that points at a descendant which appears later in the
        // document order.
        nodesToDuplicate.forEach(node => {
            const newId = uuidv4();
            idMap.set(node.id, newId);
            if (rootIds.has(node.id)) newIds.add(newId);
        });

        nodesToDuplicate.forEach(node => {
            if (DEBUG) console.log("[bulkDuplicateNodes] Duplicating node:", node.id, "type:", node.type);
            const newId = idMap.get(node.id)!;
            const blocks = getNodeBlocks(node.data);
            const newNode = {
                ...node,
                id: newId,
                selected: rootIds.has(node.id),
                ...(node.parentId ? { parentId: idMap.get(node.parentId) ?? node.parentId } : {}),
                position: {
                    x: node.position.x + OFFSET,
                    y: node.position.y + OFFSET
                },
                data: {
                    ...node.data,
                    // Deep clone content so nested blocks (gallery items, toggle
                    // children, per-column blocks) get fresh ids too — sharing
                    // them meant editing the copy edited the original.
                    content: blocks
                        ? remapBlockNodeReferences(cloneBlocks(blocks), idMap)
                        : ('content' in node.data ? node.data.content : undefined)
                }
            } as AppNode;
            newNodes.push(newNode);
        });

        if (DEBUG) console.log("[bulkDuplicateNodes] Created", newNodes.length, "new nodes");

        /* Carry over the connections BETWEEN the duplicated nodes. Duplicating
           two joined cards used to hand back two unconnected ones, quietly
           losing the relationship that was the point of copying them together. */
        const clonedEdges = get().edges
            .filter(e => idMap.has(e.source) && idMap.has(e.target))
            .map(e => ({
                ...e,
                id: uuidv4(),
                source: idMap.get(e.source)!,
                target: idMap.get(e.target)!,
                data: {
                    ...(e.data || {}),
                    parentId: typeof (e.data as { parentId?: unknown } | undefined)?.parentId === 'string'
                        ? (idMap.get((e.data as { parentId: string }).parentId) ?? (e.data as { parentId: string }).parentId)
                        : ((e.data as { parentId?: string | null } | undefined)?.parentId ?? null),
                },
                selected: false,
            }));

        set((state) => ({
            nodes: [
                ...state.nodes.map(n => ({ ...n, selected: false })),
                ...newNodes
            ],
            edges: [...state.edges, ...clonedEdges],
            selectedCanvasNodeIds: newIds
        }));
        // A copied root is a new direct child of its existing parent. Keep that
        // parent's page-block projection in sync so it survives a later
        // hydration instead of looking like an unowned canvas.
        new Set(
            roots
                .map((node) => node.parentId)
                .filter((parentId): parentId is string => !!parentId),
        ).forEach((parentId) => get().syncParentContent(parentId));
        get().setCloudDirty?.(true);
    },

    /**
     * Recreate cards copied to the clipboard, with their connections.
     *
     * The payload stores positions relative to the copied selection and refers
     * to nodes by index, so a paste can land anywhere — including a different
     * canvas level — without knowing anything about the ids it came from.
     * Everything is re-parented to whichever canvas is open now, which is what
     * makes copying between a board and a card's inner canvas work at all.
     */
    pasteClipboardNodes: (payload: NodesPayload, origin: { x: number; y: number }) => {
        if (!payload?.nodes?.length) return [];

        const { currentParentId } = get();
        const parentId = currentParentId ?? undefined;
        const idByRef = new Map<number, string>();

        const newNodes = payload.nodes.map((entry, index) => {
            const newId = uuidv4();
            idByRef.set(typeof entry.ref === 'number' ? entry.ref : index, newId);

            const data = { ...(entry.data || {}) } as Record<string, unknown>;
            const blocks = getNodeBlocks(data as never);
            if (blocks) data.content = cloneBlocks(blocks);

            return {
                id: newId,
                type: entry.type,
                position: { x: origin.x + (entry.dx || 0), y: origin.y + (entry.dy || 0) },
                data,
                selected: true,
                ...(parentId ? { parentId } : {}),
                ...(entry.width || entry.height
                    ? { style: { width: entry.width, height: entry.height } }
                    : {}),
            } as AppNode;
        });

        const newEdges = (payload.edges || [])
            .filter(e => idByRef.has(e.source) && idByRef.has(e.target))
            .map(e => ({
                id: uuidv4(),
                source: idByRef.get(e.source)!,
                target: idByRef.get(e.target)!,
                sourceHandle: e.sourceHandle ?? null,
                targetHandle: e.targetHandle ?? null,
                type: e.type || 'centered',
                // Edges are scoped to the canvas they live on, so a pasted edge
                // belongs to the canvas being pasted INTO, not the one it left.
                data: { ...(e.data || {}), parentId: currentParentId ?? null },
            })) as Edge[];

        const newIds = new Set(newNodes.map(n => n.id));
        set((state) => ({
            nodes: [...state.nodes.map(n => ({ ...n, selected: false })), ...newNodes],
            edges: [...state.edges, ...newEdges],
            selectedCanvasNodeIds: newIds,
        }));
        get().setCloudDirty?.(true);
        return Array.from(newIds);

        if (DEBUG) console.log("[bulkDuplicateNodes] Completed");
    },

    bulkApplyColor: (nodeIds: string[], color: string) => {
        if (DEBUG) {
            console.log("[bulkApplyColor] Input nodeIds:", nodeIds);
            console.log("[bulkApplyColor] Color:", color);
        }

        set((state) => ({
            nodes: state.nodes.map(n => {
                if (nodeIds.includes(n.id)) {
                    if (DEBUG) console.log("[bulkApplyColor] Applying color to node:", n.id);
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            color: color === 'transparent' ? undefined : color
                        }
                    } as AppNode;
                }
                return n;
            })
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[bulkApplyColor] Completed");
    },

    fuseNodes: (nodeIds: string[], skipConfirm?: boolean) => {
        if (!skipConfirm && !window.confirm(
            `Merge ${nodeIds.length} nodes into one fused note? The originals will be removed. This can be undone via undo (up to 200 steps).`
        )) return;

        const { nodes, edges, currentParentId } = get();
        const nodesToFuse = nodes.filter(n => nodeIds.includes(n.id));

        if (DEBUG) {
            console.log("[fuseNodes] Input nodeIds:", nodeIds);
            console.log("[fuseNodes] Found nodes to fuse:", nodesToFuse.length);
            console.log("[fuseNodes] All node IDs before:", nodes.map(n => n.id));
        }

        if (nodesToFuse.length < 2) {
            if (DEBUG) console.log("[fuseNodes] Need at least 2 nodes to fuse, got:", nodesToFuse.length);
            return;
        }

        // Calculate average position for the fused node
        const avgX = nodesToFuse.reduce((sum, n) => sum + n.position.x, 0) / nodesToFuse.length;
        const avgY = nodesToFuse.reduce((sum, n) => sum + n.position.y, 0) / nodesToFuse.length;

        if (DEBUG) console.log("[fuseNodes] Average position:", { x: avgX, y: avgY });

        // Collect all content from all nodes
        const allContent: Block[] = [];
        nodesToFuse.forEach(node => {
            if (DEBUG) console.log("[fuseNodes] Processing node:", node.id, "type:", node.type);
            const nodeBlocks = getNodeBlocks(node.data);
            if (node.type === 'note') {
                // Convert note to a page block
                const pageBlock: Block = {
                    id: uuidv4(),
                    type: 'page',
                    content: getNodeLabel(node.data) || 'Untitled',
                    metadata: { nodeId: node.id }
                };
                allContent.push(pageBlock);
            } else if (nodeBlocks) {
                allContent.push(...nodeBlocks);
            }
        });

        if (DEBUG) console.log("[fuseNodes] Total content blocks:", allContent.length);

        // Generate NEW unique ID
        const fusedNodeId = uuidv4();
        if (DEBUG) console.log("[fuseNodes] Generated new fused node ID:", fusedNodeId);

        // Create fused node
        const fusedNode: AppNode = {
            id: fusedNodeId,
            type: 'fused-note',
            position: { x: avgX, y: avgY },
            data: {
                content: allContent,
                isStandaloneBlock: true
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: 208
            },
            parentId: currentParentId || undefined
        };

        // Remove original nodes and add fused node
        const newNodes = nodes.filter(n => !nodeIds.includes(n.id));
        if (DEBUG) console.log("[fuseNodes] Nodes after filtering:", newNodes.length, "removed:", nodes.length - newNodes.length);

        newNodes.push(fusedNode);
        if (DEBUG) console.log("[fuseNodes] Nodes after adding fused:", newNodes.length);

        // Deduplicate — ensure no duplicate IDs enter the store
        const seenIds = new Set<string>();
        const dedupedNodes: AppNode[] = [];
        for (const n of newNodes) {
            if (seenIds.has(n.id)) {
                // Generate a fresh ID for the duplicate to prevent store corruption
                dedupedNodes.push({ ...n, id: uuidv4() });
                if (DEBUG) console.warn("[fuseNodes] Fixed duplicate ID:", n.id);
            } else {
                seenIds.add(n.id);
                dedupedNodes.push(n);
            }
        }

        // Remove edges connected to deleted nodes
        const newEdges = edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));

        set({ nodes: dedupedNodes, edges: newEdges });
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[fuseNodes] Completed - Final node count:", dedupedNodes.length);
    },

    linkSelectedNodes: (mainNodeId, targetNodeIds) => {
        console.log("[linkSelectedNodes] Called with mainNodeId:", mainNodeId, "targetNodeIds:", targetNodeIds);
        const { edges, currentParentId } = get();
        const parentIdForEdge = currentParentId ?? null;
        
        const newEdges: Edge[] = [];
        targetNodeIds.forEach(targetId => {
            if (targetId === mainNodeId) return;
            
            // Check if an edge already exists from mainNodeId to targetId
            const edgeExists = edges.some(e => 
                (e.source === mainNodeId && e.target === targetId) ||
                (e.source === targetId && e.target === mainNodeId)
            );
            
            if (!edgeExists) {
                newEdges.push({
                    id: uuidv4(),
                    source: mainNodeId,
                    target: targetId,
                    type: 'centered',
                    data: { parentId: parentIdForEdge },
                } as Edge);
            }
        });
        
        if (newEdges.length > 0) {
            console.log("[linkSelectedNodes] Created new edges:", newEdges);
            set({
                edges: [...edges, ...newEdges]
            });
            get().setCloudDirty?.(true);
        } else {
            console.log("[linkSelectedNodes] No new edges created (already existed or empty targets).");
        }
    },

    hydrateCanvasFromContent: (nodeId: string) => {
        const { nodes } = get();
        
        // Build index for O(1) lookups
        const byId = new Map<string, AppNode>();
        const childrenByParent = new Map<string | undefined, AppNode[]>();
        for (const node of nodes) {
            byId.set(node.id, node);
            const parentKey = node.parentId;
            if (!childrenByParent.has(parentKey)) {
                childrenByParent.set(parentKey, []);
            }
            childrenByParent.get(parentKey)!.push(node);
        }
        
        const parentNode = byId.get(nodeId);

        const parentContent = parentNode ? getNodeBlocks(parentNode.data) : undefined;
        if (!parentNode || !parentContent || parentContent.length === 0) {
            return;
        }

        // Get existing children using index
        const children = childrenByParent.get(nodeId) || [];

        // Collect all block IDs currently represented on the canvas
        const representedBlockIds = new Set<string>();
        const pageBlockByNodeId = new Map<string, Block>();
        parentContent.forEach((block) => {
            if (block.type === 'page' && typeof block.metadata?.nodeId === 'string') {
                pageBlockByNodeId.set(block.metadata.nodeId, block);
            }
        });
        children.forEach(child => {
            getNodeBlocks(child.data)?.forEach((b) => representedBlockIds.add(b.id));
            if (child.type === 'note') {
                const matchingBlock = pageBlockByNodeId.get(child.id);
                if (matchingBlock) {
                    representedBlockIds.add(matchingBlock.id);
                }
            }
        });

        // Identify meaningful, orphan blocks. Editor-only composition scaffolding
        // stays in the parent card and never becomes a canvas card.
        const orphanBlocks = parentContent.filter((block) =>
            !representedBlockIds.has(block.id) && isCanvasHydratableBlock(block)
        );

        if (orphanBlocks.length === 0) {
            if (DEBUG) console.log("[hydrateCanvas] No orphan blocks found.");
            return;
        }

        if (DEBUG) console.log("[hydrateCanvas] Found orphans:", orphanBlocks.length);

        // A first map represents the complete note. Do not silently mark a
        // partial batch as synced: the creation-limit check below either
        // accepts the complete map or explains why it cannot be made.
        const orphanBlocksOrdered = orphanBlocks;

        // --- Relatedness-based semantic grouping ---
        // Group blocks by content relatedness (not just heading/divider markers),
        // producing a semantic hierarchy tree + cross-topic "related" edges.
        // See contentHydration.ts.
        type Chunk = HydrationChunk;

        const plan = planHydration(orphanBlocksOrdered);
        const validChunks: Chunk[] = plan.chunks;

        if (validChunks.length === 0) return;

        // --- Build the first document tree ---------------------------------
        // The note's own sections are the first visible row. No synthetic
        // title card duplicates the note or competes with the hierarchy.
        const getNodeStyle = (block: Block) => getBlockNodeStyle(block, HYDRATE_SIZE_PROFILE);

        const getFusedNoteStyle = (blocks: Block[]) => {
            let estimatedHeight = 40; // Base padding/margin (reduced to exactly fit)
            blocks.forEach(b => {
                if (b.type === 'heading1') estimatedHeight += 50;
                else if (b.type === 'heading2') estimatedHeight += 40;
                else if (b.type === 'heading3') estimatedHeight += 30;
                else if (b.type === 'divider') estimatedHeight += 20;
                else {
                    const len = normalizeText(blockText(b.content)).length;

                    if (len === 0) {
                        estimatedHeight += 24; // Empty line
                    } else {
                        // Assuming ~50 characters per line for MIN_FUSED_SIZE width
                        const lines = Math.ceil(len / 50);
                        estimatedHeight += lines * 24 + 10; // 24px per line + 10px paragraph spacing
                    }
                }
            });
            
            // Snap to grid and do not force 208 height, just a small minimum of 80
            const finalHeight = Math.max(80, Math.ceil(estimatedHeight / BASE_UNIT) * BASE_UNIT);
            return { width: MIN_FUSED_SIZE, height: finalHeight };
        };

        const nonTextStandaloneTypes = new Set(['media', 'image', 'video', 'file', 'gallery', 'code', 'table']);
        const mapChunks: Chunk[] = validChunks.map((chunk) => {
            const isMainChapter = !chunk.sourceId;
            const firstBlock = chunk.blocks[0];
            // A single heading or idea should still read as a chapter, not as a
            // small loose card. Rich standalone material keeps its own card.
            const shouldFuseMainChapter = isMainChapter
                && !!firstBlock
                && !nonTextStandaloneTypes.has(firstBlock.type);
            return shouldFuseMainChapter ? { ...chunk, type: 'fused-note' } : chunk;
        });

        const sizeOf = (chunk: Chunk): { width: number; height: number } =>
            chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);

        const treeLayout = layoutDocumentTree(mapChunks, sizeOf, {
            gridStep: BASE_UNIT,
            maxRootRowWidth: typeof window !== 'undefined' && window.innerWidth < 720
                ? BASE_UNIT * 30
                : BASE_UNIT * 44,
        });

        // --- Creation of chapter and section nodes --------------------------
        const newNodes: AppNode[] = mapChunks.map(chunk => {
            const pos = treeLayout.positions.get(chunk.id) || { x: BASE_UNIT, y: BASE_UNIT };
            const style = chunk.type === 'block' ? getNodeStyle(chunk.blocks[0]) : getFusedNoteStyle(chunk.blocks);
            const isChapter = !chunk.sourceId && chunk.type === 'fused-note';
            
            return {
                id: chunk.id,
                type: chunk.type,
                position: pos,
                style: style,
                data: {
                    content: chunk.blocks,
                    isStandaloneBlock: true,
                    ...(chunk.type === 'fused-note'
                        ? { mapRole: isChapter ? 'chapter' : 'section' }
                        : {}),
                },
                parentId: nodeId
            } as AppNode;
        });

        const chunkIds = new Set(mapChunks.map(c => c.id));
        const newEdges: Edge[] = [];

        // The planner's links describe the document hierarchy. Draw them here
        // so the visual map explains both chapters and their lower sections.
        plan.relatedEdges.forEach(rel => {
            if (chunkIds.has(rel.source) && chunkIds.has(rel.target)) {
                newEdges.push({
                    id: uuidv4(),
                    source: rel.source,
                    target: rel.target,
                    type: 'centered',
                    data: { parentId: nodeId, color: 'var(--accent-ink)', strokeWidth: 1.5 } // Scope edge to this canvas
                } as Edge);
            }
        });

        // Beta creation limits (BETA_SCOPE.md) — the whole batch counts.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId: nodeId,
            isAuthenticated: get().auth.isAuthenticated,
            addedCount: newNodes.length,
        });
        if (violation) {
            get().setLimitNotice(violation);
            return;
        }

        set(state => ({
            nodes: [
                ...state.nodes.map((node) => node.id === nodeId && node.type === 'note'
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            hasNestedCanvasSync: true,
                            nestedCanvasSync: 'synced',
                            nestedCanvasSyncMessage: 'The note and its canvas are synced.',
                        },
                    } as AppNode
                    : node),
                ...newNodes,
            ],
            edges: [...state.edges, ...newEdges]
        }));
        get().setCloudDirty?.(true);

        if (DEBUG) console.log("[hydrateCanvas] Created semantic chunks and edges:", newNodes.length, newEdges.length);
    },

    migrateTopicMapToDocumentTree: (nodeId: string) => {
        const { nodes, edges } = get();
        const topicRoot = nodes.find((node) => (
            node.parentId === nodeId
            && node.type === 'fused-note'
            && node.data.mapRole === 'topic-root'
        ));
        if (!topicRoot) return false;

        /* The predicate is a type guard, not a plain boolean: `filter` does not
           narrow the element type on its own, so without it `node.type` stays
           the full node union and `layoutDocumentTree` — which accepts only
           block and fused-note — rejects the mapped input. */
        const treeNodes = nodes.filter((node): node is Extract<AppNode, { type: 'block' | 'fused-note' }> => (
            node.parentId === nodeId
            && node.id !== topicRoot.id
            && (node.type === 'block' || node.type === 'fused-note')
        ));
        const treeNodeIds = new Set(treeNodes.map((node) => node.id));
        const incomingByTarget = new Map<string, string>();
        edges.forEach((edge) => {
            if (
                edge.source !== topicRoot.id
                && treeNodeIds.has(edge.source)
                && treeNodeIds.has(edge.target)
                && !incomingByTarget.has(edge.target)
            ) {
                incomingByTarget.set(edge.target, edge.source);
            }
        });

        const nodesById = new Map(treeNodes.map((node) => [node.id, node]));
        const layout = layoutDocumentTree(
            treeNodes.map((node) => ({
                id: node.id,
                type: node.type,
                sourceId: incomingByTarget.get(node.id),
            })),
            (input) => {
                const node = nodesById.get(input.id)!;
                return {
                    width: node.measured?.width
                        ?? (typeof node.style?.width === 'number' ? node.style.width : 432),
                    height: node.measured?.height
                        ?? (typeof node.style?.height === 'number' ? node.style.height : 208),
                };
            },
            {
                gridStep: BASE_UNIT,
                maxRootRowWidth: typeof window !== 'undefined' && window.innerWidth < 720
                    ? BASE_UNIT * 30
                    : BASE_UNIT * 44,
            },
        );

        set({
            nodes: nodes
                .filter((node) => node.id !== topicRoot.id)
                .map((node) => {
                    const position = layout.positions.get(node.id);
                    return position ? { ...node, position } : node;
                }),
            edges: edges.filter((edge) => edge.source !== topicRoot.id && edge.target !== topicRoot.id),
        });
        get().setCloudDirty?.(true);
        return true;
    },

    updateEdge: (id, updates) => {
        set((state) => ({
            edges: state.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
        get().setCloudDirty?.(true);
    },

    deleteEdge: (id) => {
        set((state) => ({
            edges: state.edges.filter((e) => e.id !== id),
        }));
        get().setCloudDirty?.(true);
    },

    duplicateEdge: (id) => {
        const edge = get().edges.find((e) => e.id === id);
        if (edge) {
            const newEdge = {
                ...edge,
                id: `edge-${uuidv4()}`,
            };
            set((state) => ({
                edges: [...state.edges, newEdge],
            }));
            get().setCloudDirty?.(true);
        }
    },

    bringEdgeToFront: (id) => {
        const edges = get().edges;
        const edge = edges.find((e) => e.id === id);
        if (edge) {
            set({
                edges: [...edges.filter((e) => e.id !== id), edge],
            });
            get().setCloudDirty?.(true);
        }
    },

    arrangeNodes: (nodeIds, mode) => {
        const { nodes, edges, currentParentId } = get();
        const selected = nodes.filter(n => nodeIds.includes(n.id));
        if (selected.length < 2) return;

        const count = selected.length;

        // Smart mode may also rebuild the connectors between the selected nodes.
        let rebuiltEdges: Edge[] | null = null;

        const getW = (n: typeof selected[0]) => n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : 432);
        const getH = (n: typeof selected[0]) => n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : 432);

        const bbox = selected.reduce((acc, n) => ({
            minX: Math.min(acc.minX, n.position.x),
            maxX: Math.max(acc.maxX, n.position.x + getW(n)),
            minY: Math.min(acc.minY, n.position.y),
            maxY: Math.max(acc.maxY, n.position.y + getH(n)),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

        const getGridW = (n: typeof selected[0]) => Math.ceil(getW(n) / BASE_UNIT) * BASE_UNIT;
        const getGridH = (n: typeof selected[0]) => Math.ceil(getH(n) / BASE_UNIT) * BASE_UNIT;

        const centerX = (bbox.minX + bbox.maxX) / 2;
        const centerY = (bbox.minY + bbox.maxY) / 2;
        const gap = BASE_UNIT;

        const positions: Record<string, { x: number; y: number }> = {};

        switch (mode) {
            case 'grid': {
                const cols = Math.ceil(Math.sqrt(count));
                const cellW = Math.max(...selected.map(getGridW));
                const cellH = Math.max(...selected.map(getGridH));
                const rows = Math.ceil(count / cols);
                const gridW = cols * cellW + (cols - 1) * gap;
                const gridH = rows * cellH + (rows - 1) * gap;
                const ox = snapToGridValue(centerX - gridW / 2);
                const oy = snapToGridValue(centerY - gridH / 2);

                selected.forEach((node, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    positions[node.id] = {
                        x: snapToGridValue(ox + col * (cellW + gap)),
                        y: snapToGridValue(oy + row * (cellH + gap)),
                    };
                });
                break;
            }

            case 'circle': {
                const diagonals = selected.map(n => Math.sqrt(getGridW(n) ** 2 + getGridH(n) ** 2));
                const maxDiag = Math.max(...diagonals);
                const angleStep = (2 * Math.PI) / count;
                const minRadius = count <= 2
                    ? (maxDiag + gap)
                    : (maxDiag + gap) / (2 * Math.sin(angleStep / 2));
                const radius = snapToGridValue(Math.max(BASE_UNIT * 2, minRadius));

                selected.forEach((node, i) => {
                    const angle = -Math.PI / 2 + angleStep * i;
                    positions[node.id] = {
                        x: snapToGridValue(centerX + radius * Math.cos(angle) - getW(node) / 2),
                        y: snapToGridValue(centerY + radius * Math.sin(angle) - getH(node) / 2),
                    };
                });
                break;
            }

            case 'flow': {
                const sorted = [...selected].sort((a, b) => (a.position.x + getW(a) / 2) - (b.position.x + getW(b) / 2));
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'horizontal-row': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const totalW = sorted.reduce((s, n) => s + getGridW(n), 0) + (count - 1) * gap;
                let cx = snapToGridValue(centerX - totalW / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(cx),
                        y: snapToGridValue(centerY - getH(node) / 2),
                    };
                    cx += getGridW(node) + gap;
                });
                break;
            }

            case 'vertical-column': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const totalH = sorted.reduce((s, n) => s + getGridH(n), 0) + (count - 1) * gap;
                let cy = snapToGridValue(centerY - totalH / 2);
                sorted.forEach(node => {
                    positions[node.id] = {
                        x: snapToGridValue(centerX - getW(node) / 2),
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(node) + gap;
                });
                break;
            }

            case 'mindmap-horizontal': {
                const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildW = children.length > 0 ? Math.max(...children.map(getGridW)) : 0;
                const totalChildrenH = children.reduce((s, n) => s + getGridH(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cx = snapToGridValue(centerX - (getGridW(root) + gap + maxChildW) / 2);
                positions[root.id] = {
                    x: cx,
                    y: snapToGridValue(centerY - getH(root) / 2),
                };

                const cxChildren = cx + getGridW(root) + gap;
                let cy = snapToGridValue(centerY - totalChildrenH / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: cxChildren,
                        y: snapToGridValue(cy),
                    };
                    cy += getGridH(child) + gap;
                });
                break;
            }

            case 'mindmap-vertical': {
                const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
                const root = sorted[0];
                const children = sorted.slice(1);
                const maxChildH = children.length > 0 ? Math.max(...children.map(getGridH)) : 0;
                const totalChildrenW = children.reduce((s, n) => s + getGridW(n), 0) + Math.max(0, children.length - 1) * gap;
                
                const cy = snapToGridValue(centerY - (getGridH(root) + gap + maxChildH) / 2);
                positions[root.id] = {
                    x: snapToGridValue(centerX - getW(root) / 2),
                    y: cy,
                };

                const cyChildren = cy + getGridH(root) + gap;
                let cx = snapToGridValue(centerX - totalChildrenW / 2);
                children.forEach(child => {
                    positions[child.id] = {
                        x: snapToGridValue(cx),
                        y: cyChildren,
                    };
                    cx += getGridW(child) + gap;
                });
                break;
            }

            case 'related-clusters': {
                // Group selected nodes by content relatedness and pack each cluster
                // compactly, so related cards sit together and connectors stay short.
                const items = selected.map(n => {
                    const blocks = getNodeBlocks(n.data);
                    return {
                        id: n.id,
                        blocks: blocks && blocks.length > 0
                            ? blocks
                            : [{ type: 'text', content: getNodeLabel(n.data) || '' }],
                    };
                });
                const forest = computeSmartHierarchy(items);
                const layoutInputs = selected.map(n => ({
                    id: n.id,
                    type: (n.type === 'block' ? 'block' : 'fused-note') as 'block' | 'fused-note',
                    sourceId: forest.parent.get(n.id),
                }));
                const sizeMap = new Map(selected.map(n => [n.id, { width: getGridW(n), height: getGridH(n) }]));
                const computed = layoutChunks(
                    layoutInputs,
                    forest.edges,
                    (node) => sizeMap.get(node.id) || { width: 432, height: 200 },
                    {
                        originX: snapToGridValue(bbox.minX),
                        originY: snapToGridValue(bbox.minY),
                        gridStep: BASE_UNIT,
                    }
                );
                computed.forEach((p, id) => { positions[id] = p; });

                // Rebuild connectors: drop existing edges that link two selected
                // nodes, then draw the clean relatedness tree (default style).
                const selectedSet = new Set(nodeIds);
                const edgeParentId = currentParentId ?? null;
                const keptEdges = edges.filter(
                    e => !(selectedSet.has(e.source) && selectedSet.has(e.target))
                );
                const forestEdges = forest.edges.map(e => ({
                    id: uuidv4(),
                    source: e.source,
                    target: e.target,
                    type: 'centered',
                    data: { parentId: edgeParentId },
                }) as Edge);
                rebuiltEdges = [...keptEdges, ...forestEdges];
                break;
            }
        }

        set({
            nodes: nodes.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
            ...(rebuiltEdges ? { edges: rebuiltEdges } : {}),
        });
        get().setCloudDirty?.(true);
    },

    organizeCanvas: () => {
        const { nodes, edges, currentParentId } = get();
        const parentId = currentParentId ?? null;
        const activeNodes = nodes
            .filter((node) => (node.parentId ?? null) === parentId)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (activeNodes.length < 2) return 0;

        const nodeIds = new Set(activeNodes.map((node) => node.id));
        const estimatedBlockSize = (node: typeof activeNodes[number]) => {
            if (node.type !== 'block') return undefined;
            const blocks = getNodeBlocks(node.data);
            if (!blocks || blocks.length !== 1) return undefined;
            const block = blocks[0];
            const intrinsicTypes = new Set([
                'text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
                'todo', 'callout', 'code', 'quote', 'link', 'toggle',
            ]);
            if (!intrinsicTypes.has(block.type)) return undefined;
            if (block.type === 'link'
                && block.content.trim()
                && (block.metadata?.displayMode ?? 'bookmark') !== 'text') return undefined;
            const profile = getBlockNodeStyle(block, RELEASE_SIZE_PROFILE);
            const textLength = normalizeText(blockText(block.content)).length;
            const intrinsicWidth = Math.max(260, Math.min(432, textLength * 6 + 60));
            const userWidth = 'userWidth' in node.data && typeof node.data.userWidth === 'number'
                ? node.data.userWidth
                : undefined;
            const userHeight = 'userHeight' in node.data && typeof node.data.userHeight === 'number'
                ? node.data.userHeight
                : undefined;
            return {
                width: userWidth ?? intrinsicWidth,
                height: userHeight ?? profile.height,
            };
        };
        const widthOf = (node: typeof activeNodes[number]) => {
            const intrinsic = estimatedBlockSize(node);
            // Auto-sized blocks can retain a wide, stale measurement while
            // culled. Their content-derived footprint predicts the width they
            // will actually render at after organization.
            if (intrinsic) return intrinsic.width;
            return node.measured?.width
                ?? (typeof node.style?.width === 'number' ? node.style.width : 432);
        };
        const heightOf = (node: typeof activeNodes[number]) => {
            const intrinsic = estimatedBlockSize(node);
            if (intrinsic) return intrinsic.height;
            return node.measured?.height
                ?? (typeof node.style?.height === 'number' ? node.style.height : 432);
        };
        const gridWidthOf = (node: typeof activeNodes[number]) =>
            Math.ceil(widthOf(node) / BASE_UNIT) * BASE_UNIT;
        const gridHeightOf = (node: typeof activeNodes[number]) =>
            Math.ceil(heightOf(node) / BASE_UNIT) * BASE_UNIT;

        const originalBounds = activeNodes.reduce((bounds, node) => ({
            minX: Math.min(bounds.minX, node.position.x),
            minY: Math.min(bounds.minY, node.position.y),
            maxX: Math.max(bounds.maxX, node.position.x + widthOf(node)),
            maxY: Math.max(bounds.maxY, node.position.y + heightOf(node)),
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const relatedness = computeRelatednessHierarchy(activeNodes.map((node) => {
            const blocks = getNodeBlocks(node.data);
            const description = 'description' in node.data ? node.data.description : undefined;
            const stringContent = 'content' in node.data && typeof node.data.content === 'string'
                ? node.data.content
                : undefined;
            const fallbackText = [getNodeLabel(node.data), description, stringContent]
                .filter((value): value is string => Boolean(value?.trim()))
                .join(' ');
            return {
                id: node.id,
                blocks: blocks && blocks.length > 0
                    ? blocks
                    : [{ type: 'text', content: fallbackText }],
            };
        }));

        const sizes = new Map(activeNodes.map((node) => [node.id, {
            width: gridWidthOf(node),
            height: gridHeightOf(node),
        }]));

        // Real connectors are another useful relationship signal, but are never
        // rewritten by this action. They only help the layout keep linked cards
        // near one another.
        const connectorRelationships = edges
            .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
            .map((edge) => ({ source: edge.source, target: edge.target, score: 1 }));
        const provisional = layoutCanvasBento(
            activeNodes.map((node) => ({ id: node.id })),
            relatedness.edges,
            connectorRelationships,
            (node) => sizes.get(node.id) ?? { width: 432, height: 432 },
            { originX: 0, originY: 0, gridStep: BASE_UNIT }
        );

        // Keep the layout centred where the user's nodes already are. This
        // changes positions only; React Flow's camera is deliberately untouched.
        const organizedBounds = activeNodes.reduce((bounds, node) => {
            const position = provisional.get(node.id) ?? node.position;
            return {
                minX: Math.min(bounds.minX, position.x),
                minY: Math.min(bounds.minY, position.y),
                maxX: Math.max(bounds.maxX, position.x + widthOf(node)),
                maxY: Math.max(bounds.maxY, position.y + heightOf(node)),
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
        const offsetX = snapToGridValue(
            (originalBounds.minX + originalBounds.maxX - organizedBounds.minX - organizedBounds.maxX) / 2
        );
        const offsetY = snapToGridValue(
            (originalBounds.minY + originalBounds.maxY - organizedBounds.minY - organizedBounds.maxY) / 2
        );

        const positions = new Map<string, { x: number; y: number }>();
        provisional.forEach((position, id) => positions.set(id, {
            x: snapToGridValue(position.x + offsetX),
            y: snapToGridValue(position.y + offsetY),
        }));

        set({
            nodes: nodes.map((node) => {
                const position = positions.get(node.id);
                return position ? { ...node, position } : node;
            }),
        });
        get().setCloudDirty?.(true);
        return activeNodes.length;
    },

    applyCanvasOrganization: (operation) => {
        const { nodes, edges, currentParentId } = get();
        const positions: Record<string, { x: number; y: number }> = {};
        const previousPositions: Record<string, { x: number; y: number }> = {};
        const nodeIds = new Set(nodes.map((node) => node.id));
        Object.entries(operation.positions).forEach(([id, position]) => {
            if (!nodeIds.has(id)) return;
            positions[id] = { x: position.x, y: position.y };
            const node = nodes.find((candidate) => candidate.id === id);
            if (node) previousPositions[id] = { ...node.position };
        });

        // Capture the complete connector set before changing anything. The
        // preview owns this snapshot so its Undo button is truly one-click.
        const snapshot = { positions: previousPositions, edges: [...edges] };
        const removed = new Set(operation.removeEdgeIds);
        const keptEdges = edges.filter((edge) => !removed.has(edge.id));
        const existing = new Set(keptEdges.map((edge) => `${edge.source}:${edge.target}`));
        const addedEdges = operation.connections
            .filter(({ source, target }) => (
                source !== target
                && nodeIds.has(source)
                && nodeIds.has(target)
                && !existing.has(`${source}:${target}`)
            ))
            .map(({ source, target, label }) => {
                existing.add(`${source}:${target}`);
                return {
                    id: uuidv4(),
                    source,
                    target,
                    type: 'centered',
                    data: {
                        parentId: currentParentId ?? null,
                        aiOrganization: true,
                        ...(label ? { label } : {}),
                    },
                } as Edge;
            });

        set({
            nodes: nodes.map((node) => positions[node.id]
                ? { ...node, position: positions[node.id] }
                : node),
            edges: [...keptEdges, ...addedEdges],
        });
        get().setCloudDirty?.(true);
        return snapshot;
    },

    restoreCanvasOrganization: (snapshot) => {
        set((state) => ({
            nodes: state.nodes.map((node) => snapshot.positions[node.id]
                ? { ...node, position: snapshot.positions[node.id] }
                : node),
            edges: [...snapshot.edges],
        }));
        get().setCloudDirty?.(true);
    },
});
