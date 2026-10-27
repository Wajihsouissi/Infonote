import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { openCanvas, PANE, reload } from '../../support/canvas';
import { makeCards, readCanvasState, seedCanvasState, waitForCanvasState } from '../../support/canvasState';

type TestStore = {
    getState: () => {
        auth: { isAuthenticated: boolean };
        currentParentId: string | null;
        fullscreenId: string | null;
        selectedCanvasNodeIds: Set<string>;
        setSelectedCanvasNodeIds: (ids: Set<string>) => void;
        setAuthUser: (user: { id: string; email: string; displayName: string }) => void;
    };
};

async function signInFixture(page: Page) {
    await page.evaluate(() => {
        (window as unknown as { __appStore: TestStore }).__appStore.getState().setAuthUser({
            id: 'scrum-18-user', email: 'qa@example.com', displayName: 'QA User',
        });
    });
}

async function settledGoto(page: Page, path: string) {
    await page.waitForLoadState('networkidle');
    await page.goto(path);
    await page.waitForLoadState('networkidle');
}

test.describe('SCRUM-18 app entry and personal workspace', () => {
    test.describe('SCRUM-65 first visit', () => {
        test.use({ firstVisit: true });

        test('landing entry seeds one welcome graph and reload keeps the same cards', async ({ page }, testInfo) => {
            await page.goto('/');
            await page.getByRole('button', { name: /Start writing/ }).click();
            await expect(page.locator(PANE)).toBeVisible();
            const first = await waitForCanvasState(page, (s) => s.nodes.length === 3 && s.edges.length === 1, 'welcome graph');
            expect(first.nodes.map((node) => node.data?.label).sort()).toEqual([
                'Open me: a note that maps itself', 'Start here', 'Things to try',
            ]);
            await page.screenshot({ path: testInfo.outputPath('guest-welcome.png') });

            // Firefox reports an aborted dynamic import as a page error if a
            // reload interrupts Vite's initial lazy module loading.
            await page.waitForLoadState('networkidle');
            await reload(page);
            await expect(page.locator(PANE)).toBeVisible();
            const afterReload = await waitForCanvasState(page, (s) => s.nodes.length === 3 && s.edges.length === 1, 'reloaded welcome graph');
            expect(afterReload.nodes.map((node) => node.id).sort()).toEqual(first.nodes.map((node) => node.id).sort());
            await page.waitForLoadState('networkidle');
        });
    });

    test('SCRUM-66 direct routes, guest fallback and browser Back', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /Start writing/ }).click();
        await expect(page.locator(PANE)).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.goBack();
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/');

        const routes: Array<[string, string]> = [
            ['/profile', 'Your workspace'], ['/login', 'Sign in'], ['/signup', 'Create your account'],
        ];
        for (const [path, heading] of routes) {
            await settledGoto(page, path);
            await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }
        await settledGoto(page, '/home');
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/');
        await settledGoto(page, '/unknown-scrum-18');
        await expect(page.getByRole('heading', { name: /Think in pieces/ })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('SCRUM-67 signed-in fixture lists local cards and opens the chosen card', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(3, 'Recent'));
        await signInFixture(page);
        await page.getByRole('button', { name: 'Your dashboard' }).click();
        await expect(page.getByRole('heading', { name: 'Welcome back, QA.' })).toBeVisible();
        await expect(page.getByText('3 cards on this device.')).toBeVisible();
        await expect(page.getByRole('button', { name: /Recent 2/ })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('local-dashboard.png') });

        await page.getByRole('button', { name: /Recent 2/ }).click();
        await expect(page.locator(PANE)).toBeVisible();
        const selected = await page.evaluate(() => {
            const state = (window as unknown as { __appStore: TestStore }).__appStore.getState();
            return Array.from(state.selectedCanvasNodeIds);
        });
        const graph = await readCanvasState(page);
        expect(selected).toHaveLength(1);
        expect(graph?.nodes.find((node) => node.id === selected[0])?.data?.label).toBe('Recent 2');

        await page.getByRole('button', { name: 'Account and backup' }).click();
        await expect(page.getByText(/Saved work stays in this browser/)).toBeVisible();
        await expect(page.getByText(/Unsaved changes are not part of its recovery copy/)).toBeVisible();
        await expect(page.getByText(/Keep a backup on another device/)).toBeVisible();
        await expect(page.getByText(/Signing in or out does not separate it or create a cloud backup/)).toBeVisible();
    });

    test('SCRUM-68 keyboard controls preserve graph and active selection across theme changes', async ({ page }, testInfo) => {
        await openCanvas(page);
        await seedCanvasState(page, makeCards(3, 'Theme'));
        await page.evaluate(() => {
            (window as unknown as { __appStore: TestStore }).__appStore.getState()
                .setSelectedCanvasNodeIds(new Set(['seed-1']));
        });
        // React Flow finishes its initial fit after the fixture is loaded.
        await page.waitForTimeout(1_000);
        const before = await readCanvasState(page);
        const selectedBefore = await page.evaluate(() => Array.from(
            (window as unknown as { __appStore: TestStore }).__appStore.getState().selectedCanvasNodeIds,
        ));
        expect(selectedBefore).toEqual(['seed-1']);
        const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style');
        const initialTheme = await page.locator('html').getAttribute('data-theme');
        const themeButton = page.getByRole('button', { name: `Switch to ${initialTheme === 'dark' ? 'light' : 'dark'} mode` });
        await themeButton.focus();
        await expect(themeButton).toBeFocused();
        await themeButton.press('Enter');
        await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
        const afterTheme = await readCanvasState(page);
        expect(afterTheme?.nodes).toEqual(before?.nodes);
        expect(afterTheme?.edges).toEqual(before?.edges);
        expect(await page.evaluate(() => Array.from(
            (window as unknown as { __appStore: TestStore }).__appStore.getState().selectedCanvasNodeIds,
        ))).toEqual(selectedBefore);
        expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewportBefore);

        const shortcuts = page.getByRole('button', { name: 'Open Keyboard Shortcuts' });
        await shortcuts.focus();
        await shortcuts.press('Enter');
        const panel = page.locator('#keyboard-shortcuts-panel');
        await expect(panel).toHaveAttribute('aria-hidden', 'false');
        await expect(page.getByRole('button', { name: 'Close shortcuts' })).toBeFocused();
        await expect(page.getByText('Open keyboard shortcuts')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('theme-shortcuts.png') });
        await page.keyboard.press('Escape');
        await expect(panel).toHaveAttribute('aria-hidden', 'true');
        await expect(panel).toHaveAttribute('inert', '');
        await expect(shortcuts).toBeFocused();
        const afterShortcuts = await readCanvasState(page);
        expect(afterShortcuts?.nodes).toEqual(before?.nodes);
        expect(afterShortcuts?.edges).toEqual(before?.edges);
    });
});
