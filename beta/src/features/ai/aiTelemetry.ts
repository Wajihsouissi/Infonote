/**
 * Per-run metrics for the AI panel — ai-Plan.md §5.9 / §9.3.
 *
 * §9.3 sets targets (create success rate ≥95%, repair rate ≤15%) that were
 * unmeasurable: nothing counted anything. This records one row per create turn
 * so those numbers exist.
 *
 * DELIBERATELY LOCAL. Persisting these means a store, a retention policy, and
 * a decision about whether beta users' prompts leave their machine — that is a
 * privacy call, not an implementation detail, so nothing here leaves the tab.
 *
 * In development the buffer and its summary hang off `window.__aiRuns`, which
 * is both how a QA run reads them and how they are eyeballed during a session.
 * There is no other accessor: a second one would be a second thing to keep
 * working.
 */

/** Rows kept in memory. A working session, not an audit log. */
const MAX_RUNS = 50;

export interface AIRunMetrics {
    at: number;
    effort: string;
    /** Artifacts the planner returned. */
    planned: number;
    /** Artifacts whose bodies were written and placed. */
    placed: number;
    /** Artifacts dropped because their body could not be written. */
    failed: number;
    /** Bodies that needed a second call to meet the effort budget. */
    repaired: number;
    /** Bodies still under budget after the re-ask. */
    thin: number;
    /** Blocks per placed body — the number the effort dial is supposed to move. */
    blocks: number[];
    durationMs: number;
}

const runs: AIRunMetrics[] = [];

export function recordAIRun(metrics: AIRunMetrics): void {
    runs.push(metrics);
    if (runs.length > MAX_RUNS) runs.shift();

    if (import.meta.env.DEV) {
        const median = metrics.blocks.length
            ? [...metrics.blocks].sort((a, b) => a - b)[Math.floor(metrics.blocks.length / 2)]
            : 0;
        console.debug(
            `[ai:run] ${metrics.effort} · planned ${metrics.planned} · placed ${metrics.placed}` +
            `${metrics.failed ? ` · failed ${metrics.failed}` : ''}` +
            `${metrics.repaired ? ` · repaired ${metrics.repaired}` : ''}` +
            `${metrics.thin ? ` · thin ${metrics.thin}` : ''}` +
            ` · median ${median} blocks · ${(metrics.durationMs / 1000).toFixed(1)}s`,
        );
        (window as unknown as { __aiRuns?: { runs: AIRunMetrics[]; summary: () => AIRunSummary } }).__aiRuns = {
            runs,
            summary: summariseAIRuns,
        };
    }
}

interface AIRunSummary {
    runs: number;
    successRate: number;
    repairRate: number;
    medianBlocks: number;
}

/** The §9.3 numbers, over whatever is in the buffer. */
function summariseAIRuns(): AIRunSummary {
    if (runs.length === 0) return { runs: 0, successRate: 0, repairRate: 0, medianBlocks: 0 };

    const totalPlanned = runs.reduce((n, r) => n + r.planned, 0);
    const totalPlaced = runs.reduce((n, r) => n + r.placed, 0);
    const totalRepaired = runs.reduce((n, r) => n + r.repaired, 0);
    const allBlocks = runs.flatMap((r) => r.blocks).sort((a, b) => a - b);

    return {
        runs: runs.length,
        // Per ARTIFACT, not per turn: a turn that placed five of six is mostly a
        // success, and averaging it as a binary failure would hide the thing
        // partial success was built to deliver.
        successRate: totalPlanned === 0 ? 0 : totalPlaced / totalPlanned,
        repairRate: totalPlaced === 0 ? 0 : totalRepaired / totalPlaced,
        medianBlocks: allBlocks.length === 0 ? 0 : allBlocks[Math.floor(allBlocks.length / 2)],
    };
}
