import type { StateCreator } from 'zustand';
import type { AppState, AuthSlice, AuthState, AuthUser } from '../types';

const UNAUTHENTICATED_AUTH: AuthState = {
    userId: null,
    email: null,
    displayName: null,
    activeWorkspaceId: null,
    isAuthenticated: false,
    isAuthLoading: false,
};

/**
 * Auth slice — exposes the active Supabase user globally.
 *
 * Hydrated by <AuthProvider /> on every onAuthStateChange tick. UI components
 * can read `useStore(s => s.auth.userId)` for cheap access without going
 * through React context. Mirrors the `user_profiles` row on the backend so
 * downstream consumers always see canonical email / display name.
 */
export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
    auth: { ...UNAUTHENTICATED_AUTH, isAuthLoading: true },
    isAuthModalOpen: false,
    setAuthUser: (user: AuthUser | null) =>
        set((state) => ({
            auth: user
                ? {
                      userId: user.id,
                      email: user.email ?? null,
                      displayName: user.displayName ?? null,
                      activeWorkspaceId:
                          state.auth.userId === user.id ? state.auth.activeWorkspaceId : null,
                      isAuthenticated: true,
                      isAuthLoading: false,
                  }
                : { ...UNAUTHENTICATED_AUTH },
        })),
    setAuthWorkspace: (workspaceId: string | null) =>
        set((state) => ({
            auth: { ...state.auth, activeWorkspaceId: workspaceId },
        })),
    setAuthLoading: (isLoading: boolean) =>
        set((state) => ({
            auth: { ...state.auth, isAuthLoading: isLoading },
        })),
    setAuthModalOpen: (isOpen: boolean) => set({ isAuthModalOpen: isOpen }),
    resetAuth: () =>
        set({
            auth: { ...UNAUTHENTICATED_AUTH },
            isAuthModalOpen: false,
        }),
});
