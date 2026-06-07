import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EMAIL_LENGTH = 254;
const INVITE_RATE_LIMIT_WINDOW_MS = 60_000;
const INVITE_RATE_LIMIT_MAX = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inviteRateLimits = new Map();

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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

function sendError(res, status, error, extra = {}) {
  sendJson(res, status, {
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length > MAX_BODY_BYTES) {
    throw httpError(413, 'Invite request is too large.');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, 'Invite request body must be valid JSON.');
  }
}

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function requireSupabaseEnv() {
  const url = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    throw new Error('Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  return { url, key };
}

function requireResendEnv() {
  const key = getEnv('RESEND_API_KEY');
  if (!key) {
    throw new Error('Email delivery is not configured. Add RESEND_API_KEY in Vercel Project Settings.');
  }
  return key;
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || '';
}

function isValidEmail(email) {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkInviteRateLimit(key) {
  const now = Date.now();
  const current = inviteRateLimits.get(key);
  if (!current || now > current.resetAt) {
    inviteRateLimits.set(key, { count: 1, resetAt: now + INVITE_RATE_LIMIT_WINDOW_MS });
    return null;
  }

  current.count += 1;
  if (current.count > INVITE_RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return retryAfterSeconds;
  }

  return null;
}

function parseJsonObject(text) {
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return isRecord(data) ? data : {};
  } catch {
    return {};
  }
}

function getSiteBaseUrl(req) {
  const configured = getEnv('INVITE_SITE_URL', 'VITE_SITE_URL', 'SITE_URL');
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const cleanHost = Array.isArray(host) ? host[0] : host;
  const cleanProto = Array.isArray(proto) ? proto[0] : proto;
  if (cleanHost) return `${cleanProto}://${cleanHost}`.replace(/\/+$/, '');

  return 'http://localhost:5173';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendInviteEmail({ to, acceptUrl, workspaceName, inviterName, role }) {
  const resendKey = requireResendEnv();
  const from = getEnv('INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL') || 'Infonote <onboarding@resend.dev>';
  const safeWorkspace = escapeHtml(workspaceName || 'Infonote canvas');
  const safeInviter = escapeHtml(inviterName || 'An Infonote collaborator');
  const safeRole = escapeHtml(role);
  const safeUrl = escapeHtml(acceptUrl);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${inviterName || 'Someone'} invited you to ${workspaceName || 'an Infonote canvas'}`,
      text:
        `${inviterName || 'An Infonote collaborator'} invited you to join "${workspaceName || 'Infonote canvas'}" as ${role}.\n\n` +
        `Accept the invitation: ${acceptUrl}\n\n` +
        'If this was not expected, you can ignore this email.',
      html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111827">
          <h1 style="margin:0 0 12px;font-size:22px">You have been invited to Infonote</h1>
          <p style="margin:0 0 14px">${safeInviter} invited you to collaborate on <strong>${safeWorkspace}</strong> as <strong>${safeRole}</strong>.</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Accept invitation</a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">If the button does not work, open this link:<br>${safeUrl}</p>
        </div>
      `,
    }),
  });

  const text = await response.text();
  const data = parseJsonObject(text);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Resend failed with HTTP ${response.status}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      sendError(res, 401, 'You must be signed in to invite collaborators.');
      return;
    }

    const body = await readJsonBody(req);
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role === 'viewer' ? 'viewer' : 'editor';

    if (!workspaceId) {
      sendError(res, 400, 'No active workspace selected.');
      return;
    }
    if (!UUID_RE.test(workspaceId)) {
      sendError(res, 400, 'Invalid workspace id.');
      return;
    }
    if (!email || !isValidEmail(email)) {
      sendError(res, 400, 'Enter a valid email address.');
      return;
    }

    const { url, key } = requireSupabaseEnv();
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      sendError(res, 401, 'Your session expired. Sign in again before inviting collaborators.');
      return;
    }

    const retryAfterSeconds = checkInviteRateLimit(`${userData.user.id}:${workspaceId}`);
    if (retryAfterSeconds) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      sendError(res, 429, `Too many invitations. Try again in ${retryAfterSeconds} seconds.`);
      return;
    }

    const { data: invite, error: inviteError } = await supabase.rpc('create_workspace_invitation', {
      _workspace_id: workspaceId,
      _email: email,
      _role: role,
    });
    if (inviteError) throw inviteError;
    if (!isRecord(invite) || typeof invite.id !== 'string' || !UUID_RE.test(invite.id)) {
      throw httpError(502, 'Invitation was created without a valid id.');
    }

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();

    const inviterName =
      userData.user.user_metadata?.display_name ||
      userData.user.user_metadata?.full_name ||
      userData.user.email ||
      'An Infonote collaborator';
    const workspaceName = typeof workspace?.name === 'string' && workspace.name.trim()
      ? workspace.name.trim()
      : 'Infonote canvas';
    const acceptUrl = `${getSiteBaseUrl(req)}/login?workspaceInvite=${encodeURIComponent(invite.id)}`;
    let emailResult = null;
    let emailError = null;
    try {
      emailResult = await sendInviteEmail({
        to: email,
        acceptUrl,
        workspaceName,
        inviterName,
        role,
      });
    } catch (error) {
      emailError = error instanceof Error ? error.message : String(error);
    }

    sendJson(res, 200, {
      invitation: invite,
      workspaceName,
      acceptUrl,
      emailDelivery: emailError ? 'failed' : 'sent',
      emailError,
      emailId: emailResult?.id || null,
    });
  } catch (error) {
    sendError(res, error?.status || 500, error);
  }
}
