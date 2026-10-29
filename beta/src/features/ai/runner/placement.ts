import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import type { AppState } from '../../../store/types';
import type { AppNode } from '../../../types';
import { findNonOverlappingPosition } from '../../../utils/findNonOverlappingPosition';
import { GRID_GAP, snapToGridValue } from '../../../config/layout';
import { parseAIContent } from '../../editor/text/aiMarkdown';
import type { AIStructuredAction } from '../../../services/ai/types';
import { layoutClusteredMindmap, layoutMindmap } from './mindmapLayout';
import { DOC_SIZE, NOTE_SIZE, stampProvenance, type RunnerContext } from './context';

/** What placement created. */
export interface PlacedArtifact {
    ids: string[];
    label: string;
}

/**
 * The footprint an action will occupy, so the batch packer can reserve room for
 * it. A mind map dwarfs a card — reserving NOTE_SIZE for one would drop the
 * next action straight on top of it.
 */
export function sizeFor(action: AIStructuredAction, mindmapLayout: RunnerContext['mindmapLayout'] = 'tree') {
    if (action.type === 'fused-note') return DOC_SIZE;

    if (action.type === 'mindmap') {
        // Measured from the real layout rather than estimated, so the reserved
        // rectangle is exactly what gets drawn. A radial guess reserved a
        // square around a radius the tree never filled, which both wasted space
        // and let the next action land inside the map's actual spread.
        const { width, height } = (mindmapLayout === 'clustered' ? layoutClusteredMindmap : layoutMindmap)(action.nodes ?? []);
        return width > 0 ? { width, height } : NOTE_SIZE;
    }

    return NOTE_SIZE;
}

/** Does this rectangle touch anything already on the current canvas level? */
function rectIsFree(x: number, y: number, w: number, h: number, currentParentId: string | null): boolean {
    const PADDING = 20;
    return !useStore.getState().nodes
        .filter((n) => (n.parentId ?? null) === currentParentId)
        .some((n) => {
            const nw = n.measured?.width ?? (n.style?.width as number | undefined) ?? 300;
            const nh = n.measured?.height ?? (n.style?.height as number | undefined) ?? 120;
            return !(x + w + PADDING < n.position.x || x - PADDING > n.position.x + nw
                || y + h + PADDING < n.position.y || y - PADDING > n.position.y + nh);
        });
}

/**
 * Find room for a whole batch at once.
 *
 * findNonOverlappingPosition ignores its `center` argument whenever a viewport
 * is supplied — it anchors on the screen centre and spirals outward. Called once
 * per card, that scatters a six-part plan into a ring, which destroys the one
 * thing a plan has: its order. So the batch claims a single rectangle and each
 * card is placed at an exact offset inside it, left to right, top to bottom.
 */
export function findBlockOrigin(blockW: number, blockH: number, ctx: RunnerContext): { x: number; y: number } {
    const { x: vpX, y: vpY, zoom, screenW, screenH } = ctx.viewport();
    const flowLeft = -vpX / zoom;
    const flowTop = -vpY / zoom;

    const x = snapToGridValue(flowLeft + screenW / zoom / 2 - blockW / 2);
    let y = snapToGridValue(flowTop + screenH / zoom / 2 - blockH / 2);

    // Slide the block down past whatever is already there, rather than breaking
    // it apart to fill gaps.
    for (let attempt = 0; attempt < 40; attempt++) {
        if (rectIsFree(x, y, blockW, blockH, ctx.currentParentId)) return { x, y };
        y = snapToGridValue(y + blockH + GRID_GAP);
    }
    return { x, y };
}

/** A card the AI made, with the marks that say so. */
function aiNoteData(title: string, markdown: string) {
    const blocks = parseAIContent(markdown);
    return {
        label: title,
        content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: markdown }],
        viewMode: 'expanded' as const,
        icon: 'Sparkles',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/** Place one structured action at `position`. Returns the ids it created. */
export function placeAction(action: AIStructuredAction, position: { x: number; y: number }, ctx: RunnerContext): PlacedArtifact {
    const { addNode } = useStore.getState();
    const size = sizeFor(action, ctx.mindmapLayout);

    if (action.type === 'note') {
        const id = uuidv4();
        addNode('note', position, aiNoteData(action.title, action.content || ''), size, ctx.currentParentId || undefined, id);
        return { ids: [id], label: `Card “${action.title}”` };
    }

    if (action.type === 'fused-note') {
        const id = uuidv4();
        const markdown = `# ${action.title}\n\n${action.content || ''}`;
        const blocks = parseAIContent(markdown);
        addNode(
            'fused-note',
            position,
            { content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: markdown }] },
            size,
            ctx.currentParentId || undefined,
            id,
        );
        return { ids: [id], label: `Document “${action.title}”` };
    }

    // Mindmap: a tree of standalone blocks in a tidy two-sided layout.
    if (!action.nodes || action.nodes.length === 0) return { ids: [], label: '' };

    const newNodes: AppNode[] = [];
    const newEdges: Edge[] = [];
    const { placements } = (ctx.mindmapLayout === 'clustered' ? layoutClusteredMindmap : layoutMindmap)(action.nodes);

    // The model's ids are arbitrary strings; remap so two mindmaps in one
    // session can't collide on the canvas.
    const idMap = new Map(action.nodes.map((n) => [n.id, uuidv4()]));
    const labelOf = new Map(action.nodes.map((n) => [n.id, n.label]));

    for (const placement of placements) {
        const realId = idMap.get(placement.id)!;

        newNodes.push({
            id: realId,
            type: 'block',
            position: { x: position.x + placement.x, y: position.y + placement.y },
            style: { width: placement.width, height: placement.height },
            data: {
                content: [{
                    id: uuidv4(),
                    type: placement.depth === 0 ? 'heading2' : placement.clusterRoot ? 'heading3' : 'text',
                    content: labelOf.get(placement.id) || '',
                }],
                isStandaloneBlock: true,
            },
            parentId: ctx.currentParentId || undefined,
        } as AppNode);

        if (placement.parent && idMap.has(placement.parent)) {
            newEdges.push({
                id: `e-${idMap.get(placement.parent)}-${realId}`,
                source: idMap.get(placement.parent)!,
                target: realId,
                type: 'centered',
                data: { parentId: ctx.currentParentId ?? null },
            });
        }
    }

    useStore.getState().setNodes((prev) => [...prev, ...newNodes]);
    if (newEdges.length > 0) {
        useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...newEdges] }));
    }
    return { ids: newNodes.map((n) => n.id), label: `Mindmap “${action.title}” (${newNodes.length} nodes)` };
}

/**
 * Drop an assistant answer onto the canvas as a card — the bridge that makes
 * Ask mode worth using: read the answer first, keep it only if it's good.
 */
export function addAnswerToCanvas(title: string, markdown: string, ctx: RunnerContext): string {
    const { addNode, nodes } = useStore.getState();
    const id = uuidv4();
    const position = findNonOverlappingPosition(ctx.origin, NOTE_SIZE, nodes, ctx.currentParentId, ctx.viewport());
    addNode('note', position, aiNoteData(title, markdown), NOTE_SIZE, ctx.currentParentId || undefined, id);
    // Keeping an answer is as much an AI-created card as a generated one, and
    // it is the one most likely to be found later with no memory of its origin.
    stampProvenance([id], ctx.provenance);
    return id;
}
