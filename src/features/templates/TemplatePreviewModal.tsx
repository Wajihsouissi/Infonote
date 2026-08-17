import { ReactFlow, Background, BackgroundVariant, ReactFlowProvider, type Edge } from '@xyflow/react';
import { NoteCard } from '../card/NoteCard';
import { BlockNode } from '../block/BlockNode';
import { FusedNoteNode } from '../card/FusedNoteNode';
import { CenteredEdge } from '../canvas/CenteredEdge';
import type { AppNode } from '../../types';

const nodeTypes = {
    note: NoteCard,
    block: BlockNode,
    'fused-note': FusedNoteNode
};

const edgeTypes = {
    centered: CenteredEdge,
};

type TemplatePreviewModalProps = {
    nodes: AppNode[];
    edges: Edge[];
    isVisible: boolean;
    name?: string;
    description?: string;
};

export function TemplatePreviewModal({ nodes, edges, isVisible, name, description }: TemplatePreviewModalProps) {
    if (!isVisible) return null;

    // This ReactFlow mounts fresh on each hover and never receives pointer/resize
    // interaction, so its ResizeObserver may not populate node dimensions in time
    // for fitView or the edge layer. Seed explicit width/height/measured from each
    // node's style so React Flow has real bounds synchronously — this makes fitView
    // frame the whole template and lets the connecting edges render.
    const previewNodes = nodes.map((n) => {
        const w = (n.style?.width as number) ?? n.width ?? 300;
        const h = (n.style?.height as number) ?? n.height ?? 200;
        return { ...n, width: w, height: h, measured: { width: w, height: h } };
    }) as AppNode[];

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60vw',
            height: '60vh',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 10000,
            overflow: 'hidden',
            border: '1px solid var(--line-strong)',
            pointerEvents: 'none', // strictly visual
            animation: 'fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <style>{`
                @keyframes fadeInScale {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `}</style>
            {name && (
                <div style={{
                    position: 'absolute',
                    top: 14,
                    left: 16,
                    right: 16,
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    pointerEvents: 'none',
                }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--text-faint)',
                    }}>Preview</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>{name}</span>
                    {description && (
                        <span style={{
                            fontSize: 12,
                            color: 'var(--text-soft)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{description}</span>
                    )}
                </div>
            )}
            {/* Keyed per template so each hover mounts a fresh instance — this
                guarantees fitView re-runs (and the edge layer re-measures) for
                the newly shown template instead of reusing a stale viewport. */}
            <ReactFlowProvider key={name || 'preview'}>
                <ReactFlow
                    nodes={previewNodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.18 }}
                    onInit={(instance) => {
                        // Nodes may not be measured on the first init tick; refit
                        // on the next frames so the whole template is framed.
                        requestAnimationFrame(() => instance.fitView({ padding: 0.18 }));
                        setTimeout(() => instance.fitView({ padding: 0.18 }), 120);
                    }}
                    panOnDrag={false}
                    zoomOnScroll={false}
                    zoomOnPinch={false}
                    zoomOnDoubleClick={false}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--line-strong)" />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
