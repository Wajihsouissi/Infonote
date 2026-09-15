import { test, expect } from '../../support/fixtures';

test('closing search releases its worker on every mount', async ({ page }) => {
    await page.addInitScript(() => {
        const Original = window.Worker;
        const counts = { active: 0, created: 0 };
        Object.assign(window, { qaWorkers: counts });
        window.Worker = class extends Original {
            private ended = false;
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                counts.active++;
                counts.created++;
            }
            terminate() {
                if (!this.ended) counts.active--;
                this.ended = true;
                super.terminate();
            }
        };
    });
    await page.goto('/e2e/support/components.html');
    for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Open search', exact: true }).click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { qaWorkers: { active: number } }).qaWorkers.active)).toBe(1);
        await page.getByRole('button', { name: 'Close search', exact: true }).click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { qaWorkers: { active: number } }).qaWorkers.active)).toBe(0);
    }
});

test('Tabs supports keyboard navigation, disabled items and selection state', async ({ page }) => {
    await page.goto('/e2e/support/components.html');
    const first = page.getByRole('tab', { name: 'First', exact: true });
    const second = page.getByRole('tab', { name: 'Second', exact: true });
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Unavailable' })).toBeDisabled();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Selected section')).toHaveText('two');
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-selected', 'true');
});
