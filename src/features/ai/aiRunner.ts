import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import type { AppState } from '../../store/types';
import type { AIProvenance, AppNode } from '../../types';
import { getNodeBlocks } from '../../types';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { GRID_GAP, MEDIUM_SIZE, snapToGridValue } from '../../config/layout';
import { parsePlainText } from '../editor/pasteUtils';
import {
    composeItemBodies,
    extractJsonFromString,
    generateImage,
    generateText,
    planArtifacts,
    verifyArtifacts,
    type AIArtifactPlan,
    type AIPlanResult,
    type AIRequestOptions,
    type AIStructuredAction,
} from '../../services/aiService';
import { composeBody, mapWithConcurrency, splitItemBodies, ITEM_BATCH_SIZE } from './aiCompose';
import { recordAIRun } from './aiTelemetry';
import { normalizeAIText } from './aiResultUtils';
import { effortBudget, structuredEffortDirective } from '../../config/aiEffort';
import { nodeTitle } from './canvasContext';
import type { AIPhase, AITraceDetail } from './aiTypes';
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
    /**
     * Log a step; returns its id so the caller can flip it to done/failed.
     *
     * `extra` carries the trace phase and the expandable payload (ai-Plan.md
     * §5.1). Both are optional and appended rather than woven into the
     * positional arguments, so every existing call site keeps working and only
     * the steps with something worth expanding pay for it.
     */
    step: (
        kind: 'thought' | 'action' | 'result' | 'error',
        text: string,
        status?: 'queued' | 'running' | 'done' | 'failed',
        extra?: { phase?: AIPhase; detail?: AITraceDetail },
    ) => string;
    /**
     * Update a step already logged.
     *
     * Takes `running` as well as the terminal states so a step announced as
     * `queued` can be started later without being re-logged — which is what
     * lets the trace show the whole plan up front and then light each line as
     * it begins.
     */
    settle: (
        id: string,
        status: 'running' | 'done' | 'failed',
        text?: string,
        extra?: { phase?: AIPhase; detail?: AITraceDetail },
    ) => void;
    signal?: AbortSignal;
    /** Model the composer asked for, and any images attached to the turn. */
    request?: AIRequestOptions;
    /** The answer-to-mindmap action groups sections into compact clusters. */
    mindmapLayout?: 'tree' | 'clustered';
    /**
     * Stamped onto every node this run places (ai-Plan.md §5.4).
     *
     * Passed in rather than assembled here because only the panel knows the
     * turn id, the untrimmed request and the sources the answer actually used.
     * Absent on paths that place nothing the user would later audit.
     */
    provenance?: AIProvenance;
    /**
     * Collected by `runEdit`: what each rewritten card looked like beforehand.
     *
     * An edit turn is the only path that DESTROYS the user's own writing, so
     * the before-state has to survive the turn (ai-Plan.md §5.7). The array is
     * supplied by the caller and filled here, which keeps the runner free of
     * any opinion about how the revert is offered.
     */
    edits?: AIEditSnapshot[];
}

/** One card as it was before an AI edit overwrote it. */
export interface AIEditSnapshot {
    nodeId: string;
    title: string;
    before: Record<string, unknown>;
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

/**
 * Stamp provenance onto everything a run just placed.
 *
 * Applied AFTER placement in one pass rather than threaded through every
 * `addNode` call in `placeAction`, `placeBoard`, `placeTimeline` and
 * `placeMindmap`. Those four are the load-bearing layout code and are
 * deliberately left alone; a card that landed is a card that gets stamped, and
 * that stays true however placement changes later.
 */
function stampProvenance(ids: string[], provenance?: AIProvenance): void {
    if (!provenance || ids.length === 0) return;
    const { updateNodeData } = useStore.getState();
    for (const id of ids) updateNodeData(id, { aiProvenance: provenance });
}

/** Schema type -> the word the user calls it. Drives the plan trace chips. */
const SHAPE_LABEL: Record<AIStructuredAction['type'], string> = {
    note: 'Card',
    'fused-note': 'Document',
    mindmap: 'Mind map',
    board: 'Board',
    timeline: 'Timeline',
};

/**
 * Rewrite the cards the user has selected, one at a time.
 * Each card gets its own step so a failure on card 3 is visible and the other
 * edits still stand.
 */
export async function runEdit(query: string, selectedIds: string[], ctx: RunnerContext): Promise<RunnerResult> {
    const { updateNodeData } = useStore.getState();
    let edited = 0;
    let skipped = 0;

    for (const nodeId of selectedIds) {
        assertLive(ctx.signal);
        const node = useStore.getState().nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        // Boards, images and the rest have no text body to rewrite. This used to
        // be a bare `continue`, so selecting a board and asking for a change
        // reported "No cards were changed" with nothing explaining why.
        if (node.type !== 'note' && node.type !== 'block' && node.type !== 'fused-note') {
            skipped += 1;
            ctx.step('result', `Skipped “${nodeTitle(node)}” — a ${node.type} can't be rewritten this way`);
            continue;
        }

        const title = nodeTitle(node);
        const stepId = ctx.step('action', `Rewriting “${title}”`, 'running');

        const description = node.type === 'note' ? node.data.description || '' : '';
        const contentText = (getNodeBlocks(node.data) ?? [])
            .map((b) => (typeof b.content === 'string' ? b.content : ''))
            .join('\n');

        /* The effort directive has to be inlined rather than passed as a system
           prompt: generateText only folds effort into `system`, and this call
           deliberately sends none (system prompts are reserved for free-form
           writing). Without this the token CEILING still applied while the
           instruction to be brief did not — Fast capped the reply at 800 tokens
           and nothing told the model to fit, which is what manufactured the
           truncated JSON this function then had to cope with. */
        const effortNote = ctx.request?.effort ? `\n${structuredEffortDirective(ctx.request.effort)}\n` : '';

        const prompt = `You are editing an existing card in a note app.
Current title: "${title}"
Current description: "${description}"
Current body:
"${contentText}"

The user's instruction:
"${query}"
${effortNote}
Respond ONLY with a valid JSON object. No markdown, no code fences, no commentary.
{
  "title": "...",       // updated title, or the same one if unchanged
  "description": "...", // short summary reflecting the edit
  "content": "..."      // the full updated body, markdown allowed
}`;

        try {
            const responseText = await generateText(prompt, ctx.request);

            /* Was `responseText.match(/\{[\s\S]*\}/)` — the same greedy pattern
               extractJsonFromString was written to replace (see its comment in
               aiService). On a reply truncated at the effort ceiling, or one
               whose prose happens to contain braces, that match failed and the
               old else-branch wrote the RAW MODEL REPLY over the card body,
               destroying whatever the user had written. There is no longer a
               path that writes on a parse failure: a card we can't edit is left
               exactly as it was. */
            const jsonStr = extractJsonFromString(responseText, 'object');
            const result = jsonStr
                ? JSON.parse(jsonStr) as { title?: string; description?: string; content?: string }
                : null;

            if (!result) {
                ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}” — left unchanged`);
                continue;
            }

            const newContent = typeof result.content === 'string' ? result.content.trim() : '';
            const update: Record<string, unknown> = {};

            if (newContent) {
                const blocks = parsePlainText(newContent);
                update.content = blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: newContent }];
            }
            if (node.type === 'note') {
                update.label = result.title || title;
                update.description = result.description || description;
            }

            // A title-only reply is the classic truncation shape. Apply what came
            // back rather than blanking the body, and say so.
            if (Object.keys(update).length === 0) {
                ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}” — left unchanged`);
                continue;
            }

            /* Keep what is being overwritten so the change is reversible on its
               own (ai-Plan.md §5.7). `runEdit` destroys the user's own writing;
               Ctrl+Z is a blunt instrument for that — it walks back everything
               since, and the user has to notice within the undo window. A
               per-card snapshot makes "put that one back" a specific action. */
            ctx.edits?.push({
                nodeId,
                title,
                before: {
                    ...(node.type === 'note' ? { label: node.data.label, description } : {}),
                    content: getNodeBlocks(node.data) ?? [],
                },
            });

            updateNodeData(nodeId, update);
            edited += 1;
            ctx.settle(stepId, 'done', newContent
                ? `Rewrote “${title}”`
                : `Updated the title of “${title}” — no new body was returned`);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            ctx.settle(stepId, 'failed', `Couldn't rewrite “${title}”`);
        }
    }

    return {
        createdNodeIds: [],
        summary: edited === 0
            ? skipped > 0
                ? `Nothing was changed — ${skipped === 1 ? 'that item' : 'those items'} can't be rewritten this way.`
                : 'No cards were changed.'
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
    /** Top-level section within a compact answer-derived cluster. */
    clusterRoot?: boolean;
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
 * Answer-derived maps read better as a handful of related piles than a wide,
 * abstract tree. Each first-level section becomes an anchor; everything below
 * it stays tightly stacked in the same cluster, while the original parent
 * links are preserved so no idea becomes a disconnected ornament.
 */
function layoutClusteredMindmap(nodes: MindmapInput[]): { placements: MindmapPlacement[]; width: number; height: number } {
    if (nodes.length === 0) return { placements: [], width: 0, height: 0 };

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const root = nodes.find((node) => !node.parentId) || nodes[0];
    const parentOf = new Map<string, string>();

    for (const node of nodes) {
        if (node.id === root.id) continue;
        const requestedParent = node.parentId;
        parentOf.set(node.id, requestedParent && requestedParent !== node.id && byId.has(requestedParent)
            ? requestedParent
            : root.id);
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
        if (node.id !== root.id && !reachesRoot(node.id)) parentOf.set(node.id, root.id);
    }

    const children = new Map<string, MindmapInput[]>();
    for (const node of nodes) {
        if (node.id === root.id) continue;
        const parent = parentOf.get(node.id)!;
        const siblings = children.get(parent) || [];
        siblings.push(node);
        children.set(parent, siblings);
    }

    const sections = children.get(root.id) || [];
    if (sections.length === 0) {
        return {
            placements: [{
                id: root.id,
                parent: null,
                x: 0,
                y: 0,
                width: MINDMAP_ROOT_SIZE.width,
                height: MINDMAP_ROOT_SIZE.height,
                depth: 0,
            }],
            width: MINDMAP_ROOT_SIZE.width,
            height: MINDMAP_ROOT_SIZE.height,
        };
    }
    const placements: MindmapPlacement[] = [];
    const CLUSTER_WIDTH = MINDMAP_NODE_SIZE.width + 36;
    const CLUSTER_GAP_X = 64;
    const CLUSTER_GAP_Y = 66;
    const STACK_GAP = 14;
    const columns = sections.length > 1 ? 2 : 1;
    const clusterHeights: number[] = [];
    const sectionStacks: Array<Array<{ node: MindmapInput; depth: number }>> = [];

    const collect = (node: MindmapInput, depth: number, stack: Array<{ node: MindmapInput; depth: number }>, guard: Set<string>) => {
        if (guard.has(node.id)) return;
        guard.add(node.id);
        stack.push({ node, depth });
        for (const child of children.get(node.id) || []) collect(child, depth + 1, stack, guard);
    };

    for (const section of sections) {
        const stack: Array<{ node: MindmapInput; depth: number }> = [];
        collect(section, 1, stack, new Set<string>());
        sectionStacks.push(stack);
        clusterHeights.push(Math.max(MINDMAP_NODE_SIZE.height, stack.length * MINDMAP_NODE_SIZE.height + Math.max(0, stack.length - 1) * STACK_GAP));
    }

    const rowHeights: number[] = [];
    for (let index = 0; index < clusterHeights.length; index += columns) {
        rowHeights.push(Math.max(...clusterHeights.slice(index, index + columns)));
    }
    const rowOffsets = rowHeights.reduce<number[]>((offsets, height, row) => {
        offsets.push(row === 0 ? 0 : offsets[row - 1] + rowHeights[row - 1] + CLUSTER_GAP_Y);
        return offsets;
    }, []);

    sectionStacks.forEach((stack, sectionIndex) => {
        const column = sectionIndex % columns;
        const row = Math.floor(sectionIndex / columns);
        const clusterX = MINDMAP_ROOT_SIZE.width + 112 + column * (CLUSTER_WIDTH + CLUSTER_GAP_X);
        const clusterY = rowOffsets[row];
        stack.forEach(({ node, depth }, itemIndex) => {
            placements.push({
                id: node.id,
                parent: parentOf.get(node.id) || root.id,
                x: clusterX + Math.min(depth - 1, 2) * 18,
                y: clusterY + itemIndex * (MINDMAP_NODE_SIZE.height + STACK_GAP),
                width: MINDMAP_NODE_SIZE.width,
                height: MINDMAP_NODE_SIZE.height,
                depth,
                clusterRoot: itemIndex === 0,
            });
        });
    });

    const clusterHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * CLUSTER_GAP_Y;
    placements.push({
        id: root.id,
        parent: null,
        x: 0,
        y: Math.max(0, clusterHeight / 2 - MINDMAP_ROOT_SIZE.height / 2),
        width: MINDMAP_ROOT_SIZE.width,
        height: MINDMAP_ROOT_SIZE.height,
        depth: 0,
    });

    const width = MINDMAP_ROOT_SIZE.width + 112 + columns * CLUSTER_WIDTH + Math.max(0, columns - 1) * CLUSTER_GAP_X;
    return { placements, width, height: Math.max(MINDMAP_ROOT_SIZE.height, clusterHeight) };
}

/**
 * The footprint an action will occupy, so the batch packer can reserve room for
 * it. A board is as wide as its lanes and a timeline as long as its milestones,
 * both of which dwarf a card — reserving NOTE_SIZE for them would drop the next
 * action straight on top.
 */
function sizeFor(action: AIStructuredAction, mindmapLayout: RunnerContext['mindmapLayout'] = 'tree') {
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
        const { width, height } = (mindmapLayout === 'clustered' ? layoutClusteredMindmap : layoutMindmap)(action.nodes ?? []);
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

    const size = sizeFor(action, ctx.mindmapLayout);
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
function placeAction(action: AIStructuredAction, position: { x: number; y: number }, ctx: RunnerContext): { ids: string[]; label: string } {
    if (action.type === 'board') return placeBoard(action, position, ctx);
    if (action.type === 'timeline') return placeTimeline(action, position, ctx);

    const { addNode } = useStore.getState();
    const size = sizeFor(action, ctx.mindmapLayout);

    if (action.type === 'note') {
        const id = uuidv4();
        const blocks = parsePlainText(action.content || '');
        addNode(
            'note',
            position,
            {
                label: action.title,
                content: blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'text', content: action.content || '' }],
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
 * Build new cards from a request, using the canvas as context.
 *
 * Two passes, not one (ai-Plan.md §5.5). The old version asked a single call
 * for every artifact AND every body, so a Smart six-card request needed
 * thousands of tokens of balanced JSON in one reply; when it truncated the user
 * got nothing after two round trips. Now the plan is one small call, the bodies
 * are one call each (batched for board cards and timeline steps), and a body
 * that fails costs its own artifact rather than the whole turn.
 */
export async function runCreate(query: string, context: string, ctx: RunnerContext): Promise<RunnerResult> {
    const budget = effortBudget(ctx.request?.effort);
    const startedAt = Date.now();
    // §9.3's targets were unmeasurable because nothing counted anything.
    const metrics = { repaired: 0, unwrittenItems: 0, blocks: [] as number[] };

    /* ---- Pass 1: what to build ---- */
    const planStep = ctx.step('action', 'Working out what to build', 'running', { phase: 'compose' });
    let plan: AIPlanResult;
    try {
        plan = await planArtifacts(query, context, ctx.request);
        assertLive(ctx.signal);
    } catch (err) {
        ctx.settle(planStep, 'failed', 'Could not work out a safe plan', { phase: 'compose' });
        throw err;
    }

    const artifacts = plan.artifacts;
    if (artifacts.length === 0) {
        ctx.settle(planStep, 'done', 'Nothing to build for that request', { phase: 'compose' });
        return { createdNodeIds: [], summary: 'I couldn’t turn that into anything to place on the canvas. Try naming what you want — "3 cards on X", "a doc about Y", "mindmap of Z".' };
    }

    ctx.settle(
        planStep,
        'done',
        `Planned ${artifacts.length} item${artifacts.length === 1 ? '' : 's'}`,
        {
            phase: 'compose',
            detail: {
                kind: 'plan',
                artifacts: artifacts.map((a) => ({ shape: SHAPE_LABEL[a.type], title: a.title })),
                why: plan.why,
            },
        },
    );

    /* ---- Pass 2: write the bodies, one artifact at a time ----
       Bounded concurrency rather than Promise.all: the gateway rate-limits per
       user, and nine bodies in flight on a Smart turn is the reliable way to
       have three of them refused. */
    const failed: string[] = [];
    const outlined: { title: string; itemCount: number }[] = [];
    let thin = 0;

    /* Announce the whole plan before writing any of it.
       Every artifact gets its line the moment the plan is known, dimmed and
       waiting, and the placing step after them. This is the difference between
       a trace that reports the past and one that shows a process: the user can
       see what is still coming, and stop early if the shape is wrong rather
       than after paying for all of it. */
    const bodyWork = artifacts.filter((a) => a.type !== 'mindmap');
    const stepFor = new Map<AIArtifactPlan, string>();
    bodyWork.forEach((artifact, index) => {
        stepFor.set(artifact, ctx.step(
            'action',
            `Writing ${SHAPE_LABEL[artifact.type].toLowerCase()} “${artifact.title}”`,
            'queued',
            {
                phase: 'compose',
                detail: { kind: 'artifact', shape: SHAPE_LABEL[artifact.type], title: artifact.title, index: index + 1, total: bodyWork.length },
            },
        ));
    });
    const placeStepId = ctx.step(
        'action',
        `Placing ${artifacts.length} item${artifacts.length === 1 ? '' : 's'} on the canvas`,
        'queued',
        { phase: 'place' },
    );

    await mapWithConcurrency(artifacts, budget.concurrency, async (artifact, index) => {
        assertLive(ctx.signal);
        // Mindmaps are labels all the way down; there is no body to write.
        if (artifact.type === 'mindmap') return;

        const label = `Writing ${SHAPE_LABEL[artifact.type].toLowerCase()} “${artifact.title}”`;
        // Light the line that was already announced, rather than adding a new one.
        const stepId = stepFor.get(artifact) ?? ctx.step('action', label, 'running', { phase: 'compose' });
        /* What this artifact is going to be, stated while it is being written
           rather than only after. "5 lanes · 14 cards" is knowable from the
           plan the moment writing starts, and it is the line that makes the
           wait informative instead of merely narrated. */
        const shapeOf = (a: AIArtifactPlan): string => {
            if (a.type === 'board') {
                const lanes = a.columns?.length ?? 0;
                const cards = a.cards?.length ?? 0;
                return [lanes ? `${lanes} lanes` : '', cards ? `${cards} cards` : ''].filter(Boolean).join(' · ');
            }
            if (a.type === 'timeline') {
                const n = a.milestones?.length ?? 0;
                return n ? `${n} milestone${n === 1 ? '' : 's'}` : '';
            }
            if (a.type === 'mindmap') {
                const n = a.nodes?.length ?? 0;
                return n ? `${n} nodes` : '';
            }
            return `aiming for ${budget.targetBlocks} blocks`;
        };
        const grounded = ctx.provenance?.sources?.filter((s) => s.kind === 'node').length ?? 0;
        const shapeNote = [shapeOf(artifact), grounded ? `grounded on ${grounded} of your cards` : '']
            .filter(Boolean).join(' · ');

        ctx.settle(stepId, 'running', label, {
            phase: 'compose',
            detail: { kind: 'artifact', shape: SHAPE_LABEL[artifact.type], title: artifact.title, index: index + 1, total: bodyWork.length, note: shapeNote || undefined },
        });

        const shared = {
            shape: artifact.type,
            title: artifact.title,
            brief: artifact.brief,
            userRequest: query,
            context,
        };

        try {
            if (artifact.type === 'note' || artifact.type === 'fused-note') {
                const body = await composeBody(shared, { ...ctx.request, signal: ctx.signal });
                artifact.content = body.markdown;
                if (body.thin) thin += 1;
                if (body.repaired) metrics.repaired += 1;
                metrics.blocks.push(body.blocks);
                ctx.settle(stepId, 'done', `${label} — ${body.blocks} blocks${body.thin ? ', came back thin' : ''}`, {
                    phase: 'compose',
                });
                return;
            }

            /* Board cards and timeline steps: batched, because one call each
               would mean fourteen round trips for a fourteen-card board. */
            const items: { title: string; set: (body: string) => void }[] =
                artifact.type === 'board'
                    ? (artifact.cards ?? []).map((card) => ({ title: card.title, set: (b: string) => { card.content = b; } }))
                    : (artifact.milestones ?? []).map((m) => ({ title: m.title, set: (b: string) => { m.content = b; } }));

            let written = 0;
            for (let start = 0; start < items.length; start += ITEM_BATCH_SIZE) {
                assertLive(ctx.signal);
                const batch = items.slice(start, start + ITEM_BATCH_SIZE);
                const markdown = await composeItemBodies(
                    { ...shared, items: batch.map((i) => i.title) },
                    ctx.request,
                );
                const bodies = splitItemBodies(normalizeAIText(markdown), batch.map((i) => i.title));
                batch.forEach((item) => {
                    const body = bodies.get(item.title);
                    if (body) { item.set(body); written += 1; }
                });
            }

            /* An item with no body is placed with its title. Degraded, still
               usable, and the count says so rather than the turn failing. */
            const missing = items.length - written;
            metrics.unwrittenItems += missing;
            ctx.settle(
                stepId,
                'done',
                `${label} — ${written} of ${items.length} item${items.length === 1 ? '' : 's'} written${missing > 0 ? `, ${missing} left as titles` : ''}`,
                { phase: 'compose' },
            );
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;

            /* A board or timeline has a complete, valid structure before this
               enrichment pass starts: its lanes/milestones and item titles all
               came from the plan. Losing that useful scaffold because a
               best-effort prose request timed out or was rate-limited turned a
               recoverable body failure into the all-or-nothing error shown to
               the user. Place the titled structure, make the limitation
               explicit, and leave each item editable for them to flesh out. */
            if (artifact.type === 'board' || artifact.type === 'timeline') {
                const itemCount = artifact.type === 'board'
                    ? artifact.cards?.length ?? 0
                    : artifact.milestones?.length ?? 0;
                outlined.push({ title: artifact.title, itemCount });
                metrics.unwrittenItems += itemCount;
                ctx.settle(
                    stepId,
                    'done',
                    `${label} — details unavailable; adding ${itemCount} titled ${artifact.type === 'board' ? 'card' : 'milestone'}${itemCount === 1 ? '' : 's'}`,
                    {
                        phase: 'compose',
                        detail: {
                            kind: 'note',
                            text: 'The structure is ready to place. Its item descriptions can be filled in on the canvas.',
                        },
                    },
                );
                return;
            }

            failed.push(artifact.title);
            ctx.settle(stepId, 'failed', `Couldn’t write “${artifact.title}” — skipped`, { phase: 'compose' });
        }
    });

    assertLive(ctx.signal);

    /* An artifact whose body failed is dropped rather than placed empty: a card
       with a title and nothing in it is worse than no card. */
    const placeable = artifacts.filter((a) => !failed.includes(a.title));

    /* Say when something already exists rather than quietly making a second one
       (ai-Plan.md §5.6). Duplicates are the failure mode of a canvas assistant
       that cannot see what it has already done: ask twice, get two "Pricing
       page rewrite" cards and no idea which is current.
       It reports rather than skips — the user asked for this, and the AI is not
       entitled to decide their card is close enough. Naming it is the honest
       middle: they can undo the turn or merge, both cheap; a silently skipped
       artifact is neither visible nor recoverable. */
    const existingTitles = new Map(
        useStore.getState().nodes
            .filter((n) => (n.parentId ?? null) === ctx.currentParentId)
            .map((n) => [nodeTitle(n).trim().toLowerCase(), nodeTitle(n)]),
    );
    const duplicates = placeable
        .map((a) => existingTitles.get(a.title.trim().toLowerCase()))
        .filter((title): title is string => Boolean(title));
    if (placeable.length === 0) {
        return {
            createdNodeIds: [],
            summary: 'Every part of that came back unusable, so nothing was added. Try again, or lower the effort — shorter pieces come back cleanly more often.',
        };
    }

    ctx.settle(
        placeStepId,
        'running',
        `Placing ${placeable.length} item${placeable.length === 1 ? '' : 's'} on the canvas`,
        { phase: 'place' },
    );

    const created: string[] = [];
    let blocked = 0;

    // Measure the block first so it can be placed as one unit, then fill it in
    // reading order — card 1 top-left, card 6 bottom-right.
    const rows: { items: AIStructuredAction[]; width: number; height: number; full: boolean }[] = [];
    placeable.forEach((action) => {
        const size = sizeFor(action, ctx.mindmapLayout);
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
            cursorX += sizeFor(action, ctx.mindmapLayout).width + GRID_GAP;
        });
        cursorY += row.height + GRID_GAP;
    });

    positioned.forEach(({ action, position }) => {
        const { ids, label } = placeAction(action, position, ctx);
        // addNode refuses silently once the canvas hits its beta node ceiling,
        // so confirm the node actually landed rather than reporting a success
        // the user can't see anywhere.
        const live = new Set(useStore.getState().nodes.map((n) => n.id));
        const landed = ids.filter((id) => live.has(id));
        created.push(...landed);

        if (landed.length === 0 && ids.length > 0) {
            blocked += 1;
            ctx.step('error', `Couldn't add ${label} — the canvas is at its card limit`, undefined, { phase: 'place' });
        } else if (label) {
            ctx.step('result', `Added ${label}`, undefined, {
                phase: 'place',
                // The ids let the trace line offer the cards as click-to-locate
                // chips, so "what exactly did it just put on my canvas" is
                // answerable from the transcript rather than by hunting.
                detail: { kind: 'cards', nodeIds: landed },
            });
        }
    });

    ctx.settle(
        placeStepId,
        created.length > 0 ? 'done' : 'failed',
        created.length > 0
            ? `Placed ${created.length} item${created.length === 1 ? '' : 's'} on the canvas`
            : 'Nothing could be placed',
        { phase: 'place', ...(created.length > 0 ? { detail: { kind: 'cards' as const, nodeIds: created } } : {}) },
    );

    stampProvenance(created, ctx.provenance);

    /* Check the work before the user acts on it (ai-Plan.md §5.6). Runs AFTER
       placement, not before: the cards are already useful, and holding them
       back behind another round trip would double the perceived latency of the
       one effort level that is already the slowest (§10 D2). */
    let concerns: { title: string; concern: string }[] = [];
    if (budget.verify && created.length > 0) {
        const reviewable = placeable
            .filter((a) => typeof a.content === 'string' && a.content.trim())
            .map((a) => ({ title: a.title, body: a.content as string }));
        if (reviewable.length > 0) {
            const verifyStep = ctx.step('action', 'Checking the claims it made', 'running', { phase: 'verify' });
            concerns = await verifyArtifacts(reviewable, context, ctx.request);
            ctx.settle(
                verifyStep,
                'done',
                concerns.length === 0
                    ? 'Checked the claims — nothing flagged'
                    : `Flagged ${concerns.length} claim${concerns.length === 1 ? '' : 's'} worth verifying`,
                {
                    phase: 'verify',
                    ...(concerns.length > 0
                        ? { detail: { kind: 'note' as const, text: concerns.map((c) => `“${c.title}” — ${c.concern}`).join('\n') } }
                        : {}),
                },
            );
        }
    }

    recordAIRun({
        at: startedAt,
        effort: ctx.request?.effort ?? 'efficient',
        planned: artifacts.length,
        placed: placeable.length,
        failed: failed.length,
        repaired: metrics.repaired,
        thin,
        unwrittenItems: metrics.unwrittenItems,
        blocks: metrics.blocks,
        durationMs: Date.now() - startedAt,
    });

    /* Partial success is stated, not hidden. The old all-or-nothing path had
       nothing to say here because there was no such thing as a partial turn. */
    const notes: string[] = [];
    if (failed.length > 0) {
        notes.push(`${failed.length} of ${artifacts.length} couldn’t be written and ${failed.length === 1 ? 'was' : 'were'} skipped: ${failed.map((t) => `“${t}”`).join(', ')}.`);
    }
    if (outlined.length > 0) {
        notes.push(`${outlined.map(({ title, itemCount }) => `“${title}” (${itemCount} titled item${itemCount === 1 ? '' : 's'})`).join(', ')} was added without descriptions after its writing pass was unavailable.`);
    }
    if (thin > 0) {
        notes.push(`${thin} came back shorter than this effort level usually gives — asking again often fixes it.`);
    }
    if (concerns.length > 0) {
        notes.push(`Worth checking: ${concerns.map((c) => `“${c.title}” — ${c.concern}`).join(' ')}`);
    }
    if (duplicates.length > 0) {
        notes.push(`You already had ${duplicates.length === 1 ? 'a card' : 'cards'} called ${duplicates.map((t) => `“${t}”`).join(', ')} on this canvas — these are new, so merge or undo if that was not what you wanted.`);
    }

    return {
        createdNodeIds: created,
        summary: created.length > 0
            ? notes.join(' ')
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
    // Keeping an answer is as much an AI-created card as a generated one, and
    // it is the one most likely to be found later with no memory of its origin.
    stampProvenance([id], ctx.provenance);
    return id;
}
