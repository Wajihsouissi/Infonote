import { test, expect, type Page } from '@playwright/test';
import { makeCards, seedCanvasState } from './support/canvasState';

type FrameSample = {
    frames: number;
    p95FrameMs: number;
    maxFrameMs: number;
    missedFrames: number;
    longTasks: number;
    longTaskMs: number;
};

async function startFrameSample(page: Page) {
    await page.evaluate(() => {
        const state = {
            active: true,
            last: performance.now(),
            deltas: [] as number[],
            longTasks: [] as number[],
            observer: null as PerformanceObserver | null,
        };
        (window as typeof window & { __canvasPerf?: typeof state }).__canvasPerf = state;

        const frame = (now: number) => {
            if (!state.active) return;
            state.deltas.push(now - state.last);
            state.last = now;
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);

        if ('PerformanceObserver' in window) {
            try {
                state.observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
                });
                state.observer.observe({ type: 'longtask', buffered: false });
            } catch {
                // Chromium exposes long tasks; other engines can still report frames.
            }
        }
    });
}

async function stopFrameSample(page: Page): Promise<FrameSample> {
    return page.evaluate(() => {
        const state = (window as typeof window & {
            __canvasPerf?: {
                active: boolean;
                deltas: number[];
                longTasks: number[];
                observer: PerformanceObserver | null;
            };
        }).__canvasPerf;
        if (!state) throw new Error('Canvas performance sampler was not started');
        state.active = false;
        state.observer?.disconnect();
        const frames = state.deltas.slice(1).sort((a, b) => a - b);
        const p95 = frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))] ?? 0;
        return {
            frames: frames.length,
            p95FrameMs: Number(p95.toFixed(1)),
            maxFrameMs: Number((frames.at(-1) ?? 0).toFixed(1)),
            missedFrames: frames.filter((duration) => duration > 25).length,
            longTasks: state.longTasks.length,
            longTaskMs: Number(state.longTasks.reduce((sum, value) => sum + value, 0).toFixed(1)),
        };
    });
}

test('reports canvas pan, zoom, and node-drag frame cadence', async ({ page }) => {
    await page.goto('/canvas');
    const pane = page.locator('.react-flow__pane');
    await expect(pane).toBeVisible({ timeout: 20_000 });
    await seedCanvasState(page, makeCards(60, 'Performance'));
    await page.waitForTimeout(1_200);
    await page.keyboard.press('5');
    await page.waitForTimeout(700);

    const box = await pane.boundingBox();
    if (!box) throw new Error('Canvas pane has no bounding box');

    await startFrameSample(page);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 120 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(250);
    const pan = await stopFrameSample(page);

    await page.keyboard.press('5');
    await page.waitForTimeout(500);
    await startFrameSample(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, i < 10 ? -35 : 35);
    await page.waitForTimeout(250);
    const zoom = await stopFrameSample(page);

    await page.keyboard.press('5');
    await page.waitForTimeout(1_200);
    const draggedNodeId = await page.locator('.react-flow__node:visible').evaluateAll((elements) => {
        const safe = elements.find((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top > 80 && rect.bottom < window.innerHeight - 150;
        });
        return safe?.getAttribute('data-id') ?? null;
    });
    if (!draggedNodeId) throw new Error('Visible canvas node has no id');
    const node = page.locator(`.react-flow__node[data-id="${draggedNodeId}"]`);
    const nodeBeforeDrag = await page.evaluate((id) => {
        const store = (window as typeof window & { __appStore?: { getState: () => { nodes: Array<{ id: string; parentId?: string; position: { x: number; y: number } }> } } }).__appStore;
        const found = store?.getState().nodes.find((candidate) => candidate.id === id);
        return found ? { position: found.position, parentId: found.parentId ?? null } : undefined;
    }, draggedNodeId);
    const handle = node.locator('.custom-drag-handle').first();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('Visible canvas node has no drag handle');

    await startFrameSample(page);
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    const dragStartState = await page.evaluate(() => ({
        draggedNodeId: (window as typeof window & { __appStore?: { getState: () => { interactionState: { draggedNodeId: string | null } } } }).__appStore?.getState().interactionState.draggedNodeId ?? null,
        viewportMoving: document.querySelector('[class*="canvasArea"]')?.className.includes('viewportMoving') ?? false,
    }));
    expect(dragStartState).toEqual({ draggedNodeId, viewportMoving: false });
    await page.mouse.move(handleBox.x + 360, handleBox.y + 220, { steps: 120 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const drag = await stopFrameSample(page);

    const nodeAfterDrag = await page.evaluate((id) => {
        const store = (window as typeof window & { __appStore?: { getState: () => { nodes: Array<{ id: string; parentId?: string; position: { x: number; y: number } }> } } }).__appStore;
        const found = store?.getState().nodes.find((candidate) => candidate.id === id);
        return found ? { position: found.position, parentId: found.parentId ?? null } : undefined;
    }, draggedNodeId);
    expect(nodeBeforeDrag).toBeDefined();
    expect(nodeAfterDrag).toBeDefined();
    const moved = Math.hypot(
        nodeAfterDrag!.position.x - nodeBeforeDrag!.position.x,
        nodeAfterDrag!.position.y - nodeBeforeDrag!.position.y,
    ) > 100;
    const nested = nodeAfterDrag!.parentId !== nodeBeforeDrag!.parentId;
    expect(moved || nested).toBe(true);
    expect(pan.longTasks).toBeLessThan(30);
    expect(zoom.longTasks).toBeLessThan(25);
    expect(drag.longTasks).toBeLessThan(40);

    const dom = await page.evaluate(() => ({
        elements: document.querySelectorAll('*').length,
        mountedNodes: document.querySelectorAll('.react-flow__node').length,
        minimapNodes: document.querySelectorAll('.react-flow__minimap-node').length,
    }));

    console.log(`CANVAS_PERF ${JSON.stringify({ pan, zoom, drag, dom })}`);
});
