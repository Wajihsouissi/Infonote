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
/** Average time the page spends handling one keystroke. */
const BUDGET_MS = 45;

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

    // Event Timing reports how long the page took to handle each interaction,
    // which is what the reader actually feels.
    await page.evaluate(() => {
        const timings: number[] = [];
        (window as unknown as { __typingTimings: number[] }).__typingTimings = timings;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const event = entry as PerformanceEntry & { processingStart?: number; processingEnd?: number };
                if (!['keydown', 'input', 'keypress'].includes(entry.name)) continue;
                if (event.processingStart != null && event.processingEnd != null) {
                    timings.push(event.processingEnd - event.processingStart);
                }
            }
        }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    });

    const started = Date.now();
    await page.keyboard.type('x'.repeat(KEYSTROKES), { delay: 25 });
    await page.waitForTimeout(600);
    const elapsed = Date.now() - started;

    const timings = await page.evaluate(() => (window as unknown as { __typingTimings: number[] }).__typingTimings);
    const worst = timings.length ? Math.max(...timings) : 0;
    const average = timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;

    await testInfo.attach('typing-cost', {
        body: JSON.stringify({ blocks: BLOCKS, keystrokes: KEYSTROKES, elapsedMs: elapsed, slowEvents: timings.length, averageMs: average, worstMs: worst }, null, 2),
        contentType: 'application/json',
    });

    // The text must actually have landed — a fast but broken editor is not a pass.
    const state = await waitForCanvasState(
        page,
        (s) => JSON.stringify(s.nodes.find((n) => n.id === 'long-note')?.data?.content ?? '').includes('x'.repeat(KEYSTROKES)),
        'the typed text to be saved',
    );
    expect(state.nodes.find((n) => n.id === 'long-note')).toBeDefined();
    expect(average, `keystrokes averaged ${average.toFixed(1)}ms of work`).toBeLessThan(BUDGET_MS);
});
