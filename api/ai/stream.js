import { requireAiAccess, getServerModel, buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens, streamTrailer } from '../_lib/aiGuard.js';

const GATEWAY_TIMEOUT_MS = 40_000;

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
    const model = getServerModel('text', body.model);

    const gatewayRes = await fetch(`${getGatewayBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getGatewayKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: buildMessages({ prompt, system: body.system, images: body.images, history: body.history }),
        temperature: 0.7,
        max_tokens: getMaxTokens(body.maxTokens),
        stream: true,
      }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    if (!gatewayRes.ok || !gatewayRes.body) {
      const text = await gatewayRes.text();
      sendError(res, gatewayRes.status, text || 'AI Gateway stream request failed.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-AI-Model': model,
    });

    const reader = gatewayRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

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
