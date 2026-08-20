// Shared auth + rate-limit guard for the /api/ai/* routes.
// Mirrors the conventions of api/workspace/invite.js: Supabase bearer-token
// verification, in-memory per-user rate limiting, and quote-tolerant env reads.
//
// Files under api/_lib are not deployed as routes by Vercel (underscore prefix).
import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60_000;
// Per-user, per-window ceilings. Text and stream share one bucket since they
// hit the same chat-completions backend; images are costlier so lower.
// Search is cheap per call but easy to fire in a loop from the UI, so it gets
// its own bucket rather than competing with text generation.
const RATE_LIMITS = { text: 30, image: 10, search: 40 };

const rateLimits = new Map();

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return stripWrappingQuotes(value.trim());
  }
  return '';
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || '';
}

/**
 * The OpenAI-compatible endpoint every AI route talks to.
 *
 * Defaults to Google's Gemini compatibility layer, which speaks the same
 * /chat/completions shape the routes already use, so switching providers is a
 * base-URL + key + model swap and nothing else. Point AI_GATEWAY_BASE_URL back
 * at https://ai-gateway.vercel.sh/v1 to return to the Vercel gateway.
 */
export const DEFAULT_GATEWAY_BASE_URL = 'https://openrouter.ai/api/v1';

export function getGatewayBaseUrl() {
  const base = getEnv('AI_GATEWAY_BASE_URL', 'VITE_AI_GATEWAY_BASE_URL') || DEFAULT_GATEWAY_BASE_URL;
  return base.replace(/\/+$/, '');
}

export function getGatewayKey() {
  const key = getEnv('AI_GATEWAY_API_KEY', 'VITE_AI_GATEWAY_API_KEY', 'GEMINI_API_KEY');
  if (!key) {
    throw new Error('AI is not configured. Add AI_GATEWAY_API_KEY to your environment or Vercel Project Settings.');
  }
  return key;
}

/**
 * Text models a caller may ask for by name. Kept in step with
 * src/config/aiModels.ts, which is only the menu the UI draws — this is the
 * list that decides. Override per deployment with a comma-separated
 * AI_GATEWAY_TEXT_MODELS.
 */
const DEFAULT_TEXT_MODEL_ALLOWLIST = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

function textModelAllowlist() {
  const configured = getEnv('AI_GATEWAY_TEXT_MODELS');
  const list = configured
    ? configured.split(',').map((m) => stripWrappingQuotes(m.trim())).filter(Boolean)
    : DEFAULT_TEXT_MODEL_ALLOWLIST;
  // The workspace default is always selectable, whatever the list says.
  const fallback = getEnv('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL');
  return fallback && !list.includes(fallback) ? [...list, fallback] : list;
}

/**
 * The model to run.
 *
 * The server still decides — a caller cannot name an arbitrary model and point
 * a leaked endpoint at something expensive. `requested` is honoured only when
 * it is on the allow-list above; anything else silently falls back to the
 * configured default, so a stale client can never hard-fail on this.
 */
export function getServerModel(kind, requested) {
  if (kind === 'image') {
    return getEnv('AI_GATEWAY_IMAGE_MODEL', 'VITE_AI_GATEWAY_IMAGE_MODEL') || 'bytedance-seed/seedream-5-0-pro';
  }

  const fallback = getEnv('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'openrouter/auto';
  if (typeof requested !== 'string' || !requested.trim()) return fallback;

  const wanted = stripWrappingQuotes(requested.trim());
  return textModelAllowlist().includes(wanted) ? wanted : fallback;
}

/**
 * Build the messages array, attaching any images as multimodal parts.
 *
 * Images ride as data URLs in the standard OpenAI `image_url` shape, which the
 * gateway passes through to vision-capable models. Text-only requests keep the
 * plain-string content they always had rather than being wrapped in a parts
 * array, so nothing changes for the models that never see an image.
 */
export function buildMessages({ prompt, system, images }) {
  const messages = [];
  if (typeof system === 'string' && system.trim()) {
    messages.push({ role: 'system', content: system });
  }

  const urls = Array.isArray(images)
    ? images.filter((url) => typeof url === 'string' && url.startsWith('data:image/')).slice(0, MAX_IMAGES)
    : [];

  messages.push({
    role: 'user',
    content: urls.length === 0
      ? prompt
      : [
          { type: 'text', text: prompt },
          ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
  });

  return messages;
}

/** Per-request image ceiling — each one is a base64 blob on the wire. */
export const MAX_IMAGES = 4;

/**
 * Output ceiling for one completion.
 *
 * The AI panel's effort levels send this (800 for Fast up to 8000 for Smart).
 * Anything outside 1..8192 falls back to the default, so a bad client value
 * can neither truncate an answer to nothing nor uncap the spend.
 */
export function getMaxTokens(requested) {
  const value = typeof requested === 'number' ? requested : 0;
  if (value > 0 && value <= 8192) return Math.floor(value);
  return 4096;
}

/**
 * Verify the caller's Supabase session and enforce a per-user rate limit.
 * Returns { ok: true, userId } or { ok: false, status, message, retryAfter? }.
 */
export async function requireAiAccess(req, kind) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Sign in to use AI features.' };
  }

  const url = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) {
    return { ok: false, status: 500, message: 'Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.' };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: 'Your session expired. Sign in again to use AI features.' };
  }

  const bucket = kind === 'image' ? 'image' : 'text';
  const limitKey = `${data.user.id}:${bucket}`;
  const now = Date.now();
  const current = rateLimits.get(limitKey);
  if (!current || now >= current.resetAt) {
    rateLimits.set(limitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > RATE_LIMITS[bucket]) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      return {
        ok: false,
        status: 429,
        message: `Too many AI requests. Try again in ${retryAfter} seconds.`,
        retryAfter,
      };
    }
  }

  return { ok: true, userId: data.user.id };
}
