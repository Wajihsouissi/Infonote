import type { StateCreator } from 'zustand';
import type { AppState, UISlice } from '../types';

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
    activeIconMenuId: null,
    isKanbanModalOpen: false,
    editingKanbanId: null,
    interactionState: {
        draggingKanbanNodeId: null,
        hoveredKanbanColumn: null
    },
    theme: (localStorage.getItem('infonote-theme') as 'light' | 'dark') || 'dark',

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
});
