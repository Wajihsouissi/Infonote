import type { StateCreator } from 'zustand';
import type { AppState, UISlice } from '../types';

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
    activeIconMenuId: null,
    isKanbanModalOpen: false,
    editingKanbanId: null,
    interactionState: {
        draggingKanbanNodeId: null,
        hoveredKanbanColumn: null,
        draggedNodeId: null,
        dropTarget: null
    },
    theme: (localStorage.getItem('infonote-theme') as 'light' | 'dark') || 'dark',
    currentView: 'login',
    hasEnteredApp: false,
    selectedCanvasNodeIds: new Set<string>(),
    selectedEdgeId: null,
    selectedEdgeIds: new Set<string>(),
    isMetadataOpen: false,
    isTOCOpen: false,

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setKanbanModalOpen: (isOpen) => set({ isKanbanModalOpen: isOpen, editingKanbanId: isOpen ? get().editingKanbanId : null }),
    setEditingKanbanId: (id) => set({ editingKanbanId: id }),
    setMetadataOpen: (isOpen) => set({ isMetadataOpen: isOpen, isTOCOpen: isOpen ? false : get().isTOCOpen }),
    setTOCOpen: (isOpen) => set({ isTOCOpen: isOpen, isMetadataOpen: isOpen ? false : get().isMetadataOpen }),
    setInteractionState: (newState) => set((state) => ({
        interactionState: { ...state.interactionState, ...newState }
    })),

    toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';

        document.documentElement.classList.add('theme-transitioning');

        requestAnimationFrame(() => {
            set({ theme: newTheme });
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('infonote-theme', newTheme);

            setTimeout(() => {
                document.documentElement.classList.remove('theme-transitioning');
            }, 300);
        });
    },

    setSelectedCanvasNodeIds: (ids) => set({
        selectedCanvasNodeIds: ids,
        selectedEdgeId: ids.size > 0 ? null : get().selectedEdgeId,
        selectedEdgeIds: ids.size > 0 ? new Set<string>() : get().selectedEdgeIds
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
            selectedEdgeIds: new Set<string>()
        };
    }),

    clearCanvasSelection: () => set({
        selectedCanvasNodeIds: new Set<string>(),
        selectedEdgeId: null,
        selectedEdgeIds: new Set<string>()
    }),

    setSelectedEdgeId: (id) => set({
        selectedEdgeId: id,
        selectedEdgeIds: id ? new Set([id]) : new Set<string>(),
        selectedCanvasNodeIds: id ? new Set<string>() : get().selectedCanvasNodeIds
    }),

    setSelectedEdgeIds: (ids) => set({
        selectedEdgeIds: ids,
        selectedEdgeId: ids.size > 0 ? Array.from(ids)[0] : null,
        selectedCanvasNodeIds: ids.size > 0 ? new Set<string>() : get().selectedCanvasNodeIds
    }),

    toggleCanvasEdgeSelection: (id) => set((state) => {
        const newSelection = new Set(state.selectedEdgeIds || []);
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

    setCurrentView: (view) => {
        const isAppView = view === 'landing' || view === 'canvas' || view === 'marketplace';
        set((state) => ({
            currentView: view,
            hasEnteredApp: isAppView ? true : state.hasEnteredApp
        }));
    },
    setHasEnteredApp: (val) => set({ hasEnteredApp: val }),
});
