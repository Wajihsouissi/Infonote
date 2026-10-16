import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { makeCards, seedCanvasState } from '../../support/canvasState';
import { PANE, NODE, openCanvas, selectNode, clickEmptyCanvas, blurEditor, focusEditor } from '../../support/canvas';

/**
 * The camera belongs to the person. Once they have panned or zoomed, nothing
 * short of an explicit reframe (the `5` shortcut, focus, entering a canvas)
 * may move it behind their back.
 *
 * Regression: the generated-map fit compared its pending parent id against
 * the current one, and both are `null` on the home canvas — so every change in
 * the visible card count (a new card, culling during a pan, a sync reload)
 * snapped the home canvas back to fit-all.
 */

type Transform = { x: number; y: number; zoom: number };

async function readTransform(page: Page): Promise<Transform> {
    return page.evaluate(() => {
        const t = (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform ?? '';
        const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(t);
        return m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : { x: NaN, y: NaN, zoom: NaN };
    });
}

const same = (a: Transform, b: Transform) =>
    Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.zoom - b.zoom) < 0.001;

const currentParentId = (page: Page) => page.evaluate(() =>
    (window as unknown as { __appStore?: { getState: () => { currentParentId: string | null } } })
        .__appStore?.getState().currentParentId ?? null,
);

/** A pane point with no card under it, so a drag there pans the camera. */
async function emptyPanePoint(page: Page): Promise<{ x: number; y: number }> {
    const point = await page.evaluate((paneSelector) => {
        const pane = document.querySelector(paneSelector) as HTMLElement | null;
        if (!pane) return null;
        const r = pane.getBoundingClientRect();
        for (let y = r.top + 120; y < r.bottom - 160; y += 17) {
            for (let x = r.left + 120; x < r.right - 120; x += 17) {
                const hit = document.elementFromPoint(x, y);
                if (hit?.classList.contains('react-flow__pane')) return { x, y };
            }
        }
        return null;
    }, PANE);
    if (!point) throw new Error('No empty canvas area to drag');
    return point;
}

/** Zooms the way a trackpad pinch does (a Ctrl-modified wheel). `delta` < 0 zooms in. */
async function pinchZoom(page: Page, delta: number) {
    const at = await emptyPanePoint(page);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, delta);
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
}

/** Moves the camera the way a person does: a pan drag, then a pinch zoom. */
async function moveCameraByHand(page: Page, zoomDelta = -60): Promise<Transform> {
    const start = await emptyPanePoint(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(start.x - 14 * i, start.y - 9 * i);
    await page.mouse.up();
    // Hit-testing changes while a pan is still settling.
    await page.waitForTimeout(600);
    await pinchZoom(page, zoomDelta);
    await page.waitForTimeout(400);
    return readTransform(page);
}

/** Fails (softly) if the camera moved without being asked to. */
async function expectCameraToStay(page: Page, label: string, expected: Transform, settleMs = 1500) {
    await page.waitForTimeout(settleMs);
    // Stray input can open a card's nested canvas, which reframes on purpose;
    // that would be a broken test, not a camera bug.
    expect(await currentParentId(page), `${label}: left the home canvas`).toBeNull();
    const now = await readTransform(page);
    expect.soft(same(now, expected), `${label}: camera moved from ${JSON.stringify(expected)} to ${JSON.stringify(now)}`).toBe(true);
    return now;
}

test.describe('canvas camera', () => {
    test('stays where the person put it', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(12, 'Camera'));
        await expect(page.locator(NODE).first()).toBeVisible();
        await page.waitForTimeout(1500);

        let camera = await moveCameraByHand(page, 60);

        // Typing needs a card whose header and first lines are on screen, clear
        // of the top bar and the bottom toolbar. Zoom out by hand until one is.
        const clickableCard = () => page.evaluate(({ paneSelector, nodeSelector }) => {
            const pane = document.querySelector(paneSelector)?.getBoundingClientRect();
            if (!pane) return { id: null, debug: 'no pane' };
            const nodes = Array.from(document.querySelectorAll<HTMLElement>(nodeSelector));
            const rects = nodes.map((node) => ({ id: node.getAttribute('data-id'), r: node.getBoundingClientRect() }));
            const hit = rects.find(({ r }) => r.width > 0
                && r.left > pane.left + 20 && r.left + Math.min(r.width, 220) < pane.right - 20
                && r.top > pane.top + 60 && r.top + Math.min(r.height, 180) < pane.bottom - 160);
            const debug = `pane ${Math.round(pane.top)}..${Math.round(pane.bottom)}; transform ${(document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform}; nodes ${rects.slice(0, 6).map(({ id, r }) => `${id}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`).join(' | ')}`;
            return { id: hit?.id ?? null, debug };
        }, { paneSelector: PANE, nodeSelector: NODE });
        let found = await clickableCard();
        for (let i = 0; !found.id && i < 8; i++) {
            await pinchZoom(page, 80);
            found = await clickableCard();
        }
        if (!found.id) throw new Error(`No clickable card on screen even after zooming out — ${found.debug}`);
        camera = await readTransform(page);
        camera = await expectCameraToStay(page, 'idle after a manual pan/zoom', camera, 2500);
        const card = page.locator(`${NODE}[data-id="${found.id}"]`);
        await selectNode(card);
        camera = await expectCameraToStay(page, 'selecting a card', camera);

        await focusEditor(page, card);
        await page.keyboard.type(' more text');
        camera = await expectCameraToStay(page, 'typing in a card', camera);

        await blurEditor(page);
        await clickEmptyCanvas(page);
        camera = await expectCameraToStay(page, 'deselecting', camera);

        // Adding a card changes the visible card count. BottomMenu may pan (at
        // the same zoom) to reveal a card placed off-screen — that is asked
        // for; a fit-all, which changes the zoom, is not.
        await page.keyboard.press('Control+n');
        await page.waitForTimeout(1500);
        await blurEditor(page);
        const afterCreate = await readTransform(page);
        expect.soft(Math.abs(afterCreate.zoom - camera.zoom) < 0.001, `creating a card: zoom changed from ${camera.zoom} to ${afterCreate.zoom}`).toBe(true);
        camera = await expectCameraToStay(page, 'after creating a card', afterCreate);

        // Panning across the board mounts and culls cards as it goes.
        await clickEmptyCanvas(page);
        for (let i = 0; i < 4; i++) camera = await moveCameraByHand(page, i % 2 ? -60 : 60);
        camera = await expectCameraToStay(page, 'panning across culled cards', camera);

        await page.setViewportSize({ width: 1100, height: 760 });
        camera = await expectCameraToStay(page, 'resizing the window', camera);

        // What a workspace sync does when newer cards arrive.
        await seedCanvasState(page, makeCards(14, 'Camera'));
        await expectCameraToStay(page, 'the graph reloading underneath', camera);

        // A plain mouse wheel over empty canvas zooms — no modifier needed.
        const beforeWheel = await readTransform(page);
        const at = await emptyPanePoint(page);
        await page.mouse.move(at.x, at.y);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(600);
        const afterWheel = await readTransform(page);
        expect(Math.abs(afterWheel.zoom - beforeWheel.zoom), 'a plain mouse wheel should zoom the canvas').toBeGreaterThan(0.01);
    });
});
