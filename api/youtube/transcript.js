import { requireAiAccess } from '../_lib/aiGuard.js';

const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1';
const TIMEOUT_MS = 30_000;

function getApiKey() {
  const value = process.env.SUPADATA_API_KEY;
  return typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '';
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function safeProviderError(status, data) {
  if (status === 404) return 'No transcript was found for this video.';
  if (status === 429) return 'The transcript provider is busy. Please try again shortly.';
  if (status === 408 || status >= 500) return 'The transcript provider is temporarily unavailable.';
  const message = typeof data?.error === 'string' ? data.error : data?.error?.message;
  return typeof message === 'string' && message.length < 180 ? message : 'The transcript could not be retrieved.';
}

export function canonicalYouTubeUrl(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    let videoId = '';
    if (host === 'youtu.be') videoId = parts[0] || '';
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      videoId = url.pathname === '/watch' ? (url.searchParams.get('v') || '') : (['embed', 'shorts', 'live'].includes(parts[0]) ? (parts[1] || '') : '');
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : '';
  } catch {
    return '';
  }
}

export function normalizeProviderResponse(data, responseStatus) {
  const jobId = typeof data?.jobId === 'string' ? data.jobId : typeof data?.job_id === 'string' ? data.job_id : '';
  const providerStatus = String(data?.status || '').toLowerCase();
  if (responseStatus === 202 || ['queued', 'active', 'processing'].includes(providerStatus)) {
    return { status: 'queued', jobId };
  }
  if (providerStatus === 'failed') return { status: 'failed', error: 'Transcript generation failed.' };
  const segments = Array.isArray(data?.content) ? data.content : Array.isArray(data?.segments) ? data.segments : [];
  return {
    status: 'ready',
    segments,
    language: typeof data?.lang === 'string' ? data.lang : typeof data?.language === 'string' ? data.language : undefined,
    availableLanguages: Array.isArray(data?.availableLangs) ? data.availableLangs : undefined,
  };
}

async function providerFetch(path) {
  const response = await fetch(`${SUPADATA_BASE_URL}${path}`, {
    headers: { 'x-api-key': getApiKey(), Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok && response.status !== 202) {
    const error = new Error(safeProviderError(response.status, data));
    error.status = response.status === 429 ? 429 : 502;
    error.providerStatus = response.status;
    throw error;
  }
  return normalizeProviderResponse(data, response.status);
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const startedAt = Date.now();
  try {
    const access = await requireAiAccess(req, 'transcript');
    if (!access.ok) {
      if (access.retryAfter) res.setHeader('Retry-After', String(access.retryAfter));
      return sendJson(res, access.status, { error: access.message });
    }
    if (!getApiKey()) return sendJson(res, 503, { error: 'Automatic transcripts are not configured.' });

    if (req.method === 'GET') {
      const requestUrl = new URL(req.url || '', 'http://localhost');
      const jobId = requestUrl.searchParams.get('jobId')?.trim();
      if (!jobId || !/^[A-Za-z0-9_-]{4,160}$/.test(jobId)) return sendJson(res, 400, { error: 'A valid jobId is required.' });
      const result = await providerFetch(`/transcript/${encodeURIComponent(jobId)}`);
      console.info('[youtube-transcript]', { action: 'poll', status: result.status, latencyMs: Date.now() - startedAt });
      return sendJson(res, 200, result);
    }

    const body = await readJsonBody(req);
    const url = canonicalYouTubeUrl(typeof body.url === 'string' ? body.url.trim() : '');
    if (!url) return sendJson(res, 400, { error: 'A valid YouTube URL is required.' });
    const query = new URLSearchParams({ url, text: 'false', mode: 'auto' });
    if (typeof body.language === 'string' && /^[A-Za-z-]{2,12}$/.test(body.language)) query.set('lang', body.language);
    let result;
    try {
      result = await providerFetch(`/transcript?${query.toString()}`);
    } catch (error) {
      // A requested translation/caption language may not exist even while a
      // native transcript does. Retry once without lang before surfacing it.
      if (query.has('lang') && [400, 404, 422].includes(error?.providerStatus)) {
        query.delete('lang');
        result = await providerFetch(`/transcript?${query.toString()}`);
      } else throw error;
    }
    console.info('[youtube-transcript]', { action: 'fetch', status: result.status, latencyMs: Date.now() - startedAt });
    return sendJson(res, result.status === 'queued' ? 202 : 200, result);
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError';
    console.info('[youtube-transcript]', {
      action: req.method === 'GET' ? 'poll' : 'fetch',
      status: 'failed',
      category: timedOut ? 'timeout' : error?.status === 429 ? 'rate-limit' : 'provider',
      latencyMs: Date.now() - startedAt,
    });
    return sendJson(res, timedOut ? 504 : (error?.status || 500), {
      error: timedOut ? 'The transcript provider timed out. Your saved study work is unchanged.' : safeProviderError(error?.status || 500, { error: error?.message }),
    });
  }
}
