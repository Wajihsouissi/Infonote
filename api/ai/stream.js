import { requireAiAccess, getServerModel, buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens, streamTrailer, textModelAllowlist, getFallbackModels } from '../_lib/aiGuard.js';
import { modelChain, normalizeTemperature, normalizeThinking, postChatCompletion } from '../_lib/aiUpstream.js';

/** Time allowed to START answering, fallbacks included. Not a cap on the answer's length. */
const GATEWAY_TIMEOUT_MS = 55_000;

/**
 * Longest silence tolerated once the answer is flowing.
 *
 * Replaces a deadline over the whole stream, which cut long answers off
 * mid-sentence and then ended the response as if it had finished. A stall is
 * reported in the trailer as `interrupted`, so the client can continue the
 * answer instead of presenting a fragment as complete.
 */
const STREAM_STALL_MS = 30_000;

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function sendError(res, status, error) {
  sendJson(res, status, {
    error: error instanceof Error ? error.message : String(error),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const access = await requireAiAccess(req, 'text');
    if (!access.ok) {
      if (access.retryAfter) res.setHeader('Retry-After', String(access.retryAfter));
      sendError(res, access.status, access.message);
      return;
    }

    const body = await readJsonBody(req);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      sendError(res, 400, 'Prompt is required.');
      return;
    }

    // Still server-decided: an off-list "model" falls back to the default.
    const primary = getServerModel('text', body.model);

    /* Fallback is safe for a stream because every failure it reacts to arrives
       as a non-2xx status BEFORE the first byte — nothing has been written to
       the client yet when the next model is tried. */
    const upstream = await postChatCompletion({
      baseUrl: getGatewayBaseUrl(),
      apiKey: getGatewayKey(),
      models: modelChain(primary, textModelAllowlist(), getFallbackModels()),
      payload: {
        messages: buildMessages({ prompt, system: body.system, images: body.images, history: body.history }),
        temperature: normalizeTemperature(body.temperature),
        stream: true,
      },
      maxTokens: getMaxTokens(body.maxTokens),
      thinking: normalizeThinking(body.thinking),
      timeoutMs: GATEWAY_TIMEOUT_MS,
    });

    if (!upstream.ok) {
      sendError(res, upstream.status, upstream.message);
      return;
    }

    const gatewayRes = upstream.response;
    const model = upstream.model;
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
      'X-AI-Model': model,
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

          /* A malformed frame used to throw out of the whole handler, which
             discarded an answer that was streaming perfectly well up to that
             point. One bad frame is worth skipping, not dying over. */
          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          const choice = parsed?.choices?.[0];
          // Arrives on the final frame; "length" means the model hit the ceiling
          // rather than finishing its thought.
          if (choice?.finish_reason) finishReason = choice.finish_reason;

          const text = choice?.delta?.content || '';
          if (text) res.write(text);
        }
      }
    } catch {
      /* Stalled (the guard aborted it) or dropped by the gateway mid-answer.
         What already streamed stands; saying `interrupted` is what lets the
         client pick the answer up where it stopped rather than silently
         presenting half of it as finished. */
      finishReason = finishReason ?? 'interrupted';
    } finally {
      clearTimeout(stallTimer);
    }

    /* The trailer is a nicety; an answer that already streamed must never be
       lost to it. A throw here lands after headers are sent, which can destroy
       the socket before the buffered body flushes — the client would then see
       an empty response for a request that actually succeeded. */
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
