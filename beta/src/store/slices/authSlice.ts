import type { StateCreator } from 'zustand';
import type { AppState, AuthSlice, AuthState, AuthUser } from '../types';

const UNAUTHENTICATED_AUTH: AuthState = {
    userId: null,
    email: null,
    displayName: null,
    isAuthenticated: false,
    isAuthLoading: false,
    accessToken: null,
};

/**
 * Auth slice — exposes the signed-in user globally.
 *
 * In the beta, signing in unlocks AI and lifts the guest nesting limit; it does
 * not move anyone's work (saving is local-only). Components read
 * `useStore(s => s.auth.isAuthenticated)` rather than going through context.
 */
export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
    auth: { ...UNAUTHENTICATED_AUTH },
    setAuthUser: (user: AuthUser | null) =>
        set({
            auth: user
                ? {
                      userId: user.id,
                      email: user.email ?? null,
                      displayName: user.displayName ?? null,
                      isAuthenticated: true,
                      isAuthLoading: false,
                      accessToken: user.accessToken ?? null,
                  }
                : { ...UNAUTHENTICATED_AUTH },
        }),
    setAuthLoading: (isLoading: boolean) =>
        set((state) => ({
            auth: { ...state.auth, isAuthLoading: isLoading },
        })),
});
