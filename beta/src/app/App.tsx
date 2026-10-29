import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkspaceLoading } from './recovery/WorkspaceLoading';
import { LimitNoticeModal } from './shell/feedback/limits/LimitNoticeModal';
import { GuestReminder } from './shell/feedback/guest-reminder/GuestReminder';
import { startModifierKeyTracking } from './shell/input/modifiers/modifierKeysStore';
import { startLocalPersistence } from '../services/storage/workspace/localPersistence';
import { startAuthSession } from '../features/auth/session';
import { useStore } from '../store/useStore';
import { startErrorReports } from '../services/errorReports';
import { VIEW_PATHS, viewFromAuthRedirect, viewFromPath, type AppView } from './routes';

/* Each view is its own chunk: the canvas is the heavy one, and someone landing
   on the marketing page or signing in should not download an editor to read a
   paragraph. */
const CanvasBoard = lazy(() => import('../features/canvas/board/CanvasBoard').then((m) => ({ default: m.CanvasBoard })));
const MarketingPage = lazy(() => import('../features/landing/pages/marketing/MarketingPage').then((m) => ({ default: m.MarketingPage })));
const HomePage = lazy(() => import('../features/landing/pages/home/HomePage').then((m) => ({ default: m.HomePage })));
const AuthPage = lazy(() => import('../features/auth/pages/authentication/AuthPage').then((m) => ({ default: m.AuthPage })));
const UpdatePasswordPage = lazy(() => import('../features/auth/pages/authentication/UpdatePasswordPage').then((m) => ({ default: m.UpdatePasswordPage })));
const ProfilePage = lazy(() => import('../features/auth/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));

const loader = <WorkspaceLoading />;

export function App() {
    useEffect(() => startErrorReports(() => useStore.getState().auth.accessToken), []);
    // The saved workspace must be in the store before anyone can edit it;
    // an edit made earlier would be overwritten by the load.
    const [isWorkspaceReady, setWorkspaceReady] = useState(false);
    const [startupError, setStartupError] = useState<string | null>(null);
    const view = useStore((s) => s.view);
    const setView = useStore((s) => s.setView);
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const isAuthLoading = useStore((s) => s.auth.isAuthLoading);

    useEffect(() => startLocalPersistence({ onReady: () => setWorkspaceReady(true), onError: setStartupError }), []);
    useEffect(startModifierKeyTracking, []);
    useEffect(startAuthSession, []);

    /* The first view comes from the URL, once it is known whether anyone is
       signed in — `/` and `/home` mean different things either way. A provider
       redirect (?code=…, #access_token=…) decides for itself. */
    const routed = useRef(false);
    useEffect(() => {
        if (isAuthLoading || routed.current) return;
        routed.current = true;
        const url = new URL(window.location.href);
        setView(viewFromAuthRedirect(url) ?? viewFromPath(url.pathname, isAuthenticated));
    }, [isAuthLoading, isAuthenticated, setView]);

    // Keep the address bar in step with the view, and Back working.
    useEffect(() => {
        if (!routed.current) return;
        const path = VIEW_PATHS[view];
        if (window.location.pathname !== path) {
            window.history.pushState({ view }, '', path);
        }
    }, [view]);

    useEffect(() => {
        const onPopState = () => {
            setView(viewFromPath(window.location.pathname, useStore.getState().auth.isAuthenticated));
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [setView]);

    /* The dashboard, reached by someone who signed out in another tab, must
       not sit there showing their cards under their name. */
    useEffect(() => {
        if (isAuthLoading || isAuthenticated) return;
        if (view === 'home') setView('marketing');
    }, [isAuthLoading, isAuthenticated, view, setView]);

    if (!isWorkspaceReady) return <WorkspaceLoading error={startupError} />;

    return (
        <>
            <Suspense fallback={loader}>
                {renderView(view)}
            </Suspense>
            <LimitNoticeModal />
            <GuestReminder />
        </>
    );
}

function renderView(view: AppView) {
    switch (view) {
        case 'canvas':
            return (
                <ReactFlowProvider>
                    <CanvasBoard />
                </ReactFlowProvider>
            );
        case 'home':
            return <HomePage />;
        case 'login':
            return <AuthPage mode="login" />;
        case 'signup':
            return <AuthPage mode="signup" />;
        case 'update-password':
            return <UpdatePasswordPage />;
        case 'profile':
            return <ProfilePage />;
        case 'marketing':
            return <MarketingPage />;
    }
}
