import type { StateCreator } from 'zustand';
import type { AppState, UISlice, AppView } from '../types';

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
    activeIconMenuId: null,
    isKanbanModalOpen: false,
    editingKanbanId: null,
    lastCreatedCanvasNodeId: null,
    interactionState: {
        draggingKanbanNodeId: null,
        hoveredKanbanColumn: null,
        draggedNodeId: null,
        dropTarget: null
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
    showWelcomeModal: false,

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setKanbanModalOpen: (isOpen) => set({ isKanbanModalOpen: isOpen, editingKanbanId: isOpen ? get().editingKanbanId : null }),
    setEditingKanbanId: (id) => set({ editingKanbanId: id }),
    setMetadataOpen: (isOpen) => set({ isMetadataOpen: isOpen, isTOCOpen: isOpen ? false : get().isTOCOpen }),
    setTOCOpen: (isOpen) => set({ isTOCOpen: isOpen, isMetadataOpen: isOpen ? false : get().isMetadataOpen }),
    setShortcutsPanelOpen: (isOpen) => set({ isShortcutsPanelOpen: isOpen }),
    setInteractionState: (newState) => set((state) => ({
        interactionState: { ...state.interactionState, ...newState }
    })),
    setIsLinkingMode: (isLinking) => set({ isLinkingMode: isLinking }),

    toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';

        document.documentElement.classList.add('theme-transitioning');

        requestAnimationFrame(() => {
            set({ theme: newTheme });
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('chnk-it-theme', newTheme);

            setTimeout(() => {
                document.documentElement.classList.remove('theme-transitioning');
            }, 300);
        });
    },

    setSelectedCanvasNodeIds: (ids) => set({
        selectedCanvasNodeIds: ids,
        selectedEdgeId: ids.size > 0 ? null : get().selectedEdgeId,
        selectedEdgeIds: ids.size > 0 ? new Set<string>() : get().selectedEdgeIds,
        isLinkingMode: ids.size < 2 ? false : get().isLinkingMode
    }),

    toggleCanvasNodeSelection: (id) => set((state) => {
        const newSelection = new Set(state.selectedCanvasNodeIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return {
            selectedCanvasNodeIds: newSelection,
            selectedEdgeId: null,
            selectedEdgeIds: new Set<string>(),
            isLinkingMode: newSelection.size < 2 ? false : state.isLinkingMode
        };
    }),

    clearCanvasSelection: () => set({
        selectedCanvasNodeIds: new Set<string>(),
        selectedEdgeId: null,
        selectedEdgeIds: new Set<string>(),
        isLinkingMode: false
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

        set({
            selectedCanvasNodeIds: selected,
            selectedEdgeId: null,
            selectedEdgeIds: new Set<string>(),
            isLinkingMode: selected.size < 2 ? false : get().isLinkingMode
        });

        get().setNodes(nds => nds.map(n => {
            if (!visibleNodeIds.has(n.id)) return n;
            const shouldBeSelected = selected.has(n.id);
            if (n.selected === shouldBeSelected) return n;
            return { ...n, selected: shouldBeSelected };
        }));
    },

    setLastCreatedCanvasNodeId: (id: string | null) => set({ lastCreatedCanvasNodeId: id }),

    setSelectedEdgeId: (id: string | null) => set({
        selectedEdgeId: id,
        selectedEdgeIds: id ? new Set([id]) : new Set<string>(),
        selectedCanvasNodeIds: id ? new Set<string>() : get().selectedCanvasNodeIds
    }),

    setSelectedEdgeIds: (ids: Set<string>) => set({
        selectedEdgeIds: ids,
        selectedEdgeId: ids.size > 0 ? Array.from(ids)[0] : null,
        selectedCanvasNodeIds: ids.size > 0 ? new Set<string>() : get().selectedCanvasNodeIds
    }),

    toggleCanvasEdgeSelection: (id: string) => set((state) => {
        const newSelection = new Set(state.selectedEdgeIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return {
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
});
