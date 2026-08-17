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
Answer in the fewest words that fully answer the question. Aim for 1–4 sentences
or a short bullet list. No headings, no tables, no preamble, no summary at the
end. If a one-word answer is correct, give the one word.`,

    efficient: `EFFORT: EFFICIENT — follow the length guidance above as written.
Give a complete answer with light structure where it genuinely helps: a few
bullets, a short list, bold on key terms. Do not pad a simple answer into an
essay, and do not flatten a complex one into a single paragraph.`,

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
