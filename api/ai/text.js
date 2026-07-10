import { requireAiAccess, getServerModel } from '../_lib/aiGuard.js';

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

function getGatewayKey() {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VITE_AI_GATEWAY_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('AI Gateway is not configured. Add AI_GATEWAY_API_KEY in Vercel Project Settings.');
  }
  return key.trim();
}

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

    // Server-chosen model only — client "model" is intentionally ignored.
    const model = getServerModel('text');

    const gatewayRes = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getGatewayKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
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
