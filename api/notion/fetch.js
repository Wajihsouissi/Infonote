const NOTION_API = 'https://api.notion.com/v1';
const DEFAULT_NOTION_VERSION = '2022-06-28';

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

function buildHeaders(accessToken, notionVersion) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': notionVersion || DEFAULT_NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function readNotionJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || text || `Notion API failed with HTTP ${response.status}`);
  }
  return data;
}

async function fetchBlockChildren(id, headers, depth = 0) {
  const all = [];
  let cursor = null;

  do {
    const url =
      `${NOTION_API}/blocks/${encodeURIComponent(id)}/children?page_size=100` +
      (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '');
    const response = await fetch(url, { method: 'GET', headers });
    const data = await readNotionJson(response);
    if (Array.isArray(data.results)) {
      for (const block of data.results) {
        if (block?.has_children && block?.id && depth < 8) {
          try {
            block.children = await fetchBlockChildren(block.id, headers, depth + 1);
          } catch (error) {
            block.children_fetch_error = error instanceof Error ? error.message : String(error);
          }
        }
        all.push(block);
      }
    }
    cursor = data.has_more && data.next_cursor ? data.next_cursor : null;
  } while (cursor);

  return all;
}

async function fetchPageBlocks(id, headers) {
  return fetchBlockChildren(id, headers, 0);
}

async function queryDatabase(id, headers) {
  const all = [];
  let cursor = null;

  do {
    const response = await fetch(`${NOTION_API}/databases/${encodeURIComponent(id)}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    const data = await readNotionJson(response);
    if (Array.isArray(data.results)) all.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : null;
  } while (cursor);

  return all;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const kind = body.kind === 'database' ? 'database' : 'page';
    const notionVersion = typeof body.notionVersion === 'string' ? body.notionVersion.trim() : '';

    if (!accessToken) {
      sendError(res, 401, 'Connect Notion before importing workspace content.');
      return;
    }
    if (!id) {
      sendError(res, 400, 'Missing Notion page or database id.');
      return;
    }

    const headers = buildHeaders(accessToken, notionVersion);
    const results = kind === 'database'
      ? await queryDatabase(id, headers)
      : await fetchPageBlocks(id, headers);

    sendJson(res, 200, { kind, results });
  } catch (error) {
    sendError(res, 500, error);
  }
}
