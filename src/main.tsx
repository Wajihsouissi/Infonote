import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import '@xyflow/react/dist/style.css';

// Self-hosted fonts
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';

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
