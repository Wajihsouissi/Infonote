import { requireAiAccess, streamTrailer } from '../_lib/aiGuard.js';
import { sendError, startCompletion } from '../_lib/chatRoute.js';

/**
 * Longest silence tolerated once the answer is flowing.
 *
 * A deadline over the whole stream cut long answers off mid-sentence and then
 * ended the response as if it had finished. A stall is reported in the trailer
 * as `interrupted`, so the client can continue the answer instead of presenting
 * a fragment as complete.
 */
const STREAM_STALL_MS = 30_000;

/**
 * The same answer, forwarded as it arrives.
 *
 * `access` is passed in rather than looked up here so the dev server can run
 * this exact handler — see vite.config.ts.
 */
export async function handleStream(req, res, access) {
    try {
        const started = await startCompletion(req, res, access, { stream: true });
        if (!started) return;

        const { upstream } = started;
        const gatewayRes = upstream.response;
        if (!gatewayRes.body) {
            upstream.release();
            sendError(res, 502, 'AI Gateway stream request failed.');
            return;
        }

        // The answer has started; from here only a stall may end it early.
        upstream.release();

        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-AI-Model': upstream.model,
        });

        const reader = gatewayRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finishReason = null;

        let stallTimer;
        const armStallGuard = () => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => upstream.abort(), STREAM_STALL_MS);
        };
        armStallGuard();

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                armStallGuard();

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload || payload === '[DONE]') continue;

                    /* A malformed frame used to throw out of the whole handler,
                       which discarded an answer that was streaming perfectly
                       well up to that point. One bad frame is worth skipping,
                       not dying over. */
                    let parsed;
                    try {
                        parsed = JSON.parse(payload);
                    } catch {
                        continue;
                    }

                    const choice = parsed?.choices?.[0];
                    // Arrives on the final frame; "length" means the model hit
                    // the ceiling rather than finishing its thought.
                    if (choice?.finish_reason) finishReason = choice.finish_reason;

                    const text = choice?.delta?.content || '';
                    if (text) res.write(text);
                }
            }
        } catch {
            /* Stalled (the guard aborted it) or dropped by the gateway
               mid-answer. What already streamed stands; saying `interrupted` is
               what lets the client pick the answer up where it stopped rather
               than silently presenting half of it as finished. */
            finishReason = finishReason ?? 'interrupted';
        } finally {
            clearTimeout(stallTimer);
        }

        /* The trailer is a nicety; an answer that already streamed must never
           be lost to it. A throw here lands after headers are sent, which can
           destroy the socket before the buffered body flushes — the client
           would then see an empty response for a request that succeeded. */
        try {
            res.write(streamTrailer(finishReason));
        } catch {
            // finishReason is simply unknown to the client; the answer stands.
        }
        res.end();
    } catch (error) {
        if (!res.headersSent) {
            sendError(res, 500, error);
        } else {
            res.end();
        }
    }
}

export default async function handler(req, res) {
    await handleStream(req, res, await requireAiAccess(req));
}
