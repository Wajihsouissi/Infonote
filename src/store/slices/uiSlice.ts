import type { StateCreator } from 'zustand';
import type { AppState, UISlice, AppView } from '../types';
import { runThemeTransition } from '../../utils/themeTransition';

const syncNodeSelection = (nodes: AppState['nodes'], selectedIds: Set<string>) => {
    let changed = false;
    const nextNodes = nodes.map(node => {
        const shouldBeSelected = selectedIds.has(node.id);
        if (Boolean(node.selected) === shouldBeSelected) return node;
        changed = true;
        return { ...node, selected: shouldBeSelected };
    });
    return changed ? nextNodes : nodes;
};

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
    activeIconMenuId: null,
    lastCreatedCanvasNodeId: null,
    interactionState: {
        draggedNodeId: null,
        isMultiDragging: false,
        dropTarget: null,
        hoveredKanbanLane: null
    },
    theme: (localStorage.getItem('chnk-it-theme') as 'light' | 'dark') || 'dark',
    currentView: 'marketing',
    hasEnteredApp: false,
    selectedCanvasNodeIds: new Set<string>(),
    selectedEdgeId: null,
    selectedEdgeIds: new Set<string>(),
    isMetadataOpen: false,
    isTOCOpen: false,
    isShortcutsPanelOpen: false,
    isLinkingMode: false,
    chunkItNodeId: null,
    showWelcomeModal: false,
    limitNotice: null,

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setMetadataOpen: (isOpen) => set({ isMetadataOpen: isOpen, isTOCOpen: isOpen ? false : get().isTOCOpen }),
    setTOCOpen: (isOpen) => set({ isTOCOpen: isOpen, isMetadataOpen: isOpen ? false : get().isMetadataOpen }),
    setShortcutsPanelOpen: (isOpen) => set({ isShortcutsPanelOpen: isOpen }),
    setInteractionState: (newState) => set((state) => ({
        interactionState: { ...state.interactionState, ...newState }
    })),
    setIsLinkingMode: (isLinking) => set({ isLinkingMode: isLinking }),

    toggleTheme: (origin) => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';

        runThemeTransition(() => {
            set({ theme: newTheme });
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('chnk-it-theme', newTheme);
        }, origin);
    },

    setSelectedCanvasNodeIds: (ids) => set((state) => ({
        nodes: syncNodeSelection(state.nodes, ids),
        selectedCanvasNodeIds: ids,
        selectedEdgeId: ids.size > 0 ? null : state.selectedEdgeId,
        selectedEdgeIds: ids.size > 0 ? new Set<string>() : state.selectedEdgeIds,
        isLinkingMode: ids.size < 2 ? false : state.isLinkingMode
    })),

    toggleCanvasNodeSelection: (id) => set((state) => {
        const newSelection = new Set(state.selectedCanvasNodeIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return {
            nodes: syncNodeSelection(state.nodes, newSelection),
            selectedCanvasNodeIds: newSelection,
            selectedEdgeId: null,
            selectedEdgeIds: new Set<string>(),
            isLinkingMode: newSelection.size < 2 ? false : state.isLinkingMode
        };
    }),

    clearCanvasSelection: () => set((state) => {
        const emptySelection = new Set<string>();
        return {
            nodes: syncNodeSelection(state.nodes, emptySelection),
            selectedCanvasNodeIds: emptySelection,
            selectedEdgeId: null,
            selectedEdgeIds: new Set<string>(),
            isLinkingMode: false
        };
    }),

    selectConnectedCanvasNodes: (nodeId: string) => {
        const { edges, nodes, currentParentId } = get();

        const activeParent = currentParentId ?? null;
        const visibleNodes = nodes.filter(n => (n.parentId || null) === activeParent);
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

        const visibleEdges = edges.filter(e => {
            if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return false;
            const edgeParent = (e.data as { parentId?: string | null } | undefined)?.parentId ?? null;
            return edgeParent === activeParent;
        });

        const adjacency = new Map<string, Set<string>>();
        visibleEdges.forEach(e => {
            if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
            if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
            adjacency.get(e.source)!.add(e.target);
            adjacency.get(e.target)!.add(e.source);
        });

        const selected = new Set<string>();
        const queue: string[] = [];

        if (visibleNodeIds.has(nodeId)) {
            selected.add(nodeId);
            queue.push(nodeId);
        }

        while (queue.length > 0) {
            const cur = queue.shift()!;
            const neighbors = adjacency.get(cur);
            if (!neighbors) continue;
            neighbors.forEach(nid => {
                if (selected.has(nid)) return;
                selected.add(nid);
                queue.push(nid);
            });
        }

        const updatedNodes = syncNodeSelection(nodes, selected);
        set({
            nodes: updatedNodes,
            selectedCanvasNodeIds: selected,
            selectedEdgeId: null,
            selectedEdgeIds: new Set<string>(),
            isLinkingMode: selected.size < 2 ? false : get().isLinkingMode
        });
    },

    setLastCreatedCanvasNodeId: (id: string | null) => set({ lastCreatedCanvasNodeId: id }),

    setSelectedEdgeId: (id: string | null) => set((state) => {
        const selectedNodeIds = id ? new Set<string>() : state.selectedCanvasNodeIds;
        return {
            nodes: id ? syncNodeSelection(state.nodes, selectedNodeIds) : state.nodes,
            selectedEdgeId: id,
            selectedEdgeIds: id ? new Set([id]) : new Set<string>(),
            selectedCanvasNodeIds: selectedNodeIds
        };
    }),

    setSelectedEdgeIds: (ids: Set<string>) => set((state) => {
        const selectedNodeIds = ids.size > 0 ? new Set<string>() : state.selectedCanvasNodeIds;
        return {
            nodes: ids.size > 0 ? syncNodeSelection(state.nodes, selectedNodeIds) : state.nodes,
            selectedEdgeIds: ids,
            selectedEdgeId: ids.size > 0 ? Array.from(ids)[0] : null,
            selectedCanvasNodeIds: selectedNodeIds
        };
    }),

    toggleCanvasEdgeSelection: (id: string) => set((state) => {
        const newSelection = new Set(state.selectedEdgeIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return {
            nodes: newSelection.size > 0
                ? syncNodeSelection(state.nodes, new Set<string>())
                : state.nodes,
            selectedEdgeIds: newSelection,
            selectedEdgeId: newSelection.size > 0 ? Array.from(newSelection)[0] : null,
            selectedCanvasNodeIds: newSelection.size > 0 ? new Set<string>() : state.selectedCanvasNodeIds
        };
    }),

    setCurrentView: (view: AppView) => {
        const isAppView = view === 'landing' || view === 'canvas' || view === 'marketplace';
        set((state) => ({
            currentView: view,
            hasEnteredApp: isAppView ? true : state.hasEnteredApp
        }));
    },
    setHasEnteredApp: (val: boolean) => set({ hasEnteredApp: val }),
    setShowWelcomeModal: (v: boolean) => set({ showWelcomeModal: v }),
    setChunkItNodeId: (id: string | null) => set({ chunkItNodeId: id }),
    setLimitNotice: (notice) => set({ limitNotice: notice }),
});
