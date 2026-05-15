import { ReactFlowProvider } from '@xyflow/react';
import { CanvasBoard } from './features/canvas/CanvasBoard';
import { LandingPage } from './features/landing/LandingPage';
import { MarketplacePage } from './features/marketplace/MarketplacePage';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';

function App() {
  const currentView = useStore((state) => state.currentView);

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
