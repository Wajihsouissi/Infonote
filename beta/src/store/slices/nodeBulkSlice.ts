import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { type AppNode, getNodeBlocks } from '../../types';
import { type NodesPayload, cloneBlocks } from '../../features/clipboard/clipboardPayload';
import { materializeGraphClipboard } from '../../features/clipboard/graphClipboard';
import { historyEquality, selectionAfterHistory } from '../historyConfig';
import { BASE_UNIT } from '../../config/layout';
import { collectNodeBranch, remapBlockNodeReferences } from '../graphHelpers';
import type { AppState, NodeBulkSlice } from '../types';

/**
 * Actions on many nodes at once: confirmed (and undoable) deletion of whole
 * branches, duplication, paste, and bulk colour.
 */
export const createNodeBulkSlice: StateCreator<AppState, [], [], NodeBulkSlice> = (set, get) => ({
    pendingNodeDeletion: null,

    lastNodeDeletion: null,

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
        const state = get();
        if (!historyEquality({ nodes: state.nodes, edges: state.edges }, { nodes: deletion.afterNodes, edges: deletion.afterEdges })) {
            set({ lastNodeDeletion: null });
            return;
        }

        set({
            nodes: deletion.beforeNodes,
            edges: deletion.beforeEdges,
            lastNodeDeletion: null,
        });
        get().setSelectedCanvasNodeIds(selectionAfterHistory(deletion.beforeNodes, state.selectedCanvasNodeIds, state.currentParentId));
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


        if (nodesToDuplicate.length === 0) {
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
    },

    /**
     * Recreate cards copied to the clipboard, with their connections.
     *
     * The payload stores positions relative to the copied selection and refers
     * to nodes by index, so a paste can land anywhere — including a different
     * canvas level — without knowing anything about the ids it came from.
     * Branch roots join the active canvas; descendants keep their hierarchy.
     */
    pasteClipboardNodes: (payload: NodesPayload, origin: { x: number; y: number }) => {
        const { currentParentId } = get();
        const pasted = materializeGraphClipboard(payload, origin, currentParentId);
        if (!pasted) return [];
        set((state) => ({
            nodes: [...state.nodes.map(n => ({ ...n, selected: false })), ...pasted.nodes],
            edges: [...state.edges, ...pasted.edges],
            selectedCanvasNodeIds: pasted.selectedIds,
        }));
        if (currentParentId) get().syncParentContent(currentParentId);
        return Array.from(pasted.selectedIds);
    },

    bulkApplyColor: (nodeIds: string[], color: string) => {

        set((state) => ({
            nodes: state.nodes.map(n => {
                if (nodeIds.includes(n.id)) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            color: color === 'transparent' ? undefined : color,
                            /* Clearing the colour clears the image with it. They
                               are two ways of choosing the same thing — the
                               node's ambient — so "no colour" has to mean no
                               ambient, or the swatch would appear to do nothing
                               on a node coloured by image. */
                            ...(color === 'transparent' ? { ambientImage: undefined } : {}),
                        }
                    } as AppNode;
                }
                return n;
            })
        }));

    },
});
