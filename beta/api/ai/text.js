import { requireAiAccess } from '../_lib/aiGuard.js';
import { sendError, sendJson, startCompletion } from '../_lib/chatRoute.js';

/**
 * OpenAI-compatible providers do not all serialize visible text identically.
 * Most use `message.content` as a string, while some return a single content
 * part or the Responses-style `output` list. Deliberately does not read
 * `reasoning` fields: internal reasoning is not user-visible output.
 */
function visibleText(value, depth = 0) {
    if (depth > 4 || value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((part) => visibleText(part, depth + 1)).join('');
    if (typeof value !== 'object') return '';

    const item = value;
    if (typeof item.text === 'string') return item.text;
    if (item.text && typeof item.text === 'object') return visibleText(item.text, depth + 1);
    if (typeof item.value === 'string') return item.value;
    if (typeof item.content === 'string' || Array.isArray(item.content) || (item.content && typeof item.content === 'object')) return visibleText(item.content, depth + 1);
    if (Array.isArray(item.parts)) return visibleText(item.parts, depth + 1);
    if (item.delta && typeof item.delta === 'object') return visibleText(item.delta, depth + 1);
    if (typeof item.output_text === 'string') return item.output_text;
    return '';
}

/**
 * `preserveWhitespace` keeps the reply's edge whitespace. Needed when the client
 * is joining a reply to its continuation: trimming both halves deleted the space
 * at the seam, so "economic" + " assumptions" arrived as "economicassumptions".
 */
export function extractGatewayText(data, preserveWhitespace = false) {
    const choice = data?.choices?.[0];
    const candidates = [
        choice?.message?.content,
        choice?.message?.output_text,
        choice?.text,
        data?.output_text,
        data?.text,
        data?.output,
        data?.candidates?.[0]?.content?.parts,
    ];
    for (const candidate of candidates) {
        const output = visibleText(candidate);
        if (output.trim()) return preserveWhitespace ? output : output.trim();
    }
    return '';
}

/**
 * Why the model stopped — `stop`, `length`, or whatever the gateway reports.
 *
 * Not cosmetic: `planArtifacts` parses this response as JSON, and a truncated
 * plan fails validation with exactly the same error as malformed model output —
 * so a retry would re-send it under the same ceiling and truncate again,
 * turning "the plan needed more room" into "the AI returned an incomplete
 * canvas plan".
 */
export function extractFinishReason(data) {
    const choice = data?.choices?.[0];
    const reason = choice?.finish_reason ?? choice?.finishReason ?? data?.candidates?.[0]?.finishReason;
    return typeof reason === 'string' && reason ? reason : null;
}

/**
 * One complete answer, buffered.
 *
 * `access` is passed in rather than looked up here so the dev server can run
 * this exact handler — see vite.config.ts.
 */
export async function handleText(req, res, access) {
    try {
        const started = await startCompletion(req, res, access);
        if (!started) return;

        const { upstream, body } = started;
        const model = upstream.model;
        let text;
        try {
            text = await upstream.response.text();
        } finally {
            upstream.release();
        }
        const data = text ? JSON.parse(text) : {};

        const output = extractGatewayText(data, body.preserveWhitespace === true);
        const finishReason = extractFinishReason(data);

        if (!output) {
            /* An empty answer has two very different causes, and they used to
               have one message between them. A reasoning model spends the SAME
               budget `max_tokens` caps on its internal thinking, so a ceiling
               that is too low returns zero visible text with
               finish_reason=length — the model is perfectly text-capable, it
               simply had no room left to answer in. Telling that caller to
               "choose a text-capable model" sends them to fix something that is
               not broken. */
            const truncated = /^(length|max_tokens)$/i.test(String(finishReason ?? '').trim());
            sendError(
                res,
                502,
                truncated
                    ? 'The model used its whole token budget before writing an answer. Raise maxTokens or ask for less.'
                    : 'The configured AI model produced an empty response. Choose a text-capable model and try again.',
            );
            return;
        }

        res.setHeader('X-AI-Model', model);
        sendJson(res, 200, { text: output, finishReason });
    } catch (error) {
        sendError(res, 500, error);
    }
}

export default async function handler(req, res) {
    await handleText(req, res, await requireAiAccess(req));
}
