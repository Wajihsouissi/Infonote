import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
const NOTION_API_BASE_URL = 'https://api.notion.com/v1'
const DEFAULT_NOTION_VERSION = '2022-06-28'
const MAX_EMAIL_LENGTH = 254
const INVITE_RATE_LIMIT_WINDOW_MS = 60_000
const INVITE_RATE_LIMIT_MAX = 10
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let loadedEnv: Record<string, string> = {}
const inviteRateLimits = new Map<string, { count: number; resetAt: number }>()

type JsonBody = Record<string, unknown>
type DevAiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

function getGatewayKey(): string {
  const key = getEnvValue('AI_GATEWAY_API_KEY', 'VITE_AI_GATEWAY_API_KEY')
  if (!key || key.trim() === '') {
    throw new Error('AI Gateway is not configured. Add AI_GATEWAY_API_KEY to your local environment or Vercel Project Settings.')
  }
  return key.trim()
}

function getSupabaseServiceRoleKey(): string {
  return getEnvValue('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
}

function getEnvValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name] || loadedEnv[name]
    if (value && value.trim() !== '') return stripWrappingQuotes(value.trim())
  }
  return ''
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim()
  }
  return value
}

function getBearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header)
  return match?.[1]?.trim() || ''
}

function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getRequestBaseUrl(req: IncomingMessage): string {
  const configured = getEnvValue('INVITE_SITE_URL', 'VITE_SITE_URL', 'SITE_URL')
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '')

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173'
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const cleanHost = Array.isArray(host) ? host[0] : host
  const cleanProto = Array.isArray(proto) ? proto[0] : proto
  return `${cleanProto}://${cleanHost}`.replace(/\/+$/, '')
}

function checkInviteRateLimit(key: string): number | null {
  const now = Date.now()
  const current = inviteRateLimits.get(key)
  if (!current || now > current.resetAt) {
    inviteRateLimits.set(key, { count: 1, resetAt: now + INVITE_RATE_LIMIT_WINDOW_MS })
    return null
  }

  current.count += 1
  if (current.count > INVITE_RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  }

  return null
}

// ── AI route guard (mirrors api/_lib/aiGuard.js so dev === prod behavior) ──
const AI_RATE_LIMIT_WINDOW_MS = 60_000
const AI_RATE_LIMITS: Record<'text' | 'image', number> = { text: 30, image: 10 }
const aiRateLimits = new Map<string, { count: number; resetAt: number }>()

type AiAccessResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string; retryAfter?: number }

// The model is ALWAYS chosen server-side; client "model" fields are ignored
// so the endpoint cannot be pointed at expensive models.
function getServerAiModel(kind: 'text' | 'image'): string {
  if (kind === 'image') {
    return getEnvValue('AI_GATEWAY_IMAGE_MODEL', 'VITE_AI_GATEWAY_IMAGE_MODEL') || 'bfl/flux-2-pro'
  }
  return getEnvValue('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'openai/gpt-4o-mini'
}

async function requireDevAiAccess(req: IncomingMessage, kind: 'text' | 'image'): Promise<AiAccessResult> {
  const token = getBearerToken(req)
  if (!token) {
    return { ok: false, status: 401, message: 'Sign in to use AI features.' }
  }

  const url = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const key = getEnvValue('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!url || !key) {
    return { ok: false, status: 500, message: 'Supabase environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.' }
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, status: 401, message: 'Your session expired. Sign in again to use AI features.' }
  }

  const limitKey = `${data.user.id}:${kind}`
  const now = Date.now()
  const current = aiRateLimits.get(limitKey)
  if (!current || now >= current.resetAt) {
    aiRateLimits.set(limitKey, { count: 1, resetAt: now + AI_RATE_LIMIT_WINDOW_MS })
  } else {
    current.count += 1
    if (current.count > AI_RATE_LIMITS[kind]) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      return { ok: false, status: 429, message: `Too many AI requests. Try again in ${retryAfter} seconds.`, retryAfter }
    }
  }

  return { ok: true, userId: data.user.id }
}

async function guardDevAiRoute(req: IncomingMessage, res: ServerResponse, kind: 'text' | 'image'): Promise<boolean> {
  const access = await requireDevAiAccess(req, kind)
  if (!access.ok) {
    if (access.retryAfter) res.setHeader('Retry-After', String(access.retryAfter))
    sendError(res, access.status, access.message)
    return false
  }
  return true
}

async function readJsonBody(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}

  const parsed = JSON.parse(raw)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonBody : {}
}

function getBodyString(body: JsonBody, key: string): string {
  const value = body[key]
  return typeof value === 'string' ? value.trim() : ''
}

function sendJson(res: ServerResponse, status: number, payload: JsonBody): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function sendError(res: ServerResponse, status: number, error: unknown): void {
  sendJson(res, status, {
    error: error instanceof Error ? error.message : String(error),
  })
}

function buildNotionHeaders(accessToken: string, notionVersion?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': notionVersion || DEFAULT_NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordValue(source: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

function arrayValue(source: unknown, key: string): unknown[] {
  if (!isRecord(source)) return []
  const value = source[key]
  return Array.isArray(value) ? value : []
}

function stringValue(source: unknown, key: string): string {
  if (!isRecord(source)) return ''
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function firstChoiceMessage(data: unknown): Record<string, unknown> | null {
  const choice = arrayValue(data, 'choices').find(isRecord)
  return recordValue(choice, 'message')
}

function extractTextContent(data: unknown): string {
  const content = firstChoiceMessage(data)?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => stringValue(part, 'text')).join('')
  }
  return ''
}

function extractStreamText(data: unknown): string {
  const choice = arrayValue(data, 'choices').find(isRecord)
  const delta = recordValue(choice, 'delta')
  return stringValue(delta, 'content')
}

function extractImageUrl(data: unknown): string | null {
  const image = arrayValue(data, 'data').find(isRecord)
  const base64Image = stringValue(image, 'b64_json')
  if (base64Image) return `data:image/png;base64,${base64Image}`

  const imageUrl = stringValue(image, 'url')
  if (imageUrl) return imageUrl

  const message = firstChoiceMessage(data)
  const chatImage = arrayValue(message, 'images').find(isRecord)
  const chatImageUrl = stringValue(recordValue(chatImage, 'image_url'), 'url')
  if (chatImageUrl) return chatImageUrl

  const content = message?.content
  if (Array.isArray(content)) {
    for (const item of content) {
      const nestedImageUrl = stringValue(recordValue(item, 'image_url'), 'url')
      if (nestedImageUrl) return nestedImageUrl
    }
  }

  return null
}

function joinNotionRichText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map((item) => stringValue(item, 'plain_text') || stringValue(recordValue(item, 'text'), 'content')).join('').trim()
}

function getNotionPageTitle(properties: unknown): string {
  if (!isRecord(properties)) return 'Untitled page'
  for (const prop of Object.values(properties)) {
    if (isRecord(prop) && prop.type === 'title') {
      return joinNotionRichText(prop.title) || 'Untitled page'
    }
  }
  return 'Untitled page'
}

function normalizeNotionSearchItem(item: unknown): JsonBody | null {
  if (!isRecord(item)) return null
  const id = stringValue(item, 'id')
  if (!id) return null

  if (item.object === 'database') {
    return {
      id,
      kind: 'database',
      title: joinNotionRichText(item.title) || 'Untitled database',
      url: stringValue(item, 'url') || null,
      lastEditedTime: stringValue(item, 'last_edited_time') || null,
    }
  }

  if (item.object === 'page') {
    return {
      id,
      kind: 'page',
      title: getNotionPageTitle(item.properties),
      url: stringValue(item, 'url') || null,
      lastEditedTime: stringValue(item, 'last_edited_time') || null,
    }
  }

  return null
}

async function callGateway(path: string, payload: JsonBody): Promise<unknown> {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const gatewayError = recordValue(data, 'error')
    const message = stringValue(gatewayError, 'message') || stringValue(data, 'message') || text || `AI Gateway request failed with HTTP ${response.status}`
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data
}

async function readNotionResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(stringValue(data, 'message') || text || `Notion API failed with HTTP ${response.status}`)
  }
  return data
}

async function fetchNotionBlockChildren(id: string, headers: Record<string, string>, depth = 0): Promise<unknown[]> {
  const all: unknown[] = []
  let cursor = ''

  do {
    const url =
      `${NOTION_API_BASE_URL}/blocks/${encodeURIComponent(id)}/children?page_size=100` +
      (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '')
    const data = await readNotionResponse(await fetch(url, { method: 'GET', headers }))
    for (const rawBlock of arrayValue(data, 'results')) {
      if (!isRecord(rawBlock)) {
        all.push(rawBlock)
        continue
      }

      const block: Record<string, unknown> = { ...rawBlock }
      if (block.has_children === true && typeof block.id === 'string' && depth < 8) {
        try {
          block.children = await fetchNotionBlockChildren(block.id, headers, depth + 1)
        } catch (error) {
          block.children_fetch_error = error instanceof Error ? error.message : String(error)
        }
      }
      all.push(block)
    }
    cursor = isRecord(data) && data.has_more ? stringValue(data, 'next_cursor') : ''
  } while (cursor)

  return all
}

async function fetchNotionPageBlocks(id: string, headers: Record<string, string>): Promise<unknown[]> {
  return fetchNotionBlockChildren(id, headers, 0)
}

async function queryNotionDatabaseRows(id: string, headers: Record<string, string>): Promise<unknown[]> {
  const all: unknown[] = []
  let cursor = ''

  do {
    const data = await readNotionResponse(await fetch(`${NOTION_API_BASE_URL}/databases/${encodeURIComponent(id)}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    }))
    all.push(...arrayValue(data, 'results'))
    cursor = isRecord(data) && data.has_more ? stringValue(data, 'next_cursor') : ''
  } while (cursor)

  return all
}

async function queryNotionDatabaseRowsWithBlocks(id: string, headers: Record<string, string>): Promise<unknown[]> {
  const pages = await queryNotionDatabaseRows(id, headers)
  const hydrated: unknown[] = []

  for (const page of pages) {
    if (!isRecord(page) || typeof page.id !== 'string') {
      hydrated.push(page)
      continue
    }

    try {
      hydrated.push({
        ...page,
        children: await fetchNotionBlockChildren(page.id, headers, 0),
      })
    } catch (error) {
      hydrated.push({
        ...page,
        children: [],
        children_fetch_error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return hydrated
}

async function handleDevNotionSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }

  const body = await readJsonBody(req)
  const accessToken = getBodyString(body, 'accessToken')
  if (!accessToken) {
    sendError(res, 401, 'Connect Notion before importing workspace content.')
    return
  }

  const query = getBodyString(body, 'query')
  const notionVersion = getBodyString(body, 'notionVersion')
  const data = await readNotionResponse(await fetch(`${NOTION_API_BASE_URL}/search`, {
    method: 'POST',
    headers: buildNotionHeaders(accessToken, notionVersion),
    body: JSON.stringify({
      page_size: 25,
      ...(query ? { query } : {}),
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
    }),
  }))

  sendJson(res, 200, {
    items: arrayValue(data, 'results').map(normalizeNotionSearchItem).filter(isRecord),
    hasMore: Boolean(isRecord(data) && data.has_more),
    nextCursor: stringValue(data, 'next_cursor') || null,
  })
}

async function fetchNotionPage(id: string, headers: Record<string, string>): Promise<unknown> {
  const url = `${NOTION_API_BASE_URL}/pages/${encodeURIComponent(id)}`
  return await readNotionResponse(await fetch(url, { method: 'GET', headers }))
}

async function handleDevNotionFetch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }

  const body = await readJsonBody(req)
  const accessToken = getBodyString(body, 'accessToken')
  const id = getBodyString(body, 'id')
  const kind = getBodyString(body, 'kind') === 'database' ? 'database' : 'page'
  const notionVersion = getBodyString(body, 'notionVersion')

  if (!accessToken) {
    sendError(res, 401, 'Connect Notion before importing workspace content.')
    return
  }
  if (!id) {
    sendError(res, 400, 'Missing Notion page or database id.')
    return
  }

  const headers = buildNotionHeaders(accessToken, notionVersion)
  let results: unknown[] = []
  let page: unknown = undefined

  if (kind === 'database') {
    results = await queryNotionDatabaseRowsWithBlocks(id, headers)
  } else {
    results = await fetchNotionPageBlocks(id, headers)
    try {
      page = await fetchNotionPage(id, headers)
    } catch (e) {
      console.error('[Notion] Failed to fetch page metadata:', e)
    }
  }

  sendJson(res, 200, { kind, results, page })
}

async function sendDevInviteEmail(options: {
  supabaseUrl?: string
  to: string
  acceptUrl: string
  workspaceName: string
  inviterName: string
  role: string
}): Promise<unknown> {
  const resendKey = getEnvValue('RESEND_API_KEY')
  if (!resendKey) {
    throw new Error('Email delivery is not configured. Add RESEND_API_KEY to your local environment or Vercel Project Settings.')
  }

  const from = getEnvValue('INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL') || 'Infonote <onboarding@resend.dev>'
  const safeWorkspace = escapeHtml(options.workspaceName)
  const safeInviter = escapeHtml(options.inviterName)
  const safeRole = escapeHtml(options.role)
  const safeUrl = escapeHtml(options.acceptUrl)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: `${options.inviterName} invited you to ${options.workspaceName}`,
      text:
        `${options.inviterName} invited you to join "${options.workspaceName}" as ${options.role}.\n\n` +
        `Accept the invitation: ${options.acceptUrl}\n\n` +
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
  })

  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(stringValue(data, 'message') || stringValue(data, 'error') || text || `Resend failed with HTTP ${response.status}`)
  }
  return data
}

async function sendDevSupabaseInviteEmail(options: {
  supabaseUrl: string
  to: string
  acceptUrl: string
  workspaceName: string
  inviterName: string
  role: string
}): Promise<unknown> {
  const serviceRoleKey = getSupabaseServiceRoleKey()
  if (!serviceRoleKey) {
    throw new Error('Supabase email fallback is not configured. Add SUPABASE_SERVICE_ROLE_KEY server-side to enable Auth invite fallback.')
  }

  const admin = createClient(options.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.auth.admin.inviteUserByEmail(options.to, {
    redirectTo: options.acceptUrl,
    data: {
      workspace_invite_url: options.acceptUrl,
      workspace_name: options.workspaceName,
      invited_by: options.inviterName,
      workspace_role: options.role,
    },
  })

  if (error) throw error
  return data
}

async function deliverDevInviteEmail(options: {
  supabaseUrl: string
  to: string
  acceptUrl: string
  workspaceName: string
  inviterName: string
  role: string
}): Promise<{
  ok: boolean
  provider: 'resend' | 'supabase-auth' | null
  id: string | null
  error: string | null
}> {
  const failures: string[] = []

  try {
    const data = await sendDevInviteEmail(options)
    return {
      ok: true,
      provider: 'resend',
      id: isRecord(data) ? stringValue(data, 'id') || null : null,
      error: null,
    }
  } catch (error) {
    failures.push(`Resend: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const data = await sendDevSupabaseInviteEmail(options)
    return {
      ok: true,
      provider: 'supabase-auth',
      id: isRecord(data) ? stringValue(recordValue(data, 'user'), 'id') || null : null,
      error: null,
    }
  } catch (error) {
    failures.push(`Supabase Auth fallback: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    ok: false,
    provider: null,
    id: null,
    error: failures.join(' | '),
  }
}

function buildDevInviteHealth(): JsonBody {
  const hasResendApiKey = Boolean(getEnvValue('RESEND_API_KEY'))
  const hasInviteFromEmail = Boolean(getEnvValue('INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL'))
  const hasSupabaseServiceRoleFallback = Boolean(getSupabaseServiceRoleKey())
  const hasInviteSiteUrl = Boolean(getEnvValue('INVITE_SITE_URL', 'VITE_SITE_URL', 'SITE_URL'))
  const resendConfigured = hasResendApiKey && hasInviteFromEmail
  const emailDeliveryConfigured = resendConfigured || hasSupabaseServiceRoleFallback
  const recommendations: string[] = []

  if (!hasResendApiKey) recommendations.push('Add RESEND_API_KEY in Vercel Project Settings.')
  if (!hasInviteFromEmail) recommendations.push('Add INVITE_FROM_EMAIL using a verified Resend sender/domain.')
  if (!hasInviteSiteUrl) recommendations.push('Add INVITE_SITE_URL=https://chnkit.com so email accept links use the production domain.')
  if (!hasSupabaseServiceRoleFallback) recommendations.push('Optional: add server-only SUPABASE_SERVICE_ROLE_KEY to enable Supabase Auth email fallback.')

  return {
    ok: emailDeliveryConfigured && hasInviteSiteUrl,
    resendConfigured,
    supabaseAuthFallbackConfigured: hasSupabaseServiceRoleFallback,
    inviteSiteUrlConfigured: hasInviteSiteUrl,
    emailDeliveryConfigured,
    recommendations,
  }
}

async function handleDevWorkspaceInviteHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed')
    return
  }

  const token = getBearerToken(req)
  if (!token) {
    sendError(res, 401, 'You must be signed in to check invite email configuration.')
    return
  }

  const supabaseUrl = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = getEnvValue('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!supabaseUrl || !supabaseKey) {
    sendError(res, 500, 'Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    sendError(res, 401, 'Your session expired. Sign in again before checking invite email configuration.')
    return
  }

  sendJson(res, 200, buildDevInviteHealth())
}

async function handleDevWorkspaceInvite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }

  const token = getBearerToken(req)
  if (!token) {
    sendError(res, 401, 'You must be signed in to invite collaborators.')
    return
  }

  const body = await readJsonBody(req)
  const workspaceId = getBodyString(body, 'workspaceId')
  const email = getBodyString(body, 'email').toLowerCase()
  const role = getBodyString(body, 'role') === 'viewer' ? 'viewer' : 'editor'

  if (!workspaceId) {
    sendError(res, 400, 'No active workspace selected.')
    return
  }
  if (!UUID_RE.test(workspaceId)) {
    sendError(res, 400, 'Invalid workspace id.')
    return
  }
  if (!email || !isValidEmail(email)) {
    sendError(res, 400, 'Enter a valid email address.')
    return
  }

  const supabaseUrl = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = getEnvValue('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!supabaseUrl || !supabaseKey) {
    sendError(res, 500, 'Supabase server environment is missing SUPABASE_URL and SUPABASE_ANON_KEY.')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    sendError(res, 401, 'Your session expired. Sign in again before inviting collaborators.')
    return
  }

  const retryAfterSeconds = checkInviteRateLimit(`${userData.user.id}:${workspaceId}`)
  if (retryAfterSeconds) {
    res.setHeader('Retry-After', String(retryAfterSeconds))
    sendError(res, 429, `Too many invitations. Try again in ${retryAfterSeconds} seconds.`)
    return
  }

  const { data: invite, error: inviteError } = await supabase.rpc('create_workspace_invitation', {
    _workspace_id: workspaceId,
    _email: email,
    _role: role,
  })
  if (inviteError) throw inviteError
  if (!isRecord(invite) || typeof invite.id !== 'string') {
    throw new Error('Invitation was created without a valid id.')
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle()

  const workspaceName = isRecord(workspace) && typeof workspace.name === 'string' && workspace.name.trim()
    ? workspace.name.trim()
    : 'Infonote canvas'
  const inviterName =
    stringValue(userData.user.user_metadata, 'display_name') ||
    stringValue(userData.user.user_metadata, 'full_name') ||
    userData.user.email ||
    'An Infonote collaborator'
  const acceptUrl = `${getRequestBaseUrl(req)}/invite/${encodeURIComponent(invite.id)}`
  const delivery = await deliverDevInviteEmail({
    supabaseUrl,
    to: email,
    acceptUrl,
    workspaceName,
    inviterName,
    role,
  })

  sendJson(res, 200, {
    invitation: invite,
    workspaceName,
    acceptUrl,
    emailDelivery: delivery.ok ? 'sent' : 'failed',
    emailProvider: delivery.provider,
    emailError: delivery.error,
    emailId: delivery.id,
    emailFrom: getEnvValue('INVITE_FROM_EMAIL', 'RESEND_FROM_EMAIL') || null,
  })
}

// Build the chat messages array, prepending an optional caller-supplied system
// prompt. Free-form text callers pass a "system" string to control persona,
// formatting and adaptive length; structured (JSON) callers omit it so their
// strict "respond ONLY with JSON" instructions aren't diluted.
function buildChatMessages(body: JsonBody, prompt: string): Array<{ role: string; content: string }> {
  const system = getBodyString(body, 'system')
  const messages: Array<{ role: string; content: string }> = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })
  return messages
}

// A generous ceiling so long answers aren't truncated. Actual length is steered
// by the system prompt (short for simple asks), not capped here. Callers may
// override via "maxTokens".
function getMaxTokens(body: JsonBody): number {
  const raw = body['maxTokens']
  const value = typeof raw === 'number' ? raw : 0
  if (value > 0 && value <= 8192) return Math.floor(value)
  return 4096
}

async function handleDevText(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }
  if (!(await guardDevAiRoute(req, res, 'text'))) return

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getServerAiModel('text')
  const data = await callGateway('/chat/completions', {
    model,
    messages: buildChatMessages(body, prompt),
    temperature: 0.7,
    max_tokens: getMaxTokens(body),
  })

  const output = extractTextContent(data)

  if (!output) {
    sendError(res, 502, 'AI Gateway returned no text content.')
    return
  }

  sendJson(res, 200, { text: output })
}

async function handleDevImage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }
  if (!(await guardDevAiRoute(req, res, 'image'))) return

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getServerAiModel('image')
  let data: unknown
  try {
    data = await callGateway('/images/generations', {
      model,
      prompt,
      n: 1,
      response_format: 'b64_json',
    })
  } catch {
    data = await callGateway('/chat/completions', {
      model,
      messages: [{ role: 'user', content: prompt }],
    })
  }

  const imageUrl = extractImageUrl(data)
  if (!imageUrl) {
    sendError(res, 502, 'AI Gateway returned no image data.')
    return
  }

  sendJson(res, 200, { imageUrl })
}

async function handleDevStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }
  if (!(await guardDevAiRoute(req, res, 'text'))) return

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getServerAiModel('text')
  const gatewayRes = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: buildChatMessages(body, prompt),
      temperature: 0.7,
      max_tokens: getMaxTokens(body),
      stream: true,
    }),
  })

  if (!gatewayRes.ok || !gatewayRes.body) {
    const text = await gatewayRes.text()
    sendError(res, gatewayRes.status, text || 'AI Gateway stream request failed.')
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  const reader = gatewayRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      const parsed: unknown = JSON.parse(payload)
      const text = extractStreamText(parsed)
      if (text) res.write(text)
    }
  }

  res.end()
}

function aiGatewayDevPlugin(): Plugin {
  const routes: Record<string, DevAiHandler> = {
    '/api/ai/text': handleDevText,
    '/api/ai/image': handleDevImage,
    '/api/ai/stream': handleDevStream,
    '/api/notion/search': handleDevNotionSearch,
    '/api/notion/fetch': handleDevNotionFetch,
    '/api/workspace/invite': handleDevWorkspaceInvite,
    '/api/workspace/invite-health': handleDevWorkspaceInviteHealth,
  }

  return {
    name: 'infonote-ai-gateway-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] || ''
        const handler = routes[path]
        if (!handler) {
          next()
          return
        }

        try {
          await handler(req, res)
        } catch (error) {
          if (!res.headersSent) {
            sendError(res, (error as { status?: number })?.status || 500, error)
          } else {
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  loadedEnv = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), aiGatewayDevPlugin()],
    // Strip debug logging from production bundles. The tree carries ~110
    // console.log calls used while developing; without this they ship, and a
    // per-node/per-drop log on a busy canvas is both noise in a user's console
    // and real serialization cost. console.error/warn are kept — the error
    // boundary and telemetry paths use them deliberately.
    esbuild: {
      drop: mode === 'production' ? ['debugger'] : [],
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.trace'] : [],
    },
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
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (/node_modules\/(ai|@ai-sdk|openai|@google\/genai|@huggingface)\//.test(id)) return 'vendor-ai'
            if (id.includes('pdfjs-dist') || id.includes('react-pdf')) return 'vendor-pdf'
            if (id.includes('@xyflow')) return 'vendor-xyflow'
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('/motion/') || id.includes('framer-motion')) return 'vendor-motion'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('@dnd-kit')) return 'vendor-dnd'
            if (id.includes('html2canvas')) return 'vendor-html2canvas'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react'
          },
        },
      },
    },
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      watch: {
        // graphify-out is a code-navigation index rewritten by tooling hooks;
        // watching it makes every index refresh full-reload the app mid-work.
        ignored: ['**/graphify-out/**'],
      },
    },
    preview: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
  }
})
