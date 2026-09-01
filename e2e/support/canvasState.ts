import type { Page } from '@playwright/test';

/**
 * State oracle for canvas scenarios.
 *
 * The app exposes its real Zustand instance in development for QA. Reading it
 * gives tests an authoritative view without reintroducing a hidden IndexedDB
 * persistence layer merely to observe test state.
 */

export interface CanvasStateNode {
    id: string;
    type?: string;
    parentId?: string | null;
    position?: { x: number; y: number };
    style?: { width?: number; height?: number };
    measured?: { width?: number; height?: number };
    data?: {
        label?: string | null;
        content?: unknown;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        metadata?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

export interface CanvasStateEdge {
    id: string;
    source: string;
    target: string;
    [key: string]: unknown;
}

export interface CanvasState {
    nodes: CanvasStateNode[];
    edges: CanvasStateEdge[];
    observedAt: number;
}

type AppStore = {
    getState: () => {
        nodes: CanvasStateNode[];
        edges: CanvasStateEdge[];
        loadGraph: (nodes: CanvasStateNode[], edges: CanvasStateEdge[]) => void;
    };
};

/** Reads the canvas currently held by the application, or null before it boots. */
export async function readCanvasState(page: Page): Promise<CanvasState | null> {
    return page.evaluate(() => {
        const store = (window as unknown as { __appStore?: AppStore }).__appStore;
        if (!store) return null;
        const { nodes, edges } = store.getState();
        return { nodes, edges, observedAt: Date.now() };
    }) as Promise<CanvasState | null>;
}

/** Loads a canvas directly through the product's graph-loading path. */
export async function seedCanvasState(page: Page, nodes: CanvasStateNode[], edges: CanvasStateEdge[] = []): Promise<void> {
    await page.waitForFunction(() => Boolean((window as unknown as { __appStore?: AppStore }).__appStore));
    await page.evaluate(({ nodes: nextNodes, edges: nextEdges }) => {
        const store = (window as unknown as { __appStore?: AppStore }).__appStore;
        store?.getState().loadGraph(nextNodes, nextEdges);
    }, { nodes, edges });
}

/** Builds `count` plain note cards laid out on a grid, ready for loading. */
export function makeCards(count: number, prefix = 'Seeded'): CanvasStateNode[] {
    const COLUMNS = 8;
    return Array.from({ length: count }, (_, i) => ({
        id: `seed-${i}`,
        type: 'note',
        position: { x: (i % COLUMNS) * 500, y: Math.floor(i / COLUMNS) * 500 },
        style: { width: 432, height: 432 },
        data: {
            label: `${prefix} ${i}`,
            content: [{ id: `seed-block-${i}`, type: 'text', content: `Body of card ${i}` }],
            viewMode: 'expanded',
            icon: 'FileText',
        },
    }));
}

/** Polls live state until `predicate` holds, with an actionable failure. */
export async function waitForCanvasState(
    page: Page,
    predicate: (state: CanvasState) => boolean,
    what = 'condition',
    timeout = 15_000,
): Promise<CanvasState> {
    const deadline = Date.now() + timeout;
    let last: CanvasState | null = null;
    while (Date.now() < deadline) {
        last = await readCanvasState(page);
        if (last && predicate(last)) return last;
        await page.waitForTimeout(100);
    }
    throw new Error(
        `Timed out waiting for canvas state ${what}. Last state: ` +
        (last
            ? `${last.nodes.length} nodes / ${last.edges.length} edges — ` +
              JSON.stringify(last.nodes.map((node) => ({ id: node.id.slice(0, 8), type: node.type, label: node.data?.label })))
            : 'app store unavailable'),
    );
}

/** Cards only — the app counts `note` nodes against the anonymous quota. */
export const cards = (state: CanvasState): CanvasStateNode[] =>
    state.nodes.filter((node) => node.type === 'note');

/** Nodes living on one canvas (root canvas = `null` parent). */
export const nodesOnCanvas = (state: CanvasState, parentId: string | null = null): CanvasStateNode[] =>
    state.nodes.filter((node) => (node.parentId ?? null) === parentId);

export const nodeByLabel = (state: CanvasState, label: string): CanvasStateNode | undefined =>
    state.nodes.find((node) => node.data?.label === label);

/** Every scrap of text a node carries, flattened for content assertions. */
export function nodeText(node: CanvasStateNode): string {
    const out: string[] = [];
    const walk = (value: unknown) => {
        if (typeof value === 'string') out.push(value);
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(node.data);
    return out.join('\n');
}
