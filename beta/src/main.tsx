import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/design-system.css'; // global design tokens — must load first
import '@xyflow/react/dist/style.css';

// Self-hosted fonts
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startErrorReports } from './services/errorReports';

/* The canvas owns zoom. The browser's own page zoom (Ctrl +/-, Ctrl+wheel,
   trackpad pinch) would scale the whole UI instead, so it is suppressed. */
const blockPageZoomKeys = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_'].includes(e.key)) e.preventDefault();
};
const blockPageZoomWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
};
const blockGesture = (e: Event) => e.preventDefault();

const capture = { passive: false, capture: true } as const;
document.addEventListener('keydown', blockPageZoomKeys, capture);
document.addEventListener('wheel', blockPageZoomWheel, capture);
// Safari/macOS pinch
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, blockGesture, capture);
}

// Before the app mounts: a crash while it is starting is the one worth having.
startErrorReports();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>,
);
