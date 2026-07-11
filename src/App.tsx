import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { WelcomeModal } from './features/auth/WelcomeModal';
import { LimitNoticeModal } from './features/ui/LimitNoticeModal';
import { CanvasLimitBadge } from './features/ui/CanvasLimitBadge';
import { AnonSaveReminder } from './features/ui/AnonSaveReminder';
import { StorageChoiceModal } from './features/ui/StorageChoiceModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import type { AppView } from './store/types';
import { supabase, isSupabaseConfigured } from './services/supabase/client';
import { acceptWorkspaceInvitation, activateWorkspace } from './services/collaboration';

// Top-level views are lazy so the marketing page doesn't pay for the whole
// canvas/editor bundle (and vice versa). Vite splits each into its own chunk.
const CanvasBoard = lazy(() => import('./features/canvas/CanvasBoard').then(m => ({ default: m.CanvasBoard })));
const LandingPage = lazy(() => import('./features/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const MarketingPage = lazy(() => import('./The-website/MarketingPage').then(m => ({ default: m.MarketingPage })));
const MarketplacePage = lazy(() => import('./features/marketplace/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./features/auth/SignupPage').then(m => ({ default: m.SignupPage })));
const ProfilePage = lazy(() => import('./features/auth/ProfilePage').then(m => ({ default: m.ProfilePage })));
const UpdatePasswordPage = lazy(() => import('./features/auth/UpdatePasswordPage').then(m => ({ default: m.UpdatePasswordPage })));
const AdminGate = lazy(() => import('./features/admin/AdminGate'));

const PENDING_INVITE_KEY = 'infonote.pendingWorkspaceInvitationId';
const INVITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE_PATH_RE = /^\/invite\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

// Canonical URL for each view. 'landing' and 'marketing' share '/' (which one
// renders there depends on auth); 'not-found' keeps whatever path caused it.
const VIEW_PATHS: Partial<Record<AppView, string>> = {
  landing: '/',
  marketing: '/',
  canvas: '/canvas',
  marketplace: '/marketplace',
  login: '/login',
  signup: '/signup',
  profile: '/profile',
  'update-password': '/update-password',
  wajihadmin: '/wajihadmin',
};

function viewFromPath(rawPath: string, isAuthenticated: boolean): AppView {
  const path = rawPath.replace(/\/+$/, '') || '/';
  if (path === '/') return isAuthenticated ? 'landing' : 'marketing';
  if (path === '/wajihadmin') return 'wajihadmin';
  if (path.includes('admin')) return 'not-found';
  if (path === '/profile') return 'profile';
  if (path === '/canvas') return 'canvas';
  if (path === '/marketplace') return 'marketplace';
  if (path === '/login') return 'login';
  if (path === '/signup') return 'signup';
  if (path === '/update-password') return 'update-password';
  return isAuthenticated ? 'landing' : 'marketing';
}

const viewLoader = (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', width: '100%', backgroundColor: '#090a0f',
  }}>
    <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#8b5cf6' }} size={32} />
  </div>
);

function App() {
  const currentView = useStore((state) => state.currentView);
  const setCurrentView = useStore((state) => state.setCurrentView);
  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
  const isAuthLoading = useStore((state) => state.auth.isAuthLoading);
  const authUserId = useStore((state) => state.auth.userId);
  const showWelcomeModal = useStore((state) => state.showWelcomeModal);
  const setShowWelcomeModal = useStore((state) => state.setShowWelcomeModal);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const isFirstViewSync = useRef(true);
  const historyOpRef = useRef<'push' | 'replace'>('push');

  // URL-based route detection (e.g. direct navigation to /wajihadmin)
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    const invitePathMatch = INVITE_PATH_RE.exec(path);
    const workspaceInviteId = params.get('workspaceInvite') || params.get('invite') || invitePathMatch?.[1] || null;

    if (workspaceInviteId && INVITE_ID_RE.test(workspaceInviteId)) {
      sessionStorage.setItem(PENDING_INVITE_KEY, workspaceInviteId);
      params.delete('workspaceInvite');
      params.delete('invite');
      const nextSearch = params.toString();
      const nextPath = invitePathMatch ? '/canvas' : window.location.pathname;
      const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    } else if (workspaceInviteId) {
      window.setTimeout(() => {
        setInviteBanner('This workspace invitation link is invalid.');
      }, 0);
    }

    if (path !== '/') {
      const { auth } = useStore.getState();
      setCurrentView(viewFromPath(path, auth.isAuthenticated));
    }
  }, [setCurrentView]);

  // History integration: keep the URL in sync with the current view and make
  // the browser Back/Forward buttons navigate between views.
  useEffect(() => {
    // Skip the very first run: the initial view comes FROM the URL, and this
    // effect can observe the pre-parse view for one render.
    if (isFirstViewSync.current) {
      isFirstViewSync.current = false;
      return;
    }
    const op = historyOpRef.current;
    historyOpRef.current = 'push';

    const targetPath = VIEW_PATHS[currentView];
    // Only touch the URL when the path actually differs — this preserves
    // query strings and hashes (OAuth codes, recovery tokens) on the view
    // that consumed them.
    if (targetPath && window.location.pathname !== targetPath) {
      if (op === 'replace') {
        window.history.replaceState({ view: currentView }, '', targetPath);
      } else {
        window.history.pushState({ view: currentView }, '', targetPath);
      }
    }
  }, [currentView]);

  useEffect(() => {
    const handlePopState = () => {
      const { auth } = useStore.getState();
      setCurrentView(viewFromPath(window.location.pathname, auth.isAuthenticated));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setCurrentView]);

  useEffect(() => {
    if (typeof window === 'undefined' || isAuthLoading) return;

    const invitationId = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!invitationId) return;

    if (!isAuthenticated || !authUserId) {
      setCurrentView('login');
      return;
    }

    let cancelled = false;
    const bannerTimer = window.setTimeout(() => {
      if (!cancelled) setInviteBanner('Accepting workspace invitation...');
    }, 0);
    setCurrentView('canvas');

    acceptWorkspaceInvitation(invitationId)
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setInviteBanner(result.error);
          return;
        }

        sessionStorage.removeItem(PENDING_INVITE_KEY);
        const activation = await activateWorkspace(authUserId, result.data.workspaceId);
        if (cancelled) return;
        if (!activation.ok) {
          setInviteBanner(`Invitation accepted, but the shared canvas could not be loaded: ${activation.error}`);
          return;
        }

        setCurrentView('canvas');
        window.history.replaceState({}, '', '/canvas');
        setInviteBanner('Invitation accepted. Opening shared canvas...');
      })
      .catch((error) => {
        if (!cancelled) {
          setInviteBanner(error instanceof Error ? error.message : 'Invitation could not be accepted.');
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(bannerTimer);
    };
  }, [authUserId, isAuthLoading, isAuthenticated, setCurrentView]);

  // Auto-redirect authenticated users from login/signup/marketing views to landing/dashboard
  useEffect(() => {
    const hasPendingInvite =
      typeof window !== 'undefined' &&
      Boolean(sessionStorage.getItem(PENDING_INVITE_KEY));
    if (hasPendingInvite) return;

    if (!isAuthLoading && isAuthenticated && (currentView === 'login' || currentView === 'signup' || currentView === 'marketing')) {
      // Replace instead of push: this is a bounce, not a navigation. Pushing
      // would trap the Back button in a login -> landing loop.
      historyOpRef.current = 'replace';
      setCurrentView('landing');
    }
  }, [isAuthLoading, isAuthenticated, currentView, setCurrentView]);

  /**
   * OAuth callback error capture.
   *
   * When Google (or any provider) bounces the user back to our origin with
   * `?error=...&error_description=...` it means the handshake failed at the
   * provider/Supabase layer (e.g. provider not enabled, redirect URL not
   * allow-listed). Surface that to the user via console + an alert so they
   * stop staring at a blank page.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const err = params.get('error') || hashParams.get('error');
    const errDesc =
      params.get('error_description') || hashParams.get('error_description');
    if (err) {
      console.error('[OAuth] callback error:', err, errDesc);
      // Strip the error params from the URL so a refresh doesn't replay them.
      window.history.replaceState({}, '', window.location.pathname);
      // Send the user to the login screen and show the message.
      setCurrentView('login');
      // Defer alert so React has time to mount the login view.
      setTimeout(() => {
        window.alert(
          `Sign-in failed: ${errDesc || err}\n\n` +
            'If you used Google, make sure the provider is enabled ' +
            'in your Supabase Dashboard \u2192 Authentication \u2192 Providers and ' +
            'that this URL is in the Redirect URLs allow-list.'
        );
      }, 0);
    }
  }, [setCurrentView]);

  /**
   * Root-level auth session hydration.
   *
   * AuthProvider already maintains a live onAuthStateChange subscription.
   * This effect acts as a redundant safety net: on first mount it pulls the
   * persisted session from localStorage and immediately hydrates the Zustand
   * auth slice so the UI knows the user is still logged in after a refresh.
   */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null } | null } }) => {
      if (cancelled) return;
      const sessionUser = data.session?.user ?? null;
      if (sessionUser) {
        const { setAuthUser } = useStore.getState();
        setAuthUser({
          id: sessionUser.id,
          email: sessionUser.email ?? null,
          displayName:
            (sessionUser.user_metadata?.display_name as string | undefined) ??
            (sessionUser.user_metadata?.full_name as string | undefined) ??
            null,
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (isAuthLoading) {
    return (
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh', 
          width: '100%',
          backgroundColor: '#090a0f', 
          color: 'white', 
          position: 'relative', 
          overflow: 'hidden' 
        }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#8b5cf6]/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#06b6d4]/20 blur-[100px] pointer-events-none" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', zIndex: 10 }}>
          <div style={{ position: 'relative', width: '4rem', height: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(139, 92, 246, 0.2)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            <Loader2 style={{ animation: 'spin 1s linear infinite', position: 'relative', color: '#8b5cf6' }} size={36} />
          </div>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(233, 213, 255, 0.6)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            Syncing Secure Session...
          </span>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'landing':
        return <LandingPage />;
      case 'marketplace':
        return <MarketplacePage />;
      case 'login':
        return <LoginPage />;
      case 'signup':
        return <SignupPage />;
      case 'wajihadmin':
        return <AdminGate />;
      case 'profile':
        return <ProfilePage />;
      case 'update-password':
        return <UpdatePasswordPage />;
      case 'not-found':
        return (
          <div className="min-h-screen flex items-center justify-center bg-[#090a0f] text-white">
            <div className="text-center">
              <h1 className="text-3xl font-semibold mb-2">404</h1>
              <p className="text-white/60">Page not found.</p>
            </div>
          </div>
        );
      case 'marketing':
        return <MarketingPage />;
      case 'canvas':
        return (
          <ReactFlowProvider>
            <CanvasBoard />
          </ReactFlowProvider>
        );
      default:
        return isAuthenticated ? <LandingPage /> : <MarketingPage />;
    }
  };

  return (
    <ErrorBoundary>
      <Suspense fallback={viewLoader}>
        {renderContent()}
      </Suspense>
      {inviteBanner && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            zIndex: 11000,
            maxWidth: 'min(520px, calc(100vw - 32px))',
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(17, 24, 39, 0.94)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }}
        >
          {inviteBanner}
        </div>
      )}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => {
          setShowWelcomeModal(false);
          setCurrentView('canvas');
        }}
      />
      <LimitNoticeModal />
      <CanvasLimitBadge />
      <AnonSaveReminder />
      <StorageChoiceModal />
    </ErrorBoundary>
  );
}

export default App;
