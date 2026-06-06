const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

function getGatewayKey() {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VITE_AI_GATEWAY_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('AI Gateway is not configured. Add AI_GATEWAY_API_KEY in Vercel Project Settings.');
  }
  return key.trim();
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      sendError(res, 400, 'Prompt is required.');
      return;
    }

    const model =
      typeof body.model === 'string' && body.model.trim()
        ? body.model.trim()
        : process.env.AI_GATEWAY_TEXT_MODEL || process.env.VITE_AI_GATEWAY_TEXT_MODEL || 'openai/gpt-4o-mini';

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
    });

    if (!gatewayRes.ok || !gatewayRes.body) {
      const text = await gatewayRes.text();
      sendError(res, gatewayRes.status, text || 'AI Gateway stream request failed.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });

    const reader = gatewayRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        const parsed = JSON.parse(payload);
        const text = parsed?.choices?.[0]?.delta?.content || '';
        if (text) res.write(text);
      }
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendError(res, 500, error);
    } else {
      res.end();
    }
  }
}
