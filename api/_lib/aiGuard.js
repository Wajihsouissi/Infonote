// Shared auth + rate-limit guard for the /api/ai/* routes.
// Mirrors the conventions of api/workspace/invite.js: Supabase bearer-token
// verification, in-memory per-user rate limiting, and quote-tolerant env reads.
//
// Files under api/_lib are not deployed as routes by Vercel (underscore prefix).
import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60_000;
// Per-user, per-window ceilings. Text and stream share one bucket since they
// hit the same chat-completions backend; images are costlier so lower.
const RATE_LIMITS = { text: 30, image: 10 };

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
 * The model is ALWAYS chosen server-side. Client-supplied "model" fields are
 * ignored so a leaked endpoint cannot be pointed at expensive models.
 */
export function getServerModel(kind) {
  if (kind === 'image') {
    return getEnv('AI_GATEWAY_IMAGE_MODEL', 'VITE_AI_GATEWAY_IMAGE_MODEL') || 'bfl/flux-2-pro';
  }
  return getEnv('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'openai/gpt-4o-mini';
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
