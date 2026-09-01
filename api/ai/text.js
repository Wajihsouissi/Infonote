import { requireAiAccess, getServerModel, buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens } from '../_lib/aiGuard.js';

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

/**
 * OpenAI-compatible providers do not all serialize visible text identically.
 * Most use `message.content` as a string, while some return a single content
 * part or the Responses-style `output` list. Deliberately do not read
 * `reasoning` fields here: internal reasoning is not user-visible output.
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

export function extractGatewayText(data) {
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
    const output = visibleText(candidate).trim();
    if (output) return output;
  }
  return '';
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
        messages: buildMessages({ prompt, system: body.system, images: body.images, history: body.history }),
        temperature: 0.7,
        // Was missing here while the dev twin honoured it, so a Smart answer
        // came out long locally and clipped at the route default in prod.
        max_tokens: getMaxTokens(body.maxTokens),
      }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    const text = await gatewayRes.text();
    const data = text ? JSON.parse(text) : {};
    if (!gatewayRes.ok) {
      sendError(res, gatewayRes.status, data?.error?.message || data?.message || text || 'AI Gateway text request failed.');
      return;
    }

    const output = extractGatewayText(data);

    if (!output) {
      sendError(res, 502, 'The configured AI model produced an empty response. Choose a text-capable model and try again.');
      return;
    }

    res.setHeader('X-AI-Model', model);
    sendJson(res, 200, { text: output });
  } catch (error) {
    sendError(res, 500, error);
  }
}
