import { createClient } from '@supabase/supabase-js';

function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
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

function buildInviteHealth() {
  const hasResendApiKey = Boolean(getEnv('RESEND_API_KEY'));
  const hasInviteFromEmail = Boolean(getEnv('INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL'));
  const hasSupabaseServiceRoleFallback = Boolean(getEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'));
  const hasInviteSiteUrl = Boolean(getEnv('INVITE_SITE_URL', 'VITE_SITE_URL', 'SITE_URL'));
  const resendConfigured = hasResendApiKey && hasInviteFromEmail;
  const emailDeliveryConfigured = resendConfigured || hasSupabaseServiceRoleFallback;
  const recommendations = [];

  if (!hasResendApiKey) recommendations.push('Add RESEND_API_KEY in Vercel Project Settings.');
  if (!hasInviteFromEmail) recommendations.push('Add INVITE_FROM_EMAIL using a verified Resend sender/domain.');
  if (!hasInviteSiteUrl) recommendations.push('Add INVITE_SITE_URL=https://chnkit.com so email accept links use the production domain.');
  if (!hasSupabaseServiceRoleFallback) recommendations.push('Optional: add server-only SUPABASE_SERVICE_ROLE_KEY to enable Supabase Auth email fallback.');

  return {
    ok: emailDeliveryConfigured && hasInviteSiteUrl,
    resendConfigured,
    supabaseAuthFallbackConfigured: hasSupabaseServiceRoleFallback,
    inviteSiteUrlConfigured: hasInviteSiteUrl,
    emailDeliveryConfigured,
    recommendations,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'You must be signed in to check invite email configuration.' });
    return;
  }

  const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    sendJson(res, 500, { error: 'Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    sendJson(res, 401, { error: 'Your session expired. Sign in again before checking invite email configuration.' });
    return;
  }

  sendJson(res, 200, buildInviteHealth());
}
