import type { StateCreator } from 'zustand';
import type { AppState, NavigationSlice } from '../types';

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
    currentParentId: typeof window !== 'undefined' ? localStorage.getItem('infonote-current-parent-id') : null,
    breadcrumbs: [{ id: null, label: 'Home' }],
    fullscreenId: null,
    sidePanelId: null,
    centerPanelId: null,

    navigateToNode: (nodeId) => {
        const { nodes, breadcrumbs } = get();

        if (nodeId === null) {
            set({ currentParentId: null, breadcrumbs: [{ id: null, label: 'Home' }] });
            if (typeof window !== 'undefined') localStorage.removeItem('infonote-current-parent-id');
            return;
        }

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        // Persist to localStorage
        if (typeof window !== 'undefined') localStorage.setItem('infonote-current-parent-id', nodeId);

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

    setFullscreenId: (id) => set({ fullscreenId: id, sidePanelId: null, centerPanelId: null }),
    setSidePanelId: (id) => set({ sidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setCenterPanelId: (id) => set({ centerPanelId: id, fullscreenId: null, sidePanelId: null }),

    reconstructBreadcrumbs: () => {
        const { nodes, currentParentId } = get();

        if (currentParentId === null) {
            set({ breadcrumbs: [{ id: null, label: 'Home' }] });
            return;
        }

        // Verify parent still exists
        const exists = nodes.some(n => n.id === currentParentId);
        if (!exists) {
            set({ breadcrumbs: [{ id: null, label: 'Home' }] });
            // Don't clear localStorage here, as nodes might still be loading batch-by-batch
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
