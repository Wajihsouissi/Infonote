// Shared auth + rate-limit guard for the /api/ai/* routes.
// Mirrors the conventions of api/workspace/invite.js: Supabase bearer-token
// verification, in-memory per-user rate limiting, and quote-tolerant env reads.
//
// Files under api/_lib are not deployed as routes by Vercel (underscore prefix).
import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Per-user, per-window ceilings.
 *
 * Text and stream share one bucket since they hit the same chat-completions
 * backend; images are costlier so lower. Search is cheap per call but easy to
 * fire in a loop from the UI, so it gets its own bucket rather than competing
 * with text generation.
 *
 * PHASE BUCKETS (ai-Plan.md §7). One Create turn used to be one request. Since
 * the generator split into a plan pass plus one body call per artifact plus a
 * verify pass, a single Smart turn can be a dozen requests — so counting them
 * all against `text: 30` silently cut a user from thirty turns a minute to
 * about three, and the 429 landed MID-TURN, which is the worst moment: partial
 * success means some artifacts land and the rest fail with a message about
 * rate limits that reads as a bug.
 *
 * So the buckets now match what the numbers are supposed to mean:
 *   `plan`   is the real turn counter — one per Create turn.
 *   `verify` is likewise at most one per turn.
 *   `body`   is machine-driven fan-out of a turn the user already paid for,
 *            so it is generous; it exists to stop a runaway loop, not to
 *            ration ordinary use.
 *   `text`   stays as it was for the 1:1 paths (Ask, edit, inline writing).
 */
const RATE_LIMITS = {
  text: 30,
  plan: 12,
  body: 90,
  verify: 12,
  image: 10,
  search: 40,
  transcript: 12,
};

/**
 * Ceiling across every text-family bucket combined.
 *
 * The phase is a client-supplied header, so without this a caller could label
 * everything `body` and help itself to the widest bucket. This bounds total
 * spend per user per window whatever they claim, which keeps the phase buckets
 * a shaping mechanism rather than a hole.
 */
const TOTAL_TEXT_LIMIT = 120;

/** Phases a client may claim. Anything else falls back to the strictest text bucket. */
const PHASE_BUCKETS = new Set(['plan', 'body', 'verify']);

const rateLimits = new Map();

/**
 * Count one hit against a bucket. Returns seconds to wait, or 0 when allowed.
 *
 * Pulled out of `requireAiAccess` because a request now touches two counters —
 * its phase bucket and the combined total — and they have to increment
 * together or the total drifts from reality.
 *
 * Exported so the accounting is testable on its own. Everything around it needs
 * a live Supabase session to reach, which would leave the one piece of logic
 * that can lock a user out — or fail to limit anyone at all — verifiable only
 * in production.
 */
export function hitBucket(key, limit, now) {
  const current = rateLimits.get(key);
  if (!current || now >= current.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    /* The opening request of a window still has to be checked. For any limit
       of 1 or more this is trivially allowed, but a bucket set to 0 means
       "disabled", and returning 0 here would quietly let one request per minute
       through — a disabled limit that is not quite disabled. */
    return limit >= 1 ? 0 : Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
  }
  current.count += 1;
  if (current.count > limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return 0;
}

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
export const DEFAULT_GATEWAY_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export function getGatewayBaseUrl() {
  const base = getEnv('AI_GATEWAY_BASE_URL', 'VITE_AI_GATEWAY_BASE_URL') || DEFAULT_GATEWAY_BASE_URL;
  return base.replace(/\/+$/, '');
}

export function getGatewayKey() {
  const usingGemini = getGatewayBaseUrl().includes('generativelanguage.googleapis.com');
  /* A generic gateway key may belong to OpenRouter while GEMINI_API_KEY is
     present for Google's native compatibility endpoint. Pick the provider's
     dedicated key first so changing only the base URL cannot accidentally
     send Gemini a depleted OpenRouter credential. */
  const genericGatewayKey = getEnv('AI_GATEWAY_API_KEY', 'VITE_AI_GATEWAY_API_KEY');
  const geminiKey = getEnv('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  const key = usingGemini
    ? geminiKey || (/^sk-or-/i.test(genericGatewayKey) ? '' : genericGatewayKey)
    : genericGatewayKey || geminiKey;
  if (!key) {
    throw new Error(usingGemini
      ? 'Gemini is not configured. Add a valid GEMINI_API_KEY; an OpenRouter key cannot be used with Gemini.'
      : 'AI is not configured. Add AI_GATEWAY_API_KEY to your environment or Vercel Project Settings.');
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
    // Nano Banana 2 is Gemini's fast, general-purpose image model. Set
    // AI_GATEWAY_IMAGE_MODEL=gemini-2.5-flash-image to keep the original
    // Nano Banana model, or choose another Gemini image model explicitly.
    return getEnv('AI_GATEWAY_IMAGE_MODEL', 'VITE_AI_GATEWAY_IMAGE_MODEL') || 'gemini-3.1-flash-image';
  }

  const fallback = getEnv('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'gemini-3.7-flash';
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
/** Prior turns the client may send, so history is a real messages array. */
const MAX_HISTORY_TURNS = 16;

/**
 * Build the chat-completions messages array.
 *
 * `history` is optional and new (ai-Plan.md §2.3 A2): the AI panel used to fold
 * the whole transcript into the single `prompt` string, because that was all
 * this route accepted. That cost prompt-cache hits on every turn — the prefix
 * changed every time — and blurred the boundary between what the user said and
 * what the assistant said, which is exactly the distinction a model needs to
 * resolve "expand phase 3". Sending real turns fixes both. `prompt` alone still
 * works unchanged, so nothing that has not been updated breaks.
 */
export function buildMessages({ prompt, system, images, history }) {
  const messages = [];
  if (typeof system === 'string' && system.trim()) {
    messages.push({ role: 'system', content: system });
  }

  // Untrusted client input: take only well-formed turns, only the two roles
  // that mean anything here, and only a bounded number of them.
  if (Array.isArray(history)) {
    for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
      if (!turn || (turn.role !== 'user' && turn.role !== 'assistant')) continue;
      if (typeof turn.content !== 'string' || !turn.content.trim()) continue;
      messages.push({ role: turn.role, content: turn.content });
    }
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

/**
 * Terminal marker for the streaming route — ai-Plan.md §7.
 *
 * `/api/ai/stream` writes raw text rather than SSE frames, which keeps the
 * client a two-line decode loop but leaves nowhere to say HOW a stream ended.
 * That matters: an answer stopped at the token ceiling looks exactly like one
 * that finished, so the panel presented a sentence cut off mid-word as a
 * complete reply.
 *
 * Rather than move the whole route to SSE for one field, the stream ends with
 * U+001E (RECORD SEPARATOR) followed by a JSON object. A raw C0 control
 * character cannot appear in model prose — the gateway would have escaped it —
 * so the split is unambiguous, and a client that does not know about the
 * trailer simply shows a stray invisible character rather than breaking.
 */
export const STREAM_TRAILER_MARK = '\u001E';

export function streamTrailer(finishReason) {
  return `${STREAM_TRAILER_MARK}${JSON.stringify({ finishReason: finishReason ?? null })}`;
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

  const now = Date.now();
  const userId = data.user.id;

  if (kind === 'image' || kind === 'transcript') {
    const retryAfter = hitBucket(`${userId}:${kind}`, RATE_LIMITS[kind], now);
    if (retryAfter) {
      return {
        ok: false,
        status: 429,
        message: kind === 'transcript'
          ? `Too many transcript requests. Try again in ${retryAfter} seconds.`
          : `Too many image requests. Try again in ${retryAfter} seconds.`,
        retryAfter,
      };
    }
    return { ok: true, userId };
  }

  /* Text family. The phase rides on a header rather than the body so this can
     run before the route parses anything, and an absent or unrecognised value
     falls back to the strictest bucket — an old client, or a forged one that
     simply omits the header, gets `text: 30` rather than a free pass. */
  const claimed = String(req.headers['x-ai-phase'] || '').toLowerCase();
  const bucket = PHASE_BUCKETS.has(claimed) ? claimed : 'text';

  /* Total first: it is the real spend guard, and checking it before the phase
     bucket means a caller cannot discover which label is cheapest by probing. */
  const totalRetry = hitBucket(`${userId}:total`, TOTAL_TEXT_LIMIT, now);
  if (totalRetry) {
    return {
      ok: false,
      status: 429,
      message: `You have hit this minute's AI limit. Try again in ${totalRetry} seconds.`,
      retryAfter: totalRetry,
    };
  }

  const retryAfter = hitBucket(`${userId}:${bucket}`, RATE_LIMITS[bucket], now);
  if (retryAfter) {
    return {
      ok: false,
      status: 429,
      /* Phase-aware, because a limit hit mid-compose is not the same event as
         one hit on send. Saying which stage stopped is the difference between
         "the app broke" and "I asked for too much at once". */
      message: bucket === 'body'
        ? `That turn needed more writing than one minute allows. What was already made is on your canvas — try again in ${retryAfter} seconds, or lower the effort.`
        : bucket === 'plan'
          ? `Too many requests in a row. Try again in ${retryAfter} seconds.`
          : `Too many AI requests. Try again in ${retryAfter} seconds.`,
      retryAfter,
    };
  }

  return { ok: true, userId };
}
