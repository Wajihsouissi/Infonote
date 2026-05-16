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
    currentView: 'landing',
    selectedCanvasNodeIds: new Set<string>(),

    setActiveIconMenuId: (id) => set({ activeIconMenuId: id }),
    setKanbanModalOpen: (isOpen) => set({ isKanbanModalOpen: isOpen, editingKanbanId: isOpen ? get().editingKanbanId : null }),
    setEditingKanbanId: (id) => set({ editingKanbanId: id }),
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

    setSelectedCanvasNodeIds: (ids) => set({ selectedCanvasNodeIds: ids }),

    toggleCanvasNodeSelection: (id) => set((state) => {
        const newSelection = new Set(state.selectedCanvasNodeIds);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        return { selectedCanvasNodeIds: newSelection };
    }),

    clearCanvasSelection: () => set({ selectedCanvasNodeIds: new Set<string>() }),

    setCurrentView: (view) => set({ currentView: view }),
});
