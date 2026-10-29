import type { Page, Route } from '@playwright/test';

/**
 * A stand-in for the model.
 *
 * Every AI test runs against this rather than the real provider: a test that
 * calls a paid endpoint is slow, costs money, needs a key on every machine that
 * runs it, and — worst of all — is non-deterministic, so it can only ever
 * assert that *something* came back. Stubbing at the HTTP boundary keeps
 * everything above it real: the transport, its retries, the stream decoder, the
 * trailer, the planner's validation, placement and the trace all run exactly as
 * they do in production.
 *
 * `/api/ai/text` answers with JSON; `/api/ai/stream` answers with raw text
 * followed by the U+001E trailer, which is the contract in api/_lib/aiGuard.js.
 */

/** Mirrors STREAM_TRAILER_MARK in api/_lib/aiGuard.js. */
const TRAILER = '';

export interface AIStub {
    /** What the next `/api/ai/text` call answers, in order; the last repeats. */
    text: string[];
    /** Same for `/api/ai/stream`. */
    stream: string[];
    /** Every prompt the app sent, newest last. */
    prompts: string[];
    /** Phase headers seen, so a test can assert the run's shape. */
    phases: string[];
}

/** One plan the canvas can actually place: two cards and a small mind map. */
export const PLAN_TWO_CARDS = JSON.stringify([
    { type: 'note', title: 'Trains', brief: 'How to get around by train', why: 'Two loose topics, so two cards.' },
    { type: 'note', title: 'Food', brief: 'What to eat and where' },
]);

export const PLAN_MINDMAP = JSON.stringify([
    {
        type: 'mindmap',
        title: 'Lisbon',
        brief: 'The trip at a glance',
        why: 'The user asked how the parts relate.',
        nodes: [
            { id: 'r', label: 'Lisbon' },
            { id: 'a', label: 'Getting around', parentId: 'r' },
            { id: 'b', label: 'Food', parentId: 'r' },
        ],
    },
]);

/** A body with enough shape to pass the effort budget's block check. */
export const BODY = [
    '## What matters',
    '',
    'Trains run every ten minutes and take you almost everywhere.',
    '',
    '- Buy a day pass',
    '- Validate before boarding',
    '',
    '1. Check the line map',
    '2. Ride to Baixa',
    '',
    '- [ ] Book the airport transfer',
    '',
    '> The 28 tram is a sightseeing route, not a commute.',
].join('\n');

/**
 * Route the AI endpoints to a scripted answer. Returns the stub so a test can
 * queue different replies and read back what was asked.
 */
export async function stubAI(page: Page, initial?: Partial<Pick<AIStub, 'text' | 'stream'>>): Promise<AIStub> {
    const stub: AIStub = {
        text: initial?.text ?? ['OK'],
        stream: initial?.stream ?? ['A short answer.'],
        prompts: [],
        phases: [],
    };

    const nextOf = (queue: string[]) => (queue.length > 1 ? queue.shift()! : queue[0] ?? '');

    const record = (route: Route) => {
        const body = route.request().postDataJSON() as { prompt?: string } | null;
        if (body?.prompt) stub.prompts.push(body.prompt);
        stub.phases.push(route.request().headers()['x-ai-phase'] ?? '');
    };

    await page.route('**/api/ai/text', async (route) => {
        record(route);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'X-AI-Model': 'stub-model' },
            body: JSON.stringify({ text: nextOf(stub.text), finishReason: 'stop' }),
        });
    });

    await page.route('**/api/ai/stream', async (route) => {
        record(route);
        await route.fulfill({
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            headers: { 'X-AI-Model': 'stub-model' },
            body: `${nextOf(stub.stream)}${TRAILER}${JSON.stringify({ finishReason: 'stop' })}`,
        });
    });

    return stub;
}

/** Open the AI panel through the store, the way Ctrl+J does. */
export async function openAIPanel(page: Page, mode: 'create' | 'ask'): Promise<void> {
    await page.evaluate((m) => {
        const store = (window as unknown as { __appStore?: { getState: () => { openAIPanel: (mode: string) => void } } }).__appStore;
        store?.getState().openAIPanel(m);
    }, mode);
}
