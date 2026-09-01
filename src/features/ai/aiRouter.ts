/**
 * Deciding whether to ask before answering — ai-Plan.md §5.2 (W2).
 *
 * An underspecified request ("help me plan the launch") currently burns a full
 * Smart run on a generic answer, and the user discovers the mismatch only after
 * reading something that missed their real goal. A short form beforehand costs
 * a few seconds and directs the answer to what they actually need.
 *
 * The hard part is NOT generating questions — it is not asking them. A form on
 * a request that was already clear is worse than no form: it adds a step, it
 * reads as the assistant stalling, and it trains people to click Continue
 * without reading. So the gate below is deliberately conservative, and it is
 * checked cheaply and locally before any model call is considered.
 */

import { generateText, type AIRequestOptions } from '../../services/aiService';
import type { AIFormQuestion } from './aiTypes';

export interface ClarifyPlan {
    reason: string;
    questions: AIFormQuestion[];
}

/** Context for the Ask Me planner. It is prompt material, not a gateway
 * request option — keeping it here prevents it accidentally reaching an AI
 * provider as an unknown parameter. */
export interface ClarificationOptions extends AIRequestOptions {
    conversation?: string;
    canvasContext?: string;
}

/** Requests that name their own shape do not need to be asked about it. */
const NAMES_A_SHAPE = /\b(mindmap|mind map|board|kanban|timeline|roadmap|table|checklist|doc|document|card|cards)\b/i;

/** A direct question wants an answer, not an interview. */
const IS_DIRECT_QUESTION = /^(what|who|when|where|which|how (much|many|long|old)|is|are|was|were|does|do|did|can|should|would|will)\b/i;

/**
 * Signals the request already carries its own constraints.
 *
 * Spelled-out numerals are here because people write them: "three pricing
 * tiers" is every bit as specified as "3 pricing tiers", and a digits-only
 * pattern asked a pointless clarifying question about a request that had
 * already named its own scope.
 */
const COUNT = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)`;
const HAS_CONSTRAINTS = new RegExp(
    String.raw`\b(?:${COUNT}\s+\w*\s*(?:weeks?|days?|months?|cards?|steps?|stages?|tiers?|phases?|people|users?|sections?|options?)` +
    String.raw`|for (?:my|our|the)\s+\w+|by (?:next|the)\b|in ${COUNT}\b)`,
    'i',
);

/**
 * Should this turn ask first?
 *
 * Local and free — no model call is spent deciding whether to spend a model
 * call. Every rule here is a reason NOT to ask, because the default has to be
 * "just answer": a false positive costs the user a pointless form on every
 * simple request, which is how this feature would come to be hated.
 */
export function shouldClarify(options: {
    query: string;
    mode: 'create' | 'ask';
    effort: string;
    /** Prior turns; a follow-up is already grounded by the conversation. */
    isFollowUp: boolean;
    /** Cards or a canvas the user attached — they have already said what about. */
    hasScope: boolean;
}): boolean {
    const query = options.query.trim();

    // Fast is a promise about latency. A form breaks it.
    if (options.effort === 'fast') return false;
    // Mid-conversation, the transcript is the context.
    if (options.isFollowUp) return false;
    // They pointed at something; that IS the specification.
    if (options.hasScope) return false;
    // Already told us the shape, or the constraints.
    if (NAMES_A_SHAPE.test(query) || HAS_CONSTRAINTS.test(query)) return false;
    // A direct question deserves a direct answer.
    if (IS_DIRECT_QUESTION.test(query)) return false;
    /* Length is a proxy for "this person has already told me what they want".
       Measured at 10 rather than the 14 first guessed: an 11-word request like
       "write a detailed comparison of our three pricing tiers against
       competitors" is fully specified and was being asked about. Under-asking
       is the safer failure, so the threshold errs low. */
    if (query.split(/\s+/).length > 10) return false;
    // Very short fragments are usually a topic, not a task — "pricing".
    if (query.split(/\s+/).length < 3) return false;

    return true;
}

/**
 * Guard the model's reply into a form we can actually render.
 *
 * SALVAGES rather than rejects. The first version threw the whole plan away on
 * any imperfection — a question with one option, a missing `kind`, or simply
 * two questions where the schema wanted a minimum of two and got one. All three
 * are ordinary model output, and all three produced NO FORM AT ALL, silently,
 * which made `/ask` look broken while the code was working exactly as written.
 *
 * That is the same all-or-nothing mistake as the old single-call generator
 * (§2.3 R3): one bad part killing everything good beside it. A malformed
 * question is dropped; the rest of the form still gets asked. Only a reply with
 * nothing usable in it returns null.
 */
function validateClarifyPlan(value: unknown): ClarifyPlan | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { reason?: unknown; questions?: unknown };
    if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;

    const questions: AIFormQuestion[] = [];
    for (const item of raw.questions.slice(0, 10)) {
        if (!item || typeof item !== 'object') continue;
        const q = item as Record<string, unknown>;
        if (typeof q.prompt !== 'string' || !q.prompt.trim()) continue;

        const options = Array.isArray(q.options)
            ? q.options
                .filter((o): o is { id: string; label: string; hint?: string } =>
                    Boolean(o) && typeof (o as { label?: unknown }).label === 'string')
                .map((o, i) => ({ id: String(o.id ?? `o${i}`), label: o.label, hint: typeof o.hint === 'string' ? o.hint : undefined }))
            : [];

        /* An absent or unrecognised `kind` is inferred from the shape rather
           than being fatal: a question carrying options is a choice, one
           without is free text. The model omitting a field it was told to send
           is not a reason to ask the user nothing. */
        const declared = q.kind === 'single' || q.kind === 'multi' || q.kind === 'text' ? q.kind : null;
        const kind: AIFormQuestion['kind'] = declared ?? (options.length >= 2 ? 'single' : 'text');

        // A choice with nothing to choose between becomes free text, not a
        // discarded question — the thing being asked about is still real.
        const finalKind: AIFormQuestion['kind'] = kind !== 'text' && options.length < 2 ? 'text' : kind;

        const optionIds = new Set(options.map((o) => o.id));
        const defaults = Array.isArray(q.defaults)
            ? q.defaults.filter((d): d is string => typeof d === 'string' && optionIds.has(d))
            : [];

        questions.push({
            id: String(q.id ?? `q${questions.length}`),
            prompt: q.prompt.trim(),
            kind: finalKind,
            options: finalKind === 'text' ? undefined : options.slice(0, 5),
            /* Every choice question must arrive pre-answered, so Continue is
               always a valid, sensible run. A model that returns no default gets
               the first option picked for it rather than an empty form. */
            defaults: finalKind === 'text' ? [] : defaults.length > 0 ? defaults : [options[0].id],
        });
    }

    // One good question is still worth asking; nothing usable is not a form.
    if (questions.length === 0) return null;

    return {
        reason: typeof raw.reason === 'string' && raw.reason.trim()
            ? raw.reason.trim()
            : 'A couple of answers will help tailor this to what you need.',
        questions,
    };
}

/**
 * Ask the model what it needs to know.
 *
 * Returns `null` on any failure — a form that cannot be generated must never
 * block the run. The caller falls through and answers the question as asked,
 * which is exactly what would have happened before this existed.
 */
export async function planClarification(
    query: string,
    _mode: 'create' | 'ask',
    options: ClarificationOptions = {},
): Promise<ClarifyPlan | null> {
    const system = `You write short answer-briefing forms for Infonote.

The user chose /ask because they want to direct the answer before it is written.
Ask 2-4 questions — the FEWEST that materially improve the answer's relevance,
accuracy, or usefulness. Focus on the user's goal or decision, audience or
starting knowledge, desired depth or scope, preferred written format or tone,
and hard constraints. Never ask something you could reasonably assume, and
never ask for information the user would have to go and look up.

Rules:
- Each question is one short sentence, in the user's own vocabulary.
- "single" = pick one, "multi" = pick any, "text" = free response. Prefer
  single and multi; at most ONE text question, and only if it genuinely helps.
- Choice questions need 2-5 concrete, distinguishable options. Never include an
  "Other" or "Something else" option.
- Mark sensible defaults so pressing Continue without changing anything gives a
  useful answer.
- Never ask how anything should be shown, grouped, positioned, or placed on a
  canvas. Do not ask about cards, boards, mind maps, timelines, layouts, or app
  UI. Those are not part of the answer brief.
- If canvas context is attached, treat it as source material only. Ask what the
  user wants to understand, decide, compare, plan, or write from that material.

Respond ONLY with a JSON object, no markdown or prose:
{"reason":"one sentence on why you are asking","questions":[{"id":"q1","prompt":"What do you want this answer to help you do?","kind":"single","options":[{"id":"understand","label":"Understand the topic","hint":"A clear explanation with key ideas"},{"id":"decide","label":"Make a decision","hint":"Tradeoffs and a recommendation"}],"defaults":["understand"]}]}`;

    try {
        const context = [
            options.conversation ? `[CONVERSATION SO FAR]\n${options.conversation}` : '',
            options.canvasContext ? `[CANVAS SCOPE]\n${options.canvasContext}` : '',
        ].filter(Boolean).join('\n\n');
        const reply = await generateText(`The user asked:\n"${query}"${context ? `\n\n${context}` : ''}`, {
            system,
            model: options.model,
            // Small and fixed: a form is a handful of short strings, and this
            // runs before the user has seen anything, so it has to be quick.
            maxTokensOverride: 900,
        });
        const match = /\{[\s\S]*\}/.exec(reply.replace(/```(?:json)?/g, ''));
        if (!match) return null;
        return validateClarifyPlan(JSON.parse(match[0]));
    } catch {
        return null;
    }
}

/**
 * Generate one genuinely useful follow-up question for the active Ask Me
 * form. The caller enforces the ten-question cap; this function only returns
 * a safe, renderable question or `null`.
 */
export async function planAdditionalClarificationQuestion(
    query: string,
    _mode: 'create' | 'ask',
    existingQuestions: AIFormQuestion[],
    options: ClarificationOptions = {},
): Promise<AIFormQuestion | null> {
    const existing = existingQuestions.map((question) => `- ${question.prompt}`).join('\n');
    const context = [
        options.conversation ? `[CONVERSATION SO FAR]\n${options.conversation}` : '',
        options.canvasContext ? `[CANVAS SCOPE]\n${options.canvasContext}` : '',
    ].filter(Boolean).join('\n\n');
    const system = `You add ONE high-value answer-directing question to an Ask Me form in Infonote.

Avoid duplicating the existing questions. Ask only for a decision that would
materially improve the answer's relevance, accuracy, or usefulness. Focus on
the user's goal, audience, depth, written format or tone, or constraints. Never
ask about canvas placement, visual output shape, cards, boards, layouts, or app
UI. Return a choice question whenever possible, with 2-5 useful options and a
sensible default. “text” may have no options.

Respond ONLY with JSON:
{"question":{"id":"q-extra","prompt":"...","kind":"single","options":[{"id":"a","label":"..."}],"defaults":["a"]}}`;
    try {
        const reply = await generateText(
            `Request:\n"${query}"\n\nExisting questions:\n${existing || '(none)'}${context ? `\n\n${context}` : ''}`,
            { system, model: options.model, maxTokensOverride: 500 },
        );
        const match = /\{[\s\S]*\}/.exec(reply.replace(/```(?:json)?/g, ''));
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as { question?: unknown };
        const validated = validateClarifyPlan({ questions: [parsed.question] });
        if (!validated?.questions[0]) return null;
        return { ...validated.questions[0], id: `q-${crypto.randomUUID?.() ?? Date.now()}` };
    } catch {
        return null;
    }
}

/**
 * Fold the answers into a brief the run can act on.
 *
 * Prepended to the request rather than replacing it: the user's own words stay
 * the primary instruction, and the answers qualify them.
 */
export function answersAsBrief(
    questions: AIFormQuestion[],
    answers: Record<string, string[]>,
    customAnswers: Record<string, string> = {},
    additionalInfo = '',
): string {
    const lines = questions
        .map((question) => {
            const chosen = answers[question.id] ?? [];
            const custom = customAnswers[question.id]?.trim() ?? '';
            if (chosen.length === 0 && !custom) return '';
            const text = question.kind === 'text'
                ? chosen[0]
                : chosen
                    .map((id) => question.options?.find((o) => o.id === id)?.label ?? id)
                    .join(', ');
            const response = [text?.trim(), custom].filter(Boolean).join('; ');
            return response ? `- ${question.prompt} ${response}` : '';
        })
        .filter(Boolean);

    if (additionalInfo.trim()) lines.push(`- Additional context: ${additionalInfo.trim()}`);

    return lines.length === 0 ? '' : `[THE USER CLARIFIED]\n${lines.join('\n')}\n`;
}
