import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { seedCanvasState } from '../../support/canvasState';
import { NODE, LIVE_EDITOR, openCanvas, selectNode } from '../../support/canvas';

/**
 * A long note keeps its scroll position while the person works in it:
 * clicking, drag-selecting, reordering or dragging blocks must never throw the
 * note area back to the top.
 */

const BLOCKS = 40;

function longNote() {
    return [{
        id: 'long-note',
        type: 'note',
        position: { x: 0, y: 0 },
        style: { width: 520, height: 560 },
        data: {
            label: 'Long note',
            viewMode: 'expanded',
            icon: 'FileText',
            content: Array.from({ length: BLOCKS }, (_, i) => ({
                id: `b-${i}`,
                type: 'text',
                content: `Paragraph ${i} — some words so the line has body.`,
            })),
        },
    }];
}

const noteArea = (card: Locator) => card.locator('[class*="noteArea"]').first();

/** Records every drop of the note area's scrollTop and who might have caused it. */
async function installScrollTracer(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __scrollTrace: string[] };
        w.__scrollTrace = [];
        const area = document.querySelector('.react-flow__node[data-id="long-note"] [class*="noteArea"]') as HTMLElement;
        let last = area.scrollTop;
        area.addEventListener('scroll', () => {
            if (Math.abs(area.scrollTop - last) > 40) {
                w.__scrollTrace.push(`scroll ${Math.round(last)} -> ${Math.round(area.scrollTop)} (scrollHeight ${area.scrollHeight})`);
            }
            last = area.scrollTop;
        });
        const where = () => (new Error().stack ?? '').split('\n').slice(2, 6).map((l) => l.trim()).join(' | ');
        const origScrollTo = area.scrollTo.bind(area);
        area.scrollTo = ((...args: Parameters<HTMLElement['scrollTo']>) => {
            w.__scrollTrace.push(`area.scrollTo(${JSON.stringify(args)}) ${where()}`);
            return origScrollTo(...args);
        }) as HTMLElement['scrollTo'];
        const topDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
        Object.defineProperty(area, 'scrollTop', {
            get() { return topDesc.get!.call(area); },
            set(v: number) { w.__scrollTrace.push(`area.scrollTop = ${Math.round(v)} ${where()}`); topDesc.set!.call(area, v); },
            configurable: true,
        });
        const origIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
            if (area.contains(this)) w.__scrollTrace.push(`scrollIntoView on <${this.tagName.toLowerCase()}> ${where()}`);
            return origIntoView.call(this, arg);
        };
        new MutationObserver((records) => {
            for (const r of records) {
                const el = r.target as HTMLElement;
                if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length) && el.className?.toString().includes('body')) {
                    w.__scrollTrace.push(`note body layers changed (+${r.addedNodes.length}/-${r.removedNodes.length}) scrollTop ${Math.round(topDesc.get!.call(area))}`);
                }
            }
        }).observe(area, { childList: true, subtree: true });
        area.addEventListener('click', (e) => {
            const t = e.target as HTMLElement;
            w.__scrollTrace.push(`click on <${t.tagName.toLowerCase()} class="${String(t.className).slice(0, 40)}"> blocks=${area.querySelectorAll('[data-block-type]').length}`);
        }, true);
        window.addEventListener('chnk-it-editor-bg-click', () => {
            w.__scrollTrace.push(`chnk-it-editor-bg-click blocks=${area.querySelectorAll('[data-block-type]').length}`);
        });
        const origFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function (options?: FocusOptions) {
            if (area.contains(this)) {
                const text = (this.textContent ?? '').slice(0, 30);
                w.__scrollTrace.push(`focus(${options?.preventScroll ? 'preventScroll' : ''}) on <${this.tagName.toLowerCase()}> "${text}" ${where()}`);
            }
            return origFocus.call(this, options);
        };
    });
}

async function scrollToMiddle(page: Page, area: Locator) {
    await area.evaluate((el) => { el.scrollTop = el.scrollHeight / 2 - el.clientHeight / 2; });
    await page.waitForTimeout(200);
    return area.evaluate((el) => el.scrollTop);
}

/** A visible block near the middle of the note area. */
async function middleBlock(area: Locator, offset = 0): Promise<Locator> {
    // Block wrappers carry no id in the DOM, only their type; address by index.
    const index = await area.evaluate((el, off) => {
        const r = el.getBoundingClientRect();
        const blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-block-type]'));
        const visible = blocks
            .map((b, i) => ({ i, br: b.getBoundingClientRect() }))
            .filter(({ br }) => br.top > r.top + 40 && br.bottom < r.bottom - 40);
        const pick = visible[Math.min(visible.length - 1, Math.max(0, Math.floor(visible.length / 2) + off))];
        return pick ? pick.i : -1;
    }, offset);
    if (index < 0) throw new Error('No visible block in the note area');
    return area.locator('[data-block-type]').nth(index);
}

async function expectScrollKept(page: Page, area: Locator, label: string, before: number) {
    await page.waitForTimeout(700);
    const after = await area.evaluate((el) => el.scrollTop);
    const trace = await page.evaluate(() => (window as unknown as { __scrollTrace: string[] }).__scrollTrace.splice(0));
    expect.soft(Math.abs(after - before) < 60, `${label}: note scrolled from ${Math.round(before)} to ${Math.round(after)}\n${trace.join('\n')}`).toBe(true);
}

test.describe('note area scroll', () => {
    test('stays put while working with blocks', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, longNote());
        const card = page.locator(`${NODE}[data-id="long-note"]`);
        await expect(card).toBeVisible();
        await page.keyboard.press('5');
        await page.waitForTimeout(900);

        await selectNode(card);
        await expect(card.locator(LIVE_EDITOR)).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(800);
        const area = noteArea(card);
        await installScrollTracer(page);

        // Click into a block.
        let before = await scrollToMiddle(page, area);
        const clickTarget = (await middleBlock(area)).locator('[contenteditable="true"]').first();
        await clickTarget.click();
        await expectScrollKept(page, area, 'clicking a block', before);

        // Drag-select across blocks.
        before = await scrollToMiddle(page, area);
        const from = await (await middleBlock(area, -2)).boundingBox();
        const to = await (await middleBlock(area, 2)).boundingBox();
        if (!from || !to) throw new Error('blocks not laid out');
        await page.mouse.move(from.x + 40, from.y + from.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + 40, from.y + ((to.y - from.y) * i) / 10 + 4);
        await page.mouse.up();
        await expectScrollKept(page, area, 'drag-selecting blocks', before);

        // Reorder with the keyboard.
        before = await scrollToMiddle(page, area);
        await (await middleBlock(area)).locator('[contenteditable="true"]').first().click();
        before = await area.evaluate((el) => el.scrollTop);
        await page.keyboard.press('Control+Shift+ArrowDown');
        await expectScrollKept(page, area, 'moving a block down (Ctrl+Shift+Down)', before);

        // Drag a block by its handle onto another block.
        before = await scrollToMiddle(page, area);
        const source = await middleBlock(area, -1);
        const target = await middleBlock(area, 2);
        await source.hover();
        const handle = source.locator('[class*="dragHandle"]').first();
        await handle.dragTo(target, { force: true });
        await expectScrollKept(page, area, 'dragging a block to a new spot', before);

        // The wheel scrolls a long note instead of zooming the canvas under it.
        before = await scrollToMiddle(page, area);
        const transformOf = () => page.evaluate(() => (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform);
        const cameraBefore = await transformOf();
        const areaBox = await area.boundingBox();
        if (!areaBox) throw new Error('note area not laid out');
        await page.mouse.move(areaBox.x + areaBox.width / 2, areaBox.y + areaBox.height / 2);
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(500);
        expect(await area.evaluate((el) => el.scrollTop), 'wheel should scroll the note').toBeGreaterThan(before + 50);
        expect(await transformOf(), 'wheel over a scrollable note must not move the canvas').toBe(cameraBefore);
    });
});
