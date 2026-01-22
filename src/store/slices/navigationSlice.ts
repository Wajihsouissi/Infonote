import type { StateCreator } from 'zustand';
import type { AppState, NavigationSlice } from '../types';

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
    currentParentId: null,
    breadcrumbs: [{ id: null, label: 'Home' }],
    fullscreenId: null,
    sidePanelId: null,
    centerPanelId: null,

    navigateToNode: (nodeId) => {
        const { nodes, breadcrumbs } = get();

        if (nodeId === null) {
            set({ currentParentId: null, breadcrumbs: [{ id: null, label: 'Home' }] });
            return;
        }

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

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
});
