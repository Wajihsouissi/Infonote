import type { StateCreator } from 'zustand';
import { type Edge, addEdge, applyNodeChanges, applyEdgeChanges, reconnectEdge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, getNodeLabel } from '../../types';
import type { Block } from '../../features/editor/types';
import { MIN_FUSED_SIZE, BASE_UNIT, snapToGridValue } from '../../config/layout';
import { computeCanvasContentReconciliation } from '../contentSync';
import { withoutHistory } from '../temporalControl';
import { checkNodeCreationLimits } from '../nodeLimits';
import { getBlockNodeStyle, HYDRATE_SIZE_PROFILE } from '../blockNodeStyle';
import { scheduleParentSync } from '../graphHelpers';
import type { AppState, NodeCoreSlice } from '../types';

/**
 * Core graph state: the nodes and edges themselves, React Flow change handlers,
 * node creation and data updates.
 */
export const createNodeSlice: StateCreator<AppState, [], [], NodeCoreSlice> = (set, get) => ({
    // The saved workspace replaces these via loadGraph; a first visit starts empty.
    nodes: [],

    edges: [],

    onNodesChange: (changes) => {
        // A 'replace' from React Flow must not drop the node's parentId.
        const filteredChanges = changes.map(change => {
            if (change.type === 'replace') {
                const existingNode = get().nodes.find(n => n.id === change.id);
                if (existingNode && existingNode.parentId) {
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
           downstream (culling, persistence), and that is where it is held
           back: see useCanvasViewport and localPersistence. */

        if (filteredChanges.length === 0) return;

        set({
            nodes: applyNodeChanges(filteredChanges, get().nodes) as AppNode[],
        });

        // Sync the parent note on structural changes, and when a drag ends
        // (card order on the canvas is block order in the note).
        const hasStructuralChange = filteredChanges.some(c => c.type === 'remove' || c.type === 'add' || c.type === 'dimensions');
        const hasFinishedDragging = filteredChanges.some(c => c.type === 'position' && c.dragging === false);

        const { currentParentId } = get();
        if (currentParentId && (hasStructuralChange || hasFinishedDragging)) {
            scheduleParentSync(currentParentId, () => get().syncParentContent(currentParentId));
        }
    },

    setNodes: (nodesOrUpdater) => {
        const nextNodes = typeof nodesOrUpdater === 'function'
            ? nodesOrUpdater(get().nodes)
            : nodesOrUpdater;

        set({ nodes: nextNodes });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
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
    },

    onReconnect: (oldEdge, newConnection) => {
        set({
            edges: reconnectEdge(oldEdge, newConnection, get().edges),
        });
    },

    addNode: (type, position, initialData, style, parentId, customId) => {
        const { currentParentId } = get();
        const targetParentId = parentId !== undefined ? parentId : (currentParentId || undefined);

        // Guest limits apply to creation only — loads are never trimmed.
        const violation = checkNodeCreationLimits({
            nodes: get().nodes,
            targetParentId,
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

        const defaultStyle = type === 'fused-note' ? { width: MIN_FUSED_SIZE } : { width: 432, height: 432 };

        const createdAt = new Date().toISOString();
        const defaultData = {
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


        set((state) => {
            if (state.nodes.some(n => n.id === newNode.id)) {
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

        if (targetParentId) {
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
    },
});
