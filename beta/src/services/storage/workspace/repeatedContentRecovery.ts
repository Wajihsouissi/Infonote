import type { Block } from '../../../features/editor/types';

// Ordinary repeated lines, copied blocks and duplicate IDs still go through
// identity repair unchanged. Only an enormous run of the EXACT SAME object
// matches the historical parent-sync corruption (2^n - 1 blank references).
const CORRUPT_RUN_LENGTH = 10_000;

export interface RepeatedContentRecovery {
    format: 'chnk-it-repeated-block-runs';
    version: 1;
    originalLength: number;
    /** Lossless original sequence, including original IDs and metadata. */
    runs: Array<{ block: Block; count: number }>;
}

/** Bound identity repair before it allocates one UUID/object per corrupt
 * occurrence. Keep the complete original sequence as portable run-length data
 * beside the editable content; never truncate unique blocks or mutate input. */
export function recoverRepeatedContent(source: Block[]): { content: Block[]; recovery: RepeatedContentRecovery } | null {
    if (source.length < CORRUPT_RUN_LENGTH) return null;
    let hasCorruptRun = false, runLength = 0, previous: Block | undefined;
    for (const block of source) {
        runLength = block === previous ? runLength + 1 : 1;
        previous = block;
        if (block && typeof block === 'object' && runLength >= CORRUPT_RUN_LENGTH) { hasCorruptRun = true; break; }
    }
    if (!hasCorruptRun) return null;
    const content: Block[] = [], runs: RepeatedContentRecovery['runs'] = [];
    // Two linear passes and memory proportional to the surviving sequence,
    // rather than a Set/map holding tens of millions of generated identities.
    for (let start = 0; start < source.length;) {
        const block = source[start];
        let end = start + 1;
        while (end < source.length && source[end] === block) end++;
        const count = end - start;
        runs.push({ block, count });
        const retained = block && typeof block === 'object' && count >= CORRUPT_RUN_LENGTH ? 1 : count;
        for (let i = 0; i < retained; i++) content.push(block);
        start = end;
    }
    return { content, recovery: { format: 'chnk-it-repeated-block-runs', version: 1, originalLength: source.length, runs } };
}
