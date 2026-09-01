/**
 * How hard the AI works on an answer.
 *
 * This is a separate dial from the model in `aiModels.ts`. The model decides
 * *who* answers; effort decides *how much* they write and how much structure
 * they reach for. The two are deliberately independent — a fast model asked for
 * a deep note should still produce a deep note, just sooner.
 *
 * Effort is expressed as prompt directives rather than a provider parameter,
 * because the thing being controlled is editorial (depth, block variety), not
 * a sampling setting. Each level also carries a token ceiling so "Smart" is not
 * silently truncated mid-table and "Fast" cannot run away.
 */

export type AIEffort = 'fast' | 'efficient' | 'smart';

export interface AIEffortOption {
    id: AIEffort;
    label: string;
    /** One line shown under the name in the picker. */
    hint: string;
}

export const AI_EFFORT_LEVELS: AIEffortOption[] = [
    { id: 'fast', label: 'Fast', hint: 'Short and direct — the answer, nothing else' },
    { id: 'efficient', label: 'Efficient', hint: 'Balanced depth with light structure' },
    { id: 'smart', label: 'Smart', hint: 'Long, deep and richly formatted' },
];

export const DEFAULT_AI_EFFORT: AIEffort = 'efficient';

/** True for an id this build still offers — guards a stale saved preference. */
export const isKnownEffort = (id: string | null): id is AIEffort =>
    AI_EFFORT_LEVELS.some((e) => e.id === id);

export const effortLabel = (id: AIEffort): string =>
    AI_EFFORT_LEVELS.find((e) => e.id === id)?.label ?? 'Efficient';

/**
 * Output ceiling per level. The server clamps anything above 8192 and the
 * routes default to 4096, so these only ever narrow or widen within that.
 */
const MAX_TOKENS: Record<AIEffort, number> = {
    fast: 800,
    efficient: 3000,
    smart: 8000,
};

export const effortMaxTokens = (effort: AIEffort): number => MAX_TOKENS[effort];

/**
 * Appended to the free-form system prompt (Ask, inline writing).
 *
 * FREEFORM_SYSTEM_PROMPT tells the model to match length to the question; these
 * override that default in one direction or the other, so the wording has to be
 * explicit about *replacing* the adaptive rule rather than sitting beside it.
 */
const FREEFORM_DIRECTIVE: Record<AIEffort, string> = {
    fast: `EFFORT: FAST — this overrides the length guidance above.
Be decisive and compact, but preserve a useful canvas shape for plans, workflows
and explanations: one ## heading, a short orientation, focused bullets, and
steps or tasks where relevant. Aim for 5–8 blocks and under 450 words. A direct
factual answer can still be 1–3 sentences.`,

    efficient: `EFFORT: EFFICIENT — follow the length guidance above as written.
Give a complete, scannable canvas response. For a non-trivial request, use
8–14 blocks with sections, key points, sequence and concrete next actions. Do
not pad a simple answer into an essay, and do not flatten a useful answer into
a single paragraph.`,

    smart: `EFFORT: SMART — this overrides the length guidance above.
Treat every question as worth a thorough, well-organised answer. Go deep:
explain the mechanism and the why, not just the what. Cover edge cases,
trade-offs, common mistakes and worked examples. Reach for the full range of
formatting — ## and ### sections, tables for anything comparative, > quote
blocks for definitions or key principles, numbered steps for procedures, fenced
code blocks for code, and bold for terms of art. Long is expected here; a thin
answer is a failure at this level. Still lead with the answer, never a preamble.`,
};

export const freeformEffortDirective = (effort: AIEffort): string => FREEFORM_DIRECTIVE[effort];

/**
 * Injected into the structured (JSON) generator that builds cards, boards,
 * mindmaps and timelines.
 *
 * Content there is markdown that `parsePlainText` turns into editor blocks, so
 * asking for tables and quotes is really asking for table/quote blocks. The
 * block vocabulary named here is exactly what that parser recognises — listing
 * anything else would just produce literal markdown sitting in a text block.
 */
const STRUCTURED_DIRECTIVE: Record<AIEffort, string> = {
    fast: `EFFORT: FAST — keep every body short.
Each "content" is 1–3 sentences, or up to 4 bullets. No headings, no tables, no
quotes. Prefer the smallest number of items that answers the request.`,

    efficient: `EFFORT: EFFICIENT — moderate depth.
Each "content" is a few short paragraphs or a tight list — enough to be useful
on its own. Use headings and bullets where they help; a table or quote only when
the material really is tabular or quotable.`,

    smart: `EFFORT: SMART — build something substantial.
Each "content" should read like a well-made page of notes, not a caption. Use
the full block vocabulary the editor renders:
- "## " and "### " headings to section anything longer than a few paragraphs
- markdown tables (| a | b |) for comparisons, specs, pros/cons, schedules
- "> " quote blocks for definitions, key principles and notable statements
- "- " bullets, "1. " numbered steps, and "- [ ] " checkboxes for actions
- fenced \`\`\` code blocks for code, commands or structured data
- "---" dividers between major sections
Go deep on the subject: background, mechanism, concrete examples, caveats.
Prefer several rich cards over many thin ones, and never emit a card whose body
is a single sentence.`,
};

export const structuredEffortDirective = (effort: AIEffort): string => STRUCTURED_DIRECTIVE[effort];

/**
 * What each effort level is allowed to spend, and what it must deliver —
 * ai-Plan.md §5.5 (W5).
 *
 * The directives above ASK for depth. Nothing checked the reply, so a Smart run
 * that came back with six one-sentence cards passed validation and got placed:
 * "richer output at higher effort" was a prompt, not a contract. These numbers
 * are the contract. `composeArtifactBody` counts the blocks it parsed and
 * re-asks once, naming the deficit, when a body comes in under them.
 *
 * The counts are starting points tuned against real output, not physics. When
 * they change, change them here and record it in ai-Plan.md §11 — they are the
 * one place the phrase "depends on the effort" is actually cashed out.
 */
export interface AIEffortBudget {
    /** Hard ceiling on artifacts per turn; the planner is told this number. */
    maxArtifacts: number;
    /** A body under this many blocks is re-asked once. */
    minBlocks: number;
    /** What the body prompt aims for — always above `minBlocks`. */
    targetBlocks: number;
    /** Distinct block types (heading/bullet/table/quote/todo/code) required. */
    minBlockTypes: number;
    /** Output ceiling for ONE body call. */
    bodyTokens: number;
    /** How many bodies may be in flight at once. */
    concurrency: number;
    /**
     * Spend one extra call reviewing the bodies against the evidence.
     *
     * Smart only, and deliberately so: it costs a round trip and buys a check
     * on claims the user is most likely to act on. At Fast it would break the
     * latency promise for output nobody treats as authoritative anyway.
     */
    verify: boolean;
}

const BUDGETS: Record<AIEffort, AIEffortBudget> = {
    fast: { maxArtifacts: 3, minBlocks: 3, targetBlocks: 6, minBlockTypes: 2, bodyTokens: 700, concurrency: 3, verify: false },
    efficient: { maxArtifacts: 6, minBlocks: 6, targetBlocks: 12, minBlockTypes: 3, bodyTokens: 1800, concurrency: 3, verify: false },
    smart: { maxArtifacts: 9, minBlocks: 12, targetBlocks: 22, minBlockTypes: 4, bodyTokens: 3500, concurrency: 2, verify: true },
};

export const effortBudget = (effort: AIEffort = DEFAULT_AI_EFFORT): AIEffortBudget => BUDGETS[effort];

/**
 * The skeleton pass's own ceiling, deliberately independent of effort.
 *
 * A plan is titles and scaffolding whatever the effort — it is the BODIES that
 * get long. Letting Smart raise this would only give the model room to start
 * writing content into the plan, which is the single-giant-JSON failure the
 * split exists to remove.
 */
export const PLAN_MAX_TOKENS = 1200;
