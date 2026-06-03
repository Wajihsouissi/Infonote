import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { CanvasBoard } from './features/canvas/CanvasBoard';
import { LandingPage } from './features/landing/LandingPage';
import { MarketingPage } from './The-website/MarketingPage';
import { MarketplacePage } from './features/marketplace/MarketplacePage';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { ProfilePage } from './features/auth/ProfilePage';
import { UpdatePasswordPage } from './features/auth/UpdatePasswordPage';
import AdminGate from './features/admin/AdminGate';
import { WelcomeModal } from './features/auth/WelcomeModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { supabase, isSupabaseConfigured } from './services/supabase/client';

function App() {
  const currentView = useStore((state) => state.currentView);
  const setCurrentView = useStore((state) => state.setCurrentView);
  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
  const isAuthLoading = useStore((state) => state.auth.isAuthLoading);
  const showWelcomeModal = useStore((state) => state.showWelcomeModal);
  const setShowWelcomeModal = useStore((state) => state.setShowWelcomeModal);

  // URL-based route detection (e.g. direct navigation to /wajihadmin)
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/wajihadmin') {
      setCurrentView('wajihadmin');
    } else if (path.includes('admin')) {
      setCurrentView('not-found');
    } else if (path === '/profile') {
      setCurrentView('profile');
    } else if (path === '/canvas') {
      setCurrentView('canvas');
    } else if (path === '/login') {
      setCurrentView('login');
    } else if (path === '/signup') {
      setCurrentView('signup');
    } else if (path === '/update-password') {
      setCurrentView('update-password');
    }
  }, [setCurrentView]);

  // Auto-redirect authenticated users from login/signup/marketing views to landing/dashboard
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && (currentView === 'login' || currentView === 'signup' || currentView === 'marketing')) {
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
            'If you used Google or Facebook, make sure the provider is enabled ' +
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
      {renderContent()}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => {
          setShowWelcomeModal(false);
          setCurrentView('canvas');
        }}
      />
    </ErrorBoundary>
  );
}

export default App;
