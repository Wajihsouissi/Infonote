/**
 * Fast, network-free check of the shared AI upstream call.
 *
 * Run: npm run check:ai-upstream
 *
 * api/_lib/aiUpstream.js decides three things every AI request depends on, and
 * each one was measured to matter against the live Gemini endpoint:
 *
 * 1. Thinking is off unless asked for, at a level the model actually accepts.
 *    A wrong level is an HTTP 400, i.e. a failed turn.
 * 2. A rejected level walks to the next one, and the winner is remembered.
 * 3. An overloaded or rate-limited model falls back to another allow-listed
 *    model — but auth failures and genuinely bad requests do not, and the
 *    whole walk stays inside one deadline.
 *
 * A fake `fetch` stands in for the gateway, so this runs anywhere in ~100ms.
 */
import {
    ceilingFor,
    modelChain,
    normalizeTemperature,
    normalizeThinking,
    postChatCompletion,
    reasoningLevels,
    resetLearnedReasoningLevels,
    THINKING_HEADROOM_TOKENS,
} from '../api/_lib/aiUpstream.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a === b) {
        console.log(`  ok  ${label}`);
        return;
    }
    failures += 1;
    console.error(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`);
}

type Sent = { model: string; max_tokens: number; reasoning_effort?: string; stream?: boolean; temperature?: number };

/** A gateway whose answer depends on what was sent. Records every request. */
function fakeGateway(answer: (sent: Sent) => { status: number; body?: string } | Error) {
    const sent: Sent[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
        const payload = JSON.parse(init.body) as Sent;
        sent.push(payload);
        const outcome = answer(payload);
        if (outcome instanceof Error) throw outcome;
        return new Response(outcome.body ?? '{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}', {
            status: outcome.status,
        });
    }) as unknown as typeof fetch;
    return { sent, fetchImpl };
}

const ALLOW = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const base = { baseUrl: 'https://gateway.test', apiKey: 'test', payload: { messages: [] }, maxTokens: 1000 };

console.log('hints');
check('unknown thinking hint is off', normalizeThinking('turbo'), 'off');
check('light is honoured', normalizeThinking('light'), 'light');
check('temperature outside [0,1] falls back', normalizeTemperature(3), 0.7);
check('planner temperature is honoured', normalizeTemperature(0.3), 0.3);

console.log('levels');
check('3.7-flash starts at none', reasoningLevels('gemini-3.7-flash', 'off')[0], 'none');
check('3.6-flash starts at minimal (it rejects none)', reasoningLevels('gemini-3.6-flash', 'off')[0], 'minimal');
check('flash-lite starts at minimal (it rejects none)', reasoningLevels('gemini-3.5-flash-lite', 'off')[0], 'minimal');
check('unknown model walks every level, then omits', reasoningLevels('some-model', 'off'), ['none', 'minimal', 'low', null]);
check('light asks for low, then provider default', reasoningLevels('gemini-3.7-flash', 'light'), ['low', null]);
check('deep is honoured as a hint', normalizeThinking('deep'), 'deep');
check('deep asks for medium, then low, then provider default', reasoningLevels('gemini-3.7-flash', 'deep'), ['medium', 'low', null]);
check('no headroom when thinking is off', ceilingFor(1000, 'none'), 1000);
check('headroom when the model may think', ceilingFor(1000, 'low'), 1000 + THINKING_HEADROOM_TOKENS);
check('headroom when the parameter is omitted', ceilingFor(1000, null), 1000 + THINKING_HEADROOM_TOKENS);
check('a deliberate reasoning pass gets more headroom than light thinking', ceilingFor(1000, 'medium') > ceilingFor(1000, 'low'), true);

console.log('model chain');
check('primary, then measured fallbacks, capped at three', modelChain('gemini-3.7-flash', ALLOW, []), ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']);
check('fallbacks never leave the allow-list', modelChain('gemini-3.7-flash', ['gemini-3.7-flash'], ['gemini-9-ultra']), ['gemini-3.7-flash']);
check('configured order wins', modelChain('gemini-3.6-flash', ALLOW, ['gemini-3.5-flash', 'gemini-3.6-flash']), ['gemini-3.6-flash', 'gemini-3.5-flash']);

console.log('postChatCompletion');
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway((s) => ({ status: 200, body: s.stream ? 'data: {}' : undefined }));
    const result = await postChatCompletion({ ...base, models: ['gemini-3.7-flash'], fetchImpl: gw.fetchImpl });
    check('happy path is one request', gw.sent.length, 1);
    check('thinking off sends the model level', gw.sent[0].reasoning_effort, 'none');
    check('thinking off keeps the exact ceiling', gw.sent[0].max_tokens, 1000);
    check('reports the model that answered', result.ok && result.model, 'gemini-3.7-flash');
    check('hands back release and abort for the caller', result.ok && typeof result.release === 'function' && typeof result.abort === 'function', true);
    if (result.ok) result.release();
}
{
    /* The deadline must stop once released. It used to be AbortSignal.timeout
       over the whole response, which aborted long streams mid-sentence. */
    resetLearnedReasoningLevels();
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = (async (_url: string, init: { signal: AbortSignal }) => {
        seenSignal = init.signal;
        return new Response('data: {}', { status: 200 });
    }) as unknown as typeof fetch;
    const result = await postChatCompletion({ ...base, models: ['gemini-3.7-flash'], fetchImpl, timeoutMs: 30 });
    if (result.ok) result.release();
    await new Promise((resolve) => setTimeout(resolve, 60));
    check('a released answer is not aborted when the deadline passes', seenSignal?.aborted, false);
    if (result.ok) result.abort();
    check('abort cancels the in-flight answer', seenSignal?.aborted, true);
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway((s) => (s.reasoning_effort === 'none'
        ? { status: 400, body: '[{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}]' }
        : { status: 200 }));
    const first = await postChatCompletion({ ...base, models: ['new-flash'], fetchImpl: gw.fetchImpl });
    check('a rejected level walks to the next', gw.sent.map((s) => s.reasoning_effort), ['none', 'minimal']);
    check('and succeeds on it', first.ok && first.reasoning, 'minimal');
    await postChatCompletion({ ...base, models: ['new-flash'], fetchImpl: gw.fetchImpl });
    check('the winning level is remembered', gw.sent[2].reasoning_effort, 'minimal');
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway((s) => (s.reasoning_effort ? { status: 400, body: '{"error":{"message":"Unrecognized request argument supplied: reasoning_effort"}}' } : { status: 200 }));
    const result = await postChatCompletion({ ...base, models: ['gpt-like'], fetchImpl: gw.fetchImpl });
    check('a gateway that rejects the parameter entirely still answers', result.ok, true);
    check('by omitting it last', gw.sent[gw.sent.length - 1].reasoning_effort, undefined);
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway((s) => (s.model === 'gemini-3.7-flash'
        ? { status: 503, body: '{"error":{"message":"This model is currently experiencing high demand."}}' }
        : { status: 200 }));
    const result = await postChatCompletion({ ...base, models: modelChain('gemini-3.7-flash', ALLOW, []), fetchImpl: gw.fetchImpl });
    check('503 falls back to the next model', result.ok && result.model, 'gemini-3.5-flash-lite');
    check('using that model\'s own level', gw.sent[1].reasoning_effort, 'minimal');
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway(() => ({ status: 429, body: '{"error":{"message":"You exceeded your current quota"}}' }));
    const result = await postChatCompletion({ ...base, models: modelChain('gemini-3.7-flash', ALLOW, []), fetchImpl: gw.fetchImpl });
    check('429 on every model tries each once', gw.sent.map((s) => s.model), ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']);
    check('and reports the quota message', !result.ok && result.status === 429 && result.message, 'You exceeded your current quota');
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway(() => ({ status: 401, body: '{"error":{"message":"API key not valid"}}' }));
    const result = await postChatCompletion({ ...base, models: modelChain('gemini-3.7-flash', ALLOW, []), fetchImpl: gw.fetchImpl });
    check('401 is not retried on another model', gw.sent.length, 1);
    check('and surfaces as 401', !result.ok && result.status, 401);
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway(() => ({ status: 400, body: '{"error":{"message":"Unsupported image format"}}' }));
    await postChatCompletion({ ...base, models: modelChain('gemini-3.7-flash', ALLOW, []), fetchImpl: gw.fetchImpl });
    check('a genuinely bad request is sent once', gw.sent.length, 1);
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway((s) => (s.model === 'gemini-3.7-flash' ? new TypeError('fetch failed') : { status: 200 }));
    const result = await postChatCompletion({ ...base, models: modelChain('gemini-3.7-flash', ALLOW, []), fetchImpl: gw.fetchImpl });
    check('a network error falls back too', result.ok && result.model, 'gemini-3.5-flash-lite');
}
{
    resetLearnedReasoningLevels();
    let clock = 0;
    const gw = fakeGateway(() => {
        clock += 38_000; // the first model hangs for most of the deadline, then 503s
        return { status: 503 };
    });
    const result = await postChatCompletion({
        ...base,
        models: modelChain('gemini-3.7-flash', ALLOW, []),
        fetchImpl: gw.fetchImpl,
        now: () => clock,
        timeoutMs: 40_000,
    });
    check('no fallback that cannot finish inside the deadline', gw.sent.length, 1);
    check('the last real failure is reported', !result.ok && result.status, 503);
}
{
    resetLearnedReasoningLevels();
    const gw = fakeGateway(() => ({ status: 200 }));
    await postChatCompletion({ ...base, models: ['gemini-3.7-flash'], thinking: 'light', fetchImpl: gw.fetchImpl });
    check('light thinking sends low', gw.sent[0].reasoning_effort, 'low');
    check('with token headroom for the reasoning', gw.sent[0].max_tokens, 1000 + THINKING_HEADROOM_TOKENS);
}

if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll AI upstream checks passed.');
