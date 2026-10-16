import { useStore } from '../../../store/useStore';
import type { AIProvenance } from '../../../types';
import type { AIRequestOptions, AIStructuredAction } from '../../../services/ai/types';
import type { AIPhase, AITraceDetail } from '../aiTypes';

/**
 * What a run is given, and what it hands back.
 *
 * The runner is the canvas half of the AI panel: it turns a request into nodes
 * and narrates itself while it does. Everything it needs from the outside world
 * — where to place things, how to report a step, how to stop — arrives in this
 * context, so the same run can be driven by the panel, by a test, or by any
 * other surface without the runner knowing which.
 */
export interface RunnerContext {
    /** Flow-space anchor for whatever gets placed (usually the viewport centre). */
    origin: { x: number; y: number };
    viewport: () => { x: number; y: number; zoom: number; screenW: number; screenH: number };
    currentParentId: string | null;
    /**
     * Log a step; returns its id so the caller can flip it to done/failed.
     *
     * `extra` carries the trace phase and the expandable payload. Both are
     * optional and appended rather than woven into the positional arguments, so
     * only the steps with something worth expanding pay for it.
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
     * Stamped onto every node this run places.
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
     * the before-state has to survive the turn. The array is supplied by the
     * caller and filled here, which keeps the runner free of any opinion about
     * how the revert is offered.
     */
    edits?: AIEditSnapshot[];
    /**
     * Called as soon as a run has placed its (still empty) artifacts, before
     * any body is written — so the panel can focus the canvas on them and the
     * user watches the content stream in, instead of seeing it all at the end.
     */
    onPlaced?: (nodeIds: string[]) => void;
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

/** Schema type -> the word the user calls it. Drives the plan trace chips. */
export const SHAPE_LABEL: Record<AIStructuredAction['type'], string> = {
    note: 'Card',
    'fused-note': 'Document',
    mindmap: 'Mind map',
};

export const NOTE_SIZE = { width: 432, height: 432 };
export const DOC_SIZE = { width: 800, height: 600 };

/** Cards per row before the plan wraps to a new line. */
export const PER_ROW = 3;
/** Anything this wide claims a row of its own — a wide mind map does. */
export const FULL_ROW_WIDTH = 900;

export function assertLive(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
}

/**
 * Stamp provenance onto everything a run just placed.
 *
 * Applied AFTER placement in one pass rather than threaded through every
 * `addNode` call. Placement is the load-bearing layout code and is deliberately
 * left alone: a card that landed is a card that gets stamped, and that stays
 * true however placement changes later.
 */
export function stampProvenance(ids: string[], provenance?: AIProvenance): void {
    if (!provenance || ids.length === 0) return;
    const { updateNodeData } = useStore.getState();
    for (const id of ids) updateNodeData(id, { aiProvenance: provenance });
}
