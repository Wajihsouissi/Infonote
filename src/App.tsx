import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { CanvasBoard } from './features/canvas/CanvasBoard';
import { LandingPage } from './features/landing/LandingPage';
import { MarketplacePage } from './features/marketplace/MarketplacePage';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { supabase, isSupabaseConfigured } from './services/supabase/client';

function App() {
  const currentView = useStore((state) => state.currentView);
  const setCurrentView = useStore((state) => state.setCurrentView);
  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
  const isAuthLoading = useStore((state) => state.auth.isAuthLoading);

  // Auto-redirect authenticated users from login/signup views to landing/dashboard
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && (currentView === 'login' || currentView === 'signup')) {
      setCurrentView('landing');
    }
  }, [isAuthLoading, isAuthenticated, currentView, setCurrentView]);

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#090a0f] text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#8b5cf6]/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#06b6d4]/20 blur-[100px] pointer-events-none" />
        <div className="flex flex-col items-center gap-4 z-10">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#8b5cf6]/20 animate-pulse" />
            <Loader2 className="animate-spin text-[#8b5cf6] relative" size={36} />
          </div>
          <span className="text-sm font-semibold tracking-wider uppercase text-purple-200/60 animate-pulse">
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
      case 'admin':
        return <AdminDashboard />;
      case 'canvas':
        return (
          <ReactFlowProvider>
            <CanvasBoard />
          </ReactFlowProvider>
        );
      default:
        return <LandingPage />;
    }
  };

  return (
    <ErrorBoundary>
      {renderContent()}
    </ErrorBoundary>
  );
}

export default App;
