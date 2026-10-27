import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { addNote, NODE as PANE_NODE, openCanvas, PANE, reload } from '../../support/canvas';
import { makeCards, readCanvasState, type CanvasStateNode, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

/**
 * Step 6 — pages, accounts and the safety net.
 *
 * Sign-in itself needs a real Supabase project and a real inbox, so it is not
 * driven here. Everything around it is: which page each address shows to whom,
 * what a guest is told, and the backup file — the only thing that stands
 * between a local-only workspace and a lost laptop.
 *
 * "Signed in" is a session published straight into the store, which is the
 * app's single source of identity (features/auth/session.ts does the same with
 * a real one).
 */

type AppStore = {
    getState: () => {
        view: string;
        setView: (view: string) => void;
        setAuthUser: (user: { id: string; email: string; displayName?: string } | null) => void;
    };
};

async function signInFake(page: Page, displayName = 'Ada'): Promise<void> {
    await page.evaluate((name) => {
        const store = (window as unknown as { __appStore: AppStore }).__appStore;
        store.getState().setAuthUser({ id: 'e2e-user', email: 'ada@example.com', displayName: name });
    }, displayName);
}

async function goTo(page: Page, view: string): Promise<void> {
    await page.evaluate((next) => {
        (window as unknown as { __appStore: AppStore }).__appStore.getState().setView(next);
    }, view);
}

/** Imported by the page at run time, through Vite; not a module of the suite. */
const ASSET_STORE = '/src/services/assets/assetStore.ts';

const currentView = (page: Page) =>
    page.evaluate(() => (window as unknown as { __appStore: AppStore }).__appStore.getState().view);

test.describe('core: pages and addresses (R)', () => {
    test('R1 a visitor lands on the front page and walks into the canvas, and Back returns', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible({ timeout: 20_000 });
        // The front page promises only what this build does.
        await expect(page.getByText('What this beta does not do yet')).toBeVisible();

        await page.getByRole('button', { name: /Start writing/ }).click();
        await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
        expect(new URL(page.url()).pathname).toBe('/canvas');

        await page.goBack();
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('R2 the dashboard is for accounts; the profile and its backup are for everyone', async ({ page }) => {
        await page.goto('/home');
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible({ timeout: 20_000 });
        expect(new URL(page.url()).pathname).toBe('/');

        await page.goto('/profile');
        await expect(page.getByRole('heading', { name: 'Your workspace' })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: 'Save a backup file' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Restore from a backup' })).toBeVisible();
        // Deleting an account is meaningless without one.
        await expect(page.getByText('Delete your account')).toHaveCount(0);
    });

    test('R3 the canvas top bar reaches the profile, and an unknown address falls back home', async ({ page }) => {
        await openCanvas(page);
        await page.getByRole('button', { name: 'Backup and sign-in' }).click();
        await expect(page.getByRole('heading', { name: 'Your workspace' })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/profile');

        await page.goto('/no-such-page');
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible({ timeout: 20_000 });
    });

    test('R4 signed in: the dashboard lists local cards, and signing out leaves it', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(3, 'Recent'));
        await signInFake(page);

        await page.getByRole('button', { name: 'Your dashboard' }).click();
        await expect(page.getByText('Welcome back, Ada.')).toBeVisible();
        await expect(page.getByText('Recent 1')).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/home');

        // Signed out elsewhere (another tab): the dashboard must not linger.
        await page.evaluate(() => (window as unknown as { __appStore: AppStore }).__appStore.getState().setAuthUser(null));
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible();
        expect(await currentView(page)).toBe('marketing');
    });
});

test.describe('core: backup file (B)', () => {
    test('B1 a backup restores every card, link and uploaded file into a fresh browser', async ({ page, browser, baseURL }) => {
        await openCanvas(page);

        // Two cards, a line between them, and an uploaded cover image.
        const coverId = await page.evaluate(async (path) => {
            const { putAsset } = await import(path);
            const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
            const record = await putAsset(new File([bytes], 'cover.png', { type: 'image/png' }));
            return record.id as string;
        }, ASSET_STORE);
        const [plain, second] = makeCards(2, 'Backed up');
        const first = { ...plain, data: { ...plain.data, coverImage: `asset:${coverId}` } };
        await seedCanvasState(page, [first, second], [{ id: 'e2e-edge', source: first.id, target: second.id }]);

        await goTo(page, 'profile');
        const downloading = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save a backup file' }).click();
        const download = await downloading;
        expect(download.suggestedFilename()).toMatch(/^chnk-it-backup-\d{4}-\d{2}-\d{2}\.json$/);
        const backupPath = await download.path();

        // A different browser profile: empty IndexedDB, no asset store.
        const fresh = await browser.newContext({ baseURL });
        // A returning visitor, so no welcome cards muddy the restore.
        await fresh.addInitScript(() => localStorage.setItem('chnk-it-welcomed', '1'));
        const other = await fresh.newPage();
        try {
            await openCanvas(other);
            expect((await readCanvasState(other))?.nodes ?? []).toHaveLength(0);

            await goTo(other, 'profile');
            other.once('dialog', (dialog) => void dialog.accept());
            await other.locator('input[type="file"]').setInputFiles(backupPath);
            await expect(other.getByRole('status')).toContainText('Restored 2 cards and 1 file');

            await waitForCanvasState(other, (state) => state.nodes.length === 2 && state.edges.length === 1, 'the restored graph');
            const restoredCover = await other.evaluate(async ({ id, path }) => {
                const { getAsset } = await import(path);
                const record = await getAsset(id);
                return record ? { name: record.name as string, size: record.size as number } : null;
            }, { id: coverId, path: ASSET_STORE });
            expect(restoredCover).toEqual({ name: 'cover.png', size: 12 });

            // Restored work is saved like any other edit.
            await goTo(other, 'canvas');
            await expect(other.locator(PANE)).toBeVisible({ timeout: 20_000 });
            await reload(other);
            await waitForCanvasState(other, (state) => state.nodes.length === 2 && state.edges.length === 1, 'the restored graph after a reload');
        } finally {
            await fresh.close();
        }
    });

    test('B2 a file that is not a backup is refused and nothing is replaced', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Keep me'));
        await goTo(page, 'profile');

        page.once('dialog', (dialog) => void dialog.accept());
        await page.locator('input[type="file"]').setInputFiles({
            name: 'notes.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{"hello":"world"}'),
        });
        await expect(page.getByRole('alert')).toContainText('not a Chnk it backup');
        expect((await readCanvasState(page))?.nodes).toHaveLength(2);
    });

    test('B3 cancelling the restore question leaves the canvas alone', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(2, 'Keep me'));
        await goTo(page, 'profile');

        page.once('dialog', (dialog) => void dialog.dismiss());
        await page.locator('input[type="file"]').setInputFiles({
            name: 'backup.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ format: 'chnk-it-backup', version: 1, nodes: [], edges: [], assets: [] })),
        });
        await page.waitForTimeout(500);
        expect((await readCanvasState(page))?.nodes).toHaveLength(2);
    });
});

test.describe('core: guest reminder (G)', () => {
    test('G1 after a guest edits, a reminder says what an account adds — and never that it saves work', async ({ page }) => {
        await page.clock.install();
        await openCanvas(page);
        // Writes during load are not edits; step past the boot grace.
        await page.clock.fastForward('00:05');
        await addNote(page, 'First thought');

        await page.clock.fastForward('00:25');
        const reminder = page.getByRole('status').filter({ hasText: 'Your work is saved in this browser.' });
        await expect(reminder).toBeVisible();
        await expect(reminder).toContainText('An account adds the AI assistant and unlimited nesting.');
        await expect(reminder).not.toContainText(/sign in to save|save your work/i);

        await reminder.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/login');
    });

    test('G2 someone signed in is never reminded', async ({ page }) => {
        await page.clock.install();
        await openCanvas(page);
        await signInFake(page);
        await page.clock.fastForward('00:05');
        await addNote(page, 'Signed-in thought');
        await page.clock.fastForward('00:25');
        await expect(page.getByText('An account adds the AI assistant')).toHaveCount(0);
    });
});

test.describe('core: guest nesting limit (N)', () => {
    /** A card at the top, `depth` cards stacked inside it, and a drop target beside it. */
    function stack(depth: number): CanvasStateNode[] {
        const card = (id: string, label: string, x: number, parentId?: string): CanvasStateNode => ({
            id,
            type: 'note',
            position: { x, y: 0 },
            style: { width: 320, height: 240 },
            ...(parentId ? { parentId } : {}),
            data: { label, content: [{ id: `${id}-b`, type: 'text', content: label }], viewMode: 'expanded', icon: 'FileText' },
        });
        const nodes = [card('mover', 'Mover', 0), card('target', 'Target', 520)];
        let parent = 'mover';
        for (let level = 1; level <= depth; level++) {
            nodes.push(card(`inner-${level}`, `Inner ${level}`, 0, parent));
            parent = `inner-${level}`;
        }
        return nodes;
    }

    async function dragOnto(page: Page, from: string, to: string): Promise<void> {
        const handle = page.locator(`${PANE_NODE}[data-id="${from}"]`);
        const target = page.locator(`${PANE_NODE}[data-id="${to}"]`);
        const a = (await handle.boundingBox())!;
        const b = (await target.boundingBox())!;
        // The card body/title contains intentional nodrag editing surfaces.
        // Grab the actual top edge and prove React Flow accepted the gesture.
        await page.mouse.move(a.x + a.width / 2, a.y + 4);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2 + 14, a.y + 4, { steps: 4 });
        await expect(page.locator('body')).toHaveClass(/chnk-it-node-dragging/);
        // Intermediate moves: React Flow and the drop-target check both need them.
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
        await page.waitForTimeout(150);
        await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2 + 4, { steps: 2 });
        await page.mouse.up();
        await page.waitForTimeout(400);
    }

    const parentOf = async (page: Page, id: string) =>
        (await readCanvasState(page))?.nodes.find((n) => n.id === id)?.parentId ?? null;

    test('N1 a guest cannot drag a card whose stack would end up past three levels', async ({ page }) => {
        await openCanvas(page);
        // Mover (level 1) holds two levels of cards; inside Target they would reach level 4.
        await seedCanvasState(page, stack(2));
        await expect(page.locator(`${PANE_NODE}[data-id="mover"]`)).toBeVisible();

        await dragOnto(page, 'mover', 'target');
        await expect(page.getByRole('dialog')).toContainText('Deeper nesting needs an account');
        expect(await parentOf(page, 'mover')).toBeNull();
    });

    test('N2 a stack that fits still nests, and an account lifts the limit', async ({ page }) => {
        await openCanvas(page);
        await seedCanvasState(page, stack(1));
        await expect(page.locator(`${PANE_NODE}[data-id="mover"]`)).toBeVisible();
        await dragOnto(page, 'mover', 'target');
        await waitForCanvasState(page, (s) => s.nodes.find((n) => n.id === 'mover')?.parentId === 'target', 'Mover nested in Target');

        await seedCanvasState(page, stack(2));
        await signInFake(page);
        await expect(page.locator(`${PANE_NODE}[data-id="mover"]`)).toBeVisible();
        await dragOnto(page, 'mover', 'target');
        await waitForCanvasState(page, (s) => s.nodes.find((n) => n.id === 'mover')?.parentId === 'target', 'Mover nested in Target when signed in');
    });
});

test.describe('core: first visit (W)', () => {
    test.use({ firstVisit: true });

    test('W1 a first visit opens onto a welcome canvas, once', async ({ page }) => {
        await openCanvas(page);
        await waitForCanvasState(page, (s) => s.nodes.length === 3 && s.edges.length === 1, 'the welcome canvas');
        await expect(page.locator('input[value="Start here"]')).toBeVisible();

        // They are ordinary cards: delete them and they stay gone.
        await page.evaluate(() => {
            (window as unknown as { __appStore: { getState: () => { loadGraph: (n: unknown[], e: unknown[]) => void } } })
                .__appStore.getState().loadGraph([], []);
        });
        await expect.poll(async () => (await readCanvasState(page))?.nodes.length).toBe(0);
        await reload(page);
        expect((await readCanvasState(page))?.nodes).toHaveLength(0);
    });
});
