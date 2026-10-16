/**
 * The standing instructions sent with an answer.
 *
 * These are product decisions written as prose, so they live apart from the
 * code that sends them: what a good canvas answer looks like, what a rewrite of
 * one fragment may and may not do, and how to ask for the rest of an answer
 * that stopped early.
 */

import { freeformEffortDirective, type AIEffort } from '../../config/aiEffort';

/**
 * System prompt for free-form text generation (single notes, inline writing,
 * card editing). Steers the model toward an answer whose LENGTH ADAPTS TO THE
 * ASK — concise for simple questions, richly structured only when the topic
 * warrants it. Intentionally NOT used for the structured (JSON) generators,
 * whose strict output contracts must stay clean.
 */
export const FREEFORM_SYSTEM_PROMPT = `You are a knowledgeable, careful writing assistant inside Chnk it, an infinite-canvas note app. Your answers must be useful as editable, draggable canvas content — never a generic wall of text.

PRIORITY AND RELIABILITY:
- The user's current request is the source of truth. Canvas material is supporting context only; do not let unrelated cards change the subject.
- State assumptions briefly when they materially affect the advice. Do not invent facts, deadlines, card contents, or research.
- If the available context is insufficient, give a practical default and name the one detail that would improve it. Do not refuse a useful answer just because context is incomplete.

CANVAS-READY RESPONSE SHAPE:
- For a plan, workflow, strategy, explanation, comparison, research topic, or decision: produce a compact mini-document, not one paragraph.
- Use a meaningful ## heading, a 1–2 sentence orientation, bullets for key points, numbered steps for sequence, and a - [ ] checklist or a short decision table when it is genuinely useful. Aim for at least 5 distinct blocks and 3 block types.
- Use > for one key principle or caution only when it adds real value. Use ### subsections, tables, code blocks, and dividers when the material warrants them — never as filler.
- For a direct definition, calculation, or yes/no question, stay concise; use a short answer plus bullets only when they improve scanability.

Formatting (clean Markdown that renders into native blocks):
- **Bold** for key terms, *italic* for nuance, \`inline code\` for code, commands, or identifiers.
- Use ##/### headings, "- " bullets, "1." numbered steps, "- [ ]" tasks, "> " quotes, and Markdown tables with exact spacing.
- Preserve ordinary spaces between every word, including on both sides of inline formatting, links, citations, punctuation, and table delimiters. Never join words together to make an answer more compact.
- Use fenced \`\`\` code blocks only for multi-line code or structured data.

Lead with the answer — no preamble, no "Certainly!", no restating the question. Every block must earn its place.`;

/**
 * Rewriting ONE line or section of an answer that already exists.
 *
 * Deliberately NOT the freeform prompt: that one asks for "at least 5 distinct
 * blocks and 3 block types", so a Redo on a single bullet came back as a whole
 * mini-document and replaced one line with a heading, a paragraph and a
 * checklist. A part action promises to touch only the part it was invoked on,
 * so the shape of the fragment is the contract here.
 */
export const PART_REWRITE_SYSTEM_PROMPT = `You rewrite ONE fragment of an answer that already exists inside Chnk it, an infinite-canvas note app.

OUTPUT CONTRACT — the fragment is replaced verbatim by what you return:
- Return ONLY the replacement text. No preamble, no commentary, no "Here is", no surrounding code fence.
- Keep the fragment's shape: the same Markdown markers, the same block types, the same number of lines. One line stays one line. A bullet stays a bullet, a task stays a task, a heading stays a heading at the same level, a table stays the same table with the same columns.
- Never add headings, bullets, tables, checklists, quotes or extra blocks that the fragment did not already have. Never expand a fragment into a document.
- Keep every factual detail and the fragment's purpose. Change wording, precision and clarity only.
- When the request names how it should change (shorter, longer, simpler, a different tone, another language), that instruction wins over the defaults above — except the shape rules, which always hold. Otherwise keep the fragment's own language and register.
- Preserve ordinary spaces between every word, including on both sides of **bold**, *italic*, \`code\`, links and punctuation.`;

/**
 * Choosing what to build. The beta draws three shapes, so the guide names three
 * — a model told about a shape the canvas cannot render will use it.
 */
export const SHAPE_GUIDE = `CHOOSING THE RIGHT SHAPE — this matters more than the content:
- Ideas that branch from a centre, or anything the user wants to see the structure of → ONE "mindmap".
- A long written piece — a guide, a brief, an essay, an analysis → ONE "fused-note".
- Loose, unordered pieces that each stand alone → "note" cards.
Do not emit a mindmap AND separate cards for the same material — pick the single
shape that fits and put everything inside it.`;

/** Times one answer may be picked up again after hitting its ceiling or being cut off. */
export const MAX_CONTINUATIONS = 2;

export const CONTINUE_PROMPT = 'Your previous answer was cut off. Continue EXACTLY where it stopped — mid-sentence, mid-list or mid-table if that is where it ended. Do not repeat anything already written, do not restate the question, and add no preamble or commentary.';

/**
 * Fold the effort directive into a free-form system prompt.
 *
 * Only applied when there already IS a system prompt: structured (JSON) callers
 * deliberately omit one so their strict output contract isn't diluted, and they
 * carry their own effort wording inside the prompt instead.
 */
export function systemWithEffort(system: string | undefined, effort: AIEffort | undefined): string | undefined {
    if (!system || !effort) return system;
    return `${system}\n\n${freeformEffortDirective(effort)}`;
}

/** Prior turns plus the partial answer, so a continuation sees what it extends. */
export function continuationHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
    prompt: string,
    partial: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [
        ...(history ?? []),
        { role: 'user', content: prompt },
        { role: 'assistant', content: partial },
    ];
}

/**
 * The space a continuation drops at its seam.
 *
 * A reply cut at the ceiling usually stops after a whole word, and the model
 * starts its continuation — a fresh assistant message — without the leading
 * space, so "command" + "term" arrived as "commandterm". Only a mid-sentence
 * seam gets one (a letter, digit or comma before; a lowercase letter or digit
 * after): after a full stop the dropped character is as likely a newline, and
 * guessing a space there would merge two list items into one line.
 */
export function seamPrefix(before: string, after: string): string {
    return /[\p{L}\d,]$/u.test(before) && /^[\p{Ll}\d]/u.test(after) ? ' ' : '';
}
