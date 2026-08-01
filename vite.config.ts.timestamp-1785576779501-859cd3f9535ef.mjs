// vite.config.ts
import { createClient } from "file:///C:/Users/Wajih%20souissi/.gemini/antigravity-ide/scratch/infonote/node_modules/@supabase/supabase-js/dist/index.mjs";
import react from "file:///C:/Users/Wajih%20souissi/.gemini/antigravity-ide/scratch/infonote/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { defineConfig, loadEnv } from "file:///C:/Users/Wajih%20souissi/.gemini/antigravity-ide/scratch/infonote/node_modules/vite/dist/node/index.js";
var AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
var NOTION_API_BASE_URL = "https://api.notion.com/v1";
var DEFAULT_NOTION_VERSION = "2022-06-28";
var MAX_EMAIL_LENGTH = 254;
var INVITE_RATE_LIMIT_WINDOW_MS = 6e4;
var INVITE_RATE_LIMIT_MAX = 10;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var loadedEnv = {};
var inviteRateLimits = /* @__PURE__ */ new Map();
function getGatewayKey() {
  const key = getEnvValue("AI_GATEWAY_API_KEY", "VITE_AI_GATEWAY_API_KEY");
  if (!key || key.trim() === "") {
    throw new Error("AI Gateway is not configured. Add AI_GATEWAY_API_KEY to your local environment or Vercel Project Settings.");
  }
  return key.trim();
}
function getSupabaseServiceRoleKey() {
  return getEnvValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
}
function getEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name] || loadedEnv[name];
    if (value && value.trim() !== "") return stripWrappingQuotes(value.trim());
  }
  return "";
}
function stripWrappingQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).trim();
  }
  return value;
}
function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header);
  return match?.[1]?.trim() || "";
}
function isValidEmail(email) {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getRequestBaseUrl(req) {
  const configured = getEnvValue("INVITE_SITE_URL", "VITE_SITE_URL", "SITE_URL");
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5173";
  const proto = req.headers["x-forwarded-proto"] || "http";
  const cleanHost = Array.isArray(host) ? host[0] : host;
  const cleanProto = Array.isArray(proto) ? proto[0] : proto;
  return `${cleanProto}://${cleanHost}`.replace(/\/+$/, "");
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
    return Math.max(1, Math.ceil((current.resetAt - now) / 1e3));
  }
  return null;
}
var AI_RATE_LIMIT_WINDOW_MS = 6e4;
var AI_RATE_LIMITS = { text: 30, image: 10 };
var aiRateLimits = /* @__PURE__ */ new Map();
function getServerAiModel(kind) {
  if (kind === "image") {
    return getEnvValue("AI_GATEWAY_IMAGE_MODEL", "VITE_AI_GATEWAY_IMAGE_MODEL") || "bfl/flux-2-pro";
  }
  return getEnvValue("AI_GATEWAY_TEXT_MODEL", "VITE_AI_GATEWAY_TEXT_MODEL") || "openai/gpt-4o-mini";
}
async function requireDevAiAccess(req, kind) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: "Sign in to use AI features." };
  }
  const url = getEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = getEnvValue("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) {
    return { ok: false, status: 500, message: "Supabase environment is missing SUPABASE_URL and SUPABASE_ANON_KEY." };
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: "Your session expired. Sign in again to use AI features." };
  }
  const limitKey = `${data.user.id}:${kind}`;
  const now = Date.now();
  const current = aiRateLimits.get(limitKey);
  if (!current || now >= current.resetAt) {
    aiRateLimits.set(limitKey, { count: 1, resetAt: now + AI_RATE_LIMIT_WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > AI_RATE_LIMITS[kind]) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1e3));
      return { ok: false, status: 429, message: `Too many AI requests. Try again in ${retryAfter} seconds.`, retryAfter };
    }
  }
  return { ok: true, userId: data.user.id };
}
async function guardDevAiRoute(req, res, kind) {
  const access = await requireDevAiAccess(req, kind);
  if (!access.ok) {
    if (access.retryAfter) res.setHeader("Retry-After", String(access.retryAfter));
    sendError(res, access.status, access.message);
    return false;
  }
  return true;
}
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function getBodyString(body, key) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
function sendError(res, status, error) {
  sendJson(res, status, {
    error: error instanceof Error ? error.message : String(error)
  });
}
function buildNotionHeaders(accessToken, notionVersion) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": notionVersion || DEFAULT_NOTION_VERSION,
    "Content-Type": "application/json"
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordValue(source, key) {
  if (!isRecord(source)) return null;
  const value = source[key];
  return isRecord(value) ? value : null;
}
function arrayValue(source, key) {
  if (!isRecord(source)) return [];
  const value = source[key];
  return Array.isArray(value) ? value : [];
}
function stringValue(source, key) {
  if (!isRecord(source)) return "";
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}
function firstChoiceMessage(data) {
  const choice = arrayValue(data, "choices").find(isRecord);
  return recordValue(choice, "message");
}
function extractTextContent(data) {
  const content = firstChoiceMessage(data)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => stringValue(part, "text")).join("");
  }
  return "";
}
function extractStreamText(data) {
  const choice = arrayValue(data, "choices").find(isRecord);
  const delta = recordValue(choice, "delta");
  return stringValue(delta, "content");
}
function extractImageUrl(data) {
  const image = arrayValue(data, "data").find(isRecord);
  const base64Image = stringValue(image, "b64_json");
  if (base64Image) return `data:image/png;base64,${base64Image}`;
  const imageUrl = stringValue(image, "url");
  if (imageUrl) return imageUrl;
  const message = firstChoiceMessage(data);
  const chatImage = arrayValue(message, "images").find(isRecord);
  const chatImageUrl = stringValue(recordValue(chatImage, "image_url"), "url");
  if (chatImageUrl) return chatImageUrl;
  const content = message?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      const nestedImageUrl = stringValue(recordValue(item, "image_url"), "url");
      if (nestedImageUrl) return nestedImageUrl;
    }
  }
  return null;
}
function joinNotionRichText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => stringValue(item, "plain_text") || stringValue(recordValue(item, "text"), "content")).join("").trim();
}
function getNotionPageTitle(properties) {
  if (!isRecord(properties)) return "Untitled page";
  for (const prop of Object.values(properties)) {
    if (isRecord(prop) && prop.type === "title") {
      return joinNotionRichText(prop.title) || "Untitled page";
    }
  }
  return "Untitled page";
}
function normalizeNotionSearchItem(item) {
  if (!isRecord(item)) return null;
  const id = stringValue(item, "id");
  if (!id) return null;
  if (item.object === "database") {
    return {
      id,
      kind: "database",
      title: joinNotionRichText(item.title) || "Untitled database",
      url: stringValue(item, "url") || null,
      lastEditedTime: stringValue(item, "last_edited_time") || null
    };
  }
  if (item.object === "page") {
    return {
      id,
      kind: "page",
      title: getNotionPageTitle(item.properties),
      url: stringValue(item, "url") || null,
      lastEditedTime: stringValue(item, "last_edited_time") || null
    };
  }
  return null;
}
async function callGateway(path, payload) {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const gatewayError = recordValue(data, "error");
    const message = stringValue(gatewayError, "message") || stringValue(data, "message") || text || `AI Gateway request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}
async function readNotionResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(stringValue(data, "message") || text || `Notion API failed with HTTP ${response.status}`);
  }
  return data;
}
async function fetchNotionBlockChildren(id, headers, depth = 0) {
  const all = [];
  let cursor = "";
  do {
    const url = `${NOTION_API_BASE_URL}/blocks/${encodeURIComponent(id)}/children?page_size=100` + (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : "");
    const data = await readNotionResponse(await fetch(url, { method: "GET", headers }));
    for (const rawBlock of arrayValue(data, "results")) {
      if (!isRecord(rawBlock)) {
        all.push(rawBlock);
        continue;
      }
      const block = { ...rawBlock };
      if (block.has_children === true && typeof block.id === "string" && depth < 8) {
        try {
          block.children = await fetchNotionBlockChildren(block.id, headers, depth + 1);
        } catch (error) {
          block.children_fetch_error = error instanceof Error ? error.message : String(error);
        }
      }
      all.push(block);
    }
    cursor = isRecord(data) && data.has_more ? stringValue(data, "next_cursor") : "";
  } while (cursor);
  return all;
}
async function fetchNotionPageBlocks(id, headers) {
  return fetchNotionBlockChildren(id, headers, 0);
}
async function queryNotionDatabaseRows(id, headers) {
  const all = [];
  let cursor = "";
  do {
    const data = await readNotionResponse(await fetch(`${NOTION_API_BASE_URL}/databases/${encodeURIComponent(id)}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        page_size: 100,
        ...cursor ? { start_cursor: cursor } : {}
      })
    }));
    all.push(...arrayValue(data, "results"));
    cursor = isRecord(data) && data.has_more ? stringValue(data, "next_cursor") : "";
  } while (cursor);
  return all;
}
async function queryNotionDatabaseRowsWithBlocks(id, headers) {
  const pages = await queryNotionDatabaseRows(id, headers);
  const hydrated = [];
  for (const page of pages) {
    if (!isRecord(page) || typeof page.id !== "string") {
      hydrated.push(page);
      continue;
    }
    try {
      hydrated.push({
        ...page,
        children: await fetchNotionBlockChildren(page.id, headers, 0)
      });
    } catch (error) {
      hydrated.push({
        ...page,
        children: [],
        children_fetch_error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return hydrated;
}
async function handleDevNotionSearch(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  const body = await readJsonBody(req);
  const accessToken = getBodyString(body, "accessToken");
  if (!accessToken) {
    sendError(res, 401, "Connect Notion before importing workspace content.");
    return;
  }
  const query = getBodyString(body, "query");
  const notionVersion = getBodyString(body, "notionVersion");
  const data = await readNotionResponse(await fetch(`${NOTION_API_BASE_URL}/search`, {
    method: "POST",
    headers: buildNotionHeaders(accessToken, notionVersion),
    body: JSON.stringify({
      page_size: 25,
      ...query ? { query } : {},
      sort: {
        direction: "descending",
        timestamp: "last_edited_time"
      }
    })
  }));
  sendJson(res, 200, {
    items: arrayValue(data, "results").map(normalizeNotionSearchItem).filter(isRecord),
    hasMore: Boolean(isRecord(data) && data.has_more),
    nextCursor: stringValue(data, "next_cursor") || null
  });
}
async function fetchNotionPage(id, headers) {
  const url = `${NOTION_API_BASE_URL}/pages/${encodeURIComponent(id)}`;
  return await readNotionResponse(await fetch(url, { method: "GET", headers }));
}
async function handleDevNotionFetch(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  const body = await readJsonBody(req);
  const accessToken = getBodyString(body, "accessToken");
  const id = getBodyString(body, "id");
  const kind = getBodyString(body, "kind") === "database" ? "database" : "page";
  const notionVersion = getBodyString(body, "notionVersion");
  if (!accessToken) {
    sendError(res, 401, "Connect Notion before importing workspace content.");
    return;
  }
  if (!id) {
    sendError(res, 400, "Missing Notion page or database id.");
    return;
  }
  const headers = buildNotionHeaders(accessToken, notionVersion);
  let results = [];
  let page = void 0;
  if (kind === "database") {
    results = await queryNotionDatabaseRowsWithBlocks(id, headers);
  } else {
    results = await fetchNotionPageBlocks(id, headers);
    try {
      page = await fetchNotionPage(id, headers);
    } catch (e) {
      console.error("[Notion] Failed to fetch page metadata:", e);
    }
  }
  sendJson(res, 200, { kind, results, page });
}
async function sendDevInviteEmail(options) {
  const resendKey = getEnvValue("RESEND_API_KEY");
  if (!resendKey) {
    throw new Error("Email delivery is not configured. Add RESEND_API_KEY to your local environment or Vercel Project Settings.");
  }
  const from = getEnvValue("INVITE_FROM_EMAIL", "RESEND_FROM_EMAIL") || "Infonote <onboarding@resend.dev>";
  const safeWorkspace = escapeHtml(options.workspaceName);
  const safeInviter = escapeHtml(options.inviterName);
  const safeRole = escapeHtml(options.role);
  const safeUrl = escapeHtml(options.acceptUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: `${options.inviterName} invited you to ${options.workspaceName}`,
      text: `${options.inviterName} invited you to join "${options.workspaceName}" as ${options.role}.

Accept the invitation: ${options.acceptUrl}

If this was not expected, you can ignore this email.`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111827">
          <h1 style="margin:0 0 12px;font-size:22px">You have been invited to Infonote</h1>
          <p style="margin:0 0 14px">${safeInviter} invited you to collaborate on <strong>${safeWorkspace}</strong> as <strong>${safeRole}</strong>.</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Accept invitation</a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px">If the button does not work, open this link:<br>${safeUrl}</p>
        </div>
      `
    })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(stringValue(data, "message") || stringValue(data, "error") || text || `Resend failed with HTTP ${response.status}`);
  }
  return data;
}
async function sendDevSupabaseInviteEmail(options) {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error("Supabase email fallback is not configured. Add SUPABASE_SERVICE_ROLE_KEY server-side to enable Auth invite fallback.");
  }
  const admin = createClient(options.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(options.to, {
    redirectTo: options.acceptUrl,
    data: {
      workspace_invite_url: options.acceptUrl,
      workspace_name: options.workspaceName,
      invited_by: options.inviterName,
      workspace_role: options.role
    }
  });
  if (error) throw error;
  return data;
}
async function deliverDevInviteEmail(options) {
  const failures = [];
  try {
    const data = await sendDevInviteEmail(options);
    return {
      ok: true,
      provider: "resend",
      id: isRecord(data) ? stringValue(data, "id") || null : null,
      error: null
    };
  } catch (error) {
    failures.push(`Resend: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const data = await sendDevSupabaseInviteEmail(options);
    return {
      ok: true,
      provider: "supabase-auth",
      id: isRecord(data) ? stringValue(recordValue(data, "user"), "id") || null : null,
      error: null
    };
  } catch (error) {
    failures.push(`Supabase Auth fallback: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    ok: false,
    provider: null,
    id: null,
    error: failures.join(" | ")
  };
}
function buildDevInviteHealth() {
  const hasResendApiKey = Boolean(getEnvValue("RESEND_API_KEY"));
  const hasInviteFromEmail = Boolean(getEnvValue("INVITE_FROM_EMAIL", "RESEND_FROM_EMAIL"));
  const hasSupabaseServiceRoleFallback = Boolean(getSupabaseServiceRoleKey());
  const hasInviteSiteUrl = Boolean(getEnvValue("INVITE_SITE_URL", "VITE_SITE_URL", "SITE_URL"));
  const resendConfigured = hasResendApiKey && hasInviteFromEmail;
  const emailDeliveryConfigured = resendConfigured || hasSupabaseServiceRoleFallback;
  const recommendations = [];
  if (!hasResendApiKey) recommendations.push("Add RESEND_API_KEY in Vercel Project Settings.");
  if (!hasInviteFromEmail) recommendations.push("Add INVITE_FROM_EMAIL using a verified Resend sender/domain.");
  if (!hasInviteSiteUrl) recommendations.push("Add INVITE_SITE_URL=https://chnkit.com so email accept links use the production domain.");
  if (!hasSupabaseServiceRoleFallback) recommendations.push("Optional: add server-only SUPABASE_SERVICE_ROLE_KEY to enable Supabase Auth email fallback.");
  return {
    ok: emailDeliveryConfigured && hasInviteSiteUrl,
    resendConfigured,
    supabaseAuthFallbackConfigured: hasSupabaseServiceRoleFallback,
    inviteSiteUrlConfigured: hasInviteSiteUrl,
    emailDeliveryConfigured,
    recommendations
  };
}
async function handleDevWorkspaceInviteHealth(req, res) {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 401, "You must be signed in to check invite email configuration.");
    return;
  }
  const supabaseUrl = getEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseKey = getEnvValue("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    sendError(res, 500, "Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    sendError(res, 401, "Your session expired. Sign in again before checking invite email configuration.");
    return;
  }
  sendJson(res, 200, buildDevInviteHealth());
}
async function handleDevWorkspaceInvite(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 401, "You must be signed in to invite collaborators.");
    return;
  }
  const body = await readJsonBody(req);
  const workspaceId = getBodyString(body, "workspaceId");
  const email = getBodyString(body, "email").toLowerCase();
  const role = getBodyString(body, "role") === "viewer" ? "viewer" : "editor";
  if (!workspaceId) {
    sendError(res, 400, "No active workspace selected.");
    return;
  }
  if (!UUID_RE.test(workspaceId)) {
    sendError(res, 400, "Invalid workspace id.");
    return;
  }
  if (!email || !isValidEmail(email)) {
    sendError(res, 400, "Enter a valid email address.");
    return;
  }
  const supabaseUrl = getEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseKey = getEnvValue("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    sendError(res, 500, "Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    sendError(res, 401, "Your session expired. Sign in again before inviting collaborators.");
    return;
  }
  const retryAfterSeconds = checkInviteRateLimit(`${userData.user.id}:${workspaceId}`);
  if (retryAfterSeconds) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    sendError(res, 429, `Too many invitations. Try again in ${retryAfterSeconds} seconds.`);
    return;
  }
  const { data: invite, error: inviteError } = await supabase.rpc("create_workspace_invitation", {
    _workspace_id: workspaceId,
    _email: email,
    _role: role
  });
  if (inviteError) throw inviteError;
  if (!isRecord(invite) || typeof invite.id !== "string") {
    throw new Error("Invitation was created without a valid id.");
  }
  const { data: workspace } = await supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
  const workspaceName = isRecord(workspace) && typeof workspace.name === "string" && workspace.name.trim() ? workspace.name.trim() : "Infonote canvas";
  const inviterName = stringValue(userData.user.user_metadata, "display_name") || stringValue(userData.user.user_metadata, "full_name") || userData.user.email || "An Infonote collaborator";
  const acceptUrl = `${getRequestBaseUrl(req)}/invite/${encodeURIComponent(invite.id)}`;
  const delivery = await deliverDevInviteEmail({
    supabaseUrl,
    to: email,
    acceptUrl,
    workspaceName,
    inviterName,
    role
  });
  sendJson(res, 200, {
    invitation: invite,
    workspaceName,
    acceptUrl,
    emailDelivery: delivery.ok ? "sent" : "failed",
    emailProvider: delivery.provider,
    emailError: delivery.error,
    emailId: delivery.id,
    emailFrom: getEnvValue("INVITE_FROM_EMAIL", "RESEND_FROM_EMAIL") || null
  });
}
function buildChatMessages(body, prompt) {
  const system = getBodyString(body, "system");
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  return messages;
}
function getMaxTokens(body) {
  const raw = body["maxTokens"];
  const value = typeof raw === "number" ? raw : 0;
  if (value > 0 && value <= 8192) return Math.floor(value);
  return 4096;
}
async function handleDevText(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  if (!await guardDevAiRoute(req, res, "text")) return;
  const body = await readJsonBody(req);
  const prompt = getBodyString(body, "prompt");
  if (!prompt) {
    sendError(res, 400, "Prompt is required.");
    return;
  }
  const model = getServerAiModel("text");
  const data = await callGateway("/chat/completions", {
    model,
    messages: buildChatMessages(body, prompt),
    temperature: 0.7,
    max_tokens: getMaxTokens(body)
  });
  const output = extractTextContent(data);
  if (!output) {
    sendError(res, 502, "AI Gateway returned no text content.");
    return;
  }
  sendJson(res, 200, { text: output });
}
async function handleDevImage(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  if (!await guardDevAiRoute(req, res, "image")) return;
  const body = await readJsonBody(req);
  const prompt = getBodyString(body, "prompt");
  if (!prompt) {
    sendError(res, 400, "Prompt is required.");
    return;
  }
  const model = getServerAiModel("image");
  let data;
  try {
    data = await callGateway("/images/generations", {
      model,
      prompt,
      n: 1,
      response_format: "b64_json"
    });
  } catch {
    data = await callGateway("/chat/completions", {
      model,
      messages: [{ role: "user", content: prompt }]
    });
  }
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) {
    sendError(res, 502, "AI Gateway returned no image data.");
    return;
  }
  sendJson(res, 200, { imageUrl });
}
async function handleDevStream(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  if (!await guardDevAiRoute(req, res, "text")) return;
  const body = await readJsonBody(req);
  const prompt = getBodyString(body, "prompt");
  if (!prompt) {
    sendError(res, 400, "Prompt is required.");
    return;
  }
  const model = getServerAiModel("text");
  const gatewayRes = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: buildChatMessages(body, prompt),
      temperature: 0.7,
      max_tokens: getMaxTokens(body),
      stream: true
    })
  });
  if (!gatewayRes.ok || !gatewayRes.body) {
    const text = await gatewayRes.text();
    sendError(res, gatewayRes.status, text || "AI Gateway stream request failed.");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  const reader = gatewayRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      const parsed = JSON.parse(payload);
      const text = extractStreamText(parsed);
      if (text) res.write(text);
    }
  }
  res.end();
}
function aiGatewayDevPlugin() {
  const routes = {
    "/api/ai/text": handleDevText,
    "/api/ai/image": handleDevImage,
    "/api/ai/stream": handleDevStream,
    "/api/notion/search": handleDevNotionSearch,
    "/api/notion/fetch": handleDevNotionFetch,
    "/api/workspace/invite": handleDevWorkspaceInvite,
    "/api/workspace/invite-health": handleDevWorkspaceInviteHealth
  };
  return {
    name: "infonote-ai-gateway-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0] || "";
        const handler = routes[path];
        if (!handler) {
          next();
          return;
        }
        try {
          await handler(req, res);
        } catch (error) {
          if (!res.headersSent) {
            sendError(res, error?.status || 500, error);
          } else {
            res.end();
          }
        }
      });
    }
  };
}
var vite_config_default = defineConfig(({ mode }) => {
  loadedEnv = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), aiGatewayDevPlugin()],
    build: {
      // Our largest deliberate chunks are the split vendors (pdf ~462kB) and the
      // canvas feature entry (BottomMenu ~500kB); 700 keeps the warning meaningful
      // without flagging these intentional bundles.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Split heavy third-party libs into their own cacheable chunks so the
          // app entry / feature chunks (BottomMenu pulled the whole AI SDK stack,
          // ~928kB) stay lean and vendors cache independently across deploys.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/node_modules\/(ai|@ai-sdk|openai|@google\/genai|@huggingface)\//.test(id)) return "vendor-ai";
            if (id.includes("pdfjs-dist") || id.includes("react-pdf")) return "vendor-pdf";
            if (id.includes("@xyflow")) return "vendor-xyflow";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("/motion/") || id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("@dnd-kit")) return "vendor-dnd";
            if (id.includes("html2canvas")) return "vendor-html2canvas";
            if (id.includes("react-dom") || id.includes("/react/") || id.includes("/scheduler/")) return "vendor-react";
          }
        }
      }
    },
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      watch: {
        // graphify-out is a code-navigation index rewritten by tooling hooks;
        // watching it makes every index refresh full-reload the app mid-work.
        ignored: ["**/graphify-out/**"]
      }
    },
    preview: {
      host: "localhost",
      port: 5173,
      strictPort: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxXYWppaCBzb3Vpc3NpXFxcXC5nZW1pbmlcXFxcYW50aWdyYXZpdHktaWRlXFxcXHNjcmF0Y2hcXFxcaW5mb25vdGVcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFdhamloIHNvdWlzc2lcXFxcLmdlbWluaVxcXFxhbnRpZ3Jhdml0eS1pZGVcXFxcc2NyYXRjaFxcXFxpbmZvbm90ZVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvV2FqaWglMjBzb3Vpc3NpLy5nZW1pbmkvYW50aWdyYXZpdHktaWRlL3NjcmF0Y2gvaW5mb25vdGUvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgdHlwZSB7IEluY29taW5nTWVzc2FnZSwgU2VydmVyUmVzcG9uc2UgfSBmcm9tICdub2RlOmh0dHAnXHJcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJ0BzdXBhYmFzZS9zdXBhYmFzZS1qcydcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5pbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYsIHR5cGUgUGx1Z2luIH0gZnJvbSAndml0ZSdcclxuXHJcbmNvbnN0IEFJX0dBVEVXQVlfQkFTRV9VUkwgPSAnaHR0cHM6Ly9haS1nYXRld2F5LnZlcmNlbC5zaC92MSdcclxuY29uc3QgTk9USU9OX0FQSV9CQVNFX1VSTCA9ICdodHRwczovL2FwaS5ub3Rpb24uY29tL3YxJ1xyXG5jb25zdCBERUZBVUxUX05PVElPTl9WRVJTSU9OID0gJzIwMjItMDYtMjgnXHJcbmNvbnN0IE1BWF9FTUFJTF9MRU5HVEggPSAyNTRcclxuY29uc3QgSU5WSVRFX1JBVEVfTElNSVRfV0lORE9XX01TID0gNjBfMDAwXHJcbmNvbnN0IElOVklURV9SQVRFX0xJTUlUX01BWCA9IDEwXHJcbmNvbnN0IFVVSURfUkUgPSAvXlswLTlhLWZdezh9LVswLTlhLWZdezR9LVsxLTVdWzAtOWEtZl17M30tWzg5YWJdWzAtOWEtZl17M30tWzAtOWEtZl17MTJ9JC9pXHJcbmxldCBsb2FkZWRFbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fVxyXG5jb25zdCBpbnZpdGVSYXRlTGltaXRzID0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgcmVzZXRBdDogbnVtYmVyIH0+KClcclxuXHJcbnR5cGUgSnNvbkJvZHkgPSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxyXG50eXBlIERldkFpSGFuZGxlciA9IChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSkgPT4gUHJvbWlzZTx2b2lkPlxyXG5cclxuZnVuY3Rpb24gZ2V0R2F0ZXdheUtleSgpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGtleSA9IGdldEVudlZhbHVlKCdBSV9HQVRFV0FZX0FQSV9LRVknLCAnVklURV9BSV9HQVRFV0FZX0FQSV9LRVknKVxyXG4gIGlmICgha2V5IHx8IGtleS50cmltKCkgPT09ICcnKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0FJIEdhdGV3YXkgaXMgbm90IGNvbmZpZ3VyZWQuIEFkZCBBSV9HQVRFV0FZX0FQSV9LRVkgdG8geW91ciBsb2NhbCBlbnZpcm9ubWVudCBvciBWZXJjZWwgUHJvamVjdCBTZXR0aW5ncy4nKVxyXG4gIH1cclxuICByZXR1cm4ga2V5LnRyaW0oKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRTdXBhYmFzZVNlcnZpY2VSb2xlS2V5KCk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIGdldEVudlZhbHVlKCdTVVBBQkFTRV9TRVJWSUNFX1JPTEVfS0VZJywgJ1NVUEFCQVNFX1NFUlZJQ0VfS0VZJylcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RW52VmFsdWUoLi4ubmFtZXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcclxuICBmb3IgKGNvbnN0IG5hbWUgb2YgbmFtZXMpIHtcclxuICAgIGNvbnN0IHZhbHVlID0gcHJvY2Vzcy5lbnZbbmFtZV0gfHwgbG9hZGVkRW52W25hbWVdXHJcbiAgICBpZiAodmFsdWUgJiYgdmFsdWUudHJpbSgpICE9PSAnJykgcmV0dXJuIHN0cmlwV3JhcHBpbmdRdW90ZXModmFsdWUudHJpbSgpKVxyXG4gIH1cclxuICByZXR1cm4gJydcclxufVxyXG5cclxuZnVuY3Rpb24gc3RyaXBXcmFwcGluZ1F1b3Rlcyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICBpZiAoXHJcbiAgICAodmFsdWUuc3RhcnRzV2l0aCgnXCInKSAmJiB2YWx1ZS5lbmRzV2l0aCgnXCInKSkgfHxcclxuICAgICh2YWx1ZS5zdGFydHNXaXRoKFwiJ1wiKSAmJiB2YWx1ZS5lbmRzV2l0aChcIidcIikpXHJcbiAgKSB7XHJcbiAgICByZXR1cm4gdmFsdWUuc2xpY2UoMSwgLTEpLnRyaW0oKVxyXG4gIH1cclxuICByZXR1cm4gdmFsdWVcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QmVhcmVyVG9rZW4ocmVxOiBJbmNvbWluZ01lc3NhZ2UpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGhlYWRlciA9IHJlcS5oZWFkZXJzLmF1dGhvcml6YXRpb24gfHwgJydcclxuICBjb25zdCBtYXRjaCA9IC9eQmVhcmVyXFxzKyguKykkL2kuZXhlYyhBcnJheS5pc0FycmF5KGhlYWRlcikgPyBoZWFkZXJbMF0gOiBoZWFkZXIpXHJcbiAgcmV0dXJuIG1hdGNoPy5bMV0/LnRyaW0oKSB8fCAnJ1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1ZhbGlkRW1haWwoZW1haWw6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiBlbWFpbC5sZW5ndGggPD0gTUFYX0VNQUlMX0xFTkdUSCAmJiAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLy50ZXN0KGVtYWlsKVxyXG59XHJcblxyXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcclxuICByZXR1cm4gU3RyaW5nKHZhbHVlKVxyXG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcclxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcclxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcclxuICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFJlcXVlc3RCYXNlVXJsKHJlcTogSW5jb21pbmdNZXNzYWdlKTogc3RyaW5nIHtcclxuICBjb25zdCBjb25maWd1cmVkID0gZ2V0RW52VmFsdWUoJ0lOVklURV9TSVRFX1VSTCcsICdWSVRFX1NJVEVfVVJMJywgJ1NJVEVfVVJMJylcclxuICBpZiAoY29uZmlndXJlZCAmJiAvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGNvbmZpZ3VyZWQpKSByZXR1cm4gY29uZmlndXJlZC5yZXBsYWNlKC9cXC8rJC8sICcnKVxyXG5cclxuICBjb25zdCBob3N0ID0gcmVxLmhlYWRlcnNbJ3gtZm9yd2FyZGVkLWhvc3QnXSB8fCByZXEuaGVhZGVycy5ob3N0IHx8ICdsb2NhbGhvc3Q6NTE3MydcclxuICBjb25zdCBwcm90byA9IHJlcS5oZWFkZXJzWyd4LWZvcndhcmRlZC1wcm90byddIHx8ICdodHRwJ1xyXG4gIGNvbnN0IGNsZWFuSG9zdCA9IEFycmF5LmlzQXJyYXkoaG9zdCkgPyBob3N0WzBdIDogaG9zdFxyXG4gIGNvbnN0IGNsZWFuUHJvdG8gPSBBcnJheS5pc0FycmF5KHByb3RvKSA/IHByb3RvWzBdIDogcHJvdG9cclxuICByZXR1cm4gYCR7Y2xlYW5Qcm90b306Ly8ke2NsZWFuSG9zdH1gLnJlcGxhY2UoL1xcLyskLywgJycpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrSW52aXRlUmF0ZUxpbWl0KGtleTogc3RyaW5nKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxyXG4gIGNvbnN0IGN1cnJlbnQgPSBpbnZpdGVSYXRlTGltaXRzLmdldChrZXkpXHJcbiAgaWYgKCFjdXJyZW50IHx8IG5vdyA+IGN1cnJlbnQucmVzZXRBdCkge1xyXG4gICAgaW52aXRlUmF0ZUxpbWl0cy5zZXQoa2V5LCB7IGNvdW50OiAxLCByZXNldEF0OiBub3cgKyBJTlZJVEVfUkFURV9MSU1JVF9XSU5ET1dfTVMgfSlcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG5cclxuICBjdXJyZW50LmNvdW50ICs9IDFcclxuICBpZiAoY3VycmVudC5jb3VudCA+IElOVklURV9SQVRFX0xJTUlUX01BWCkge1xyXG4gICAgcmV0dXJuIE1hdGgubWF4KDEsIE1hdGguY2VpbCgoY3VycmVudC5yZXNldEF0IC0gbm93KSAvIDEwMDApKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwIEFJIHJvdXRlIGd1YXJkIChtaXJyb3JzIGFwaS9fbGliL2FpR3VhcmQuanMgc28gZGV2ID09PSBwcm9kIGJlaGF2aW9yKSBcdTI1MDBcdTI1MDBcclxuY29uc3QgQUlfUkFURV9MSU1JVF9XSU5ET1dfTVMgPSA2MF8wMDBcclxuY29uc3QgQUlfUkFURV9MSU1JVFM6IFJlY29yZDwndGV4dCcgfCAnaW1hZ2UnLCBudW1iZXI+ID0geyB0ZXh0OiAzMCwgaW1hZ2U6IDEwIH1cclxuY29uc3QgYWlSYXRlTGltaXRzID0gbmV3IE1hcDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgcmVzZXRBdDogbnVtYmVyIH0+KClcclxuXHJcbnR5cGUgQWlBY2Nlc3NSZXN1bHQgPVxyXG4gIHwgeyBvazogdHJ1ZTsgdXNlcklkOiBzdHJpbmcgfVxyXG4gIHwgeyBvazogZmFsc2U7IHN0YXR1czogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHJldHJ5QWZ0ZXI/OiBudW1iZXIgfVxyXG5cclxuLy8gVGhlIG1vZGVsIGlzIEFMV0FZUyBjaG9zZW4gc2VydmVyLXNpZGU7IGNsaWVudCBcIm1vZGVsXCIgZmllbGRzIGFyZSBpZ25vcmVkXHJcbi8vIHNvIHRoZSBlbmRwb2ludCBjYW5ub3QgYmUgcG9pbnRlZCBhdCBleHBlbnNpdmUgbW9kZWxzLlxyXG5mdW5jdGlvbiBnZXRTZXJ2ZXJBaU1vZGVsKGtpbmQ6ICd0ZXh0JyB8ICdpbWFnZScpOiBzdHJpbmcge1xyXG4gIGlmIChraW5kID09PSAnaW1hZ2UnKSB7XHJcbiAgICByZXR1cm4gZ2V0RW52VmFsdWUoJ0FJX0dBVEVXQVlfSU1BR0VfTU9ERUwnLCAnVklURV9BSV9HQVRFV0FZX0lNQUdFX01PREVMJykgfHwgJ2JmbC9mbHV4LTItcHJvJ1xyXG4gIH1cclxuICByZXR1cm4gZ2V0RW52VmFsdWUoJ0FJX0dBVEVXQVlfVEVYVF9NT0RFTCcsICdWSVRFX0FJX0dBVEVXQVlfVEVYVF9NT0RFTCcpIHx8ICdvcGVuYWkvZ3B0LTRvLW1pbmknXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlcXVpcmVEZXZBaUFjY2VzcyhyZXE6IEluY29taW5nTWVzc2FnZSwga2luZDogJ3RleHQnIHwgJ2ltYWdlJyk6IFByb21pc2U8QWlBY2Nlc3NSZXN1bHQ+IHtcclxuICBjb25zdCB0b2tlbiA9IGdldEJlYXJlclRva2VuKHJlcSlcclxuICBpZiAoIXRva2VuKSB7XHJcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHN0YXR1czogNDAxLCBtZXNzYWdlOiAnU2lnbiBpbiB0byB1c2UgQUkgZmVhdHVyZXMuJyB9XHJcbiAgfVxyXG5cclxuICBjb25zdCB1cmwgPSBnZXRFbnZWYWx1ZSgnU1VQQUJBU0VfVVJMJywgJ1ZJVEVfU1VQQUJBU0VfVVJMJylcclxuICBjb25zdCBrZXkgPSBnZXRFbnZWYWx1ZSgnU1VQQUJBU0VfQU5PTl9LRVknLCAnU1VQQUJBU0VfUFVCTElTSEFCTEVfS0VZJywgJ1ZJVEVfU1VQQUJBU0VfQU5PTl9LRVknLCAnVklURV9TVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVknKVxyXG4gIGlmICghdXJsIHx8ICFrZXkpIHtcclxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA1MDAsIG1lc3NhZ2U6ICdTdXBhYmFzZSBlbnZpcm9ubWVudCBpcyBtaXNzaW5nIFNVUEFCQVNFX1VSTCBhbmQgU1VQQUJBU0VfQU5PTl9LRVkuJyB9XHJcbiAgfVxyXG5cclxuICBjb25zdCBzdXBhYmFzZSA9IGNyZWF0ZUNsaWVudCh1cmwsIGtleSwge1xyXG4gICAgYXV0aDogeyBwZXJzaXN0U2Vzc2lvbjogZmFsc2UsIGF1dG9SZWZyZXNoVG9rZW46IGZhbHNlIH0sXHJcbiAgfSlcclxuICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5hdXRoLmdldFVzZXIodG9rZW4pXHJcbiAgaWYgKGVycm9yIHx8ICFkYXRhPy51c2VyKSB7XHJcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHN0YXR1czogNDAxLCBtZXNzYWdlOiAnWW91ciBzZXNzaW9uIGV4cGlyZWQuIFNpZ24gaW4gYWdhaW4gdG8gdXNlIEFJIGZlYXR1cmVzLicgfVxyXG4gIH1cclxuXHJcbiAgY29uc3QgbGltaXRLZXkgPSBgJHtkYXRhLnVzZXIuaWR9OiR7a2luZH1gXHJcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxyXG4gIGNvbnN0IGN1cnJlbnQgPSBhaVJhdGVMaW1pdHMuZ2V0KGxpbWl0S2V5KVxyXG4gIGlmICghY3VycmVudCB8fCBub3cgPj0gY3VycmVudC5yZXNldEF0KSB7XHJcbiAgICBhaVJhdGVMaW1pdHMuc2V0KGxpbWl0S2V5LCB7IGNvdW50OiAxLCByZXNldEF0OiBub3cgKyBBSV9SQVRFX0xJTUlUX1dJTkRPV19NUyB9KVxyXG4gIH0gZWxzZSB7XHJcbiAgICBjdXJyZW50LmNvdW50ICs9IDFcclxuICAgIGlmIChjdXJyZW50LmNvdW50ID4gQUlfUkFURV9MSU1JVFNba2luZF0pIHtcclxuICAgICAgY29uc3QgcmV0cnlBZnRlciA9IE1hdGgubWF4KDEsIE1hdGguY2VpbCgoY3VycmVudC5yZXNldEF0IC0gbm93KSAvIDEwMDApKVxyXG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHN0YXR1czogNDI5LCBtZXNzYWdlOiBgVG9vIG1hbnkgQUkgcmVxdWVzdHMuIFRyeSBhZ2FpbiBpbiAke3JldHJ5QWZ0ZXJ9IHNlY29uZHMuYCwgcmV0cnlBZnRlciB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4geyBvazogdHJ1ZSwgdXNlcklkOiBkYXRhLnVzZXIuaWQgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBndWFyZERldkFpUm91dGUocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UsIGtpbmQ6ICd0ZXh0JyB8ICdpbWFnZScpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICBjb25zdCBhY2Nlc3MgPSBhd2FpdCByZXF1aXJlRGV2QWlBY2Nlc3MocmVxLCBraW5kKVxyXG4gIGlmICghYWNjZXNzLm9rKSB7XHJcbiAgICBpZiAoYWNjZXNzLnJldHJ5QWZ0ZXIpIHJlcy5zZXRIZWFkZXIoJ1JldHJ5LUFmdGVyJywgU3RyaW5nKGFjY2Vzcy5yZXRyeUFmdGVyKSlcclxuICAgIHNlbmRFcnJvcihyZXMsIGFjY2Vzcy5zdGF0dXMsIGFjY2Vzcy5tZXNzYWdlKVxyXG4gICAgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHJldHVybiB0cnVlXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlYWRKc29uQm9keShyZXE6IEluY29taW5nTWVzc2FnZSk6IFByb21pc2U8SnNvbkJvZHk+IHtcclxuICBjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW11cclxuICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHJlcSkge1xyXG4gICAgY2h1bmtzLnB1c2goQnVmZmVyLmlzQnVmZmVyKGNodW5rKSA/IGNodW5rIDogQnVmZmVyLmZyb20oY2h1bmspKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgcmF3ID0gQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JylcclxuICBpZiAoIXJhdykgcmV0dXJuIHt9XHJcblxyXG4gIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KVxyXG4gIHJldHVybiBwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZCBhcyBKc29uQm9keSA6IHt9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEJvZHlTdHJpbmcoYm9keTogSnNvbkJvZHksIGtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCB2YWx1ZSA9IGJvZHlba2V5XVxyXG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUudHJpbSgpIDogJydcclxufVxyXG5cclxuZnVuY3Rpb24gc2VuZEpzb24ocmVzOiBTZXJ2ZXJSZXNwb25zZSwgc3RhdHVzOiBudW1iZXIsIHBheWxvYWQ6IEpzb25Cb2R5KTogdm9pZCB7XHJcbiAgcmVzLnN0YXR1c0NvZGUgPSBzdGF0dXNcclxuICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpXHJcbiAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSlcclxufVxyXG5cclxuZnVuY3Rpb24gc2VuZEVycm9yKHJlczogU2VydmVyUmVzcG9uc2UsIHN0YXR1czogbnVtYmVyLCBlcnJvcjogdW5rbm93bik6IHZvaWQge1xyXG4gIHNlbmRKc29uKHJlcywgc3RhdHVzLCB7XHJcbiAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxyXG4gIH0pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJ1aWxkTm90aW9uSGVhZGVycyhhY2Nlc3NUb2tlbjogc3RyaW5nLCBub3Rpb25WZXJzaW9uPzogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHthY2Nlc3NUb2tlbn1gLFxyXG4gICAgJ05vdGlvbi1WZXJzaW9uJzogbm90aW9uVmVyc2lvbiB8fCBERUZBVUxUX05PVElPTl9WRVJTSU9OLFxyXG4gICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKVxyXG59XHJcblxyXG5mdW5jdGlvbiByZWNvcmRWYWx1ZShzb3VyY2U6IHVua25vd24sIGtleTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcclxuICBpZiAoIWlzUmVjb3JkKHNvdXJjZSkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdmFsdWUgPSBzb3VyY2Vba2V5XVxyXG4gIHJldHVybiBpc1JlY29yZCh2YWx1ZSkgPyB2YWx1ZSA6IG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gYXJyYXlWYWx1ZShzb3VyY2U6IHVua25vd24sIGtleTogc3RyaW5nKTogdW5rbm93bltdIHtcclxuICBpZiAoIWlzUmVjb3JkKHNvdXJjZSkpIHJldHVybiBbXVxyXG4gIGNvbnN0IHZhbHVlID0gc291cmNlW2tleV1cclxuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZSA6IFtdXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0cmluZ1ZhbHVlKHNvdXJjZTogdW5rbm93biwga2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGlmICghaXNSZWNvcmQoc291cmNlKSkgcmV0dXJuICcnXHJcbiAgY29uc3QgdmFsdWUgPSBzb3VyY2Vba2V5XVxyXG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUudHJpbSgpIDogJydcclxufVxyXG5cclxuZnVuY3Rpb24gZmlyc3RDaG9pY2VNZXNzYWdlKGRhdGE6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwge1xyXG4gIGNvbnN0IGNob2ljZSA9IGFycmF5VmFsdWUoZGF0YSwgJ2Nob2ljZXMnKS5maW5kKGlzUmVjb3JkKVxyXG4gIHJldHVybiByZWNvcmRWYWx1ZShjaG9pY2UsICdtZXNzYWdlJylcclxufVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdFRleHRDb250ZW50KGRhdGE6IHVua25vd24pOiBzdHJpbmcge1xyXG4gIGNvbnN0IGNvbnRlbnQgPSBmaXJzdENob2ljZU1lc3NhZ2UoZGF0YSk/LmNvbnRlbnRcclxuICBpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSByZXR1cm4gY29udGVudFxyXG4gIGlmIChBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XHJcbiAgICByZXR1cm4gY29udGVudC5tYXAoKHBhcnQpID0+IHN0cmluZ1ZhbHVlKHBhcnQsICd0ZXh0JykpLmpvaW4oJycpXHJcbiAgfVxyXG4gIHJldHVybiAnJ1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0U3RyZWFtVGV4dChkYXRhOiB1bmtub3duKTogc3RyaW5nIHtcclxuICBjb25zdCBjaG9pY2UgPSBhcnJheVZhbHVlKGRhdGEsICdjaG9pY2VzJykuZmluZChpc1JlY29yZClcclxuICBjb25zdCBkZWx0YSA9IHJlY29yZFZhbHVlKGNob2ljZSwgJ2RlbHRhJylcclxuICByZXR1cm4gc3RyaW5nVmFsdWUoZGVsdGEsICdjb250ZW50JylcclxufVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdEltYWdlVXJsKGRhdGE6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBjb25zdCBpbWFnZSA9IGFycmF5VmFsdWUoZGF0YSwgJ2RhdGEnKS5maW5kKGlzUmVjb3JkKVxyXG4gIGNvbnN0IGJhc2U2NEltYWdlID0gc3RyaW5nVmFsdWUoaW1hZ2UsICdiNjRfanNvbicpXHJcbiAgaWYgKGJhc2U2NEltYWdlKSByZXR1cm4gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke2Jhc2U2NEltYWdlfWBcclxuXHJcbiAgY29uc3QgaW1hZ2VVcmwgPSBzdHJpbmdWYWx1ZShpbWFnZSwgJ3VybCcpXHJcbiAgaWYgKGltYWdlVXJsKSByZXR1cm4gaW1hZ2VVcmxcclxuXHJcbiAgY29uc3QgbWVzc2FnZSA9IGZpcnN0Q2hvaWNlTWVzc2FnZShkYXRhKVxyXG4gIGNvbnN0IGNoYXRJbWFnZSA9IGFycmF5VmFsdWUobWVzc2FnZSwgJ2ltYWdlcycpLmZpbmQoaXNSZWNvcmQpXHJcbiAgY29uc3QgY2hhdEltYWdlVXJsID0gc3RyaW5nVmFsdWUocmVjb3JkVmFsdWUoY2hhdEltYWdlLCAnaW1hZ2VfdXJsJyksICd1cmwnKVxyXG4gIGlmIChjaGF0SW1hZ2VVcmwpIHJldHVybiBjaGF0SW1hZ2VVcmxcclxuXHJcbiAgY29uc3QgY29udGVudCA9IG1lc3NhZ2U/LmNvbnRlbnRcclxuICBpZiAoQXJyYXkuaXNBcnJheShjb250ZW50KSkge1xyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGNvbnRlbnQpIHtcclxuICAgICAgY29uc3QgbmVzdGVkSW1hZ2VVcmwgPSBzdHJpbmdWYWx1ZShyZWNvcmRWYWx1ZShpdGVtLCAnaW1hZ2VfdXJsJyksICd1cmwnKVxyXG4gICAgICBpZiAobmVzdGVkSW1hZ2VVcmwpIHJldHVybiBuZXN0ZWRJbWFnZVVybFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gam9pbk5vdGlvblJpY2hUZXh0KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gJydcclxuICByZXR1cm4gdmFsdWUubWFwKChpdGVtKSA9PiBzdHJpbmdWYWx1ZShpdGVtLCAncGxhaW5fdGV4dCcpIHx8IHN0cmluZ1ZhbHVlKHJlY29yZFZhbHVlKGl0ZW0sICd0ZXh0JyksICdjb250ZW50JykpLmpvaW4oJycpLnRyaW0oKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXROb3Rpb25QYWdlVGl0bGUocHJvcGVydGllczogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgaWYgKCFpc1JlY29yZChwcm9wZXJ0aWVzKSkgcmV0dXJuICdVbnRpdGxlZCBwYWdlJ1xyXG4gIGZvciAoY29uc3QgcHJvcCBvZiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpKSB7XHJcbiAgICBpZiAoaXNSZWNvcmQocHJvcCkgJiYgcHJvcC50eXBlID09PSAndGl0bGUnKSB7XHJcbiAgICAgIHJldHVybiBqb2luTm90aW9uUmljaFRleHQocHJvcC50aXRsZSkgfHwgJ1VudGl0bGVkIHBhZ2UnXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiAnVW50aXRsZWQgcGFnZSdcclxufVxyXG5cclxuZnVuY3Rpb24gbm9ybWFsaXplTm90aW9uU2VhcmNoSXRlbShpdGVtOiB1bmtub3duKTogSnNvbkJvZHkgfCBudWxsIHtcclxuICBpZiAoIWlzUmVjb3JkKGl0ZW0pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGlkID0gc3RyaW5nVmFsdWUoaXRlbSwgJ2lkJylcclxuICBpZiAoIWlkKSByZXR1cm4gbnVsbFxyXG5cclxuICBpZiAoaXRlbS5vYmplY3QgPT09ICdkYXRhYmFzZScpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlkLFxyXG4gICAgICBraW5kOiAnZGF0YWJhc2UnLFxyXG4gICAgICB0aXRsZTogam9pbk5vdGlvblJpY2hUZXh0KGl0ZW0udGl0bGUpIHx8ICdVbnRpdGxlZCBkYXRhYmFzZScsXHJcbiAgICAgIHVybDogc3RyaW5nVmFsdWUoaXRlbSwgJ3VybCcpIHx8IG51bGwsXHJcbiAgICAgIGxhc3RFZGl0ZWRUaW1lOiBzdHJpbmdWYWx1ZShpdGVtLCAnbGFzdF9lZGl0ZWRfdGltZScpIHx8IG51bGwsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBpZiAoaXRlbS5vYmplY3QgPT09ICdwYWdlJykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQsXHJcbiAgICAgIGtpbmQ6ICdwYWdlJyxcclxuICAgICAgdGl0bGU6IGdldE5vdGlvblBhZ2VUaXRsZShpdGVtLnByb3BlcnRpZXMpLFxyXG4gICAgICB1cmw6IHN0cmluZ1ZhbHVlKGl0ZW0sICd1cmwnKSB8fCBudWxsLFxyXG4gICAgICBsYXN0RWRpdGVkVGltZTogc3RyaW5nVmFsdWUoaXRlbSwgJ2xhc3RfZWRpdGVkX3RpbWUnKSB8fCBudWxsLFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gY2FsbEdhdGV3YXkocGF0aDogc3RyaW5nLCBwYXlsb2FkOiBKc29uQm9keSk6IFByb21pc2U8dW5rbm93bj4ge1xyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7QUlfR0FURVdBWV9CQVNFX1VSTH0ke3BhdGh9YCwge1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBoZWFkZXJzOiB7XHJcbiAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtnZXRHYXRld2F5S2V5KCl9YCxcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgIH0sXHJcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcclxuICB9KVxyXG5cclxuICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpXHJcbiAgY29uc3QgZGF0YTogdW5rbm93biA9IHRleHQgPyBKU09OLnBhcnNlKHRleHQpIDoge31cclxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICBjb25zdCBnYXRld2F5RXJyb3IgPSByZWNvcmRWYWx1ZShkYXRhLCAnZXJyb3InKVxyXG4gICAgY29uc3QgbWVzc2FnZSA9IHN0cmluZ1ZhbHVlKGdhdGV3YXlFcnJvciwgJ21lc3NhZ2UnKSB8fCBzdHJpbmdWYWx1ZShkYXRhLCAnbWVzc2FnZScpIHx8IHRleHQgfHwgYEFJIEdhdGV3YXkgcmVxdWVzdCBmYWlsZWQgd2l0aCBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWBcclxuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpIGFzIEVycm9yICYgeyBzdGF0dXM/OiBudW1iZXIgfVxyXG4gICAgZXJyb3Iuc3RhdHVzID0gcmVzcG9uc2Uuc3RhdHVzXHJcbiAgICB0aHJvdyBlcnJvclxyXG4gIH1cclxuICByZXR1cm4gZGF0YVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWFkTm90aW9uUmVzcG9uc2UocmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTx1bmtub3duPiB7XHJcbiAgY29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKVxyXG4gIGNvbnN0IGRhdGE6IHVua25vd24gPSB0ZXh0ID8gSlNPTi5wYXJzZSh0ZXh0KSA6IHt9XHJcbiAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKHN0cmluZ1ZhbHVlKGRhdGEsICdtZXNzYWdlJykgfHwgdGV4dCB8fCBgTm90aW9uIEFQSSBmYWlsZWQgd2l0aCBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWApXHJcbiAgfVxyXG4gIHJldHVybiBkYXRhXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoTm90aW9uQmxvY2tDaGlsZHJlbihpZDogc3RyaW5nLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBkZXB0aCA9IDApOiBQcm9taXNlPHVua25vd25bXT4ge1xyXG4gIGNvbnN0IGFsbDogdW5rbm93bltdID0gW11cclxuICBsZXQgY3Vyc29yID0gJydcclxuXHJcbiAgZG8ge1xyXG4gICAgY29uc3QgdXJsID1cclxuICAgICAgYCR7Tk9USU9OX0FQSV9CQVNFX1VSTH0vYmxvY2tzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlkKX0vY2hpbGRyZW4/cGFnZV9zaXplPTEwMGAgK1xyXG4gICAgICAoY3Vyc29yID8gYCZzdGFydF9jdXJzb3I9JHtlbmNvZGVVUklDb21wb25lbnQoY3Vyc29yKX1gIDogJycpXHJcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVhZE5vdGlvblJlc3BvbnNlKGF3YWl0IGZldGNoKHVybCwgeyBtZXRob2Q6ICdHRVQnLCBoZWFkZXJzIH0pKVxyXG4gICAgZm9yIChjb25zdCByYXdCbG9jayBvZiBhcnJheVZhbHVlKGRhdGEsICdyZXN1bHRzJykpIHtcclxuICAgICAgaWYgKCFpc1JlY29yZChyYXdCbG9jaykpIHtcclxuICAgICAgICBhbGwucHVzaChyYXdCbG9jaylcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBibG9jazogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLnJhd0Jsb2NrIH1cclxuICAgICAgaWYgKGJsb2NrLmhhc19jaGlsZHJlbiA9PT0gdHJ1ZSAmJiB0eXBlb2YgYmxvY2suaWQgPT09ICdzdHJpbmcnICYmIGRlcHRoIDwgOCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBibG9jay5jaGlsZHJlbiA9IGF3YWl0IGZldGNoTm90aW9uQmxvY2tDaGlsZHJlbihibG9jay5pZCwgaGVhZGVycywgZGVwdGggKyAxKVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBibG9jay5jaGlsZHJlbl9mZXRjaF9lcnJvciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBhbGwucHVzaChibG9jaylcclxuICAgIH1cclxuICAgIGN1cnNvciA9IGlzUmVjb3JkKGRhdGEpICYmIGRhdGEuaGFzX21vcmUgPyBzdHJpbmdWYWx1ZShkYXRhLCAnbmV4dF9jdXJzb3InKSA6ICcnXHJcbiAgfSB3aGlsZSAoY3Vyc29yKVxyXG5cclxuICByZXR1cm4gYWxsXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoTm90aW9uUGFnZUJsb2NrcyhpZDogc3RyaW5nLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx1bmtub3duW10+IHtcclxuICByZXR1cm4gZmV0Y2hOb3Rpb25CbG9ja0NoaWxkcmVuKGlkLCBoZWFkZXJzLCAwKVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBxdWVyeU5vdGlvbkRhdGFiYXNlUm93cyhpZDogc3RyaW5nLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx1bmtub3duW10+IHtcclxuICBjb25zdCBhbGw6IHVua25vd25bXSA9IFtdXHJcbiAgbGV0IGN1cnNvciA9ICcnXHJcblxyXG4gIGRvIHtcclxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZWFkTm90aW9uUmVzcG9uc2UoYXdhaXQgZmV0Y2goYCR7Tk9USU9OX0FQSV9CQVNFX1VSTH0vZGF0YWJhc2VzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlkKX0vcXVlcnlgLCB7XHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgcGFnZV9zaXplOiAxMDAsXHJcbiAgICAgICAgLi4uKGN1cnNvciA/IHsgc3RhcnRfY3Vyc29yOiBjdXJzb3IgfSA6IHt9KSxcclxuICAgICAgfSksXHJcbiAgICB9KSlcclxuICAgIGFsbC5wdXNoKC4uLmFycmF5VmFsdWUoZGF0YSwgJ3Jlc3VsdHMnKSlcclxuICAgIGN1cnNvciA9IGlzUmVjb3JkKGRhdGEpICYmIGRhdGEuaGFzX21vcmUgPyBzdHJpbmdWYWx1ZShkYXRhLCAnbmV4dF9jdXJzb3InKSA6ICcnXHJcbiAgfSB3aGlsZSAoY3Vyc29yKVxyXG5cclxuICByZXR1cm4gYWxsXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5Tm90aW9uRGF0YWJhc2VSb3dzV2l0aEJsb2NrcyhpZDogc3RyaW5nLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx1bmtub3duW10+IHtcclxuICBjb25zdCBwYWdlcyA9IGF3YWl0IHF1ZXJ5Tm90aW9uRGF0YWJhc2VSb3dzKGlkLCBoZWFkZXJzKVxyXG4gIGNvbnN0IGh5ZHJhdGVkOiB1bmtub3duW10gPSBbXVxyXG5cclxuICBmb3IgKGNvbnN0IHBhZ2Ugb2YgcGFnZXMpIHtcclxuICAgIGlmICghaXNSZWNvcmQocGFnZSkgfHwgdHlwZW9mIHBhZ2UuaWQgIT09ICdzdHJpbmcnKSB7XHJcbiAgICAgIGh5ZHJhdGVkLnB1c2gocGFnZSlcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBoeWRyYXRlZC5wdXNoKHtcclxuICAgICAgICAuLi5wYWdlLFxyXG4gICAgICAgIGNoaWxkcmVuOiBhd2FpdCBmZXRjaE5vdGlvbkJsb2NrQ2hpbGRyZW4ocGFnZS5pZCwgaGVhZGVycywgMCksXHJcbiAgICAgIH0pXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBoeWRyYXRlZC5wdXNoKHtcclxuICAgICAgICAuLi5wYWdlLFxyXG4gICAgICAgIGNoaWxkcmVuOiBbXSxcclxuICAgICAgICBjaGlsZHJlbl9mZXRjaF9lcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxyXG4gICAgICB9KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGh5ZHJhdGVkXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZURldk5vdGlvblNlYXJjaChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkSnNvbkJvZHkocmVxKVxyXG4gIGNvbnN0IGFjY2Vzc1Rva2VuID0gZ2V0Qm9keVN0cmluZyhib2R5LCAnYWNjZXNzVG9rZW4nKVxyXG4gIGlmICghYWNjZXNzVG9rZW4pIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwMSwgJ0Nvbm5lY3QgTm90aW9uIGJlZm9yZSBpbXBvcnRpbmcgd29ya3NwYWNlIGNvbnRlbnQuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgcXVlcnkgPSBnZXRCb2R5U3RyaW5nKGJvZHksICdxdWVyeScpXHJcbiAgY29uc3Qgbm90aW9uVmVyc2lvbiA9IGdldEJvZHlTdHJpbmcoYm9keSwgJ25vdGlvblZlcnNpb24nKVxyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZWFkTm90aW9uUmVzcG9uc2UoYXdhaXQgZmV0Y2goYCR7Tk9USU9OX0FQSV9CQVNFX1VSTH0vc2VhcmNoYCwge1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBoZWFkZXJzOiBidWlsZE5vdGlvbkhlYWRlcnMoYWNjZXNzVG9rZW4sIG5vdGlvblZlcnNpb24pLFxyXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICBwYWdlX3NpemU6IDI1LFxyXG4gICAgICAuLi4ocXVlcnkgPyB7IHF1ZXJ5IH0gOiB7fSksXHJcbiAgICAgIHNvcnQ6IHtcclxuICAgICAgICBkaXJlY3Rpb246ICdkZXNjZW5kaW5nJyxcclxuICAgICAgICB0aW1lc3RhbXA6ICdsYXN0X2VkaXRlZF90aW1lJyxcclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gIH0pKVxyXG5cclxuICBzZW5kSnNvbihyZXMsIDIwMCwge1xyXG4gICAgaXRlbXM6IGFycmF5VmFsdWUoZGF0YSwgJ3Jlc3VsdHMnKS5tYXAobm9ybWFsaXplTm90aW9uU2VhcmNoSXRlbSkuZmlsdGVyKGlzUmVjb3JkKSxcclxuICAgIGhhc01vcmU6IEJvb2xlYW4oaXNSZWNvcmQoZGF0YSkgJiYgZGF0YS5oYXNfbW9yZSksXHJcbiAgICBuZXh0Q3Vyc29yOiBzdHJpbmdWYWx1ZShkYXRhLCAnbmV4dF9jdXJzb3InKSB8fCBudWxsLFxyXG4gIH0pXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoTm90aW9uUGFnZShpZDogc3RyaW5nLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx1bmtub3duPiB7XHJcbiAgY29uc3QgdXJsID0gYCR7Tk9USU9OX0FQSV9CQVNFX1VSTH0vcGFnZXMvJHtlbmNvZGVVUklDb21wb25lbnQoaWQpfWBcclxuICByZXR1cm4gYXdhaXQgcmVhZE5vdGlvblJlc3BvbnNlKGF3YWl0IGZldGNoKHVybCwgeyBtZXRob2Q6ICdHRVQnLCBoZWFkZXJzIH0pKVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZXZOb3Rpb25GZXRjaChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkSnNvbkJvZHkocmVxKVxyXG4gIGNvbnN0IGFjY2Vzc1Rva2VuID0gZ2V0Qm9keVN0cmluZyhib2R5LCAnYWNjZXNzVG9rZW4nKVxyXG4gIGNvbnN0IGlkID0gZ2V0Qm9keVN0cmluZyhib2R5LCAnaWQnKVxyXG4gIGNvbnN0IGtpbmQgPSBnZXRCb2R5U3RyaW5nKGJvZHksICdraW5kJykgPT09ICdkYXRhYmFzZScgPyAnZGF0YWJhc2UnIDogJ3BhZ2UnXHJcbiAgY29uc3Qgbm90aW9uVmVyc2lvbiA9IGdldEJvZHlTdHJpbmcoYm9keSwgJ25vdGlvblZlcnNpb24nKVxyXG5cclxuICBpZiAoIWFjY2Vzc1Rva2VuKSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDEsICdDb25uZWN0IE5vdGlvbiBiZWZvcmUgaW1wb3J0aW5nIHdvcmtzcGFjZSBjb250ZW50LicpXHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgaWYgKCFpZCkge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNDAwLCAnTWlzc2luZyBOb3Rpb24gcGFnZSBvciBkYXRhYmFzZSBpZC4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCBoZWFkZXJzID0gYnVpbGROb3Rpb25IZWFkZXJzKGFjY2Vzc1Rva2VuLCBub3Rpb25WZXJzaW9uKVxyXG4gIGxldCByZXN1bHRzOiB1bmtub3duW10gPSBbXVxyXG4gIGxldCBwYWdlOiB1bmtub3duID0gdW5kZWZpbmVkXHJcblxyXG4gIGlmIChraW5kID09PSAnZGF0YWJhc2UnKSB7XHJcbiAgICByZXN1bHRzID0gYXdhaXQgcXVlcnlOb3Rpb25EYXRhYmFzZVJvd3NXaXRoQmxvY2tzKGlkLCBoZWFkZXJzKVxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXN1bHRzID0gYXdhaXQgZmV0Y2hOb3Rpb25QYWdlQmxvY2tzKGlkLCBoZWFkZXJzKVxyXG4gICAgdHJ5IHtcclxuICAgICAgcGFnZSA9IGF3YWl0IGZldGNoTm90aW9uUGFnZShpZCwgaGVhZGVycylcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignW05vdGlvbl0gRmFpbGVkIHRvIGZldGNoIHBhZ2UgbWV0YWRhdGE6JywgZSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHNlbmRKc29uKHJlcywgMjAwLCB7IGtpbmQsIHJlc3VsdHMsIHBhZ2UgfSlcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc2VuZERldkludml0ZUVtYWlsKG9wdGlvbnM6IHtcclxuICBzdXBhYmFzZVVybD86IHN0cmluZ1xyXG4gIHRvOiBzdHJpbmdcclxuICBhY2NlcHRVcmw6IHN0cmluZ1xyXG4gIHdvcmtzcGFjZU5hbWU6IHN0cmluZ1xyXG4gIGludml0ZXJOYW1lOiBzdHJpbmdcclxuICByb2xlOiBzdHJpbmdcclxufSk6IFByb21pc2U8dW5rbm93bj4ge1xyXG4gIGNvbnN0IHJlc2VuZEtleSA9IGdldEVudlZhbHVlKCdSRVNFTkRfQVBJX0tFWScpXHJcbiAgaWYgKCFyZXNlbmRLZXkpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignRW1haWwgZGVsaXZlcnkgaXMgbm90IGNvbmZpZ3VyZWQuIEFkZCBSRVNFTkRfQVBJX0tFWSB0byB5b3VyIGxvY2FsIGVudmlyb25tZW50IG9yIFZlcmNlbCBQcm9qZWN0IFNldHRpbmdzLicpXHJcbiAgfVxyXG5cclxuICBjb25zdCBmcm9tID0gZ2V0RW52VmFsdWUoJ0lOVklURV9GUk9NX0VNQUlMJywgJ1JFU0VORF9GUk9NX0VNQUlMJykgfHwgJ0luZm9ub3RlIDxvbmJvYXJkaW5nQHJlc2VuZC5kZXY+J1xyXG4gIGNvbnN0IHNhZmVXb3Jrc3BhY2UgPSBlc2NhcGVIdG1sKG9wdGlvbnMud29ya3NwYWNlTmFtZSlcclxuICBjb25zdCBzYWZlSW52aXRlciA9IGVzY2FwZUh0bWwob3B0aW9ucy5pbnZpdGVyTmFtZSlcclxuICBjb25zdCBzYWZlUm9sZSA9IGVzY2FwZUh0bWwob3B0aW9ucy5yb2xlKVxyXG4gIGNvbnN0IHNhZmVVcmwgPSBlc2NhcGVIdG1sKG9wdGlvbnMuYWNjZXB0VXJsKVxyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5yZXNlbmQuY29tL2VtYWlscycsIHtcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVzZW5kS2V5fWAsXHJcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICB9LFxyXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICBmcm9tLFxyXG4gICAgICB0bzogb3B0aW9ucy50byxcclxuICAgICAgc3ViamVjdDogYCR7b3B0aW9ucy5pbnZpdGVyTmFtZX0gaW52aXRlZCB5b3UgdG8gJHtvcHRpb25zLndvcmtzcGFjZU5hbWV9YCxcclxuICAgICAgdGV4dDpcclxuICAgICAgICBgJHtvcHRpb25zLmludml0ZXJOYW1lfSBpbnZpdGVkIHlvdSB0byBqb2luIFwiJHtvcHRpb25zLndvcmtzcGFjZU5hbWV9XCIgYXMgJHtvcHRpb25zLnJvbGV9LlxcblxcbmAgK1xyXG4gICAgICAgIGBBY2NlcHQgdGhlIGludml0YXRpb246ICR7b3B0aW9ucy5hY2NlcHRVcmx9XFxuXFxuYCArXHJcbiAgICAgICAgJ0lmIHRoaXMgd2FzIG5vdCBleHBlY3RlZCwgeW91IGNhbiBpZ25vcmUgdGhpcyBlbWFpbC4nLFxyXG4gICAgICBodG1sOiBgXHJcbiAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtZmFtaWx5OkludGVyLEFyaWFsLHNhbnMtc2VyaWY7bGluZS1oZWlnaHQ6MS41NTtjb2xvcjojMTExODI3XCI+XHJcbiAgICAgICAgICA8aDEgc3R5bGU9XCJtYXJnaW46MCAwIDEycHg7Zm9udC1zaXplOjIycHhcIj5Zb3UgaGF2ZSBiZWVuIGludml0ZWQgdG8gSW5mb25vdGU8L2gxPlxyXG4gICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MCAwIDE0cHhcIj4ke3NhZmVJbnZpdGVyfSBpbnZpdGVkIHlvdSB0byBjb2xsYWJvcmF0ZSBvbiA8c3Ryb25nPiR7c2FmZVdvcmtzcGFjZX08L3N0cm9uZz4gYXMgPHN0cm9uZz4ke3NhZmVSb2xlfTwvc3Ryb25nPi48L3A+XHJcbiAgICAgICAgICA8cCBzdHlsZT1cIm1hcmdpbjoyNHB4IDBcIj5cclxuICAgICAgICAgICAgPGEgaHJlZj1cIiR7c2FmZVVybH1cIiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWJsb2NrO2JhY2tncm91bmQ6IzI1NjNlYjtjb2xvcjojZmZmZmZmO3RleHQtZGVjb3JhdGlvbjpub25lO3BhZGRpbmc6MTJweCAxOHB4O2JvcmRlci1yYWRpdXM6OHB4O2ZvbnQtd2VpZ2h0OjcwMFwiPkFjY2VwdCBpbnZpdGF0aW9uPC9hPlxyXG4gICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MDtjb2xvcjojNmI3MjgwO2ZvbnQtc2l6ZToxM3B4XCI+SWYgdGhlIGJ1dHRvbiBkb2VzIG5vdCB3b3JrLCBvcGVuIHRoaXMgbGluazo8YnI+JHtzYWZlVXJsfTwvcD5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgYCxcclxuICAgIH0pLFxyXG4gIH0pXHJcblxyXG4gIGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KClcclxuICBjb25zdCBkYXRhOiB1bmtub3duID0gdGV4dCA/IEpTT04ucGFyc2UodGV4dCkgOiB7fVxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihzdHJpbmdWYWx1ZShkYXRhLCAnbWVzc2FnZScpIHx8IHN0cmluZ1ZhbHVlKGRhdGEsICdlcnJvcicpIHx8IHRleHQgfHwgYFJlc2VuZCBmYWlsZWQgd2l0aCBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWApXHJcbiAgfVxyXG4gIHJldHVybiBkYXRhXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHNlbmREZXZTdXBhYmFzZUludml0ZUVtYWlsKG9wdGlvbnM6IHtcclxuICBzdXBhYmFzZVVybDogc3RyaW5nXHJcbiAgdG86IHN0cmluZ1xyXG4gIGFjY2VwdFVybDogc3RyaW5nXHJcbiAgd29ya3NwYWNlTmFtZTogc3RyaW5nXHJcbiAgaW52aXRlck5hbWU6IHN0cmluZ1xyXG4gIHJvbGU6IHN0cmluZ1xyXG59KTogUHJvbWlzZTx1bmtub3duPiB7XHJcbiAgY29uc3Qgc2VydmljZVJvbGVLZXkgPSBnZXRTdXBhYmFzZVNlcnZpY2VSb2xlS2V5KClcclxuICBpZiAoIXNlcnZpY2VSb2xlS2V5KSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1N1cGFiYXNlIGVtYWlsIGZhbGxiYWNrIGlzIG5vdCBjb25maWd1cmVkLiBBZGQgU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWSBzZXJ2ZXItc2lkZSB0byBlbmFibGUgQXV0aCBpbnZpdGUgZmFsbGJhY2suJylcclxuICB9XHJcblxyXG4gIGNvbnN0IGFkbWluID0gY3JlYXRlQ2xpZW50KG9wdGlvbnMuc3VwYWJhc2VVcmwsIHNlcnZpY2VSb2xlS2V5LCB7XHJcbiAgICBhdXRoOiB7IHBlcnNpc3RTZXNzaW9uOiBmYWxzZSwgYXV0b1JlZnJlc2hUb2tlbjogZmFsc2UgfSxcclxuICB9KVxyXG5cclxuICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBhZG1pbi5hdXRoLmFkbWluLmludml0ZVVzZXJCeUVtYWlsKG9wdGlvbnMudG8sIHtcclxuICAgIHJlZGlyZWN0VG86IG9wdGlvbnMuYWNjZXB0VXJsLFxyXG4gICAgZGF0YToge1xyXG4gICAgICB3b3Jrc3BhY2VfaW52aXRlX3VybDogb3B0aW9ucy5hY2NlcHRVcmwsXHJcbiAgICAgIHdvcmtzcGFjZV9uYW1lOiBvcHRpb25zLndvcmtzcGFjZU5hbWUsXHJcbiAgICAgIGludml0ZWRfYnk6IG9wdGlvbnMuaW52aXRlck5hbWUsXHJcbiAgICAgIHdvcmtzcGFjZV9yb2xlOiBvcHRpb25zLnJvbGUsXHJcbiAgICB9LFxyXG4gIH0pXHJcblxyXG4gIGlmIChlcnJvcikgdGhyb3cgZXJyb3JcclxuICByZXR1cm4gZGF0YVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBkZWxpdmVyRGV2SW52aXRlRW1haWwob3B0aW9uczoge1xyXG4gIHN1cGFiYXNlVXJsOiBzdHJpbmdcclxuICB0bzogc3RyaW5nXHJcbiAgYWNjZXB0VXJsOiBzdHJpbmdcclxuICB3b3Jrc3BhY2VOYW1lOiBzdHJpbmdcclxuICBpbnZpdGVyTmFtZTogc3RyaW5nXHJcbiAgcm9sZTogc3RyaW5nXHJcbn0pOiBQcm9taXNlPHtcclxuICBvazogYm9vbGVhblxyXG4gIHByb3ZpZGVyOiAncmVzZW5kJyB8ICdzdXBhYmFzZS1hdXRoJyB8IG51bGxcclxuICBpZDogc3RyaW5nIHwgbnVsbFxyXG4gIGVycm9yOiBzdHJpbmcgfCBudWxsXHJcbn0+IHtcclxuICBjb25zdCBmYWlsdXJlczogc3RyaW5nW10gPSBbXVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHNlbmREZXZJbnZpdGVFbWFpbChvcHRpb25zKVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IHRydWUsXHJcbiAgICAgIHByb3ZpZGVyOiAncmVzZW5kJyxcclxuICAgICAgaWQ6IGlzUmVjb3JkKGRhdGEpID8gc3RyaW5nVmFsdWUoZGF0YSwgJ2lkJykgfHwgbnVsbCA6IG51bGwsXHJcbiAgICAgIGVycm9yOiBudWxsLFxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBmYWlsdXJlcy5wdXNoKGBSZXNlbmQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApXHJcbiAgfVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHNlbmREZXZTdXBhYmFzZUludml0ZUVtYWlsKG9wdGlvbnMpXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogdHJ1ZSxcclxuICAgICAgcHJvdmlkZXI6ICdzdXBhYmFzZS1hdXRoJyxcclxuICAgICAgaWQ6IGlzUmVjb3JkKGRhdGEpID8gc3RyaW5nVmFsdWUocmVjb3JkVmFsdWUoZGF0YSwgJ3VzZXInKSwgJ2lkJykgfHwgbnVsbCA6IG51bGwsXHJcbiAgICAgIGVycm9yOiBudWxsLFxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBmYWlsdXJlcy5wdXNoKGBTdXBhYmFzZSBBdXRoIGZhbGxiYWNrOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG9rOiBmYWxzZSxcclxuICAgIHByb3ZpZGVyOiBudWxsLFxyXG4gICAgaWQ6IG51bGwsXHJcbiAgICBlcnJvcjogZmFpbHVyZXMuam9pbignIHwgJyksXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBidWlsZERldkludml0ZUhlYWx0aCgpOiBKc29uQm9keSB7XHJcbiAgY29uc3QgaGFzUmVzZW5kQXBpS2V5ID0gQm9vbGVhbihnZXRFbnZWYWx1ZSgnUkVTRU5EX0FQSV9LRVknKSlcclxuICBjb25zdCBoYXNJbnZpdGVGcm9tRW1haWwgPSBCb29sZWFuKGdldEVudlZhbHVlKCdJTlZJVEVfRlJPTV9FTUFJTCcsICdSRVNFTkRfRlJPTV9FTUFJTCcpKVxyXG4gIGNvbnN0IGhhc1N1cGFiYXNlU2VydmljZVJvbGVGYWxsYmFjayA9IEJvb2xlYW4oZ2V0U3VwYWJhc2VTZXJ2aWNlUm9sZUtleSgpKVxyXG4gIGNvbnN0IGhhc0ludml0ZVNpdGVVcmwgPSBCb29sZWFuKGdldEVudlZhbHVlKCdJTlZJVEVfU0lURV9VUkwnLCAnVklURV9TSVRFX1VSTCcsICdTSVRFX1VSTCcpKVxyXG4gIGNvbnN0IHJlc2VuZENvbmZpZ3VyZWQgPSBoYXNSZXNlbmRBcGlLZXkgJiYgaGFzSW52aXRlRnJvbUVtYWlsXHJcbiAgY29uc3QgZW1haWxEZWxpdmVyeUNvbmZpZ3VyZWQgPSByZXNlbmRDb25maWd1cmVkIHx8IGhhc1N1cGFiYXNlU2VydmljZVJvbGVGYWxsYmFja1xyXG4gIGNvbnN0IHJlY29tbWVuZGF0aW9uczogc3RyaW5nW10gPSBbXVxyXG5cclxuICBpZiAoIWhhc1Jlc2VuZEFwaUtleSkgcmVjb21tZW5kYXRpb25zLnB1c2goJ0FkZCBSRVNFTkRfQVBJX0tFWSBpbiBWZXJjZWwgUHJvamVjdCBTZXR0aW5ncy4nKVxyXG4gIGlmICghaGFzSW52aXRlRnJvbUVtYWlsKSByZWNvbW1lbmRhdGlvbnMucHVzaCgnQWRkIElOVklURV9GUk9NX0VNQUlMIHVzaW5nIGEgdmVyaWZpZWQgUmVzZW5kIHNlbmRlci9kb21haW4uJylcclxuICBpZiAoIWhhc0ludml0ZVNpdGVVcmwpIHJlY29tbWVuZGF0aW9ucy5wdXNoKCdBZGQgSU5WSVRFX1NJVEVfVVJMPWh0dHBzOi8vY2hua2l0LmNvbSBzbyBlbWFpbCBhY2NlcHQgbGlua3MgdXNlIHRoZSBwcm9kdWN0aW9uIGRvbWFpbi4nKVxyXG4gIGlmICghaGFzU3VwYWJhc2VTZXJ2aWNlUm9sZUZhbGxiYWNrKSByZWNvbW1lbmRhdGlvbnMucHVzaCgnT3B0aW9uYWw6IGFkZCBzZXJ2ZXItb25seSBTVVBBQkFTRV9TRVJWSUNFX1JPTEVfS0VZIHRvIGVuYWJsZSBTdXBhYmFzZSBBdXRoIGVtYWlsIGZhbGxiYWNrLicpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBvazogZW1haWxEZWxpdmVyeUNvbmZpZ3VyZWQgJiYgaGFzSW52aXRlU2l0ZVVybCxcclxuICAgIHJlc2VuZENvbmZpZ3VyZWQsXHJcbiAgICBzdXBhYmFzZUF1dGhGYWxsYmFja0NvbmZpZ3VyZWQ6IGhhc1N1cGFiYXNlU2VydmljZVJvbGVGYWxsYmFjayxcclxuICAgIGludml0ZVNpdGVVcmxDb25maWd1cmVkOiBoYXNJbnZpdGVTaXRlVXJsLFxyXG4gICAgZW1haWxEZWxpdmVyeUNvbmZpZ3VyZWQsXHJcbiAgICByZWNvbW1lbmRhdGlvbnMsXHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZXZXb3Jrc3BhY2VJbnZpdGVIZWFsdGgocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBpZiAocmVxLm1ldGhvZCAhPT0gJ0dFVCcpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIGNvbnN0IHRva2VuID0gZ2V0QmVhcmVyVG9rZW4ocmVxKVxyXG4gIGlmICghdG9rZW4pIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwMSwgJ1lvdSBtdXN0IGJlIHNpZ25lZCBpbiB0byBjaGVjayBpbnZpdGUgZW1haWwgY29uZmlndXJhdGlvbi4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCBzdXBhYmFzZVVybCA9IGdldEVudlZhbHVlKCdTVVBBQkFTRV9VUkwnLCAnVklURV9TVVBBQkFTRV9VUkwnKVxyXG4gIGNvbnN0IHN1cGFiYXNlS2V5ID0gZ2V0RW52VmFsdWUoJ1NVUEFCQVNFX0FOT05fS0VZJywgJ1NVUEFCQVNFX1BVQkxJU0hBQkxFX0tFWScsICdWSVRFX1NVUEFCQVNFX0FOT05fS0VZJywgJ1ZJVEVfU1VQQUJBU0VfUFVCTElTSEFCTEVfS0VZJylcclxuICBpZiAoIXN1cGFiYXNlVXJsIHx8ICFzdXBhYmFzZUtleSkge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNTAwLCAnU3VwYWJhc2Ugc2VydmVyIGVudmlyb25tZW50IGlzIG1pc3NpbmcgU1VQQUJBU0VfVVJMIGFuZCBTVVBBQkFTRV9BTk9OX0tFWS4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCBzdXBhYmFzZSA9IGNyZWF0ZUNsaWVudChzdXBhYmFzZVVybCwgc3VwYWJhc2VLZXksIHtcclxuICAgIGdsb2JhbDogeyBoZWFkZXJzOiB7IEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0b2tlbn1gIH0gfSxcclxuICAgIGF1dGg6IHsgcGVyc2lzdFNlc3Npb246IGZhbHNlLCBhdXRvUmVmcmVzaFRva2VuOiBmYWxzZSB9LFxyXG4gIH0pXHJcblxyXG4gIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcih0b2tlbilcclxuICBpZiAoZXJyb3IgfHwgIWRhdGEudXNlcikge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNDAxLCAnWW91ciBzZXNzaW9uIGV4cGlyZWQuIFNpZ24gaW4gYWdhaW4gYmVmb3JlIGNoZWNraW5nIGludml0ZSBlbWFpbCBjb25maWd1cmF0aW9uLicpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIHNlbmRKc29uKHJlcywgMjAwLCBidWlsZERldkludml0ZUhlYWx0aCgpKVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZXZXb3Jrc3BhY2VJbnZpdGUocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDUsICdNZXRob2Qgbm90IGFsbG93ZWQnKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCB0b2tlbiA9IGdldEJlYXJlclRva2VuKHJlcSlcclxuICBpZiAoIXRva2VuKSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDEsICdZb3UgbXVzdCBiZSBzaWduZWQgaW4gdG8gaW52aXRlIGNvbGxhYm9yYXRvcnMuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgYm9keSA9IGF3YWl0IHJlYWRKc29uQm9keShyZXEpXHJcbiAgY29uc3Qgd29ya3NwYWNlSWQgPSBnZXRCb2R5U3RyaW5nKGJvZHksICd3b3Jrc3BhY2VJZCcpXHJcbiAgY29uc3QgZW1haWwgPSBnZXRCb2R5U3RyaW5nKGJvZHksICdlbWFpbCcpLnRvTG93ZXJDYXNlKClcclxuICBjb25zdCByb2xlID0gZ2V0Qm9keVN0cmluZyhib2R5LCAncm9sZScpID09PSAndmlld2VyJyA/ICd2aWV3ZXInIDogJ2VkaXRvcidcclxuXHJcbiAgaWYgKCF3b3Jrc3BhY2VJZCkge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNDAwLCAnTm8gYWN0aXZlIHdvcmtzcGFjZSBzZWxlY3RlZC4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGlmICghVVVJRF9SRS50ZXN0KHdvcmtzcGFjZUlkKSkge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNDAwLCAnSW52YWxpZCB3b3Jrc3BhY2UgaWQuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuICBpZiAoIWVtYWlsIHx8ICFpc1ZhbGlkRW1haWwoZW1haWwpKSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDAsICdFbnRlciBhIHZhbGlkIGVtYWlsIGFkZHJlc3MuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3Qgc3VwYWJhc2VVcmwgPSBnZXRFbnZWYWx1ZSgnU1VQQUJBU0VfVVJMJywgJ1ZJVEVfU1VQQUJBU0VfVVJMJylcclxuICBjb25zdCBzdXBhYmFzZUtleSA9IGdldEVudlZhbHVlKCdTVVBBQkFTRV9BTk9OX0tFWScsICdTVVBBQkFTRV9QVUJMSVNIQUJMRV9LRVknLCAnVklURV9TVVBBQkFTRV9BTk9OX0tFWScsICdWSVRFX1NVUEFCQVNFX1BVQkxJU0hBQkxFX0tFWScpXHJcbiAgaWYgKCFzdXBhYmFzZVVybCB8fCAhc3VwYWJhc2VLZXkpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDUwMCwgJ1N1cGFiYXNlIHNlcnZlciBlbnZpcm9ubWVudCBpcyBtaXNzaW5nIFNVUEFCQVNFX1VSTCBhbmQgU1VQQUJBU0VfQU5PTl9LRVkuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3Qgc3VwYWJhc2UgPSBjcmVhdGVDbGllbnQoc3VwYWJhc2VVcmwsIHN1cGFiYXNlS2V5LCB7XHJcbiAgICBnbG9iYWw6IHsgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7dG9rZW59YCB9IH0sXHJcbiAgICBhdXRoOiB7IHBlcnNpc3RTZXNzaW9uOiBmYWxzZSwgYXV0b1JlZnJlc2hUb2tlbjogZmFsc2UgfSxcclxuICB9KVxyXG5cclxuICBjb25zdCB7IGRhdGE6IHVzZXJEYXRhLCBlcnJvcjogdXNlckVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5hdXRoLmdldFVzZXIodG9rZW4pXHJcbiAgaWYgKHVzZXJFcnJvciB8fCAhdXNlckRhdGEudXNlcikge1xyXG4gICAgc2VuZEVycm9yKHJlcywgNDAxLCAnWW91ciBzZXNzaW9uIGV4cGlyZWQuIFNpZ24gaW4gYWdhaW4gYmVmb3JlIGludml0aW5nIGNvbGxhYm9yYXRvcnMuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgcmV0cnlBZnRlclNlY29uZHMgPSBjaGVja0ludml0ZVJhdGVMaW1pdChgJHt1c2VyRGF0YS51c2VyLmlkfToke3dvcmtzcGFjZUlkfWApXHJcbiAgaWYgKHJldHJ5QWZ0ZXJTZWNvbmRzKSB7XHJcbiAgICByZXMuc2V0SGVhZGVyKCdSZXRyeS1BZnRlcicsIFN0cmluZyhyZXRyeUFmdGVyU2Vjb25kcykpXHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MjksIGBUb28gbWFueSBpbnZpdGF0aW9ucy4gVHJ5IGFnYWluIGluICR7cmV0cnlBZnRlclNlY29uZHN9IHNlY29uZHMuYClcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgeyBkYXRhOiBpbnZpdGUsIGVycm9yOiBpbnZpdGVFcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UucnBjKCdjcmVhdGVfd29ya3NwYWNlX2ludml0YXRpb24nLCB7XHJcbiAgICBfd29ya3NwYWNlX2lkOiB3b3Jrc3BhY2VJZCxcclxuICAgIF9lbWFpbDogZW1haWwsXHJcbiAgICBfcm9sZTogcm9sZSxcclxuICB9KVxyXG4gIGlmIChpbnZpdGVFcnJvcikgdGhyb3cgaW52aXRlRXJyb3JcclxuICBpZiAoIWlzUmVjb3JkKGludml0ZSkgfHwgdHlwZW9mIGludml0ZS5pZCAhPT0gJ3N0cmluZycpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignSW52aXRhdGlvbiB3YXMgY3JlYXRlZCB3aXRob3V0IGEgdmFsaWQgaWQuJylcclxuICB9XHJcblxyXG4gIGNvbnN0IHsgZGF0YTogd29ya3NwYWNlIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3dvcmtzcGFjZXMnKVxyXG4gICAgLnNlbGVjdCgnbmFtZScpXHJcbiAgICAuZXEoJ2lkJywgd29ya3NwYWNlSWQpXHJcbiAgICAubWF5YmVTaW5nbGUoKVxyXG5cclxuICBjb25zdCB3b3Jrc3BhY2VOYW1lID0gaXNSZWNvcmQod29ya3NwYWNlKSAmJiB0eXBlb2Ygd29ya3NwYWNlLm5hbWUgPT09ICdzdHJpbmcnICYmIHdvcmtzcGFjZS5uYW1lLnRyaW0oKVxyXG4gICAgPyB3b3Jrc3BhY2UubmFtZS50cmltKClcclxuICAgIDogJ0luZm9ub3RlIGNhbnZhcydcclxuICBjb25zdCBpbnZpdGVyTmFtZSA9XHJcbiAgICBzdHJpbmdWYWx1ZSh1c2VyRGF0YS51c2VyLnVzZXJfbWV0YWRhdGEsICdkaXNwbGF5X25hbWUnKSB8fFxyXG4gICAgc3RyaW5nVmFsdWUodXNlckRhdGEudXNlci51c2VyX21ldGFkYXRhLCAnZnVsbF9uYW1lJykgfHxcclxuICAgIHVzZXJEYXRhLnVzZXIuZW1haWwgfHxcclxuICAgICdBbiBJbmZvbm90ZSBjb2xsYWJvcmF0b3InXHJcbiAgY29uc3QgYWNjZXB0VXJsID0gYCR7Z2V0UmVxdWVzdEJhc2VVcmwocmVxKX0vaW52aXRlLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGludml0ZS5pZCl9YFxyXG4gIGNvbnN0IGRlbGl2ZXJ5ID0gYXdhaXQgZGVsaXZlckRldkludml0ZUVtYWlsKHtcclxuICAgIHN1cGFiYXNlVXJsLFxyXG4gICAgdG86IGVtYWlsLFxyXG4gICAgYWNjZXB0VXJsLFxyXG4gICAgd29ya3NwYWNlTmFtZSxcclxuICAgIGludml0ZXJOYW1lLFxyXG4gICAgcm9sZSxcclxuICB9KVxyXG5cclxuICBzZW5kSnNvbihyZXMsIDIwMCwge1xyXG4gICAgaW52aXRhdGlvbjogaW52aXRlLFxyXG4gICAgd29ya3NwYWNlTmFtZSxcclxuICAgIGFjY2VwdFVybCxcclxuICAgIGVtYWlsRGVsaXZlcnk6IGRlbGl2ZXJ5Lm9rID8gJ3NlbnQnIDogJ2ZhaWxlZCcsXHJcbiAgICBlbWFpbFByb3ZpZGVyOiBkZWxpdmVyeS5wcm92aWRlcixcclxuICAgIGVtYWlsRXJyb3I6IGRlbGl2ZXJ5LmVycm9yLFxyXG4gICAgZW1haWxJZDogZGVsaXZlcnkuaWQsXHJcbiAgICBlbWFpbEZyb206IGdldEVudlZhbHVlKCdJTlZJVEVfRlJPTV9FTUFJTCcsICdSRVNFTkRfRlJPTV9FTUFJTCcpIHx8IG51bGwsXHJcbiAgfSlcclxufVxyXG5cclxuLy8gQnVpbGQgdGhlIGNoYXQgbWVzc2FnZXMgYXJyYXksIHByZXBlbmRpbmcgYW4gb3B0aW9uYWwgY2FsbGVyLXN1cHBsaWVkIHN5c3RlbVxyXG4vLyBwcm9tcHQuIEZyZWUtZm9ybSB0ZXh0IGNhbGxlcnMgcGFzcyBhIFwic3lzdGVtXCIgc3RyaW5nIHRvIGNvbnRyb2wgcGVyc29uYSxcclxuLy8gZm9ybWF0dGluZyBhbmQgYWRhcHRpdmUgbGVuZ3RoOyBzdHJ1Y3R1cmVkIChKU09OKSBjYWxsZXJzIG9taXQgaXQgc28gdGhlaXJcclxuLy8gc3RyaWN0IFwicmVzcG9uZCBPTkxZIHdpdGggSlNPTlwiIGluc3RydWN0aW9ucyBhcmVuJ3QgZGlsdXRlZC5cclxuZnVuY3Rpb24gYnVpbGRDaGF0TWVzc2FnZXMoYm9keTogSnNvbkJvZHksIHByb21wdDogc3RyaW5nKTogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9PiB7XHJcbiAgY29uc3Qgc3lzdGVtID0gZ2V0Qm9keVN0cmluZyhib2R5LCAnc3lzdGVtJylcclxuICBjb25zdCBtZXNzYWdlczogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9PiA9IFtdXHJcbiAgaWYgKHN5c3RlbSkgbWVzc2FnZXMucHVzaCh7IHJvbGU6ICdzeXN0ZW0nLCBjb250ZW50OiBzeXN0ZW0gfSlcclxuICBtZXNzYWdlcy5wdXNoKHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBwcm9tcHQgfSlcclxuICByZXR1cm4gbWVzc2FnZXNcclxufVxyXG5cclxuLy8gQSBnZW5lcm91cyBjZWlsaW5nIHNvIGxvbmcgYW5zd2VycyBhcmVuJ3QgdHJ1bmNhdGVkLiBBY3R1YWwgbGVuZ3RoIGlzIHN0ZWVyZWRcclxuLy8gYnkgdGhlIHN5c3RlbSBwcm9tcHQgKHNob3J0IGZvciBzaW1wbGUgYXNrcyksIG5vdCBjYXBwZWQgaGVyZS4gQ2FsbGVycyBtYXlcclxuLy8gb3ZlcnJpZGUgdmlhIFwibWF4VG9rZW5zXCIuXHJcbmZ1bmN0aW9uIGdldE1heFRva2Vucyhib2R5OiBKc29uQm9keSk6IG51bWJlciB7XHJcbiAgY29uc3QgcmF3ID0gYm9keVsnbWF4VG9rZW5zJ11cclxuICBjb25zdCB2YWx1ZSA9IHR5cGVvZiByYXcgPT09ICdudW1iZXInID8gcmF3IDogMFxyXG4gIGlmICh2YWx1ZSA+IDAgJiYgdmFsdWUgPD0gODE5MikgcmV0dXJuIE1hdGguZmxvb3IodmFsdWUpXHJcbiAgcmV0dXJuIDQwOTZcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGV2VGV4dChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpXHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgaWYgKCEoYXdhaXQgZ3VhcmREZXZBaVJvdXRlKHJlcSwgcmVzLCAndGV4dCcpKSkgcmV0dXJuXHJcblxyXG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkSnNvbkJvZHkocmVxKVxyXG4gIGNvbnN0IHByb21wdCA9IGdldEJvZHlTdHJpbmcoYm9keSwgJ3Byb21wdCcpXHJcbiAgaWYgKCFwcm9tcHQpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwMCwgJ1Byb21wdCBpcyByZXF1aXJlZC4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCBtb2RlbCA9IGdldFNlcnZlckFpTW9kZWwoJ3RleHQnKVxyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCBjYWxsR2F0ZXdheSgnL2NoYXQvY29tcGxldGlvbnMnLCB7XHJcbiAgICBtb2RlbCxcclxuICAgIG1lc3NhZ2VzOiBidWlsZENoYXRNZXNzYWdlcyhib2R5LCBwcm9tcHQpLFxyXG4gICAgdGVtcGVyYXR1cmU6IDAuNyxcclxuICAgIG1heF90b2tlbnM6IGdldE1heFRva2Vucyhib2R5KSxcclxuICB9KVxyXG5cclxuICBjb25zdCBvdXRwdXQgPSBleHRyYWN0VGV4dENvbnRlbnQoZGF0YSlcclxuXHJcbiAgaWYgKCFvdXRwdXQpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDUwMiwgJ0FJIEdhdGV3YXkgcmV0dXJuZWQgbm8gdGV4dCBjb250ZW50LicpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIHNlbmRKc29uKHJlcywgMjAwLCB7IHRleHQ6IG91dHB1dCB9KVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZXZJbWFnZShyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpXHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgaWYgKCEoYXdhaXQgZ3VhcmREZXZBaVJvdXRlKHJlcSwgcmVzLCAnaW1hZ2UnKSkpIHJldHVyblxyXG5cclxuICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEpzb25Cb2R5KHJlcSlcclxuICBjb25zdCBwcm9tcHQgPSBnZXRCb2R5U3RyaW5nKGJvZHksICdwcm9tcHQnKVxyXG4gIGlmICghcHJvbXB0KSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDAsICdQcm9tcHQgaXMgcmVxdWlyZWQuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgbW9kZWwgPSBnZXRTZXJ2ZXJBaU1vZGVsKCdpbWFnZScpXHJcbiAgbGV0IGRhdGE6IHVua25vd25cclxuICB0cnkge1xyXG4gICAgZGF0YSA9IGF3YWl0IGNhbGxHYXRld2F5KCcvaW1hZ2VzL2dlbmVyYXRpb25zJywge1xyXG4gICAgICBtb2RlbCxcclxuICAgICAgcHJvbXB0LFxyXG4gICAgICBuOiAxLFxyXG4gICAgICByZXNwb25zZV9mb3JtYXQ6ICdiNjRfanNvbicsXHJcbiAgICB9KVxyXG4gIH0gY2F0Y2gge1xyXG4gICAgZGF0YSA9IGF3YWl0IGNhbGxHYXRld2F5KCcvY2hhdC9jb21wbGV0aW9ucycsIHtcclxuICAgICAgbW9kZWwsXHJcbiAgICAgIG1lc3NhZ2VzOiBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHByb21wdCB9XSxcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBjb25zdCBpbWFnZVVybCA9IGV4dHJhY3RJbWFnZVVybChkYXRhKVxyXG4gIGlmICghaW1hZ2VVcmwpIHtcclxuICAgIHNlbmRFcnJvcihyZXMsIDUwMiwgJ0FJIEdhdGV3YXkgcmV0dXJuZWQgbm8gaW1hZ2UgZGF0YS4nKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBzZW5kSnNvbihyZXMsIDIwMCwgeyBpbWFnZVVybCB9KVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZXZTdHJlYW0ocmVxOiBJbmNvbWluZ01lc3NhZ2UsIHJlczogU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDUsICdNZXRob2Qgbm90IGFsbG93ZWQnKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGlmICghKGF3YWl0IGd1YXJkRGV2QWlSb3V0ZShyZXEsIHJlcywgJ3RleHQnKSkpIHJldHVyblxyXG5cclxuICBjb25zdCBib2R5ID0gYXdhaXQgcmVhZEpzb25Cb2R5KHJlcSlcclxuICBjb25zdCBwcm9tcHQgPSBnZXRCb2R5U3RyaW5nKGJvZHksICdwcm9tcHQnKVxyXG4gIGlmICghcHJvbXB0KSB7XHJcbiAgICBzZW5kRXJyb3IocmVzLCA0MDAsICdQcm9tcHQgaXMgcmVxdWlyZWQuJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgbW9kZWwgPSBnZXRTZXJ2ZXJBaU1vZGVsKCd0ZXh0JylcclxuICBjb25zdCBnYXRld2F5UmVzID0gYXdhaXQgZmV0Y2goYCR7QUlfR0FURVdBWV9CQVNFX1VSTH0vY2hhdC9jb21wbGV0aW9uc2AsIHtcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7Z2V0R2F0ZXdheUtleSgpfWAsXHJcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICB9LFxyXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICBtb2RlbCxcclxuICAgICAgbWVzc2FnZXM6IGJ1aWxkQ2hhdE1lc3NhZ2VzKGJvZHksIHByb21wdCksXHJcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXHJcbiAgICAgIG1heF90b2tlbnM6IGdldE1heFRva2Vucyhib2R5KSxcclxuICAgICAgc3RyZWFtOiB0cnVlLFxyXG4gICAgfSksXHJcbiAgfSlcclxuXHJcbiAgaWYgKCFnYXRld2F5UmVzLm9rIHx8ICFnYXRld2F5UmVzLmJvZHkpIHtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCBnYXRld2F5UmVzLnRleHQoKVxyXG4gICAgc2VuZEVycm9yKHJlcywgZ2F0ZXdheVJlcy5zdGF0dXMsIHRleHQgfHwgJ0FJIEdhdGV3YXkgc3RyZWFtIHJlcXVlc3QgZmFpbGVkLicpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIHJlcy53cml0ZUhlYWQoMjAwLCB7XHJcbiAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgnLFxyXG4gICAgJ0NhY2hlLUNvbnRyb2wnOiAnbm8tc3RvcmUnLFxyXG4gIH0pXHJcblxyXG4gIGNvbnN0IHJlYWRlciA9IGdhdGV3YXlSZXMuYm9keS5nZXRSZWFkZXIoKVxyXG4gIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKVxyXG4gIGxldCBidWZmZXIgPSAnJ1xyXG5cclxuICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgY29uc3QgeyB2YWx1ZSwgZG9uZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKVxyXG4gICAgaWYgKGRvbmUpIGJyZWFrXHJcblxyXG4gICAgYnVmZmVyICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KVxyXG4gICAgY29uc3QgbGluZXMgPSBidWZmZXIuc3BsaXQoJ1xcbicpXHJcbiAgICBidWZmZXIgPSBsaW5lcy5wb3AoKSB8fCAnJ1xyXG5cclxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xyXG4gICAgICBjb25zdCB0cmltbWVkID0gbGluZS50cmltKClcclxuICAgICAgaWYgKCF0cmltbWVkLnN0YXJ0c1dpdGgoJ2RhdGE6JykpIGNvbnRpbnVlXHJcbiAgICAgIGNvbnN0IHBheWxvYWQgPSB0cmltbWVkLnNsaWNlKDUpLnRyaW0oKVxyXG4gICAgICBpZiAoIXBheWxvYWQgfHwgcGF5bG9hZCA9PT0gJ1tET05FXScpIGNvbnRpbnVlXHJcblxyXG4gICAgICBjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHBheWxvYWQpXHJcbiAgICAgIGNvbnN0IHRleHQgPSBleHRyYWN0U3RyZWFtVGV4dChwYXJzZWQpXHJcbiAgICAgIGlmICh0ZXh0KSByZXMud3JpdGUodGV4dClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJlcy5lbmQoKVxyXG59XHJcblxyXG5mdW5jdGlvbiBhaUdhdGV3YXlEZXZQbHVnaW4oKTogUGx1Z2luIHtcclxuICBjb25zdCByb3V0ZXM6IFJlY29yZDxzdHJpbmcsIERldkFpSGFuZGxlcj4gPSB7XHJcbiAgICAnL2FwaS9haS90ZXh0JzogaGFuZGxlRGV2VGV4dCxcclxuICAgICcvYXBpL2FpL2ltYWdlJzogaGFuZGxlRGV2SW1hZ2UsXHJcbiAgICAnL2FwaS9haS9zdHJlYW0nOiBoYW5kbGVEZXZTdHJlYW0sXHJcbiAgICAnL2FwaS9ub3Rpb24vc2VhcmNoJzogaGFuZGxlRGV2Tm90aW9uU2VhcmNoLFxyXG4gICAgJy9hcGkvbm90aW9uL2ZldGNoJzogaGFuZGxlRGV2Tm90aW9uRmV0Y2gsXHJcbiAgICAnL2FwaS93b3Jrc3BhY2UvaW52aXRlJzogaGFuZGxlRGV2V29ya3NwYWNlSW52aXRlLFxyXG4gICAgJy9hcGkvd29ya3NwYWNlL2ludml0ZS1oZWFsdGgnOiBoYW5kbGVEZXZXb3Jrc3BhY2VJbnZpdGVIZWFsdGgsXHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgbmFtZTogJ2luZm9ub3RlLWFpLWdhdGV3YXktZGV2LWFwaScsXHJcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XHJcbiAgICAgIHNlcnZlci5taWRkbGV3YXJlcy51c2UoYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XHJcbiAgICAgICAgY29uc3QgcGF0aCA9IHJlcS51cmw/LnNwbGl0KCc/JylbMF0gfHwgJydcclxuICAgICAgICBjb25zdCBoYW5kbGVyID0gcm91dGVzW3BhdGhdXHJcbiAgICAgICAgaWYgKCFoYW5kbGVyKSB7XHJcbiAgICAgICAgICBuZXh0KClcclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IGhhbmRsZXIocmVxLCByZXMpXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIGlmICghcmVzLmhlYWRlcnNTZW50KSB7XHJcbiAgICAgICAgICAgIHNlbmRFcnJvcihyZXMsIChlcnJvciBhcyB7IHN0YXR1cz86IG51bWJlciB9KT8uc3RhdHVzIHx8IDUwMCwgZXJyb3IpXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXMuZW5kKClcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICB9LFxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xyXG4gIGxvYWRlZEVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBwbHVnaW5zOiBbcmVhY3QoKSwgYWlHYXRld2F5RGV2UGx1Z2luKCldLFxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgLy8gT3VyIGxhcmdlc3QgZGVsaWJlcmF0ZSBjaHVua3MgYXJlIHRoZSBzcGxpdCB2ZW5kb3JzIChwZGYgfjQ2MmtCKSBhbmQgdGhlXHJcbiAgICAgIC8vIGNhbnZhcyBmZWF0dXJlIGVudHJ5IChCb3R0b21NZW51IH41MDBrQik7IDcwMCBrZWVwcyB0aGUgd2FybmluZyBtZWFuaW5nZnVsXHJcbiAgICAgIC8vIHdpdGhvdXQgZmxhZ2dpbmcgdGhlc2UgaW50ZW50aW9uYWwgYnVuZGxlcy5cclxuICAgICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA3MDAsXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAgIC8vIFNwbGl0IGhlYXZ5IHRoaXJkLXBhcnR5IGxpYnMgaW50byB0aGVpciBvd24gY2FjaGVhYmxlIGNodW5rcyBzbyB0aGVcclxuICAgICAgICAgIC8vIGFwcCBlbnRyeSAvIGZlYXR1cmUgY2h1bmtzIChCb3R0b21NZW51IHB1bGxlZCB0aGUgd2hvbGUgQUkgU0RLIHN0YWNrLFxyXG4gICAgICAgICAgLy8gfjkyOGtCKSBzdGF5IGxlYW4gYW5kIHZlbmRvcnMgY2FjaGUgaW5kZXBlbmRlbnRseSBhY3Jvc3MgZGVwbG95cy5cclxuICAgICAgICAgIG1hbnVhbENodW5rcyhpZDogc3RyaW5nKSB7XHJcbiAgICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSByZXR1cm5cclxuICAgICAgICAgICAgaWYgKC9ub2RlX21vZHVsZXNcXC8oYWl8QGFpLXNka3xvcGVuYWl8QGdvb2dsZVxcL2dlbmFpfEBodWdnaW5nZmFjZSlcXC8vLnRlc3QoaWQpKSByZXR1cm4gJ3ZlbmRvci1haSdcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdwZGZqcy1kaXN0JykgfHwgaWQuaW5jbHVkZXMoJ3JlYWN0LXBkZicpKSByZXR1cm4gJ3ZlbmRvci1wZGYnXHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnQHh5ZmxvdycpKSByZXR1cm4gJ3ZlbmRvci14eWZsb3cnXHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnQHN1cGFiYXNlJykpIHJldHVybiAndmVuZG9yLXN1cGFiYXNlJ1xyXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9tb3Rpb24vJykgfHwgaWQuaW5jbHVkZXMoJ2ZyYW1lci1tb3Rpb24nKSkgcmV0dXJuICd2ZW5kb3ItbW90aW9uJ1xyXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSByZXR1cm4gJ3ZlbmRvci1pY29ucydcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAZG5kLWtpdCcpKSByZXR1cm4gJ3ZlbmRvci1kbmQnXHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnaHRtbDJjYW52YXMnKSkgcmV0dXJuICd2ZW5kb3ItaHRtbDJjYW52YXMnXHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVhY3QtZG9tJykgfHwgaWQuaW5jbHVkZXMoJy9yZWFjdC8nKSB8fCBpZC5pbmNsdWRlcygnL3NjaGVkdWxlci8nKSkgcmV0dXJuICd2ZW5kb3ItcmVhY3QnXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxyXG4gICAgICBwb3J0OiA1MTczLFxyXG4gICAgICBzdHJpY3RQb3J0OiB0cnVlLFxyXG4gICAgICB3YXRjaDoge1xyXG4gICAgICAgIC8vIGdyYXBoaWZ5LW91dCBpcyBhIGNvZGUtbmF2aWdhdGlvbiBpbmRleCByZXdyaXR0ZW4gYnkgdG9vbGluZyBob29rcztcclxuICAgICAgICAvLyB3YXRjaGluZyBpdCBtYWtlcyBldmVyeSBpbmRleCByZWZyZXNoIGZ1bGwtcmVsb2FkIHRoZSBhcHAgbWlkLXdvcmsuXHJcbiAgICAgICAgaWdub3JlZDogWycqKi9ncmFwaGlmeS1vdXQvKionXSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBwcmV2aWV3OiB7XHJcbiAgICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxyXG4gICAgICBwb3J0OiA1MTczLFxyXG4gICAgICBzdHJpY3RQb3J0OiB0cnVlLFxyXG4gICAgfSxcclxuICB9XHJcbn0pXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsU0FBUyxjQUFjLGVBQTRCO0FBRW5ELElBQU0sc0JBQXNCO0FBQzVCLElBQU0sc0JBQXNCO0FBQzVCLElBQU0seUJBQXlCO0FBQy9CLElBQU0sbUJBQW1CO0FBQ3pCLElBQU0sOEJBQThCO0FBQ3BDLElBQU0sd0JBQXdCO0FBQzlCLElBQU0sVUFBVTtBQUNoQixJQUFJLFlBQW9DLENBQUM7QUFDekMsSUFBTSxtQkFBbUIsb0JBQUksSUFBZ0Q7QUFLN0UsU0FBUyxnQkFBd0I7QUFDL0IsUUFBTSxNQUFNLFlBQVksc0JBQXNCLHlCQUF5QjtBQUN2RSxNQUFJLENBQUMsT0FBTyxJQUFJLEtBQUssTUFBTSxJQUFJO0FBQzdCLFVBQU0sSUFBSSxNQUFNLDRHQUE0RztBQUFBLEVBQzlIO0FBQ0EsU0FBTyxJQUFJLEtBQUs7QUFDbEI7QUFFQSxTQUFTLDRCQUFvQztBQUMzQyxTQUFPLFlBQVksNkJBQTZCLHNCQUFzQjtBQUN4RTtBQUVBLFNBQVMsZUFBZSxPQUF5QjtBQUMvQyxhQUFXLFFBQVEsT0FBTztBQUN4QixVQUFNLFFBQVEsUUFBUSxJQUFJLElBQUksS0FBSyxVQUFVLElBQUk7QUFDakQsUUFBSSxTQUFTLE1BQU0sS0FBSyxNQUFNLEdBQUksUUFBTyxv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
