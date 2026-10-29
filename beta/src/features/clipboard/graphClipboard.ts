import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import { type AppNode, getNodeBlocks, getNodeLabel } from '../../types';
import { collectNodeBranch, remapBlockNodeReferences } from '../../store/graphHelpers';
import { blocksToHtml, blocksToPlainText, cloneBlocks, encodePayload, type NodesPayload } from './clipboardPayload';

/** A branch is indivisible: cut deletes descendants, so copy must carry them. */
export function buildGraphClipboard(allNodes: AppNode[], edges: Edge[], selectedIds: Set<string>) {
    const nodes = collectNodeBranch(allNodes, selectedIds);
    if (!nodes.length) return null;
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const roots = nodes.filter(n => !n.parentId || !index.has(n.parentId));
    const minX = Math.min(...roots.map(n => n.position.x));
    const minY = Math.min(...roots.map(n => n.position.y));
    const payload: NodesPayload = {
        v: 1, kind: 'nodes',
        nodes: nodes.map((n, ref) => {
            const parentRef = n.parentId ? index.get(n.parentId) ?? null : null;
            return {
                ref, sourceId: n.id, parentRef, type: n.type || 'note',
                dx: n.position.x - (parentRef === null ? minX : 0),
                dy: n.position.y - (parentRef === null ? minY : 0),
                width: typeof n.style?.width === 'number' ? n.style.width : undefined,
                height: typeof n.style?.height === 'number' ? n.style.height : undefined,
                data: n.data as unknown as Record<string, unknown>,
            };
        }),
        edges: edges.filter(e => index.has(e.source) && index.has(e.target)).map(e => ({
            source: index.get(e.source)!, target: index.get(e.target)!,
            sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, data: e.data,
            parentRef: typeof e.data?.parentId === 'string' ? index.get(e.data.parentId) ?? null : null,
            presentation: {
                label: e.label, style: e.style, labelStyle: e.labelStyle, labelShowBg: e.labelShowBg,
                labelBgStyle: e.labelBgStyle, labelBgPadding: e.labelBgPadding, labelBgBorderRadius: e.labelBgBorderRadius,
                markerStart: e.markerStart, markerEnd: e.markerEnd, animated: e.animated,
            },
        })),
    };
    const text = nodes.map(n => [getNodeLabel(n.data), blocksToPlainText(getNodeBlocks(n.data) ?? [])].filter(Boolean).join('\n')).join('\n\n---\n\n');
    const html = nodes.map(n => blocksToHtml(getNodeBlocks(n.data) ?? [])).join('<hr />');
    return { ...encodePayload(payload, text, html), ids: roots.map(n => n.id), payload };
}

/** Reject malformed identities/trees before changing the graph. Legacy v1 stays valid. */
export function isValidGraphPayload(payload: NodesPayload): boolean {
    if (!Array.isArray(payload.nodes) || !payload.nodes.length || !Array.isArray(payload.edges)) return false;
    if (payload.nodes.some(n => !n || typeof n !== 'object')) return false;
    const byRef = new Map(payload.nodes.map(n => [n?.ref, n]));
    if (byRef.size !== payload.nodes.length) return false;
    const sourceIds = payload.nodes.flatMap(n => n.sourceId ? [n.sourceId] : []);
    if (new Set(sourceIds).size !== sourceIds.length) return false;
    return payload.nodes.every(n => {
        if (!Number.isInteger(n.ref) || !['note', 'block', 'fused-note'].includes(n.type)
            || !Number.isFinite(n.dx) || !Number.isFinite(n.dy) || !n.data || typeof n.data !== 'object'
            || Array.isArray(n.data)) return false;
        const seen = new Set([n.ref]);
        let parent = n.parentRef;
        while (parent != null) {
            if (!byRef.has(parent) || seen.has(parent)) return false;
            seen.add(parent);
            parent = byRef.get(parent)!.parentRef;
        }
        return true;
    }) && payload.edges.every(e => e && byRef.has(e.source) && byRef.has(e.target)
        && (e.parentRef == null || byRef.has(e.parentRef)));
}

export function materializeGraphClipboard(payload: NodesPayload, origin: { x: number; y: number }, currentParentId: string | null) {
    if (!isValidGraphPayload(payload)) return null;
    const ids = new Map(payload.nodes.map(n => [n.ref, uuidv4()]));
    const sourceIds = new Map(payload.nodes.filter(n => n.sourceId).map(n => [n.sourceId!, ids.get(n.ref)!]));
    const nodes: AppNode[] = payload.nodes.map(n => {
        const root = n.parentRef == null;
        const parentId = root ? currentParentId : ids.get(n.parentRef!);
        const data = structuredClone(n.data);
        const blocks = getNodeBlocks(data as never);
        if (blocks) data.content = remapBlockNodeReferences(cloneBlocks(blocks), sourceIds);
        return {
            id: ids.get(n.ref)!, type: n.type, data,
            position: { x: n.dx + (root ? origin.x : 0), y: n.dy + (root ? origin.y : 0) },
            selected: root, ...(parentId ? { parentId } : {}),
            style: { width: n.width, height: n.height },
        } as AppNode;
    });
    const edges: Edge[] = payload.edges.map(e => ({
        ...structuredClone(e.presentation ?? {}), id: uuidv4(), source: ids.get(e.source)!, target: ids.get(e.target)!,
        sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, type: e.type || 'centered', selected: false,
        data: { ...structuredClone(e.data ?? {}), parentId: e.parentRef == null ? currentParentId : ids.get(e.parentRef)! },
    }));
    return { nodes, edges, selectedIds: new Set(nodes.filter(n => n.selected).map(n => n.id)) };
}
