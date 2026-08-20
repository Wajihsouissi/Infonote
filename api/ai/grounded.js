import { requireAiAccess, getMaxTokens } from '../_lib/aiGuard.js';
import { groundedAnswer } from '../_lib/geminiSearch.js';

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
  sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
}

/**
 * POST /api/ai/grounded  { prompt, system?, model?, maxTokens? }
 *   -> { text, citations: [{ title, url, source }], queries: [] }
 *
 * Web-grounded answers. Separate from /api/ai/text because grounding is a
 * native-API feature: it needs `tools: [{google_search:{}}]` and returns
 * `groundingMetadata`, neither of which the OpenAI-compat endpoint carries.
 * Shares the same auth gate and 'text' rate-limit bucket.
 */
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

    const result = await groundedAnswer(prompt, {
      model: typeof body.model === 'string' ? body.model : undefined,
      system: typeof body.system === 'string' ? body.system : undefined,
      maxTokens: getMaxTokens(body.maxTokens),
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, error);
  }
}
