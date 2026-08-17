import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import type { AppState } from '../../store/types';
import type { AppNode } from '../../types';
import { getNodeBlocks } from '../../types';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { GRID_GAP, MEDIUM_SIZE, snapToGridValue } from '../../config/layout';
import { parsePlainText } from '../editor/pasteUtils';
import { generateImage, generateText, parseStructuredAction, type AIRequestOptions, type AIStructuredAction } from '../../services/aiService';
import { nodeTitle } from './canvasContext';
import {
    createKanbanData,
    DEFAULT_COLUMNS,
    GROUP_FIELDS,
    KANBAN_DEFAULT_HEIGHT,
    KANBAN_LANE_GAP,
    KANBAN_LANE_WIDTH,
    KANBAN_TONES,
    type KanbanColumn,
    type KanbanGroupField,
    type KanbanNodeData,
    type KanbanTone,
} from '../kanban/kanbanTypes';

/**
 * The canvas half of the AI panel: turns a request into nodes, and narrates
 * itself while it does.
 *
 * This logic used to live inline in the bottom bar's submit handler, where it
 * ran silently and left no trace of what it had done. Here every stage reports
 * a step and every node it adds is tracked by id, which is what makes a turn
 * reviewable and undoable on its own.
 */

export interface RunnerContext {
    /** Flow-space anchor for whatever gets placed (usually the viewport centre). */
    origin: { x: number; y: number };
    viewport: () => { x: number; y: number; zoom: number; screenW: number; screenH: number };
    currentParentId: string | null;
    /** Log a step; returns its id so the caller can flip it to done/failed. */
    step: (kind: 'thought' | 'action' | 'result' | 'error', text: string, status?: 'running' | 'done' | 'failed') => string;
    /** Update a step already logged. */
    settle: (id: string, status: 'done' | 'failed', text?: string) => void;
    signal?: AbortSignal;
    /** Model the composer asked for, and any images attached to the turn. */
    request?: AIRequestOptions;
}

export interface RunnerResult {
    createdNodeIds: string[];
    /** Prose to show in the bubble (empty when the steps say it all). */
    summary: string;
}

const NOTE_SIZE = { width: 432, height: 432 };
const DOC_SIZE = { width: 800, height: 600 };
const IMAGE_SIZE = { width: 380, height: 380 };
/* A step is a full-width expanded card: at 320 the titles a timeline actually
   carries ("Week 3 — IA & flows") truncated in the header. Shorter than a note
   because a step is a summary, not a document. */
const MILESTONE_SIZE = { width: 432, height: 340 };
const TIMELINE_GAP = 72;
/** Cards per row before the plan wraps to a new line. */
const PER_ROW = 3;
/** Anything this wide claims a row of its own — boards and timelines do. */
const FULL_ROW_WIDTH = 900;
/** Columns in the grid a board's cards occupy on its drilled-in canvas.
 *  Mirrors useCanvasNodeDrag's slot maths so AI-made and dropped cards agree. */
const DRILL_GRID_COLS = 4;

function assertLive(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
}

/** Colour to fall back to: whatever the canvas is already using. */
function inheritedColor(nodes: AppNode[]): string | undefined {
    const colored = nodes.filter((n) => n.type === 'note' && 'color' in n.data && !!n.data.color);
    if (colored.length === 0) return undefined;
    const pick = colored[Math.floor(Math.random() * colored.length)];
    return 'color' in pick.data ? (pick.data.color as string) : undefined;
}

/**
 * Rewrite the cards the user has selected, one at a time.
 * Each card gets its own step so a failure on card 3 is visible and the other
 * edits still stand.
 */
export async function runEdit(query: string, selectedIds: string[], ctx: RunnerContext): Promise<RunnerResult> {
    const { updateNodeData } = useStore.getState();
    let edited = 0;

    for (const nodeId of selectedIds) {
        assertLive(ctx.signal);
        const node = useStore.getState().nodes.find((n) => n.id === nodeId);
        if (!node || (node.type !== 'note' && node.type !== 'block' && node.type !== 'fused-note')) continue;

        const title = nodeTitle(node);
        const stepId = ctx.step('action', `Rewriting “${title}”`, 'running');

        const description = node.type === 'note' ? node.data.description || '' : '';
        const contentText = (getNodeBlocks(node.data) ?? [])
            .map((b) => (typeof b.content === 'string' ? b.content : ''))
            .join('\n');

        const prompt = `You are editing an existing card in a note app.
Current title: "${title}"
Current description: "${description}"
Current body:
"${contentText}"

The user's instruction:
"${query}"

Respond ONLY with a valid JSON object. No markdown, no code fences, no commentary.
{
  "title": "...",       // updated title, or the same one if unchanged
  "description": "...", // short summary reflecting the edit
  "content": "..."      // the full updated body, markdown allowed
}`;

        try {
            const responseText = await generateText(prompt, ctx.request);
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const update: Record<string, unknown> = {};

            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]) as { title?: string; description?: string; content?: string };
                const blocks = parsePlainText(result.content || contentText);
                update.content = blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: result.content || contentText }];
                if (node.type === 'note') {
                    update.label = result.title || title;
                    update.description = result.description || description;
                }
            } else {
                const blocks = parsePlainText(responseText);
                update.content = blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: responseText }];
            }

            updateNodeData(nodeId, update);
            edited += 1;
            ctx.settle(stepId, 'done', `Rewrote “${title}”`);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}”`);
        }
    }

    return {
        createdNodeIds: [],
        summary: edited === 0
            ? 'No cards were changed.'
            : `Updated ${edited} card${edited === 1 ? '' : 's'} in place. Undo with Ctrl+Z if it isn't what you wanted.`,
    };
}

const MINDMAP_ROOT_SIZE = { width: 260, height: 80 };
const MINDMAP_NODE_SIZE = { width: 220, height: 70 };
/** Clear space between depth columns, and between stacked sibling rows. */
const MINDMAP_H_GAP = 90;
const MINDMAP_V_GAP = 22;

type MindmapInput = NonNullable<AIStructuredAction['nodes']>[number];

interface MindmapPlacement {
    id: string;
    /** Effective parent after orphan repair — the edge is drawn from this. */
    parent: string | null;
    /** Top-left, relative to the layout's own bounding box. */
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
}

/**
 * Lay a mindmap out as a tidy two-sided tree: root in the middle, subtrees
 * marching left and right in fixed columns, siblings stacked in rows.
 *
 * This replaced a radial layout that placed every child on an arc around its
 * parent. Radial looks right for a handful of nodes and falls apart past that:
 * it positions nodes as if they were points, so a ring of 220px-wide boxes at
 * neighbouring angles overlaps badly, and a deep branch inherits a narrow arc
 * slice that crushes its own children together. The model routinely returns
 * 15-30 nodes, which is squarely in the range where that broke down.
 *
 * Vertical packing is the standard tidy-tree trick: only leaves consume vertical
 * space (one row each), and every parent is centred on the span of its children.
 * That gives each subtree a disjoint vertical band, so nodes in the same column
 * are always at least one row apart and can never collide, while the tree still
 * pulls tight around its own shape instead of spreading over a fixed radius.
 *
 * Coordinates come back relative to the layout's bounding box (top-left 0,0) so
 * the caller can both reserve exactly this rectangle and draw into it.
 */
function layoutMindmap(nodes: MindmapInput[]): { placements: MindmapPlacement[]; width: number; height: number } {
    if (nodes.length === 0) return { placements: [], width: 0, height: 0 };

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const root = nodes.find((n) => !n.parentId) || nodes[0];

    // Resolve every node's parent, repairing anything that doesn't lead back to
    // the root: an id the model never defined, a self-reference, or a cycle.
    // All three orphan a branch from the root's traversal, and an orphaned
    // branch is simply never drawn — the nodes vanish with no error.
    const parentOf = new Map<string, string>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const declared = node.parentId;
        parentOf.set(node.id, declared && declared !== node.id && byId.has(declared) ? declared : root.id);
    }

    const reachesRoot = (id: string): boolean => {
        const walked = new Set<string>([id]);
        let cursor = parentOf.get(id);
        while (cursor) {
            if (cursor === root.id) return true;
            if (walked.has(cursor)) return false;
            walked.add(cursor);
            cursor = parentOf.get(cursor);
        }
        return false;
    };

    for (const node of nodes) {
        if (node.id === root.id) continue;
        if (!reachesRoot(node.id)) parentOf.set(node.id, root.id);
    }

    const childrenMap = new Map<string, MindmapInput[]>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const parentId = parentOf.get(node.id)!;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(node);
    }

    // The tree is acyclic by construction now; `seen` keeps traversal total
    // regardless, and marks which nodes each side has already claimed.
    const seen = new Set<string>([root.id]);
    const childrenOf = (id: string) => (childrenMap.get(id) || []).filter((c) => !seen.has(c.id));

    const leafCount = (id: string, guard = new Set<string>()): number => {
        if (guard.has(id)) return 1;
        guard.add(id);
        const kids = childrenMap.get(id) || [];
        if (kids.length === 0) return 1;
        return kids.reduce((sum, kid) => sum + leafCount(kid.id, guard), 0);
    };

    // Split the root's branches between the two sides, always feeding the
    // lighter one, so the map stays balanced rather than lopsided.
    const topLevel = [...(childrenMap.get(root.id) || [])]
        .sort((a, b) => leafCount(b.id) - leafCount(a.id));
    const sides: { branches: MindmapInput[]; weight: number }[] = [
        { branches: [], weight: 0 },
        { branches: [], weight: 0 },
    ];
    for (const branch of topLevel) {
        const target = sides[0].weight <= sides[1].weight ? sides[0] : sides[1];
        target.branches.push(branch);
        target.weight += leafCount(branch.id);
    }

    const placements: MindmapPlacement[] = [];
    const columnStep = MINDMAP_NODE_SIZE.width + MINDMAP_H_GAP;

    const layoutSide = (branches: MindmapInput[], direction: 1 | -1) => {
        const start = placements.length;
        let cursor = 0;

        const walk = (node: MindmapInput, parentId: string, depth: number): number => {
            seen.add(node.id);
            const kids = childrenOf(node.id);
            kids.forEach((kid) => seen.add(kid.id));

            let centerY: number;
            if (kids.length === 0) {
                centerY = cursor + MINDMAP_NODE_SIZE.height / 2;
                cursor += MINDMAP_NODE_SIZE.height + MINDMAP_V_GAP;
            } else {
                const childCenters = kids.map((kid) => walk(kid, node.id, depth + 1));
                centerY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
            }

            placements.push({
                id: node.id,
                parent: parentId,
                x: direction * depth * columnStep - MINDMAP_NODE_SIZE.width / 2,
                y: centerY - MINDMAP_NODE_SIZE.height / 2,
                width: MINDMAP_NODE_SIZE.width,
                height: MINDMAP_NODE_SIZE.height,
                depth,
            });
            return centerY;
        };

        branches.forEach((branch) => walk(branch, root.id, 1));

        // Each side is packed from y=0 downward; recentre it on the root.
        const height = Math.max(0, cursor - MINDMAP_V_GAP);
        for (let i = start; i < placements.length; i++) placements[i].y -= height / 2;
    };

    layoutSide(sides[0].branches, 1);
    layoutSide(sides[1].branches, -1);

    placements.push({
        id: root.id,
        parent: null,
        x: -MINDMAP_ROOT_SIZE.width / 2,
        y: -MINDMAP_ROOT_SIZE.height / 2,
        width: MINDMAP_ROOT_SIZE.width,
        height: MINDMAP_ROOT_SIZE.height,
        depth: 0,
    });

    const minX = Math.min(...placements.map((p) => p.x));
    const minY = Math.min(...placements.map((p) => p.y));
    const maxX = Math.max(...placements.map((p) => p.x + p.width));
    const maxY = Math.max(...placements.map((p) => p.y + p.height));
    for (const placement of placements) {
        placement.x -= minX;
        placement.y -= minY;
    }

    return { placements, width: maxX - minX, height: maxY - minY };
}

/**
 * The footprint an action will occupy, so the batch packer can reserve room for
 * it. A board is as wide as its lanes and a timeline as long as its milestones,
 * both of which dwarf a card — reserving NOTE_SIZE for them would drop the next
 * action straight on top.
 */
function sizeFor(action: AIStructuredAction) {
    if (action.type === 'fused-note') return DOC_SIZE;

    if (action.type === 'board') {
        const lanes = Math.max(1, action.columns?.length ?? 4);
        return {
            width: lanes * KANBAN_LANE_WIDTH + (lanes - 1) * KANBAN_LANE_GAP,
            height: KANBAN_DEFAULT_HEIGHT,
        };
    }

    if (action.type === 'timeline') {
        const steps = Math.max(1, action.milestones?.length ?? 3);
        return {
            width: steps * MILESTONE_SIZE.width + (steps - 1) * TIMELINE_GAP,
            height: MILESTONE_SIZE.height,
        };
    }

    if (action.type === 'mindmap') {
        // Measured from the real layout rather than estimated, so the reserved
        // rectangle is exactly what gets drawn. The old radial guess reserved a
        // square around a radius the tree never filled, which both wasted space
        // and let the next action land inside the map's actual spread.
        const { width, height } = layoutMindmap(action.nodes ?? []);
        return width > 0 ? { width, height } : NOTE_SIZE;
    }

    return NOTE_SIZE;
}

/**
 * Create a board and open it with its cards.
 *
 * A board owns no card data (see kanbanTypes): its lanes are one metadata field
 * on ordinary note nodes whose `parentId` is the board. So this writes the same
 * two things a drag-and-drop would — the parent link and the one field — and
 * nothing else. The cards stay real notes, editable and searchable, and pulling
 * one off the board later leaves it intact.
 */
function placeBoard(action: AIStructuredAction, position: { x: number; y: number }, ctx: RunnerContext): { ids: string[]; label: string } {
    const { addNode } = useStore.getState();
    const boardId = uuidv4();

    const groupBy = (action.groupBy && GROUP_FIELDS.includes(action.groupBy as KanbanGroupField)
        ? action.groupBy
        : 'status') as KanbanGroupField;

    const columns: KanbanColumn[] = (action.columns ?? [])
        .filter((c) => c?.label)
        .map((c) => {
            const value = (c.value || c.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const tone = KANBAN_TONES.includes(c.tone as KanbanTone) ? (c.tone as KanbanTone) : 'neutral';
            return { id: value || 'column', value: value || 'column', label: c.label, tone };
        });

    const size = sizeFor(action);
    const data: KanbanNodeData = {
        ...createKanbanData(action.title || 'Board'),
        groupBy,
        // Empty falls back to the field's defaults, which is right for a plain
        // "kanban for X" where the model named no lanes.
        columns: columns.length > 0 ? columns : (DEFAULT_COLUMNS[groupBy] ?? []),
    };

    addNode('kanban', position, data as unknown as Record<string, unknown>, size, ctx.currentParentId || undefined, boardId);

    // Bail out rather than orphan cards on a board that never landed.
    if (!useStore.getState().nodes.some((n) => n.id === boardId)) {
        return { ids: [], label: `Board “${action.title}”` };
    }

    const laneValues = new Set(data.columns.map((c) => c.value));
    const cardIds: string[] = [];
    const step = MEDIUM_SIZE + GRID_GAP;

    (action.cards ?? []).forEach((card, index) => {
        if (!card?.title) return;
        const cardId = uuidv4();
        const requested = (card.column || '').toLowerCase().trim();
        // A value no lane carries would strand the card in the unsorted lane, so
        // only honour one the board actually has.
        const laneValue = laneValues.has(requested) ? requested : '';
        const blocks = parsePlainText(card.content || '');

        addNode(
            'note',
            // Cards sit on the board's own drilled-in canvas; the grid mirrors
            // what a drop-adoption assigns, so drilling in shows a tidy sheet.
            { x: (index % DRILL_GRID_COLS) * step, y: Math.floor(index / DRILL_GRID_COLS) * step },
            {
                label: card.title,
                content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: card.content || '' }],
                [groupBy]: laneValue,
                ...(card.priority && groupBy !== 'priority' ? { priority: card.priority } : {}),
                viewMode: 'expanded',
                showMetadata: false,
                icon: 'Sparkles',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            NOTE_SIZE,
            boardId,
            cardId
        );
        if (useStore.getState().nodes.some((n) => n.id === cardId)) cardIds.push(cardId);
    });

    if (cardIds.length > 0) {
        useStore.getState().updateNodeData(boardId, { cardOrder: cardIds });
    }

    return {
        ids: [boardId, ...cardIds],
        label: `Board “${action.title}” (${data.columns.length} lanes, ${cardIds.length} cards)`,
    };
}

/**
 * Lay milestones out left to right and join them with arrows.
 *
 * There is no timeline *view* in the app — the board's timeline/table/calendar
 * views were removed in the rebuild — so a timeline is drawn from what the
 * canvas already has: a row of cards and the directed edges between them. That
 * keeps every step a real, editable note instead of a cell in a widget.
 */
function placeTimeline(action: AIStructuredAction, position: { x: number; y: number }, ctx: RunnerContext): { ids: string[]; label: string } {
    const { addNode } = useStore.getState();
    const milestones = (action.milestones ?? []).filter((m) => m?.title);
    if (milestones.length === 0) return { ids: [], label: '' };

    const ids: string[] = [];
    const edges: Edge[] = [];

    milestones.forEach((milestone, index) => {
        const id = uuidv4();
        // The date leads the body as well as being stored: showMetadata renders
        // a row of empty "Add property" placeholders, which reads as clutter on
        // six cards in a row, while the date itself is the thing you scan for.
        const body = milestone.date
            ? `**${milestone.date}**\n\n${milestone.content || ''}`.trim()
            : (milestone.content || '');
        const blocks = parsePlainText(body);
        addNode(
            'note',
            { x: position.x + index * (MILESTONE_SIZE.width + TIMELINE_GAP), y: position.y },
            {
                label: milestone.title,
                content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: body }],
                ...(milestone.date ? { startDate: milestone.date } : {}),
                viewMode: 'expanded',
                showMetadata: false,
                icon: 'Sparkles',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            MILESTONE_SIZE,
            ctx.currentParentId || undefined,
            id
        );
        if (!useStore.getState().nodes.some((n) => n.id === id)) return;

        if (ids.length > 0) {
            edges.push({
                id: `tl-${ids[ids.length - 1]}-${id}`,
                source: ids[ids.length - 1],
                target: id,
                type: 'centered',
                /* CenteredEdge reads its arrow and stroke off `data`, not off
                   React Flow's own markerEnd prop. On defaults it draws a
                   1.75px --line-strong hairline, which across a 72px gap is
                   invisible — and an unreadable connector makes the row look
                   like six unrelated cards rather than a sequence. */
                data: {
                    parentId: ctx.currentParentId ?? null,
                    markerEndType: 'arrow',
                    color: 'var(--accent)',
                    strokeWidth: 2.5,
                },
            });
        }
        ids.push(id);
    });

    if (edges.length > 0) {
        useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...edges] }));
    }

    return { ids, label: `Timeline “${action.title}” (${ids.length} steps)` };
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
 * per card that scatters a six-phase plan into a ring, which destroys the one
 * thing a plan has: its order. So the batch claims a single rectangle and each
 * card is placed at an exact offset inside it, left to right, top to bottom.
 */
function findBlockOrigin(blockW: number, blockH: number, ctx: RunnerContext): { x: number; y: number } {
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

/** Place one structured action at `position`. Returns the ids it created. */
function placeAction(action: AIStructuredAction, position: { x: number; y: number }, ctx: RunnerContext, fallbackColor?: string): { ids: string[]; label: string } {
    if (action.type === 'board') return placeBoard(action, position, ctx);
    if (action.type === 'timeline') return placeTimeline(action, position, ctx);

    const { addNode } = useStore.getState();
    const size = sizeFor(action);

    if (action.type === 'note') {
        const id = uuidv4();
        const blocks = parsePlainText(action.content || '');
        addNode(
            'note',
            position,
            {
                label: action.title,
                content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: action.content || '' }],
                color: action.color || fallbackColor || undefined,
                viewMode: 'expanded',
                showMetadata: false,
                icon: 'Sparkles',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            size,
            ctx.currentParentId || undefined,
            id
        );
        return { ids: [id], label: `Card “${action.title}”` };
    }

    if (action.type === 'fused-note') {
        const id = uuidv4();
        const markdown = `# ${action.title}\n\n${action.content || ''}`;
        const blocks = parsePlainText(markdown);
        addNode(
            'fused-note',
            position,
            { content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: markdown }] },
            size,
            ctx.currentParentId || undefined,
            id
        );
        return { ids: [id], label: `Document “${action.title}”` };
    }

    // Mindmap: a tree of standalone blocks in a tidy two-sided layout.
    if (!action.nodes || action.nodes.length === 0) return { ids: [], label: '' };

    const newNodes: AppNode[] = [];
    const newEdges: Edge[] = [];
    const { placements } = layoutMindmap(action.nodes);

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
                    type: placement.depth === 0 ? 'heading2' : 'text',
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

/** Build new cards from a request, using the canvas as context. */
export async function runCreate(query: string, context: string, ctx: RunnerContext): Promise<RunnerResult> {
    const planStep = ctx.step('action', 'Planning what to build', 'running');
    let actions: AIStructuredAction[];
    try {
        actions = await parseStructuredAction(query, context, ctx.request);
        assertLive(ctx.signal);
    } catch (err) {
        ctx.settle(planStep, 'failed', 'Planning failed');
        throw err;
    }

    if (actions.length === 0) {
        ctx.settle(planStep, 'done', 'Nothing to build for that request');
        return { createdNodeIds: [], summary: 'I couldn\'t turn that into anything to place on the canvas. Try naming what you want — "3 cards on X", "a doc about Y", "mindmap of Z".' };
    }

    ctx.settle(planStep, 'done', `Planned ${actions.length} item${actions.length === 1 ? '' : 's'}`);

    const fallbackColor = inheritedColor(useStore.getState().nodes);
    const created: string[] = [];
    let blocked = 0;

    // Measure the block first so it can be placed as one unit, then fill it in
    // reading order — card 1 top-left, card 6 bottom-right.
    const rows: { items: AIStructuredAction[]; width: number; height: number; full: boolean }[] = [];
    actions.forEach((action) => {
        const size = sizeFor(action);
        const wide = size.width >= FULL_ROW_WIDTH;
        const row = rows[rows.length - 1];
        if (!row || wide || row.full || row.items.length === PER_ROW) {
            rows.push({ items: [action], width: size.width, height: size.height, full: wide });
        } else {
            row.items.push(action);
            row.width += GRID_GAP + size.width;
            row.height = Math.max(row.height, size.height);
        }
    });

    const blockW = Math.max(...rows.map((r) => r.width));
    const blockH = rows.reduce((sum, r) => sum + r.height, 0) + GRID_GAP * (rows.length - 1);
    const blockOrigin = findBlockOrigin(blockW, blockH, ctx);

    let cursorY = blockOrigin.y;
    const positioned: { action: AIStructuredAction; position: { x: number; y: number } }[] = [];
    rows.forEach((row) => {
        let cursorX = blockOrigin.x;
        row.items.forEach((action) => {
            positioned.push({ action, position: { x: cursorX, y: cursorY } });
            cursorX += sizeFor(action).width + GRID_GAP;
        });
        cursorY += row.height + GRID_GAP;
    });

    positioned.forEach(({ action, position }) => {
        const { ids, label } = placeAction(action, position, ctx, fallbackColor);
        // addNode refuses silently once the canvas hits its beta node ceiling,
        // so confirm the node actually landed rather than reporting a success
        // the user can't see anywhere.
        const live = new Set(useStore.getState().nodes.map((n) => n.id));
        const landed = ids.filter((id) => live.has(id));
        created.push(...landed);

        if (landed.length === 0 && ids.length > 0) {
            blocked += 1;
            ctx.step('error', `Couldn't add ${label} — the canvas is at its card limit`);
        } else if (label) {
            ctx.step('result', `Added ${label}`);
        }
    });

    return {
        createdNodeIds: created,
        summary: created.length > 0
            ? ''
            : blocked > 0
                ? 'Nothing could be added — this canvas has hit its card limit. Delete a few cards or open a sub-canvas and try again.'
                : 'Nothing landed on the canvas — try rephrasing the request.',
    };
}

/** Generate an image and drop it on the canvas as a standalone image block. */
export async function runImage(query: string, ctx: RunnerContext): Promise<RunnerResult> {
    const stepId = ctx.step('action', 'Generating image', 'running');
    let imageUrl: string;
    try {
        imageUrl = await generateImage(query);
        assertLive(ctx.signal);
    } catch (err) {
        ctx.settle(stepId, 'failed', 'Image generation failed');
        throw err;
    }
    ctx.settle(stepId, 'done', 'Image generated');

    const { addNode, nodes } = useStore.getState();
    const id = uuidv4();
    const position = findNonOverlappingPosition(ctx.origin, IMAGE_SIZE, nodes, ctx.currentParentId, ctx.viewport());
    addNode(
        'block',
        position,
        {
            content: [{ id: uuidv4(), type: 'image', content: imageUrl, metadata: { prompt: query, width: 380, alignment: 'center' } }],
            isStandaloneBlock: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        IMAGE_SIZE,
        ctx.currentParentId || undefined,
        id
    );
    ctx.step('result', 'Placed the image on the canvas');
    return { createdNodeIds: [id], summary: '' };
}

/**
 * Drop an assistant answer onto the canvas as a card — the bridge that makes
 * Ask mode worth using: read the answer first, keep it only if it's good.
 */
export function addAnswerToCanvas(title: string, markdown: string, ctx: RunnerContext): string {
    const { addNode, nodes } = useStore.getState();
    const id = uuidv4();
    const position = findNonOverlappingPosition(ctx.origin, NOTE_SIZE, nodes, ctx.currentParentId, ctx.viewport());
    const blocks = parsePlainText(markdown);
    addNode(
        'note',
        position,
        {
            label: title,
            content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: markdown }],
            viewMode: 'expanded',
            showMetadata: false,
            icon: 'Sparkles',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        NOTE_SIZE,
        ctx.currentParentId || undefined,
        id
    );
    return id;
}
