import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
const NOTION_API_BASE_URL = 'https://api.notion.com/v1'
const DEFAULT_NOTION_VERSION = '2022-06-28'
let loadedEnv: Record<string, string> = {}

type JsonBody = Record<string, unknown>
type DevAiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

function getGatewayKey(): string {
  const key = getEnvValue('AI_GATEWAY_API_KEY', 'VITE_AI_GATEWAY_API_KEY')
  if (!key || key.trim() === '') {
    throw new Error('AI Gateway is not configured. Add AI_GATEWAY_API_KEY to your local environment or Vercel Project Settings.')
  }
  return key.trim()
}

function getEnvValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name] || loadedEnv[name]
    if (value && value.trim() !== '') return value.trim()
  }
  return ''
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
  const results = kind === 'database'
    ? await queryNotionDatabaseRows(id, headers)
    : await fetchNotionPageBlocks(id, headers)

  sendJson(res, 200, { kind, results })
}

async function handleDevText(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed')
    return
  }

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getBodyString(body, 'model') || getEnvValue('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'openai/gpt-4o-mini'
  const data = await callGateway('/chat/completions', {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
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

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getBodyString(body, 'model') || getEnvValue('AI_GATEWAY_IMAGE_MODEL', 'VITE_AI_GATEWAY_IMAGE_MODEL') || 'bfl/flux-2-pro'
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

  const body = await readJsonBody(req)
  const prompt = getBodyString(body, 'prompt')
  if (!prompt) {
    sendError(res, 400, 'Prompt is required.')
    return
  }

  const model = getBodyString(body, 'model') || getEnvValue('AI_GATEWAY_TEXT_MODEL', 'VITE_AI_GATEWAY_TEXT_MODEL') || 'openai/gpt-4o-mini'
  const gatewayRes = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
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
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
  }
})
