/**
 * The two-pass generator.
 *
 * One call used to produce every artifact AND every body: a request for six
 * rich cards therefore needed several thousand tokens of perfectly balanced
 * JSON in a single reply, and when it truncated, validation threw, the repair
 * retry re-sent the same impossible ask, and the user got nothing after two
 * full round trips. That was the root cause of most "the AI is unreliable"
 * reports.
 *
 *   planArtifacts()       one small call. Titles, shapes, scaffolding, briefs.
 *                         No bodies, so the reply is short enough that
 *                         truncation stops being the common case — and the plan
 *                         is something the trace can show before the expensive
 *                         work starts.
 *
 *   composeArtifactBody() one call per artifact, run with bounded concurrency.
 *                         Returns MARKDOWN, not JSON — which removes an entire
 *                         class of escaping failures — and a failure costs one
 *                         artifact rather than the whole turn.
 */

import { effortBudget, planMaxTokens } from '../../config/aiEffort';
import { AI_CONTEXT_DEFINITIONS } from '../../features/ai/aiTypes';
import { SHAPE_GUIDE } from './prompts';
import { AIOutputValidationError, extractJsonFromString, parseValidatedStructuredActions } from './structured';
import { generateCompleteText, generateText, generateTextWithMeta, streamText } from './text';
import type { AIArtifactPlan, AIBodyOptions, AIPlanResult, AIRequestOptions, AIStructuredAction } from './types';

/**
 * Pass 1: decide what to build, without writing any of it.
 *
 * Returns the artifacts with their structure fully specified (mindmap nodes)
 * and every body left empty, plus the model's own one-sentence reason for the
 * shapes it chose — which the trace shows, so the user can disagree with the
 * decision rather than only with the result.
 */
export async function planArtifacts(
    prompt: string,
    context: string | undefined,
    options: AIRequestOptions = {},
): Promise<AIPlanResult> {
    const requestedTypes = (options.contexts ?? [])
        .map((id) => AI_CONTEXT_DEFINITIONS.find((d) => d.id === id)?.actionType)
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

    const budget = effortBudget(options.effort);

    const systemPrompt = `You are the planner for Chnk it, an infinite-canvas note app.
Decide WHAT to build for the user's request. Do NOT write any body content — a
second pass writes the bodies. Your job is the shape and the scaffolding.

${SHAPE_GUIDE}

Emit at most ${budget.maxArtifacts} artifacts. Fewer, well-chosen artifacts beat
many thin ones. If one artifact answers the request, emit one.

${requestedTypes.length > 0 ? `The user explicitly selected these output types: [${requestedTypes.join(', ')}]. You MUST include at least one artifact of each.\n` : ''}${requestedTypes.length === 0 && options.shapeHint && options.shapeHint.length > 0 ? `This request most likely fits: [${options.shapeHint.join(', ')}]. Prefer these shapes unless the request clearly needs something else.\n` : ''}
${context ? `[CANVAS CONTEXT]\n${context}\n` : ''}
Respond ONLY with a valid JSON array. No markdown, no code fences, no prose.
Each object:
- "type": "note" | "fused-note" | "mindmap"
- "title": the artifact's title
- "brief": ONE sentence saying what this artifact should cover. This steers the
  writing pass, so be specific about scope and angle — not "about pricing" but
  "the three things the current pricing page gets wrong, and the fix for each".
- "why": (first object only) ONE sentence on why you chose these shapes.
- "color": optional hex, ONLY from: #f95d2e, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #e3a24f, #6366f1
- If "mindmap": "nodes": [{"id","label","parentId"}] — one root with no parentId,
  every other node's parentId must exist. Labels are short; there are no bodies.

Example:
[{"type":"mindmap","title":"Beta launch","brief":"How the launch breaks down, from positioning to the post-launch review","why":"A mindmap rather than loose cards — the user is asking how the parts relate.","nodes":[{"id":"r","label":"Beta launch"},{"id":"a","label":"Positioning","parentId":"r"},{"id":"b","label":"Build","parentId":"r"}]}]`;

    const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n<user>\n${prompt}\n</user>`;

    /* A fixed, effort-independent ceiling: a plan is titles whatever the effort,
       and giving Smart more room here only invites it to start writing bodies.
       History rides along because follow-ups land HERE — "add two more cards"
       is a planning decision. The body passes deliberately get no history: they
       write one artifact against one brief, and prior turns would be cost
       without signal.

       Lower temperature because this reply is parsed, not read: variety in a
       plan buys nothing and every stray token is a chance to break the JSON. */
    const planOptions: AIRequestOptions = { model: options.model, images: options.images, history: options.history, phase: 'plan', temperature: 0.4 };

    const planCeiling = planMaxTokens(options.effort);
    const first = await generateTextWithMeta(fullPrompt, { ...planOptions, maxTokensOverride: planCeiling });

    let actions: AIStructuredAction[];
    try {
        actions = parseValidatedStructuredActions(first.text, requestedTypes, false);
    } catch (error) {
        /* Two different failures used to share one recovery. A plan that ran
           out of room is not malformed — it is unfinished — and re-sending the
           fragment with "repair this" under the SAME ceiling asks the model to
           fit the identical content into the identical space, so it truncates
           at the same point and the user gets a validation error either way.

           So the retry depends on which failure happened. Truncated: ask for a
           deliberately smaller plan with more room to express it, and do not
           echo the fragment back — those wasted tokens are part of why it did
           not fit. Malformed: repair, which is the case recovery is right for. */
        const retryPrompt = first.truncated
            ? `${fullPrompt}\n\n<user>\nThat plan did not fit. Emit AT MOST ${Math.max(1, Math.ceil(budget.maxArtifacts / 2))} artifacts, keep every "brief" to one short sentence, and keep mindmaps under 20 nodes. Return ONLY a valid JSON array.\n</user>`
            : `${fullPrompt}\n\n<assistant>\n${first.text}\n</assistant>\n\n<user>\nRepair this response. Return ONLY a valid JSON array satisfying every required field, with connected mindmaps. Still no body content.\n</user>`;

        const retry = await generateTextWithMeta(retryPrompt, {
            ...planOptions,
            // A truncated first pass earned more room, not the same amount again.
            maxTokensOverride: first.truncated ? Math.round(planCeiling * 1.5) : planCeiling,
        });

        try {
            actions = parseValidatedStructuredActions(retry.text, requestedTypes, false);
        } catch {
            /* Say which failure this was. "Incomplete plan — be more specific"
               is actively misleading advice when the cause was the model
               running out of room: a more specific request is usually a BIGGER
               one, which truncates harder. */
            if (first.truncated || retry.truncated) {
                throw new AIOutputValidationError(
                    'The AI ran out of room before finishing the canvas plan.',
                    'try again, ask for fewer artifacts, or lower the effort',
                );
            }
            throw error instanceof AIOutputValidationError ? error : new AIOutputValidationError();
        }
    }

    const trimmed = actions.slice(0, budget.maxArtifacts) as AIArtifactPlan[];
    const why = (actions[0] as { why?: string } | undefined)?.why;
    return {
        artifacts: trimmed,
        why: typeof why === 'string' && why.trim() ? why.trim() : undefined,
    };
}

/**
 * Send a body-writing request, with a compatibility retry.
 *
 * Planning is deliberately one plain prompt, whereas body calls use a system
 * message to keep their formatting contract separate from user/canvas text.
 * Some OpenAI-compatible gateways accept the former but reject `system` for a
 * configured model, which made a perfectly valid plan fail only during its
 * writing pass. Retry those — and only those — with the same contract folded
 * into the top of the prompt.
 */
async function generateBodyText(
    prompt: string,
    system: string,
    options: AIBodyOptions,
    maxTokensOverride: number,
): Promise<string> {
    const request = {
        model: options.model,
        maxTokensOverride,
        phase: 'body' as const,
    };
    const { onText, signal } = options;

    /* Continued past the ceiling rather than cut: a body is placed as written,
       so a truncated one used to land on the canvas mid-sentence. When the
       runner is showing the body in its card as it arrives, the same answer is
       streamed instead — continuation included — so the card fills in live. */
    try {
        if (onText) {
            let streamed = '';
            const result = await streamText(prompt, {
                ...request,
                system,
                thinking: 'off',
                signal,
                onDelta: (delta) => {
                    streamed += delta;
                    // Hide an opening ``` wrapper while it streams; the final
                    // body is unwrapped by the caller either way.
                    onText(streamed.replace(/^\s*```(?:markdown|md)?[ \t]*\n/, ''));
                },
            });
            return result.text;
        }
        return (await generateCompleteText(prompt, { ...request, system })).text;
    } catch (error) {
        const status = typeof error === 'object' && error !== null
            ? (error as { status?: unknown }).status
            : undefined;
        /* Only a REJECTED request is worth re-shaping. Retrying everything
           except auth and rate limits meant a timeout (408) or an overloaded
           model (5xx) — which the transport had already retried, and the server
           had already tried other models for — sent the whole body again, up to
           another 45s, for a failure a folded system prompt cannot fix. */
        if (status !== 400 && status !== 422) throw error;

        return generateText(
            `[WRITING INSTRUCTIONS]\n${system}\n\n[REQUEST]\n${prompt}`,
            request,
        );
    }
}

/**
 * Pass 2: write ONE artifact's body against its brief.
 *
 * Markdown out, not JSON. `parsePlainText` turns it into editor blocks, so the
 * block vocabulary asked for here is exactly what the editor renders — and no
 * escaping layer sits between the model and the text, which is where a
 * meaningful share of the old failures came from.
 */
export async function composeArtifactBody(
    request: {
        shape: AIStructuredAction['type'];
        title: string;
        brief?: string;
        /** The original user request, so a body cannot drift off-topic. */
        userRequest: string;
        context?: string;
        /** Names the deficit when this is a re-ask after a thin first body. */
        deficit?: string;
    },
    options: AIBodyOptions = {},
): Promise<string> {
    const budget = effortBudget(options.effort);

    const system = `You are writing the body of one item on an infinite canvas in Chnk it.
Return MARKDOWN ONLY — no JSON, no code fences around the whole answer, no
preamble, and do not repeat the title as a heading.

Write ${budget.targetBlocks} blocks or so, and never fewer than ${budget.minBlocks}. A "block"
is one line or element: a paragraph, a heading, a bullet, a numbered step, a
checkbox, a table, a quote, a divider, a fenced code block.

Use the vocabulary the editor renders natively:
- "## " and "### " headings to section anything longer than a few paragraphs
- markdown tables (| a | b |) for comparisons, specs, pros/cons, schedules
- "> " quote blocks for definitions, key principles, notable statements
- "- " bullets, "1. " numbered steps, "- [ ] " checkboxes for actions
- fenced \`\`\` code blocks for code, commands or structured data
- "---" dividers between major sections
- **bold** for terms of art, \`inline code\` for identifiers

Use at least ${budget.minBlockTypes} DIFFERENT block types. A wall of paragraphs
is a failure at any effort level. Do not invent facts, dates or figures; where a
real value is missing, say what is needed rather than inventing one.`;

    const prompt = [
        `[THE USER ASKED]\n${request.userRequest}`,
        request.context ? `[CANVAS CONTEXT]\n${request.context}` : '',
        `[WRITE THIS]\nThe body of the ${request.shape} "${request.title}".`,
        request.brief ? `[IT SHOULD COVER]\n${request.brief}` : '',
        request.deficit ? `[YOUR PREVIOUS ATTEMPT FELL SHORT]\n${request.deficit}\nWrite it again, properly this time.` : '',
    ].filter(Boolean).join('\n\n');

    const text = await generateBodyText(prompt, system, options, budget.bodyTokens);

    // Models sometimes wrap the whole answer in one fence despite being told not
    // to; unwrapping is cheaper than another round trip.
    const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
    return (fenced ? fenced[1] : text).trim();
}

/**
 * Review finished bodies against the evidence.
 *
 * Smart only. Returns the claims the model itself is least confident about, so
 * the panel can say "check these two things" instead of presenting everything
 * with equal certainty. It ANNOTATES rather than edits: silently rewriting a
 * body the user has not read yet would make the verify pass a second author,
 * and a wrong correction is worse than a flagged claim.
 *
 * Returns `[]` on any failure. A verification that cannot run must never fail
 * the turn — the artifacts are already written and placed.
 */
export async function verifyArtifacts(
    artifacts: { title: string; body: string }[],
    context: string | undefined,
    options: AIRequestOptions = {},
): Promise<{ title: string; concern: string }[]> {
    if (artifacts.length === 0) return [];

    const system = `You are fact-checking your own work before the user reads it.

For each item, name AT MOST ONE claim that a careful reader should verify — a
number, date, benchmark, causal claim or recommendation that you cannot support
from the context given and that is not common knowledge.

Be strict about what counts. Do NOT flag: opinions clearly framed as such,
obvious general knowledge, or anything the context supports. Most well-written
items should have NOTHING to flag; returning an empty array is the expected
result for solid work, not a failure.

Respond ONLY with a JSON array, no prose:
[{"title":"<the item's exact title>","concern":"<one short sentence naming what to check>"}]`;

    const prompt = [
        context ? `[CONTEXT AVAILABLE]\n${context}` : '[NO CONTEXT WAS AVAILABLE]',
        ...artifacts.map((a) => `[ITEM: ${a.title}]\n${a.body.slice(0, 1800)}`),
    ].join('\n\n');

    try {
        const reply = await generateText(prompt, {
            system,
            model: options.model,
            maxTokensOverride: 700,
            phase: 'verify',
        });
        const json = extractJsonFromString(reply, 'array');
        if (!json) return [];
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is { title: string; concern: string } =>
                Boolean(item) && typeof item === 'object'
                && typeof (item as { title?: unknown }).title === 'string'
                && typeof (item as { concern?: unknown }).concern === 'string'
                && (item as { concern: string }).concern.trim().length > 0)
            .slice(0, artifacts.length);
    } catch {
        return [];
    }
}
