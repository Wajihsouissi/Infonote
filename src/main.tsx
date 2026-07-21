import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/design-system.css' // global design tokens — must load first
import './styles/index.css'
import '@xyflow/react/dist/style.css';

// Self-hosted fonts
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';
import { initErrorTelemetry } from './services/errorTelemetry';

initErrorTelemetry();

// Prevent default browser zoom via keyboard (Ctrl +/-, Cmd +/-)
document.addEventListener(
  'keydown',
  (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')
    ) {
      e.preventDefault();
    }
  },
  { passive: false, capture: true }
);

// Prevent default browser zoom via mouse wheel and trackpad pinch (Windows/Chrome/Edge)
document.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  },
  { passive: false, capture: true }
);

// Prevent default browser zoom via trackpad pinch (Safari/macOS)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, capture: true });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false, capture: true });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false, capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
