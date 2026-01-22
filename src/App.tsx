import { ReactFlowProvider } from '@xyflow/react';
import { CanvasBoard } from './features/canvas/CanvasBoard';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <CanvasBoard />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}

export default App;
