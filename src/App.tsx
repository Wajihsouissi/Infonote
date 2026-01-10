import { ReactFlowProvider } from '@xyflow/react';
import { CanvasBoard } from './features/canvas/CanvasBoard';

function App() {
  return (
    <ReactFlowProvider>
      <CanvasBoard />
    </ReactFlowProvider>
  );
}

export default App;
