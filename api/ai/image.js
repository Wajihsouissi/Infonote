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

function extractImageUrl(data) {
  const image = data?.data?.[0];
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
  if (typeof image?.url === 'string' && image.url.trim()) return image.url;

  const chatImageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (typeof chatImageUrl === 'string' && chatImageUrl.trim()) return chatImageUrl;

  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const part = content.find((item) => item?.image_url?.url || item?.type === 'image_url');
    if (part?.image_url?.url) return part.image_url.url;
  }

  return null;
}

async function callGateway(path, payload) {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text || `AI Gateway image request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const access = await requireAiAccess(req, 'image');
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
    const model = getServerModel('image');

    let data;
    try {
      data = await callGateway('/images/generations', {
        model,
        prompt,
        n: 1,
        response_format: 'b64_json',
      });
    } catch {
      data = await callGateway('/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
      });
    }

    const imageUrl = extractImageUrl(data);
    if (!imageUrl) {
      sendError(res, 502, 'AI Gateway returned no image data.');
      return;
    }

    sendJson(res, 200, { imageUrl });
  } catch (error) {
    sendError(res, error?.status || 500, error);
  }
}
