import { test, expect } from '../../support/fixtures';
import { NODE, openCanvas, selectNode } from '../../support/canvas';
import { readCanvasState, waitForCanvasState, type CanvasState, type CanvasStateNode } from '../../support/canvasState';

/**
 * Files: upload, storage, and the two ways of reading one.
 *
 * The assertion that matters most here is the storage boundary. A file's bytes
 * must never land in the canvas document — `block.content` carries an
 * `asset:<id>` reference and nothing else — because the document is what every
 * local-folder write and cloud sync payload has to carry.
 * A regression there is invisible in the UI and ruinous in the payload.
 */

const PDF = 'Board Memo.pdf';
const CSV = 'Q3 metrics.csv';

/**
 * Drops a file on the canvas the way the OS does. Playwright's file APIs drive
 * `<input type=file>`; the canvas has no input, so the drag has to be
 * synthesised with a real `DataTransfer`.
 */
async function dropOnCanvas(
    page: import('@playwright/test').Page,
    name: string,
    mime: string,
    body: string,
    at: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Promise<void> {
    await page.evaluate(
        ({ name, mime, body, at }) => {
            const file = new File([new Blob([body], { type: mime })], name, { type: mime });
            const dt = new DataTransfer();
            dt.items.add(file);
            const pane = document.querySelector('.react-flow__pane')!;
            const r = pane.getBoundingClientRect();
            const clientX = Math.round(r.left + r.width * at.x);
            const clientY = Math.round(r.top + r.height * at.y);
            const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY };
            pane.dispatchEvent(new DragEvent('dragover', opts));
            pane.dispatchEvent(new DragEvent('drop', opts));
        },
        { name, mime, body, at },
    );
}

/** Every file block held anywhere in the current canvas document. */
const fileBlocks = (snap: CanvasState) =>
    snap.nodes
        .flatMap((n: CanvasStateNode) => (Array.isArray(n.data?.content) ? n.data.content : []))
        .filter((b: { type?: string }) => b?.type === 'file') as Array<{
            content: string;
            metadata?: Record<string, unknown>;
        }>;

/** The canvas node holding a given file, found by its name field. */
const fileNode = (page: import('@playwright/test').Page, name: string) =>
    page.locator(NODE).filter({ has: page.locator(`input[value="${name}"]`) });

test.describe('core: files (F)', () => {
    test('F1 a dropped file is stored by reference, never inlined in the document', async ({ page }) => {
        await openCanvas(page);

        await dropOnCanvas(page, PDF, 'application/pdf', '%PDF-1.4\n% minimal\n');

        const closed = fileNode(page, PDF);
        await expect(closed).toBeVisible();
        // A file card is artwork and a name, not an editor.
        await expect(closed.locator('[data-chnk-it-block-editor]')).toHaveCount(0);

        const snap = await waitForCanvasState(
            page,
            (s) => fileBlocks(s).length === 1,
            'the dropped file to reach the canvas document',
        );
        const [block] = fileBlocks(snap);
        expect(block.metadata?.name).toBe(PDF);
        expect(block.content).toMatch(/^asset:[0-9a-f-]{36}$/);
        expect(block.content).not.toContain('base64');

        // The bytes themselves live in their own database.
        const stored = await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((res, rej) => {
                const r = indexedDB.open('chnk-it-assets');
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            try {
                return await new Promise<Array<{ name: string; mime: string; bytes: number }>>((res) => {
                    const q = db.transaction('assets', 'readonly').objectStore('assets').getAll();
                    q.onsuccess = () => res(q.result.map((a: { name: string; mime: string; blob: Blob }) => ({
                        name: a.name, mime: a.mime, bytes: a.blob.size,
                    })));
                });
            } finally {
                db.close();
            }
        });
        expect(stored).toContainEqual(expect.objectContaining({ name: PDF, mime: 'application/pdf' }));
        expect(stored[0].bytes).toBeGreaterThan(0);

        // The document keeps the lightweight asset reference after the card is
        // deselected, rather than retaining the file bytes inline.
        await page.locator('.react-flow__pane').click({ position: { x: 12, y: 12 }, force: true });
        expect(fileBlocks((await readCanvasState(page))!)[0].content).toMatch(/^asset:/);
    });

    test('F2 opening a file on the canvas mounts the real document, gated like an editor', async ({ page }) => {
        await openCanvas(page);
        await dropOnCanvas(page, CSV, 'text/csv', 'quarter,revenue\nQ3,163000\n');

        const closed = fileNode(page, CSV);
        await expect(closed).toBeVisible();

        /* The closed card is identified by its filename input, and opening
           replaces that input with static text — so pin the node by id before
           it changes shape. */
        const id = await closed.getAttribute('data-id');
        expect(id).toBeTruthy();
        const node = page.locator(`${NODE}[data-id="${id}"]`);

        await selectNode(node);
        await node.getByTitle('Open the file').click();

        // The viewer's header identifies what it is holding...
        await expect(node.getByText('Spreadsheet', { exact: false })).toBeVisible();
        // ...and a delimited file is laid out as a sheet, not printed as the
        // commas it happens to be stored with: header row, own cells.
        await expect(node.getByRole('columnheader', { name: 'revenue' })).toBeVisible();
        await expect(node.getByRole('cell', { name: '163000', exact: true })).toBeVisible();
    });

    test('F3 a file opens in a peek instead of an empty block editor', async ({ page }) => {
        await openCanvas(page);
        await dropOnCanvas(page, CSV, 'text/csv', 'quarter,revenue\nQ3,163000\n');

        const node = fileNode(page, CSV);
        await expect(node).toBeVisible();
        await selectNode(node);
        await node.getByTitle('Center Peek').click();

        /* Regression guard for the four peek shells: before they shared one
           resolver, anything that was not a note fell through to a bare block
           editor, so a file opened as an empty page. */
        const peek = page.locator('[class*="centerModalOverride"]');
        await expect(peek).toBeVisible();
        await expect(peek.getByLabel('File name')).toHaveValue(CSV);
        await expect(peek.getByRole('cell', { name: '163000', exact: true })).toBeVisible();
        await expect(peek.locator('[data-chnk-it-block-editor]')).toHaveCount(0);
    });

    test('F4 files appear in the fullscreen rail beside cards', async ({ page }) => {
        await openCanvas(page);
        await dropOnCanvas(page, PDF, 'application/pdf', '%PDF-1.4\n', { x: 0.3, y: 0.3 });
        await dropOnCanvas(page, CSV, 'text/csv', 'quarter,revenue\n', { x: 0.6, y: 0.3 });

        const node = fileNode(page, PDF);
        await expect(node).toBeVisible();
        await selectNode(node);
        await node.getByTitle('Full Screen').click();

        const rail = page.locator('aside[aria-label="Notes on this canvas"]');
        await expect(rail).toBeVisible();

        // Both files are listed, each with what it is rather than a bare name.
        await expect(rail.getByText(PDF)).toBeVisible();
        await expect(rail.getByText(CSV)).toBeVisible();
        await expect(rail.getByText('PDF document', { exact: false })).toBeVisible();
        await expect(rail.getByText('Spreadsheet', { exact: false })).toBeVisible();

        // Picking one from the rail opens it in the pane.
        await rail.getByText(CSV).click();
        const stage = page.locator('[class*="stage"]').first();
        await expect(stage.getByLabel('File name')).toHaveValue(CSV);
    });

    test('F6 a spreadsheet is laid out as a sheet, quoted fields and all', async ({ page }) => {
        await openCanvas(page);
        /* The third row's region holds the delimiter inside quotes — the case a
           naive split on commas gets wrong, shifting every later column by one. */
        await dropOnCanvas(
            page,
            'Regions.csv',
            'text/csv',
            'quarter,revenue,region\nQ1,120000,EMEA\nQ2,138500,APAC\nQ3,163200,"Americas, North"\n',
        );

        const node = fileNode(page, 'Regions.csv');
        await expect(node).toBeVisible();
        await selectNode(node);
        await node.getByTitle('Open the file').click();

        await expect(node.getByRole('columnheader', { name: 'region' })).toBeVisible();
        await expect(node.getByRole('cell', { name: 'Americas, North', exact: true })).toBeVisible();
        // Three data rows, each numbered in the gutter.
        await expect(node.getByRole('cell', { name: '3', exact: true })).toBeVisible();
    });

    test('F7 a file can be renamed from the viewer, not just from its card', async ({ page }) => {
        await openCanvas(page);
        await dropOnCanvas(page, CSV, 'text/csv', 'quarter,revenue\nQ3,163000\n');

        const node = fileNode(page, CSV);
        await expect(node).toBeVisible();
        await selectNode(node);
        await node.getByTitle('Center Peek').click();

        const peek = page.locator('[class*="centerModalOverride"]');
        const title = peek.getByLabel('File name');
        await expect(title).toHaveValue(CSV);

        await title.fill('Revenue 2026.csv');
        await title.press('Enter');

        // The rename reaches the document, not just the field it was typed in.
        await waitForCanvasState(
            page,
            (s) => fileBlocks(s).some((b) => b.metadata?.name === 'Revenue 2026.csv'),
            'the rename to reach the canvas document',
        );
    });

    test('F5 an oversized file is refused with a message instead of being stored', async ({ page }) => {
        await openCanvas(page);
        const before = fileBlocks((await readCanvasState(page)) ?? { nodes: [], edges: [], observedAt: 0 }).length;

        await page.evaluate(() => {
            /* Past MAX_ASSET_BYTES (100 MB) without allocating it: a Blob of
               repeated references to one zero-filled chunk costs one chunk. */
            const chunk = new Uint8Array(1024 * 1024);
            const file = new File([new Blob(Array.from({ length: 101 }, () => chunk))], 'huge.bin', {
                type: 'application/octet-stream',
            });
            const dt = new DataTransfer();
            dt.items.add(file);
            const pane = document.querySelector('.react-flow__pane')!;
            const r = pane.getBoundingClientRect();
            const opts = {
                bubbles: true,
                cancelable: true,
                dataTransfer: dt,
                clientX: Math.round(r.left + r.width * 0.4),
                clientY: Math.round(r.top + r.height * 0.4),
            };
            pane.dispatchEvent(new DragEvent('dragover', opts));
            pane.dispatchEvent(new DragEvent('drop', opts));
        });

        await expect(page.getByText('That file could not be added')).toBeVisible();
        const after = fileBlocks((await readCanvasState(page)) ?? { nodes: [], edges: [], observedAt: 0 }).length;
        expect(after).toBe(before);
    });
});
