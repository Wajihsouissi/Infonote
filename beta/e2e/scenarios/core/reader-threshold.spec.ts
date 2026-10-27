import { test, expect } from '../../support/fixtures';

test('complete expanded reading does not rebuild for overview threshold crossings', async ({ page }) => {
    // A real Vite document retains the server's address space and refresh
    // preamble; a fulfilled synthetic HTML document can fail Chromium's local
    // network checks for the HMR websocket before any assertion runs.
    await page.goto('/qa/reader-threshold.html');
    const complete = page.locator('[data-probe="complete"]');
    const compact = page.locator('[data-probe="compact"]');
    await expect(complete.getByText('Evidence paragraph 499', { exact: true })).toBeVisible();
    const reset = () => page.evaluate(() => (window as unknown as { __readerThresholdProbe: { reset: () => void } }).__readerThresholdProbe.reset());
    const commits = () => page.evaluate(() => (window as unknown as { __readerThresholdProbe: { commits: Record<string, number> } }).__readerThresholdProbe.commits);
    await reset();
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect(compact.getByText('Evidence paragraph 15', { exact: true })).toHaveCount(0);
    await expect(complete.getByText('Evidence paragraph 499', { exact: true })).toBeVisible();
    expect((await commits()).complete).toBe(0);
    expect((await commits()).compact).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(compact.getByText('Evidence paragraph 15', { exact: true })).toBeVisible();
    expect((await commits()).complete).toBe(0);
    await page.getByRole('button', { name: 'Switch presentation', exact: true }).click();
    await expect(complete.getByText('Evidence paragraph 499', { exact: true })).toHaveCount(0);
    await reset();
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect(complete.getByText('Evidence paragraph 15', { exact: true })).toHaveCount(0);
    expect((await commits()).complete).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Switch presentation', exact: true }).click();
    await expect(complete.getByText('Evidence paragraph 499', { exact: true })).toBeVisible();
    await reset();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(compact.getByText('Evidence paragraph 15', { exact: true })).toBeVisible();
    expect((await commits()).complete).toBe(0);
});
