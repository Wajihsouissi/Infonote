import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import type { AppNode, CanvasEdgeData } from '../../../../types';

const withClass = (className: string, token: string, on: boolean) => (on ? `${className} ${token}`.trim() : className);

/**
 * What React Flow is handed to draw: the visible nodes with their state
 * classes, and only the edges that belong to this canvas.
 */
export function useRenderedGraph(
    visibleNodes: AppNode[],
    edges: Edge[],
    currentParentId: string | null,
    isLinkingMode: boolean,
) {
    // State classes for CSS: `is-selected`, `is-linking-mode`. A node keeps its
    // identity when nothing changed, so React Flow does not re-render it.
    const nodes = useMemo(() => visibleNodes.map((node) => {
        const base = node.className || '';
        let next = base.replace(/\bis-selected\b|\bis-linking-mode\b/g, '').replace(/\s+/g, ' ').trim();
        next = withClass(next, 'is-selected', Boolean(node.selected));
        next = withClass(next, 'is-linking-mode', isLinkingMode);
        return next === base ? node : { ...node, className: next };
    }), [visibleNodes, isLinkingMode]);

    /* An edge shows when both ends are visible and it was made on this canvas
       (`data.parentId`), so connections inside a nested canvas never bleed into
       its parent. Keyed on node membership, not positions: a drag moves nodes
       every frame without changing which edges are visible. */
    const visibleNodeIdKey = useMemo(() => visibleNodes.map((node) => node.id).join('\u0000'), [visibleNodes]);
    const visibleEdges = useMemo(() => {
        const ids = new Set(visibleNodeIdKey ? visibleNodeIdKey.split('\u0000') : []);
        const activeParent = currentParentId ?? null;
        return edges.filter((e) => ids.has(e.source) && ids.has(e.target)
            && ((e.data as CanvasEdgeData | undefined)?.parentId ?? null) === activeParent);
    }, [edges, visibleNodeIdKey, currentParentId]);

    return { nodes, edges: visibleEdges };
}
