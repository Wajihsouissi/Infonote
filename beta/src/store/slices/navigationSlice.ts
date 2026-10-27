import type { StateCreator } from 'zustand';
import type { AppState, Breadcrumb, NavigationSlice } from '../types';
import type { AppNode } from '../../types';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../utils/preferences';

const HOME: Breadcrumb = { id: null, label: 'Home' };

const crumbLabel = (node: AppNode): string => {
    if (node.type === 'block') return 'Block';
    return node.data.label || (node.type === 'note' ? 'Note' : 'Fused note');
};

/** The canvas the user was last inside survives a refresh. */
const rememberParent = (id: string | null) => writePreference(PREFERENCE_KEYS.currentParentId, id);

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
    currentParentId: readPreference(PREFERENCE_KEYS.currentParentId),
    lastExitedNodeId: null,
    clearLastExitedNodeId: () => set({ lastExitedNodeId: null }),
    breadcrumbs: [HOME],
    fullscreenId: null,
    rightSidePanelId: null,
    leftSidePanelId: null,
    centerPanelId: null,

    navigateToNode: (nodeId) => {
        const { nodes, breadcrumbs, currentParentId } = get();

        if (nodeId === null) {
            set({ currentParentId: null, lastExitedNodeId: currentParentId, breadcrumbs: [HOME] });
            rememberParent(null);
            return;
        }

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        rememberParent(nodeId);

        const existingIndex = breadcrumbs.findIndex((b) => b.id === nodeId);
        if (existingIndex !== -1) {
            set({
                currentParentId: nodeId,
                lastExitedNodeId: currentParentId, // Going backward to an existing crumb
                breadcrumbs: breadcrumbs.slice(0, existingIndex + 1),
            });
        } else {
            set({
                currentParentId: nodeId,
                lastExitedNodeId: null, // Going deeper, not backward
                breadcrumbs: [...breadcrumbs, { id: nodeId, label: crumbLabel(targetNode) }],
            });
        }
    },

    setFullscreenId: (id) => set({ fullscreenId: id, rightSidePanelId: null, leftSidePanelId: null, centerPanelId: null }),
    setRightSidePanelId: (id) => set({ rightSidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setLeftSidePanelId: (id) => set({ leftSidePanelId: id, fullscreenId: null, centerPanelId: null }),
    setCenterPanelId: (id) => set({ centerPanelId: id, fullscreenId: null, rightSidePanelId: null, leftSidePanelId: null }),

    reconstructBreadcrumbs: () => {
        const { nodes, currentParentId } = get();

        if (currentParentId === null) {
            set({ breadcrumbs: [HOME] });
            return;
        }

        const byId = new Map(nodes.map((n) => [n.id, n]));
        if (!byId.has(currentParentId)) {
            // The remembered canvas no longer exists: fall back to Home.
            set({ currentParentId: null, breadcrumbs: [HOME] });
            rememberParent(null);
            return;
        }

        const path: Breadcrumb[] = [];
        const visited = new Set<string>();
        let currId: string | null = currentParentId;
        // `visited` guards against a corrupt parent cycle looping forever.
        while (currId && !visited.has(currId)) {
            visited.add(currId);
            const node = byId.get(currId);
            if (!node) break;
            path.unshift({ id: node.id, label: crumbLabel(node) });
            currId = node.parentId || null;
        }

        set({ breadcrumbs: [HOME, ...path] });
    },
});
