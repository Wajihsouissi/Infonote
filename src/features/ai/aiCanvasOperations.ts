import type { Edge } from '@xyflow/react';
import { generateText } from '../../services/aiService';
import type { AppNode } from '../../types';
import { getNodeBlocks } from '../../types';
import { nodeTitle } from './canvasContext';

export type CanvasCluster = {
    id: string;
    title: string;
    nodeIds: string[];
};

export type CanvasConnection = {
    source: string;
    target: string;
    label?: string;
    confidence: number;
};

/** A reviewable, reversible operation. It contains positions and edge deltas,
 * never content edits or new cards. */
export type CanvasOrganizationProposal = {
    query: string;
    clusters: CanvasCluster[];
    connections: CanvasConnection[];
    positions: Record<string, { x: number; y: number }>;
    removeEdgeIds: string[];
    summary: string;
};

type ModelPlan = {
    clusters?: Array<{ title?: unknown; cards?: unknown }>;
    connections?: Array<{ source?: unknown; target?: unknown; label?: unknown; confidence?: unknown }>;
    replaceConnections?: unknown;
};

const excerpt = (node: AppNode) => (getNodeBlocks(node.data) ?? [])
    .map((block) => typeof block.content === 'string' ? block.content : '')
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

function parseJson(text: string): ModelPlan | null {
    const match = /\{[\s\S]*\}/.exec(text.replace(/```(?:json)?/gi, ''));
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === 'object' ? parsed as ModelPlan : null;
    } catch {
        return null;
    }
}

function nodeSize(node: AppNode) {
    const width = node.measured?.width ?? (typeof node.style?.width === 'number' ? node.style.width : 300);
    const height = node.measured?.height ?? (typeof node.style?.height === 'number' ? node.style.height : 190);
    return { width: Math.min(Math.max(width, 220), 420), height: Math.min(Math.max(height, 120), 320) };
}

function layoutClusters(nodes: AppNode[], clusters: CanvasCluster[]): Record<string, { x: number; y: number }> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const bounds = nodes.reduce((current, node) => ({
        minX: Math.min(current.minX, node.position.x),
        minY: Math.min(current.minY, node.position.y),
        maxX: Math.max(current.maxX, node.position.x + nodeSize(node).width),
        maxY: Math.max(current.maxY, node.position.y + nodeSize(node).height),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const originX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
    const originY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
    const positions: Record<string, { x: number; y: number }> = {};
    const columns = clusters.length > 4 ? 3 : 2;
    const columnY = Array.from({ length: columns }, () => originY);
    const columnWidth = 720;
    const cardXGap = 32;
    const cardYGap = 56;

    clusters.forEach((cluster, clusterIndex) => {
        const column = clusterIndex % columns;
        const x = originX + column * columnWidth;
        let y = columnY[column];
        const rows = new Map<number, number>();
        cluster.nodeIds.forEach((id, index) => {
            const node = byId.get(id);
            if (!node) return;
            const size = nodeSize(node);
            const col = index % 2;
            const row = Math.floor(index / 2);
            positions[id] = { x: Math.round(x + col * (320 + cardXGap)), y: Math.round(y) };
            rows.set(row, Math.max(rows.get(row) ?? 0, size.height));
            if (col === 1 || index === cluster.nodeIds.length - 1) {
                y += (rows.get(row) ?? size.height) + cardYGap;
            }
        });
        columnY[column] = y + 88;
    });
    return positions;
}

/** Build the proposal, but intentionally do not mutate the canvas. */
export async function planCanvasOrganization(
    query: string,
    nodes: AppNode[],
    existingEdges: Edge[],
    options: { model?: string | null; conversation?: string } = {},
): Promise<CanvasOrganizationProposal> {
    if (nodes.length < 2) throw new Error('Add at least two cards before organizing this canvas.');
    const refs = new Map(nodes.map((node, index) => [`C${index + 1}`, node.id]));
    const cards = nodes.map((node, index) => {
        const ref = `C${index + 1}`;
        return `[${ref}] ${nodeTitle(node)}${excerpt(node) ? ` — ${excerpt(node)}` : ''}`;
    }).join('\n');
    const system = `You organise an existing canvas. Return a safe PLAN only: do not propose new cards, delete cards, edit card content, or invent ids.

Group every listed card into 2-6 clear clusters. Then propose only high-confidence directional connections between cards that express a useful relationship. Prefer fewer connections. Set replaceConnections true only when existing links would be misleading.

Respond ONLY with JSON:
{"clusters":[{"title":"...","cards":["C1","C2"]}],"connections":[{"source":"C1","target":"C2","label":"optional short relation","confidence":0.82}],"replaceConnections":false}`;
    const prompt = `Request: ${query}\n\nCards on this canvas:\n${cards}${options.conversation ? `\n\nConversation context:\n${options.conversation.slice(-2400)}` : ''}`;
    const plan = parseJson(await generateText(prompt, { system, model: options.model, maxTokensOverride: 1200 }));
    if (!plan?.clusters || !Array.isArray(plan.clusters)) throw new Error('I could not make a reliable organization plan. Try again with a more specific goal.');

    const seen = new Set<string>();
    const clusters: CanvasCluster[] = [];
    plan.clusters.slice(0, 6).forEach((cluster, index) => {
        if (!cluster || typeof cluster !== 'object') return;
        const ids: string[] = [];
        if (Array.isArray(cluster.cards)) {
            for (const ref of cluster.cards) {
                const id = typeof ref === 'string' ? refs.get(ref) : undefined;
                if (id && !seen.has(id)) ids.push(id);
            }
        }
        ids.forEach((id) => seen.add(id));
        if (!ids.length) return;
        clusters.push({
            id: `cluster-${index + 1}`,
            title: typeof cluster.title === 'string' && cluster.title.trim() ? cluster.title.trim().slice(0, 64) : 'Related cards',
            nodeIds: ids,
        });
    });
    const remaining = nodes.filter((node) => !seen.has(node.id)).map((node) => node.id);
    if (remaining.length) clusters.push({ id: 'cluster-other', title: 'Other related cards', nodeIds: remaining });
    if (!clusters.length) throw new Error('I could not find safe card groups to apply.');

    const active = new Set(nodes.map((node) => node.id));
    const connected = new Set<string>();
    const connections: CanvasConnection[] = [];
    if (Array.isArray(plan.connections)) {
        for (const link of plan.connections.slice(0, Math.max(3, nodes.length))) {
            if (!link || typeof link !== 'object') continue;
            const source = typeof link.source === 'string' ? refs.get(link.source) : undefined;
            const target = typeof link.target === 'string' ? refs.get(link.target) : undefined;
            const confidence = typeof link.confidence === 'number' ? link.confidence : 0;
            const key = source && target ? `${source}:${target}` : '';
            if (!source || !target || source === target || !active.has(source) || !active.has(target) || confidence < 0.7 || connected.has(key)) continue;
            connected.add(key);
            connections.push({ source, target, confidence, ...(typeof link.label === 'string' && link.label.trim() ? { label: link.label.trim().slice(0, 60) } : {}) });
        }
    }
    const replaceConnections = plan.replaceConnections === true;
    const removeEdgeIds = replaceConnections
        ? existingEdges.filter((edge) => active.has(edge.source) && active.has(edge.target)).map((edge) => edge.id)
        : [];
    const positions = layoutClusters(nodes, clusters);
    return {
        query,
        clusters,
        connections,
        positions,
        removeEdgeIds,
        summary: `${nodes.length} cards · ${clusters.length} clusters · ${connections.length} high-confidence connection${connections.length === 1 ? '' : 's'}`,
    };
}
