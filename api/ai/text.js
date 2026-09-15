import { requireAiAccess, getServerModel, buildMessages, getGatewayBaseUrl, getGatewayKey, getMaxTokens, textModelAllowlist, getFallbackModels } from '../_lib/aiGuard.js';
import { modelChain, normalizeTemperature, normalizeThinking, postChatCompletion } from '../_lib/aiUpstream.js';

/* 55s, inside the 60s maxDuration in vercel.json. Was 40s, which a 6000-token
   body from a ~146 tokens/s model could not finish inside. */
const GATEWAY_TIMEOUT_MS = 55_000;

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

/**
 * `preserveWhitespace` keeps the reply's edge whitespace. Needed when the client
 * is joining a reply to its continuation: trimming both halves deleted the space
 * at the seam, so "economic" + " assumptions" arrived as "economicassumptions".
 * Keep in step with extractTextContent in vite.config.ts.
 */
export function extractGatewayText(data, preserveWhitespace = false) {
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
    const output = visibleText(candidate);
    if (output.trim()) return preserveWhitespace ? output : output.trim();
  }
  return '';
}

/**
 * Why the model stopped — `stop`, `length`, or whatever the gateway reports.
 *
 * The streaming route has carried this since it gained a trailer, but this one
 * returned bare text, so an answer cut off at `max_tokens` was indistinguishable
 * from a complete one. That is not a cosmetic gap: `planArtifacts` parses this
 * response as JSON, and a truncated plan fails validation with exactly the same
 * error as malformed model output — so the retry re-sent it under the same
 * ceiling and truncated again, turning "the plan needed more room" into "the AI
 * returned an incomplete canvas plan".
 *
 * Keep in step with the dev twin in vite.config.ts.
 */
export function extractFinishReason(data) {
  const choice = data?.choices?.[0];
  const reason = choice?.finish_reason ?? choice?.finishReason ?? data?.candidates?.[0]?.finishReason;
  return typeof reason === 'string' && reason ? reason : null;
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

    /* Thinking control, per-model level negotiation and fallback to another
       allow-listed model on 429/5xx all live in aiUpstream.js, which the dev
       twin imports too — see that file for the measurements behind them. */
    const upstream = await postChatCompletion({
      baseUrl: getGatewayBaseUrl(),
      apiKey: getGatewayKey(),
      models: modelChain(primary, textModelAllowlist(), getFallbackModels()),
      payload: {
        // `system` was previously dropped here while the dev twin honoured it,
        // so a system prompt worked locally and silently vanished in prod.
        messages: buildMessages({ prompt, system: body.system, images: body.images, history: body.history }),
        temperature: normalizeTemperature(body.temperature),
      },
      // Was missing here while the dev twin honoured it, so a Smart answer
      // came out long locally and clipped at the route default in prod.
      maxTokens: getMaxTokens(body.maxTokens),
      thinking: normalizeThinking(body.thinking),
      timeoutMs: GATEWAY_TIMEOUT_MS,
    });

    if (!upstream.ok) {
      sendError(res, upstream.status, upstream.message);
      return;
    }

    const model = upstream.model;
    let text;
    try {
      text = await upstream.response.text();
    } finally {
      upstream.release();
    }
    const data = text ? JSON.parse(text) : {};

    const output = extractGatewayText(data, body.preserveWhitespace === true);
    const finishReason = extractFinishReason(data);

    if (!output) {
      /* An empty answer has two very different causes, and they had one
         message between them. A reasoning model spends the SAME budget
         `max_tokens` caps on its internal thinking, so a ceiling that is too
         low returns zero visible text with finish_reason=length — the model is
         perfectly text-capable, it simply had no room left to answer in.
         Telling that caller to "choose a text-capable model" sends them to fix
         something that is not broken. */
      const truncated = /^(length|max_tokens)$/i.test(String(finishReason ?? '').trim());
      sendError(
        res,
        502,
        truncated
          ? 'The model used its whole token budget before writing an answer. Raise maxTokens or ask for less.'
          : 'The configured AI model produced an empty response. Choose a text-capable model and try again.',
      );
      return;
    }

    res.setHeader('X-AI-Model', model);
    sendJson(res, 200, { text: output, finishReason });
  } catch (error) {
    sendError(res, 500, error);
  }
}
