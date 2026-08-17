import { requireAiAccess, getServerModel, buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens } from '../_lib/aiGuard.js';

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
        // `system` was previously dropped here while the dev twin honoured it,
        // so a system prompt worked locally and silently vanished in prod.
        messages: buildMessages({ prompt, system: body.system, images: body.images }),
        temperature: 0.7,
        // Was missing here while the dev twin honoured it, so a Smart answer
        // came out long locally and clipped at the route default in prod.
        max_tokens: getMaxTokens(body.maxTokens),
      }),
    });

    const text = await gatewayRes.text();
    const data = text ? JSON.parse(text) : {};
    if (!gatewayRes.ok) {
      sendError(res, gatewayRes.status, data?.error?.message || data?.message || text || 'AI Gateway text request failed.');
      return;
    }

    const content = data?.choices?.[0]?.message?.content;
    const output = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => part?.text || '').join('')
        : '';

    if (!output) {
      sendError(res, 502, 'AI Gateway returned no text content.');
      return;
    }

    sendJson(res, 200, { text: output });
  } catch (error) {
    sendError(res, 500, error);
  }
}
