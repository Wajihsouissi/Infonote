/**
 * Body composition and its budget check — ai-Plan.md §5.5 (W5).
 *
 * The generator's second pass writes one artifact's markdown at a time; this
 * module is what turns "the effort dial should give me more blocks" from a
 * prompt directive into something the code actually verifies. A body that comes
 * back under budget is re-asked ONCE, naming the deficit, and then accepted
 * with a note rather than looped on — a retry loop over a model that has
 * decided to be terse costs money and still ends terse.
 */

import { composeArtifactBody, type AIRequestOptions, type AIStructuredAction } from '../../services/aiService';
import { effortBudget } from '../../config/aiEffort';
import { parsePlainText } from '../editor/pasteUtils';
import { normalizeAIText } from './aiResultUtils';
import type { Block } from '../editor/types';

export interface BodyRequest {
    shape: AIStructuredAction['type'];
    title: string;
    brief?: string;
    itemTitle?: string;
    userRequest: string;
    context?: string;
}

export interface BodyResult {
    markdown: string;
    blocks: number;
    /** Distinct block types present — the anti-wall-of-paragraphs measure. */
    types: number;
    /** True when the re-ask still came back under budget. */
    thin: boolean;
    /** Whether a second call was spent on this body. */
    repaired: boolean;
}

/**
 * Count what `parsePlainText` will actually make of this markdown.
 *
 * Counting the parser's output rather than the raw text is the whole point:
 * asking the model for "12 blocks" is meaningless unless the thing measured is
 * the same thing the editor will render. A body of twelve newline-separated
 * fragments that the parser folds into three paragraphs has not met the budget,
 * and this is what notices.
 */
export function measureBody(markdown: string): { blocks: number; types: number } {
    const parsed: Block[] = parsePlainText(markdown);
    const meaningful = parsed.filter((block) => {
        if (block.type === 'divider') return true;
        return typeof block.content === 'string' ? block.content.trim().length > 0 : true;
    });
    return {
        blocks: meaningful.length,
        types: new Set(meaningful.map((block) => block.type)).size,
    };
}

/**
 * Write one body and hold it to the effort budget.
 *
 * The deficit message names the specific shortfall ("came back as 4 blocks of
 * plain paragraphs; this needs at least 12 blocks and at least 4 different
 * kinds") rather than saying "try harder", because a model given a number hits
 * the number far more often than one given an adjective.
 */
export async function composeBody(
    request: BodyRequest,
    options: AIRequestOptions & { signal?: AbortSignal } = {},
): Promise<BodyResult> {
    const budget = effortBudget(options.effort);
    const isItem = Boolean(request.itemTitle);
    const minBlocks = isItem ? Math.max(2, Math.round(budget.minBlocks / 3)) : budget.minBlocks;
    const minTypes = isItem ? Math.max(1, budget.minBlockTypes - 2) : budget.minBlockTypes;

    /* Repair emphasis the model glued to neighbouring words before anything
       measures or stores it, so the canvas card and the panel agree. */
    const markdown = normalizeAIText(await composeArtifactBody(request, options));
    if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');

    const first = measureBody(markdown);
    const short = first.blocks < minBlocks;
    const flat = first.types < minTypes;
    if (!short && !flat) {
        return { markdown, blocks: first.blocks, types: first.types, thin: false, repaired: false };
    }

    const deficit = [
        `It came back as ${first.blocks} block${first.blocks === 1 ? '' : 's'} using ${first.types} kind${first.types === 1 ? '' : 's'} of block.`,
        short ? `It needs at least ${minBlocks} blocks.` : '',
        flat ? `It needs at least ${minTypes} different block types — add a table, a checklist, headings or a quote where they genuinely help.` : '',
    ].filter(Boolean).join(' ');

    const second = normalizeAIText(await composeArtifactBody({ ...request, deficit }, options));
    if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');

    const retry = measureBody(second);
    /* Keep whichever attempt is actually richer. A re-ask that comes back
       WORSE is not rare, and silently preferring the newer one would make the
       budget check a net loss on those turns. */
    const useRetry = retry.blocks >= first.blocks;
    const chosen = useRetry ? { text: second, ...retry } : { text: markdown, ...first };

    return {
        markdown: chosen.text,
        blocks: chosen.blocks,
        types: chosen.types,
        thin: chosen.blocks < minBlocks || chosen.types < minTypes,
        repaired: true,
    };
}

/** How many item bodies to ask for in one call. */
export const ITEM_BATCH_SIZE = 5;

/**
 * Split a heading-delimited batch reply back into `title -> body`.
 *
 * Matching is normalised (case, whitespace, the several dash characters models
 * swap freely) because "Week 1 — Research" comes back as "Week 1 - Research"
 * often enough to matter. An item whose heading never appears simply gets no
 * body: it is placed with its title, which is degraded but perfectly usable —
 * far better than discarding the whole batch over one paraphrased heading.
 */
export function splitItemBodies(markdown: string, titles: string[]): Map<string, string> {
    const normalise = (value: string) => value
        .toLowerCase()
        .replace(/[‐-―−]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 -]/g, '')
        .trim();

    const wanted = new Map(titles.map((title) => [normalise(title), title]));
    const bodies = new Map<string, string>();

    // Split on any heading level: models drift between ## and ### despite the
    // instruction, and the level carries no meaning here.
    const sections = markdown.split(/^#{2,4}\s+(.+?)\s*$/m);
    for (let i = 1; i < sections.length; i += 2) {
        const heading = normalise(sections[i] ?? '');
        const body = (sections[i + 1] ?? '').trim();
        const title = wanted.get(heading);
        if (title && body) bodies.set(title, body);
    }

    return bodies;
}

/**
 * Run `tasks` with at most `limit` in flight.
 *
 * Bounded rather than `Promise.all` because the gateway rate-limits per user:
 * firing nine bodies at once on a Smart turn is the reliable way to have three
 * of them refused, which would turn the partial-success design into a partial-
 * failure one. Results come back in input order regardless of finish order.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        for (;;) {
            const index = cursor++;
            if (index >= items.length) return;
            try {
                results[index] = { status: 'fulfilled', value: await task(items[index], index) };
            } catch (reason) {
                results[index] = { status: 'rejected', reason };
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
