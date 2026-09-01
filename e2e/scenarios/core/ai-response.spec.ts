import { test, expect } from '../../support/fixtures';
import { openCanvas } from '../../support/canvas';

type AssistantTurn = {
    id: string;
    role: 'assistant';
    text: string;
    steps: unknown[];
    intent: 'ask';
    status: 'streaming' | 'done';
    createdNodeIds: string[];
    at: string;
};

type TestStore = {
    getState: () => { aiMessages: AssistantTurn[] };
    setState: (partial: Record<string, unknown>) => void;
};

/**
 * Regression coverage for a subtle streaming bug: parseAIContent creates UUIDs
 * by design, so an AI line used to lose its selected/drag-ready state every
 * time a new chunk arrived. This writes a streamed append through the real
 * store without calling a real AI endpoint.
 */
test.describe('core: AI response reliability', () => {
    test('C18 preserves a selected AI line while the response grows', async ({ page }) => {
        await openCanvas(page);
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            store?.setState({
                isAIPanelOpen: true,
                aiMessages: [{
                    id: 'streaming-response',
                    role: 'assistant',
                    text: '## Weekly plan\n- Pick the three most important tasks\n- Reserve focused time',
                    steps: [],
                    intent: 'ask',
                    status: 'streaming',
                    createdNodeIds: [],
                    at: new Date().toISOString(),
                } satisfies AssistantTurn],
            });
        });

        const response = page.getByLabel('AI response blocks');
        await expect(response).toBeVisible();
        const firstLine = response.getByRole('button', { name: 'Select line for canvas drag' }).first();
        await firstLine.click();
        await expect(firstLine).toHaveAttribute('aria-pressed', 'true');

        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            const current = store?.getState().aiMessages ?? [];
            store?.setState({
                aiMessages: current.map((message) => ({
                    ...message,
                    text: `${message.text}\n- Link the related notes`,
                })),
            });
        });

        await expect(firstLine).toHaveAttribute('aria-pressed', 'true');
    });

    test('C19 renders readable response tables outside the canvas editor grid', async ({ page }) => {
        await openCanvas(page);
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            store?.setState({
                isAIPanelOpen: true,
                aiMessages: [{
                    id: 'readable-table-response',
                    role: 'assistant',
                    text: `## Revision methods\nUse these methods in rotation.\n\n| Method | What to do | Frequency |\n| --- | --- | --- |\n| Active recall | Close the notes, then write everything you remember. | Daily |\n| Past papers | Answer questions under timed conditions. | Twice a week |`,
                    steps: [],
                    intent: 'ask',
                    status: 'done',
                    createdNodeIds: [],
                    at: new Date().toISOString(),
                } satisfies AssistantTurn],
            });
        });

        const response = page.getByLabel('AI response blocks');
        const tableRegion = response.getByLabel('AI response table');
        await expect(tableRegion).toBeVisible();
        await expect(tableRegion.locator('th')).toHaveCount(3);
        await expect(tableRegion.locator('td')).toHaveCount(6);

        const layout = await tableRegion.evaluate((region) => {
            const table = region.querySelector('table')!;
            const cell = table.querySelector('td')!;
            const tableStyle = getComputedStyle(table);
            const cellStyle = getComputedStyle(cell);
            const regionStyle = getComputedStyle(region);
            return {
                regionClass: region.className,
                tableClass: table.className,
                overflowX: regionStyle.overflowX,
                fontSize: tableStyle.fontSize,
                wordSpacing: tableStyle.wordSpacing,
                wordBreak: cellStyle.wordBreak,
                minWidth: cellStyle.minWidth,
            };
        });

        expect(layout.regionClass).toContain('responseTableScroll');
        expect(layout.tableClass).toContain('responseTable');
        expect(layout.overflowX).toBe('auto');
        expect(layout.fontSize).toBe('13px');
        expect(layout.wordSpacing).not.toBe('normal');
        expect(layout.wordBreak).toBe('normal');
        expect(Number.parseFloat(layout.minWidth)).toBeGreaterThanOrEqual(100);
    });

    test('C20 keeps the active AI status in one animated trace row', async ({ page }) => {
        await openCanvas(page);
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            store?.setState({
                isAIPanelOpen: true,
                aiMessages: [{
                    id: 'single-live-trace',
                    role: 'assistant',
                    text: '',
                    steps: [{
                        id: 'planning',
                        kind: 'action',
                        status: 'running',
                        text: 'Working out what to build',
                    }],
                    intent: 'ask',
                    status: 'streaming',
                    createdNodeIds: [],
                    at: new Date().toISOString(),
                } satisfies AssistantTurn],
            });
        });

        const status = page.getByText('Working out what to build', { exact: true });
        await expect(status).toHaveCount(1);
        await expect(status).toHaveClass(/toggleLabel/);
    });

    test('C21 hides empty AI context and exposes canvas notes only after an explicit @Canvas attachment', async ({ page }) => {
        await openCanvas(page);
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            store?.setState({
                isAIPanelOpen: true,
                selectedCanvasNodeIds: new Set(['selected-but-unattached']),
            });
        });

        await expect(page.getByLabel('AI context')).toHaveCount(0);

        const composer = page.getByPlaceholder('Describe what to build…  @ for context, / for commands');
        await composer.fill('@canvas');
        await expect(page.getByRole('listbox', { name: 'Attach context' })).toBeVisible();
        await page.keyboard.press('Enter');

        const context = page.getByLabel('AI context');
        await expect(context).toBeVisible();
        await expect(context.getByText(/@Canvas/)).toBeVisible();
        await expect(context.locator('xpath=ancestor::div[contains(@class, "composer")][1]')).toHaveCount(1);
    });

    test('C22 renders answer creation actions as icon-only ghost buttons', async ({ page }) => {
        await openCanvas(page);
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: TestStore }).__appStore;
            store?.setState({
                isAIPanelOpen: true,
                aiMessages: [{
                    id: 'answer-actions',
                    role: 'assistant',
                    text: 'Here is a concise answer you can turn into a canvas item.',
                    steps: [],
                    intent: 'ask',
                    status: 'done',
                    createdNodeIds: [],
                    at: new Date().toISOString(),
                } satisfies AssistantTurn],
            });
        });

        const actions = page.getByRole('group', { name: 'Create from this answer' });
        await expect(actions).toBeVisible();
        await expect(actions.getByRole('button')).toHaveCount(4);
        await expect(actions.getByRole('button', { name: 'Create card' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Add as mind map' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Make a plan' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Create board' })).toBeVisible();
        await expect(actions.locator('button')).toHaveText(['', '', '', '']);

        const firstActionStyle = await actions.getByRole('button', { name: 'Create card' }).evaluate((button) => {
            const style = getComputedStyle(button);
            return { display: style.display, width: style.width, height: style.height };
        });
        expect(firstActionStyle).toEqual({ display: 'grid', width: '32px', height: '32px' });
    });
});
