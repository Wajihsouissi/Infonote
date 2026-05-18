import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
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
