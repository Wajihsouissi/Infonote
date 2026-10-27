// What /api/ai/text and /api/ai/stream have in common.
//
// The two routes differ only in how they deliver the answer — one buffers it,
// one forwards it as it arrives. Everything before that point (method, access,
// body, model choice, the upstream call) is identical, and when it lived in
// both files it drifted: `system` was honoured by one and dropped by the other,
// and a max-token ceiling was applied in one place and not the other.

import { buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens, getServerModel, textModelAllowlist, getFallbackModels } from './aiGuard.js';
import { modelChain, normalizeTemperature, normalizeThinking, postChatCompletion } from './aiUpstream.js';

/** Time allowed to START answering, fallbacks included. Not a cap on length. */
const GATEWAY_TIMEOUT_MS = 55_000;

export async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
}

export function sendJson(res, status, payload) {
    if (typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(status).json(payload);
        return;
    }

    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

export function sendError(res, status, error) {
    sendJson(res, status, {
        error: error instanceof Error ? error.message : String(error),
    });
}

/**
 * Run everything both routes do before they diverge.
 *
 * Returns the upstream handle on success, or `null` once it has already
 * answered the request — the caller only has to stop.
 */
export async function startCompletion(req, res, access, { stream = false } = {}) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'Method not allowed');
        return null;
    }

    if (!access.ok) {
        if (access.retryAfter) res.setHeader('Retry-After', String(access.retryAfter));
        sendError(res, access.status, access.message);
        return null;
    }

    const body = await readJsonBody(req);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
        sendError(res, 400, 'Prompt is required.');
        return null;
    }

    // Still server-decided: an off-list "model" falls back to the default.
    const primary = getServerModel(body.model);

    /* Thinking control, per-model level negotiation and fallback to another
       allow-listed model on 429/5xx all live in aiUpstream.js — see that file
       for the measurements behind them. Fallback is safe for a stream too:
       every failure it reacts to arrives as a non-2xx status BEFORE the first
       byte, so nothing has been written to the client yet. */
    const upstream = await postChatCompletion({
        baseUrl: getGatewayBaseUrl(),
        apiKey: getGatewayKey(),
        models: modelChain(primary, textModelAllowlist(), getFallbackModels()),
        payload: {
            messages: buildMessages({ prompt, system: body.system, images: body.images, history: body.history }),
            temperature: normalizeTemperature(body.temperature),
            ...(stream ? { stream: true } : {}),
        },
        maxTokens: getMaxTokens(body.maxTokens),
        thinking: normalizeThinking(body.thinking),
        timeoutMs: GATEWAY_TIMEOUT_MS,
    });

    if (!upstream.ok) {
        sendError(res, upstream.status, upstream.message);
        return null;
    }

    return { upstream, body };
}
