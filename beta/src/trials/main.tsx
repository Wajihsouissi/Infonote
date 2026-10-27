import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodesInitialized, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '../styles/design-system.css';
import './trial.css';
import { CanvasBoard } from '../features/canvas/board/CanvasBoard';
import { useStore } from '../store/useStore';
import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';

// This entry does not mount App, so local workspace hydration and autosave never start.
// The fixture is the only source of graph data. Remove it and reload to clear the trial.
const files = import.meta.glob('../../../trials/canvas-recreation.json', {
    query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const raw = Object.values(files)[0];

export function FitTrialView() {
    const { fitView } = useReactFlow();
    const nodesReady = useNodesInitialized();
    useEffect(() => {
        if (nodesReady) void fitView({ padding: 0.08, maxZoom: 0.85, duration: 0 });
    }, [fitView, nodesReady]);
    return null;
}

export function TrialCanvas() {
    if (!raw) return <main style={{ padding: 32 }}>Trial data file removed.</main>;
    try {
        const graph = JSON.parse(raw) as { nodes: AppNode[]; edges: Edge[] };
        if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Invalid trial graph');
        useStore.getState().loadGraph(graph.nodes, graph.edges);
        useStore.setState({ currentParentId: null, view: 'canvas', theme: 'light', isTOCOpen: false });
        document.documentElement.setAttribute('data-theme', 'light');
    } catch {
        return <main style={{ padding: 32 }}>Trial JSON could not be read.</main>;
    }
    return <>
        <ReactFlowProvider><CanvasBoard /><FitTrialView /></ReactFlowProvider>
        <div style={{ position: 'fixed', right: 20, top: 12, zIndex: 2000, padding: '7px 11px',
            borderRadius: 9, background: '#163b35', color: '#fff', font: '12px Outfit, sans-serif',
            pointerEvents: 'none', boxShadow: '0 2px 12px #0002' }}>
            Medical study trial · memory only
        </div>
    </>;
}

createRoot(document.getElementById('root')!).render(
    <StrictMode><TrialCanvas /></StrictMode>,
);
