import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../support/fixtures';

test('login validates email and allows accessible password visibility', async ({ page }) => {
    await page.goto('/login');
    const email = page.getByLabel('Email address', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await expect(email).toBeVisible();
    await email.fill('invalid-email');
    await password.fill('disposable-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
});

for (const path of ['/login', '/signup']) {
    test(`WCAG serious and critical violations: ${path}`, async ({ page }, testInfo) => {
        await page.goto(path);
        await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        await testInfo.attach('accessibility', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
        expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    });
}

test('anonymous visitors cannot enter the administration dashboard', async ({ page }) => {
    await page.goto('/wajihadmin');
    await expect(page.getByRole('heading', { name: /Access Denied|Sign in|Restricted/i }).first()).toBeVisible();
    await expect(page.getByText('Total Users', { exact: true })).toHaveCount(0);
});
