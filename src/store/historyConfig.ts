import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types';
import type { HistoryState } from './temporalControl';

/**
 * Fields React Flow mutates as part of pure UI interaction (selecting,
 * measuring, in-flight drag/resize flags). Changes to ONLY these must never
 * create an undo step — otherwise clicking or hovering a card pollutes history.
 */
const VOLATILE_NODE_FIELDS = new Set(['selected', 'measured', 'dragging', 'resizing']);
const VOLATILE_EDGE_FIELDS = new Set(['selected']);

/** True when two nodes are identical apart from volatile UI-only fields. */
function nodesEquivalent(a: AppNode, b: AppNode): boolean {
    if (a === b) return true;

    for (const key in a) {
        if (VOLATILE_NODE_FIELDS.has(key)) continue;
        if ((a as any)[key] === (b as any)[key]) continue;
        // `position` is re-created each drag frame; compare by value so a no-op
        // re-render with identical coordinates doesn't count as a move.
        if (key === 'position' && a.position && b.position &&
            a.position.x === b.position.x && a.position.y === b.position.y) {
            continue;
        }
        return false;
    }
    // Catch keys present on `b` but not `a`.
    for (const key in b) {
        if (VOLATILE_NODE_FIELDS.has(key)) continue;
        if (!(key in a)) return false;
    }
    return true;
}

function edgesEquivalent(a: Edge, b: Edge): boolean {
    if (a === b) return true;
    for (const key in a) {
        if (VOLATILE_EDGE_FIELDS.has(key)) continue;
        if ((a as any)[key] !== (b as any)[key]) return false;
    }
    for (const key in b) {
        if (VOLATILE_EDGE_FIELDS.has(key)) continue;
        if (!(key in a)) return false;
    }
    return true;
}

/**
 * zundo `equality`: return TRUE to SKIP recording a snapshot.
 *
 * Relies on the slices' immutable updates — unchanged nodes/edges keep their
 * reference, so the per-item loop short-circuits and only genuinely-changed
 * items are inspected. This makes the check cheap even during a drag.
 */
export function historyEquality(past: HistoryState, curr: HistoryState): boolean {
    if (past === curr) return true;

    const pNodes = past.nodes, cNodes = curr.nodes;
    if (pNodes !== cNodes) {
        if (pNodes.length !== cNodes.length) return false;
        for (let i = 0; i < pNodes.length; i++) {
            if (pNodes[i] === cNodes[i]) continue;
            if (pNodes[i].id !== cNodes[i].id) return false; // reordered / structural
            if (!nodesEquivalent(pNodes[i], cNodes[i])) return false;
        }
    }

    const pEdges = past.edges, cEdges = curr.edges;
    if (pEdges !== cEdges) {
        if (pEdges.length !== cEdges.length) return false;
        for (let i = 0; i < pEdges.length; i++) {
            if (pEdges[i] === cEdges[i]) continue;
            if (pEdges[i].id !== cEdges[i].id) return false;
            if (!edgesEquivalent(pEdges[i], cEdges[i])) return false;
        }
    }

    return true; // only volatile differences → not a real change
}

/**
 * Coalesce a burst of rapid mutations into a SINGLE undo step using a
 * leading-edge debounce.
 *
 * - Fires on the first change of a burst, capturing the pre-burst state as the
 *   undo target, then suppresses further changes until the canvas is quiet for
 *   `waitMs`. A multi-second drag (frames every ~16ms) or a synchronous cascade
 *   of `set()` calls therefore becomes one entry.
 * - Leading (not trailing) so the change is undoable immediately — no window
 *   where a just-performed action isn't yet in history.
 *
 * Typing commits land ~300ms apart (editor debounce), so they stay as separate,
 * sentence-sized steps rather than collapsing into one.
 */
export function createCoalescingHandleSet<HS extends (...args: any[]) => void>(waitMs: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (handleSet: HS) =>
        (...args: Parameters<HS>) => {
            const isLeadingEdge = timer === null;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { timer = null; }, waitMs);
            if (isLeadingEdge) handleSet(...args);
        };
}
