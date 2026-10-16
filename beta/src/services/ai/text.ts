/**
 * Asking for text, and finishing it.
 *
 * Two ways in — buffered (`generateText`) and streamed (`streamText`) — and one
 * shared obligation: an answer that stopped because it ran out of room is not a
 * finished answer. Both paths detect that and continue from where the model
 * stopped rather than handing back a fragment that reads as complete.
 */

import { effortMaxTokens } from '../../config/aiEffort';
import { CONTINUE_PROMPT, MAX_CONTINUATIONS, continuationHistory, seamPrefix, systemWithEffort } from './prompts';
import { AIRequestError, STREAM_TRAILER_MARK, TEXT_MODEL, aiHeaders, gatewayFetch, requestAI } from './transport';
import type { AIRequestOptions, AIStreamResult, AITextResult } from './types';

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
    error?: { message?: string };
};

/** How a caller with `onDelta` receives the answer as it arrives. */
type StreamOptions = AIRequestOptions & { onDelta: (delta: string) => void; signal?: AbortSignal };

/** The ceiling this request asked for, if it asked for one. */
const ceilingFor = (options: AIRequestOptions): number | undefined =>
    options.maxTokensOverride ?? (options.effort ? effortMaxTokens(options.effort) : undefined);

/**
 * One completion, reporting whether the answer actually finished.
 *
 * Callers that parse the output as JSON need this. Without it a response cut
 * off at `max_tokens` arrives as an ordinary string and fails parsing exactly
 * like malformed model output, so the only available recovery — asking the
 * model to repair it under the same ceiling — cannot possibly work.
 */
export async function generateTextWithMeta(
    prompt: string,
    options: string | AIRequestOptions = {},
): Promise<AITextResult> {
    // Historically the second argument was the system prompt; keep that working.
    const request: AIRequestOptions = typeof options === 'string' ? { system: options } : options;
    const { system, model, images, effort, history, phase, thinking, temperature, preserveWhitespace } = request;

    const finalSystem = systemWithEffort(system, effort);
    const maxTokens = ceilingFor(request);
    const response = await gatewayFetch<ChatCompletionResponse>('/api/ai/text', {
        model: model || TEXT_MODEL,
        prompt,
        ...(finalSystem ? { system: finalSystem } : {}),
        ...(images && images.length > 0 ? { images } : {}),
        ...(maxTokens ? { maxTokens } : {}),
        ...(history && history.length > 0 ? { history } : {}),
        // Non-streaming callers are plans, bodies, JSON edits and summaries:
        // every one of them parses or places the text, so none may think.
        thinking: thinking ?? 'off',
        ...(temperature !== undefined ? { temperature } : {}),
        ...(preserveWhitespace ? { preserveWhitespace: true } : {}),
    }, phase);

    const envelope = response as ChatCompletionResponse & { text?: string; finishReason?: string | null };
    const content = envelope.text ?? response.choices?.[0]?.message?.content;

    let text: string;
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content.map((part) => part.text || '').join('');
    } else {
        throw new Error(response.error?.message || 'The AI returned no text content.');
    }

    const finishReason = envelope.finishReason
        ?? (response.choices?.[0] as { finish_reason?: string } | undefined)?.finish_reason
        ?? null;

    return { text, finishReason, truncated: hitCeiling(finishReason) };
}

/* Gateways spell the ceiling differently — OpenAI says `length`, Gemini's
   compatibility layer passes `MAX_TOKENS` through. Match either. */
const hitCeiling = (reason: string | null): boolean =>
    typeof reason === 'string' && /^(length|max_tokens)$/i.test(reason.trim());

export async function generateText(prompt: string, options: string | AIRequestOptions = {}): Promise<string> {
    const { text } = await generateTextWithMeta(prompt, options);
    return text;
}

/**
 * Same completion, delivered token by token.
 *
 * /api/ai/stream writes raw text chunks (not SSE frames), so the client just
 * decodes and forwards them. Used by the AI panel so an answer starts arriving
 * immediately instead of after a long silence; `signal` lets the panel stop a
 * run mid-flight and keep whatever had already landed.
 */
async function streamTextOnce(prompt: string, options: StreamOptions): Promise<AIStreamResult> {
    const startedAt = performance.now();
    const { system, model, images, effort, history, onDelta, signal, thinking, temperature, phase } = options;
    const finalSystem = systemWithEffort(system, effort);
    /* Streams are read, not parsed, so Smart may reason a little. Everything
       else streams with thinking off: with default thinking a gemini-3.5-flash
       answer took 10.1s to its first token and was still cut off at the
       ceiling; with it off the first token arrived in 0.8s. */
    const streamThinking = thinking ?? (effort === 'smart' ? 'light' : 'off');
    const maxTokens = ceilingFor(options);
    const response = await requestAI('/api/ai/stream', {
        method: 'POST',
        /* Canvas bodies stream too, and a Create turn is many of them; without
           the phase they would all land in the strict `text` bucket instead of
           `body` (api/_lib/aiGuard.js). */
        headers: await aiHeaders(phase),
        body: JSON.stringify({
            model: model || TEXT_MODEL,
            prompt,
            ...(finalSystem ? { system: finalSystem } : {}),
            ...(images && images.length > 0 ? { images } : {}),
            ...(maxTokens ? { maxTokens } : {}),
            ...(history && history.length > 0 ? { history } : {}),
            thinking: streamThinking,
            ...(temperature !== undefined ? { temperature } : {}),
        }),
    }, signal);

    if (!response.body) throw new Error('The AI returned an empty stream.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    // Fetch resolves as soon as headers arrive; guard each body read too, so a
    // gateway that opens a stream and then stalls cannot leave the composer
    // working forever. Cancelling preserves the user's normal Stop action.
    const cancelStream = () => { void reader.cancel(); };
    signal?.addEventListener('abort', cancelStream, { once: true });
    const readNext = async () => {
        let timeout: number | undefined;
        try {
            return await Promise.race([
                reader.read(),
                new Promise<never>((_, reject) => {
                    timeout = window.setTimeout(() => reject(new AIRequestError('The AI stream stalled. Please try again.', 408)), 65_000);
                }),
            ]);
        } finally {
            if (timeout !== undefined) window.clearTimeout(timeout);
        }
    };

    /* The stream ends with U+001E followed by a JSON trailer (see
       STREAM_TRAILER_MARK in api/_lib/aiGuard.js). Everything before the mark
       is the answer; everything after is metadata that must never reach
       `onDelta`, or the user watches a control character and a JSON blob type
       themselves out at the end of their answer.

       The trailer can arrive split across reads, so once the mark is seen the
       remainder of the stream is accumulated rather than parsed per chunk. */
    let trailerRaw = '';
    let inTrailer = false;

    try {
        for (;;) {
            const { value, done } = await readNext();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (!chunk) continue;

            if (inTrailer) {
                trailerRaw += chunk;
                continue;
            }

            const mark = chunk.indexOf(STREAM_TRAILER_MARK);
            if (mark === -1) {
                full += chunk;
                onDelta(chunk);
                continue;
            }

            const head = chunk.slice(0, mark);
            if (head) {
                full += head;
                onDelta(head);
            }
            trailerRaw = chunk.slice(mark + 1);
            inTrailer = true;
        }
    } finally {
        signal?.removeEventListener('abort', cancelStream);
    }

    /* A missing or unparsable trailer is not an error: a stopped run, an older
       deployment, or a proxy that truncated the tail all land here, and the
       answer above is still perfectly good. `finishReason` is simply unknown.
       Parsed BEFORE the empty check, because when there is no answer at all the
       reason is the only thing that can explain why. */
    let finishReason: string | null = null;
    if (trailerRaw.trim()) {
        try {
            const parsed = JSON.parse(trailerRaw) as { finishReason?: unknown };
            if (typeof parsed.finishReason === 'string') finishReason = parsed.finishReason;
        } catch { /* unknown, and that is a valid answer */ }
    }

    if (!full.trim()) {
        /* "The AI returned no text content" was true and useless. The reasoning
           models behind this gateway spend `max_tokens` on their own thinking
           before any of it reaches the answer, so a high ceiling can be
           consumed entirely and come back empty with `finish_reason: "length"`
           — slow AND blank, which is the worst pair to debug from a generic
           message. Name the cause and the two things that fix it. */
        throw new AIRequestError(
            finishReason === 'length'
                ? 'The model spent its whole token budget thinking and never got to the answer. Try Efficient effort, or ask something narrower.'
                : 'The AI returned an empty answer. Try again, or switch model.',
        );
    }

    return {
        text: full,
        model: response.headers.get('X-AI-Model'),
        durationMs: Math.round(performance.now() - startedAt),
        finishReason,
        /* `interrupted` is the server saying the stream stalled or dropped
           mid-answer — as unfinished as hitting the ceiling, and just as worth
           continuing. */
        truncated: hitCeiling(finishReason) || finishReason === 'interrupted',
    };
}

/**
 * Streams an answer and FINISHES it.
 *
 * Long answers used to stop mid-sentence: at the token ceiling, or when the
 * server's deadline aborted a stream that was still flowing. Both now arrive
 * with a reason (`length`, `interrupted`), and instead of presenting the
 * fragment this asks the model to continue from where it stopped, streaming the
 * rest into the same `onDelta` so the reader just sees the answer keep going.
 * Bounded at MAX_CONTINUATIONS; if the answer is still unfinished after that,
 * `truncated` stays true and the panel says so.
 */
export async function streamText(prompt: string, options: StreamOptions): Promise<AIStreamResult> {
    const startedAt = performance.now();
    let result = await streamTextOnce(prompt, options);
    let text = result.text;

    for (let round = 0; round < MAX_CONTINUATIONS && result.truncated && !options.signal?.aborted; round += 1) {
        const before = text;
        let seamSent = false;
        try {
            result = await streamTextOnce(CONTINUE_PROMPT, {
                ...options,
                history: continuationHistory(options.history, prompt, before),
                // The seam's space has to go out with the first streamed chunk.
                onDelta: (delta) => {
                    if (!seamSent && delta) {
                        seamSent = true;
                        options.onDelta(seamPrefix(before, delta) + delta);
                        return;
                    }
                    options.onDelta(delta);
                },
            });
        } catch (error) {
            if (options.signal?.aborted) throw error;
            break; // keep what arrived; `truncated` still tells the caller
        }
        text += seamPrefix(before, result.text) + result.text;
    }

    return { ...result, text, durationMs: Math.round(performance.now() - startedAt) };
}

/**
 * `generateTextWithMeta`, continued until the answer actually ends.
 *
 * For writing that is placed rather than parsed — card and document bodies. A
 * body cut off at its ceiling used to land on the canvas mid-sentence, because
 * nothing checked why the model stopped. JSON callers must not use this: a plan
 * that ran out of room is re-planned smaller instead (see `planArtifacts`),
 * never glued together from two replies.
 */
export async function generateCompleteText(
    prompt: string,
    options: AIRequestOptions = {},
): Promise<AITextResult> {
    /* Untrimmed on every call: the space at a seam belongs to one half or the
       other, and trimming both deleted it ("economic" + "assumptions"). The
       joined answer is trimmed once, at the end. */
    const request: AIRequestOptions = { ...options, preserveWhitespace: true };
    let result = await generateTextWithMeta(prompt, request);
    let text = result.text;

    for (let round = 0; round < MAX_CONTINUATIONS && result.truncated; round += 1) {
        try {
            result = await generateTextWithMeta(CONTINUE_PROMPT, {
                ...request,
                history: continuationHistory(options.history, prompt, text.trimEnd()),
            });
        } catch {
            break;
        }
        text += seamPrefix(text, result.text) + result.text;
    }

    return { ...result, text: text.trim() };
}
