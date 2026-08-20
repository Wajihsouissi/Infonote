/**
 * Gemini grounded answers — web search via Google's `google_search` tool.
 *
 * This does NOT go through the OpenAI-compatibility layer the rest of the AI
 * routes use. Grounding is a native Gemini feature: the tool is declared as
 * `tools: [{ google_search: {} }]` on `:generateContent`, and the citations come
 * back on `candidates[].groundingMetadata`, which the compat layer does not
 * surface. So this speaks the native API directly, with the same key.
 *
 * Consequence worth knowing: the model performs the search and answers in one
 * call. There is no list of results to hand back — grounding returns prose plus
 * the sources it used. Image and video search is not available through it.
 *
 * REQUIRES BILLING. On a free-tier key every grounded call returns
 * 429 RESOURCE_EXHAUSTED while plain calls on the same key and model succeed —
 * verified across three consecutive paired trials on 2026-08-19. `isQuotaError`
 * exists to turn that into an explanation rather than a bare 429.
 */

const NATIVE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function getGeminiKey() {
  const raw = process.env.AI_GATEWAY_API_KEY || process.env.GEMINI_API_KEY || '';
  const key = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!key) {
    throw new Error('AI is not configured. Add AI_GATEWAY_API_KEY to your environment or Vercel Project Settings.');
  }
  return key;
}

export function getGroundingModel() {
  const raw = process.env.AI_GROUNDING_MODEL || process.env.AI_GATEWAY_TEXT_MODEL || '';
  const model = String(raw).trim().replace(/^["']|["']$/g, '');
  return model || 'gemini-3.7-flash';
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Sources the answer actually leaned on.
 *
 * `groundingChunks` is the list of pages; `groundingSupports` maps spans of the
 * answer onto indices in that list. Only the chunks a support references are
 * returned, so a page the model retrieved but never used is not presented to
 * the reader as a citation.
 */
function extractCitations(metadata) {
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];

  const used = new Set();
  for (const support of supports) {
    for (const index of support?.groundingChunkIndices ?? []) used.add(index);
  }

  return chunks
    .map((chunk, index) => ({ index, web: chunk?.web }))
    // No supports at all means the mapping is absent, not that nothing was
    // used — fall back to listing every retrieved page rather than none.
    .filter(({ index }) => used.size === 0 || used.has(index))
    .map(({ web }) => ({
      title: text(web?.title) || hostOf(text(web?.uri)),
      url: text(web?.uri),
      source: hostOf(text(web?.uri)) || text(web?.title),
    }))
    .filter((c) => c.url);
}

/** The searches Gemini decided to run — useful for showing what it looked up. */
function extractQueries(metadata) {
  const queries = metadata?.webSearchQueries;
  return Array.isArray(queries) ? queries.map(text).filter(Boolean) : [];
}

export function isQuotaError(status, body) {
  if (status !== 429) return false;
  return /RESOURCE_EXHAUSTED|quota/i.test(String(body ?? ''));
}

/**
 * Ask Gemini a question with web search enabled.
 * Returns the grounded answer plus the sources and the queries it ran.
 */
export async function groundedAnswer(prompt, { model, system, maxTokens } = {}) {
  const trimmed = text(prompt);
  if (!trimmed) throw new Error('A question is required.');

  const chosen = model || getGroundingModel();
  const payload = {
    contents: [{ role: 'user', parts: [{ text: trimmed }] }],
    tools: [{ google_search: {} }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
  };

  const response = await fetch(
    `${NATIVE_BASE_URL}/models/${encodeURIComponent(chosen)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getGeminiKey() },
      body: JSON.stringify(payload),
    }
  );

  const body = await response.text();

  if (!response.ok) {
    if (isQuotaError(response.status, body)) {
      /* The single most likely failure, and it is pure configuration. A bare
         "429" sends people hunting for a bug that isn't there. */
      throw new Error(
        'Web search needs billing enabled on your Google AI Studio key. Grounded requests return a quota error on the free tier, even though ordinary AI requests work. Enable billing at aistudio.google.com, then try again.'
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Web search rejected the API key. Check AI_GATEWAY_API_KEY.');
    }
    if (response.status === 404) {
      throw new Error(`Model "${chosen}" is not available for grounding. Set AI_GROUNDING_MODEL to one that is.`);
    }
    if (response.status === 503) {
      throw new Error('The model is busy right now. Try again in a moment.');
    }
    throw new Error(`Web search failed (HTTP ${response.status}).`);
  }

  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    throw new Error('Web search returned a malformed response.');
  }

  const candidate = data?.candidates?.[0];
  const answer = (candidate?.content?.parts ?? [])
    .map((part) => text(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!answer) {
    // A safety block or an empty candidate reads identically here; say so
    // rather than returning a blank bubble.
    throw new Error('Web search returned no answer. Try rephrasing the question.');
  }

  const metadata = candidate?.groundingMetadata;
  return {
    text: answer,
    citations: extractCitations(metadata),
    queries: extractQueries(metadata),
  };
}
