import { create } from 'zustand';
import { temporal } from 'zundo';
import { createNodeSlice } from './slices/nodeSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createStorageSlice } from './slices/storageSlice';
import { createUISlice } from './slices/uiSlice';
import type { AppState } from './types';

export const useStore = create<AppState>()(
    temporal(
        (...a) => ({
            ...createNodeSlice(...a),
            ...createNavigationSlice(...a),
            ...createStorageSlice(...a),
            ...createUISlice(...a),
        }),
        {
            limit: 50, // Limit history stack size
            partialize: (state) => {
                const { nodes, edges } = state;
                return { nodes, edges };
            },
            // Use a more efficient equality check or remove to use default
        }
    )
);
