import { expect, test } from '@playwright/test';
import { makeCards, seedCanvasState } from '../../support/canvasState';

type SelectionTiming = {
    selectedMs: number;
    toolbarMs: number;
    nextPaintMs: number;
    longTasks: number[];
};

test('node selection and its contextual toolbar paint without a perceptible pause', async ({ page }) => {
    await page.goto('/canvas');
    await expect(page.locator('.react-flow__pane')).toBeVisible({ timeout: 20_000 });
    const hasTestStore = await page.evaluate(() => Boolean((window as typeof window & { __appStore?: unknown }).__appStore));
    if (hasTestStore) {
        await seedCanvasState(page, makeCards(60, 'Selection performance'));
    } else {
        await page.waitForTimeout(1_500);
        for (let index = 0; index < 8; index += 1) {
            await page.keyboard.press('Control+n');
            await page.waitForTimeout(120);
        }
    }
    await page.keyboard.press('5');
    await page.waitForTimeout(800);

    const node = page.locator('.react-flow__node:visible').first();
    await expect(node).toBeVisible();

    await page.evaluate(() => {
        const sample = {
            clickAt: 0,
            selectedAt: 0,
            toolbarAt: 0,
            nextPaintAt: 0,
            longTasks: [] as number[],
        };
        (window as typeof window & { __selectionTiming?: typeof sample }).__selectionTiming = sample;

        document.addEventListener('click', (event) => {
            if ((event.target as Element | null)?.closest('.react-flow__node')) {
                sample.clickAt = performance.now();
            }
        }, { capture: true, once: true });

        const observer = new MutationObserver(() => {
            if (!sample.clickAt) return;
            if (!sample.selectedAt && document.querySelector('.react-flow__node.is-selected')) {
                sample.selectedAt = performance.now();
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        sample.nextPaintAt = performance.now();
                        observer.disconnect();
                    });
                });
            }
            if (!sample.toolbarAt && document.querySelector('[data-selection-toolbar="true"][aria-hidden="false"]')) {
                sample.toolbarAt = performance.now();
            }
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });

        try {
            const longTaskObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) sample.longTasks.push(entry.duration);
            });
            longTaskObserver.observe({ type: 'longtask', buffered: false });
        } catch {
            // Chromium supports long tasks; keep the timing benchmark useful elsewhere.
        }
    });

    await node.click();
    await expect(node).toHaveClass(/is-selected/);
    await expect(page.locator('[data-selection-toolbar="true"]')).toBeVisible();
    await page.waitForFunction(() => {
        const sample = (window as typeof window & { __selectionTiming?: { nextPaintAt: number } }).__selectionTiming;
        return Boolean(sample?.nextPaintAt);
    });

    const timing = await page.evaluate((): SelectionTiming => {
        const sample = (window as typeof window & {
            __selectionTiming?: {
                clickAt: number;
                selectedAt: number;
                toolbarAt: number;
                nextPaintAt: number;
                longTasks: number[];
            };
        }).__selectionTiming;
        if (!sample) throw new Error('Selection timing sample was not installed');
        return {
            selectedMs: Number((sample.selectedAt - sample.clickAt).toFixed(1)),
            toolbarMs: sample.toolbarAt ? Number((sample.toolbarAt - sample.clickAt).toFixed(1)) : 0,
            nextPaintMs: Number((sample.nextPaintAt - sample.clickAt).toFixed(1)),
            longTasks: sample.longTasks.map((duration) => Number(duration.toFixed(1))),
        };
    });

    console.log(`SELECTION_PERF ${JSON.stringify(timing)}`);
    expect(timing.selectedMs).toBeLessThan(150);
    expect(timing.toolbarMs).toBeLessThan(150);
    expect(timing.nextPaintMs).toBeLessThan(250);
});
