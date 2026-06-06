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

function joinRichText(richText) {
  return Array.isArray(richText)
    ? richText.map((item) => item?.plain_text || item?.text?.content || '').join('').trim()
    : '';
}

function getPageTitle(properties) {
  if (!properties || typeof properties !== 'object') return 'Untitled page';
  for (const prop of Object.values(properties)) {
    if (prop?.type === 'title') {
      return joinRichText(prop.title) || 'Untitled page';
    }
  }
  return 'Untitled page';
}

function normalizeSearchItem(item) {
  if (item?.object === 'database') {
    return {
      id: item.id,
      kind: 'database',
      title: joinRichText(item.title) || 'Untitled database',
      url: item.url || null,
      lastEditedTime: item.last_edited_time || null,
    };
  }

  if (item?.object === 'page') {
    return {
      id: item.id,
      kind: 'page',
      title: getPageTitle(item.properties),
      url: item.url || null,
      lastEditedTime: item.last_edited_time || null,
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const notionVersion = typeof body.notionVersion === 'string' ? body.notionVersion.trim() : '';

    if (!accessToken) {
      sendError(res, 401, 'Connect Notion before importing workspace content.');
      return;
    }

    const response = await fetch(`${NOTION_API}/search`, {
      method: 'POST',
      headers: buildHeaders(accessToken, notionVersion),
      body: JSON.stringify({
        page_size: 25,
        ...(query ? { query } : {}),
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
      }),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      sendError(res, response.status, data?.message || text || 'Notion search failed.');
      return;
    }

    const items = Array.isArray(data.results)
      ? data.results.map(normalizeSearchItem).filter(Boolean)
      : [];

    sendJson(res, 200, {
      items,
      hasMore: Boolean(data.has_more),
      nextCursor: data.next_cursor || null,
    });
  } catch (error) {
    sendError(res, 500, error);
  }
}
