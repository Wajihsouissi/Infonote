import type { StateCreator } from 'zustand';
import type { AppState, AuthSlice, AuthUser } from '../types';

/**
 * Auth slice — exposes the active Supabase user globally.
 *
 * Hydrated by <AuthProvider /> on every onAuthStateChange tick. UI components
 * can read `useStore(s => s.auth.userId)` for cheap access without going
 * through React context.
 */
export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
    auth: {
        userId: null,
        email: null,
        isAuthenticated: false,
        isAuthLoading: true,
    },
    isAuthModalOpen: false,
    setAuthUser: (user: AuthUser | null) =>
        set({
            auth: {
                userId: user?.id ?? null,
                email: user?.email ?? null,
                isAuthenticated: Boolean(user?.id),
                isAuthLoading: false,
            },
        }),
    setAuthLoading: (isLoading: boolean) =>
        set((state) => ({
            auth: { ...state.auth, isAuthLoading: isLoading },
        })),
    setAuthModalOpen: (isOpen: boolean) => set({ isAuthModalOpen: isOpen }),
});
