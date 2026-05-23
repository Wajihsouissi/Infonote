import type { StateCreator } from 'zustand';
import type { AppState, NavigationSlice } from '../types';

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
    currentParentId: typeof window !== 'undefined' ? localStorage.getItem('chnk-it-current-parent-id') : null,
    breadcrumbs: [{ id: null, label: 'Home' }],
    fullscreenId: null,
    sidePanelId: null, // Deprecated, kept for backward compatibility if any
    rightSidePanelId: null,
    leftSidePanelId: null,
    centerPanelId: null,

    navigateToNode: (nodeId) => {
        const { nodes, breadcrumbs } = get();

        if (nodeId === null) {
            set({ currentParentId: null, breadcrumbs: [{ id: null, label: 'Home' }] });
            if (typeof window !== 'undefined') localStorage.removeItem('chnk-it-current-parent-id');
            return;
        }

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        // Persist to localStorage
        if (typeof window !== 'undefined') localStorage.setItem('chnk-it-current-parent-id', nodeId);

        // Hydrate canvas from content if it's a note
        if (targetNode.type === 'note') {
            get().hydrateCanvasFromContent(nodeId);
        }

        const existingIndex = breadcrumbs.findIndex((b) => b.id === nodeId);
        if (existingIndex !== -1) {
            set({
                currentParentId: nodeId,
                breadcrumbs: breadcrumbs.slice(0, existingIndex + 1),
            });
        } else {
            set({
                currentParentId: nodeId,
                breadcrumbs: [...breadcrumbs, { id: nodeId, label: targetNode.type === 'note' ? (targetNode.data.label || 'Note') : 'Block' }],
            });
        }
    },

    setFullscreenId: (id) => set({ fullscreenId: id, rightSidePanelId: null, leftSidePanelId: null, centerPanelId: null }),
    setSidePanelId: (id) => get().setRightSidePanelId(id), // Alias to right panel
    setRightSidePanelId: (id) => set({ rightSidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setLeftSidePanelId: (id) => set({ leftSidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setCenterPanelId: (id) => set({ centerPanelId: id, fullscreenId: null, rightSidePanelId: null, leftSidePanelId: null }),

    reconstructBreadcrumbs: () => {
        const { nodes, currentParentId } = get();

        if (currentParentId === null) {
            set({ breadcrumbs: [{ id: null, label: 'Home' }] });
            return;
        }

        // Verify parent still exists
        const exists = nodes.some(n => n.id === currentParentId);
        if (!exists) {
            set({ currentParentId: null, breadcrumbs: [{ id: null, label: 'Home' }] });
            if (typeof window !== 'undefined') localStorage.removeItem('chnk-it-current-parent-id');
            return;
        }

        const path: { id: string | null; label: string }[] = [];
        let currId: string | null = currentParentId;

        while (currId) {
            const node = nodes.find(n => n.id === currId);
            if (!node) break;

            if (currId === currentParentId && node.type === 'note') {
                get().hydrateCanvasFromContent(currId);
            }

            path.unshift({
                id: node.id,
                label: node.type === 'note' ? (node.data.label || 'Note') : 'Block'
            });

            currId = node.parentId || null;
        }

        path.unshift({ id: null, label: 'Home' });
        set({ breadcrumbs: path });
    },
});
