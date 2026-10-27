import { test, expect } from '../../support/fixtures';
import { openCanvas, selectNode, nodeById, LIVE_EDITOR } from '../../support/canvas';
import { seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * Typing has to stay cheap in a long note.
 *
 * Every block is a React component, so the question this measures is whether a
 * keystroke re-renders the line being typed in or the whole document. The
 * budget is deliberately loose — this is a regression guard, not a benchmark,
 * and it runs on the same machine as two other workers.
 */

const BLOCKS = 150;
const KEYSTROKES = 25;
/** Loose development/parallel-CI rendering-opportunity budget, not INP. */
const P95_BUDGET_MS = 120;

test('P1 typing in a 150-block note stays responsive', async ({ page }, testInfo) => {
    await openCanvas(page);
    await seedCanvasState(page, [{
        id: 'long-note',
        type: 'note',
        position: { x: 0, y: 0 },
        style: { width: 640, height: 640 },
        data: {
            label: 'Long note',
            viewMode: 'expanded',
            content: Array.from({ length: BLOCKS }, (_, i) => ({
                id: `p1-block-${i}`,
                type: i % 10 === 0 ? 'heading2' : 'text',
                content: `Paragraph ${i}: the quick brown fox jumps over the lazy dog.`,
            })),
        },
    }]);

    const node = nodeById(page, 'long-note');
    await expect(node).toBeVisible();
    await selectNode(node);
    const editor = node.locator(LIVE_EDITOR);
    await expect(editor).toBeVisible({ timeout: 20_000 });

    const firstBlock = editor.locator('[contenteditable="true"]').first();
    await firstBlock.click();
    await page.waitForTimeout(500);

    // Every input gets a sample, including work after the DOM event handler.
    // A thresholded Event Timing observer plus handler-only averages missed
    // rendering stalls and silently passed when it collected zero events.
    await page.evaluate(() => {
        const timings: number[] = [];
        (window as unknown as { __typingTimings: number[] }).__typingTimings = timings;
        document.addEventListener('input', () => {
            const started = performance.now();
            requestAnimationFrame(() => requestAnimationFrame(() => timings.push(performance.now() - started)));
        }, true);
    });

    const started = Date.now();
    await page.keyboard.type('x'.repeat(KEYSTROKES), { delay: 25 });
    await page.waitForTimeout(600);
    const elapsed = Date.now() - started;

    const timings = await page.evaluate(() => (window as unknown as { __typingTimings: number[] }).__typingTimings);
    expect(timings, 'one rendering sample must be recorded for every typed character').toHaveLength(KEYSTROKES);
    const sorted = [...timings].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const worst = timings.length ? Math.max(...timings) : 0;
    const average = timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;

    await testInfo.attach('typing-cost', {
        body: JSON.stringify({ blocks: BLOCKS, keystrokes: KEYSTROKES, elapsedMs: elapsed, samples: timings.length, averageMs: average, p95Ms: p95, worstMs: worst, metric: 'input to second animation frame (not INP)' }, null, 2),
        contentType: 'application/json',
    });

    // The text must actually have landed — a fast but broken editor is not a pass.
    const state = await waitForCanvasState(
        page,
        (s) => JSON.stringify(s.nodes.find((n) => n.id === 'long-note')?.data?.content ?? '').includes('x'.repeat(KEYSTROKES)),
        'the typed text to be saved',
    );
    expect(state.nodes.find((n) => n.id === 'long-note')).toBeDefined();
    expect(p95, `95th percentile input-to-frame time was ${p95.toFixed(1)}ms`).toBeLessThan(P95_BUDGET_MS);
});
