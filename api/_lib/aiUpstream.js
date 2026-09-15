// The one upstream call behind /api/ai/text and /api/ai/stream.
//
// Shared by the deployed routes AND their dev twins in vite.config.ts (which
// import this file rather than copying it), so the three behaviours below cannot
// drift between localhost and production. Pure apart from `fetch`: every input
// arrives as a parameter, which is what lets `scripts/check-ai-upstream.mts`
// exercise it without a network.
//
// Measured against the live Gemini endpoint on 2026-09-13 (ai-Plan.md
// "Speed and reliability pass"):
//
// 1. THINKING. Gemini's flash models reason by default, and those tokens come
//    out of the same `max_tokens` the answer uses. A 1560-token plan on
//    gemini-3.6-flash spent 1493 tokens thinking, returned 62 tokens of broken
//    JSON with finish_reason=length, and took 10s. The same call with thinking
//    off took ~2.5s and returned a complete plan. So thinking is OFF unless the
//    caller asks for it, and whenever it may happen the ceiling gets headroom.
//
// 2. PER-MODEL LEVELS. There is no one value every model accepts: 3.7/3.8-flash
//    reject "minimal", 3.6-flash and 3.5-flash-lite reject "none". A wrong
//    guess is an HTTP 400, i.e. a failed turn. So each model has an ordered list
//    of levels; a rejection walks to the next one and the level that worked is
//    remembered for the life of the process.
//
// 3. AVAILABILITY. gemini-3.7-flash answered "high demand" 503s and per-minute
//    429s several times in one short benchmark. The client used to retry the
//    SAME model 500ms later, which usually fails the same way. A retryable
//    failure now moves to the next allow-listed model, inside one deadline.

/** Statuses worth trying another model for. Auth and bad requests are not. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Primary plus at most two fallbacks: bounded latency, bounded spend. */
const MAX_MODELS_PER_REQUEST = 3;

/** Below this much remaining deadline, another attempt cannot finish anyway. */
const MIN_ATTEMPT_MS = 4_000;

/**
 * Extra output ceiling granted whenever the model may think.
 *
 * With thinking at "none"/"minimal" no reasoning tokens were observed in any
 * benchmark, so no headroom is spent there. At "low" (or the provider default)
 * reasoning ran up to ~700 tokens; without headroom that comes straight out of
 * the answer, which is exactly the truncation this module exists to prevent.
 */
export const THINKING_HEADROOM_TOKENS = 1024;

/**
 * The cheapest level each known model accepts. Seeds the walk so the common
 * case never spends a rejected request; unknown models still work by walking.
 */
const OFF_LEVEL_BY_MODEL = {
  'gemini-3.8-flash': 'none',
  'gemini-3.7-flash': 'none',
  'gemini-3.6-flash': 'minimal',
  'gemini-3.5-flash': 'none',
  'gemini-3.5-flash-lite': 'minimal',
};

/**
 * Preferred fallback order when AI_GATEWAY_FALLBACK_MODELS is unset.
 * Ordered by measured speed with thinking off, not by version number:
 * flash-lite answered every shape in ~2-2.5s; 3.6-flash and 3.5-flash were
 * 2-4x slower on the same prompts.
 */
export const DEFAULT_FALLBACK_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

/** Levels that worked, per `${model}|${thinking}`. Process-lifetime cache. */
const learnedLevels = new Map();

/** Test hook: forget what the walk has learned. */
export function resetLearnedReasoningLevels() {
  learnedLevels.clear();
}

/**
 * Normalise the client's thinking hint. Anything unrecognised is "off" — the
 * fast, truncation-safe choice — so a stale or forged value cannot opt a
 * request into slower, costlier reasoning by accident.
 */
export function normalizeThinking(value) {
  return value === 'light' || value === 'deep' ? value : 'off';
}

/**
 * Sampling temperature: a client value in [0, 1], else the historical 0.7.
 * The planner asks for a lower value because its output is parsed as JSON.
 */
export function normalizeTemperature(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
}

/**
 * `reasoning_effort` values to try for this model, most preferred first.
 * `null` means "omit the parameter" — the last resort for a gateway or model
 * that rejects it outright, so the request still succeeds on provider defaults.
 */
export function reasoningLevels(model, thinking) {
  /* `deep` is the router's "reason" strategy: a real reasoning budget for
     maths, debugging and trade-off decisions. `low` barely reasons on the
     flash models (0-70 thinking tokens measured), so deep asks for `medium`. */
  const base = thinking === 'deep'
    ? ['medium', 'low', null]
    : thinking === 'light'
      ? ['low', null]
      : [OFF_LEVEL_BY_MODEL[model], 'none', 'minimal', 'low', null];

  const learned = learnedLevels.get(`${model}|${thinking}`);
  const ordered = learned !== undefined ? [learned, ...base] : base;

  const seen = new Set();
  return ordered.filter((level) => {
    if (level === undefined || seen.has(level)) return false;
    seen.add(level);
    return true;
  });
}

/** Does a 400 mean "that thinking level", rather than a genuinely bad request? */
export function isReasoningRejection(status, errorText) {
  if (status !== 400) return false;
  // Gemini names the level for 3.7/3.8-flash but says only "invalid argument"
  // for 3.6-flash and flash-lite. The walk is bounded, so the generic message
  // costs at most a few fast 400s on a request that was doomed anyway.
  return /thinking|reasoning|invalid argument/i.test(String(errorText || ''));
}

/**
 * The models to try, in order: the requested one, then configured fallbacks
 * that are on the allow-list. The allow-list still decides — a fallback can
 * never reach a model the deployment did not approve.
 */
export function modelChain(primary, allowlist, configuredFallbacks) {
  const allowed = new Set(allowlist);
  const preferred = configuredFallbacks && configuredFallbacks.length > 0
    ? configuredFallbacks
    : DEFAULT_FALLBACK_MODELS;

  const chain = [primary];
  for (const model of preferred) {
    if (chain.length >= MAX_MODELS_PER_REQUEST) break;
    if (model && allowed.has(model) && !chain.includes(model)) chain.push(model);
  }
  return chain;
}

/**
 * Headroom for a deliberate reasoning pass (`medium`/`high`). A real reasoning
 * budget runs to thousands of tokens, and all of them come out of `max_tokens`
 * before a word of the answer does.
 */
export const DEEP_THINKING_HEADROOM_TOKENS = 4096;

/** The max_tokens actually sent for a given level. */
export function ceilingFor(maxTokens, level) {
  if (level === 'none' || level === 'minimal') return maxTokens;
  if (level === 'medium' || level === 'high') return maxTokens + DEEP_THINKING_HEADROOM_TOKENS;
  return maxTokens + THINKING_HEADROOM_TOKENS;
}

function errorMessageFrom(errorText, status) {
  try {
    const data = JSON.parse(errorText);
    const node = Array.isArray(data) ? data[0] : data;
    const message = node?.error?.message || node?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return String(errorText || '').trim() || `AI Gateway request failed with HTTP ${status}`;
}

/**
 * POST /chat/completions with thinking control, level negotiation and model
 * fallback. Returns either `{ ok: true, response, model, reasoning }` with an
 * unread 2xx Response (so streaming callers can pipe it), or
 * `{ ok: false, status, message, model }` describing the last failure.
 *
 * `payload` is everything except `model`, `max_tokens` and `reasoning_effort`,
 * which this function owns.
 */
export async function postChatCompletion({
  baseUrl,
  apiKey,
  models,
  payload,
  maxTokens,
  thinking = 'off',
  timeoutMs = 40_000,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs;
  let last = { ok: false, status: 504, message: 'The AI took too long to respond. Please try again.', model: models[0] };
  let attempted = false;

  for (const model of models) {
    for (const level of reasoningLevels(model, thinking)) {
      // The first attempt always runs; later ones only when they can finish.
      const remaining = deadline - now();
      if (attempted && remaining < MIN_ATTEMPT_MS) return last;
      attempted = true;

      /* The deadline bounds REACHING an answer — and reading it, until the
         caller calls `release()`. It used to be `AbortSignal.timeout`, which
         also covers the response body, so a stream still flowing at the 40s
         mark was aborted mid-sentence: a Smart answer from gemini-3.6-flash
         streams at ~146 tokens/s and needs ~57s. Streaming callers now release
         as soon as headers arrive and police stalls themselves. */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, remaining));
      const release = () => clearTimeout(timer);

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...payload,
            model,
            max_tokens: ceilingFor(maxTokens, level),
            ...(level ? { reasoning_effort: level } : {}),
          }),
          signal: controller.signal,
        });
      } catch (error) {
        release();
        const timedOut = controller.signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError';
        last = {
          ok: false,
          status: timedOut ? 504 : 502,
          message: timedOut ? 'The AI took too long to respond. Please try again.' : String(error?.message || error),
          model,
        };
        break; // network trouble is about this model's endpoint, not its level
      }

      if (response.ok) {
        learnedLevels.set(`${model}|${thinking}`, level);
        return {
          ok: true,
          response,
          model,
          reasoning: level,
          /** Stop the deadline — call once the answer has started (streams) or been read. */
          release,
          /** Cancel the in-flight answer, e.g. when a stream stalls. */
          abort: () => {
            release();
            controller.abort();
          },
        };
      }

      const errorText = await response.text().catch(() => '');
      release();
      last = { ok: false, status: response.status, message: errorMessageFrom(errorText, response.status), model };

      if (level !== null && isReasoningRejection(response.status, errorText)) continue;
      break;
    }

    if (!RETRYABLE_STATUSES.has(last.status)) return last;
  }

  return last;
}
