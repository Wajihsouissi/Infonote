import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
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
