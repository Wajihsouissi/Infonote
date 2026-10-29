import { test, expect } from '../../support/fixtures';
import { addNote, focusEditor, openCanvas, selectNode } from '../../support/canvas';
import { nodeByLabel, waitForCanvasState } from '../../support/canvasState';
import { stubAI } from '../../support/aiStub';

/**
 * QA scenarios AI8–AI10 — the AI that is not the panel.
 *
 * Three small surfaces that write in place: the "/" block inside a note, the
 * summary button beside a card's description, and Chunk it's suggestion for
 * where a long note should be cut. The model is stubbed; what is under test is
 * that each one puts its answer in the right place and nowhere else.
 */

test.describe('core: AI in place (AI)', () => {
    test('AI8 the AI block replaces itself with what it wrote', async ({ page }) => {
        await openCanvas(page);
        await stubAI(page, { text: ['## Packing\n\n- Passport\n- Charger'] });

        const node = await addNote(page, 'Trip');
        await selectNode(node);
        await focusEditor(page, node);
        await page.keyboard.type('/ai');
        await page.getByRole('option', { name: /Generate with AI/ }).first().click();

        const prompt = node.getByPlaceholder('Tell AI what to write…');
        await expect(prompt).toBeVisible();
        await prompt.fill('What should I pack?');
        await prompt.press('Enter');

        const state = await waitForCanvasState(
            page,
            (s) => JSON.stringify(nodeByLabel(s, 'Trip')?.data?.content ?? []).includes('Passport'),
            'the generated text in the note',
        );
        const blocks = JSON.stringify(nodeByLabel(state, 'Trip')!.data!.content);
        expect(blocks, 'markdown becomes real blocks, not one text blob').toContain('heading2');
        expect(blocks, 'the prompt box is gone once it has answered').not.toContain('"type":"ai"');
    });

    test('AI9 the summary button writes the card description', async ({ page }) => {
        await openCanvas(page);
        await stubAI(page, { text: ['Two nights in Lisbon.\nFlights are booked.'] });

        const node = await addNote(page, 'Lisbon');
        await selectNode(node);
        await focusEditor(page, node);
        await page.keyboard.type('We land on Friday and leave on Sunday.');
        await page.keyboard.press('Escape');

        await node.getByRole('button', { name: 'Summarize this card' }).click();

        const state = await waitForCanvasState(
            page,
            (s) => Boolean(nodeByLabel(s, 'Lisbon')?.data?.description),
            'the description to be written',
        );
        expect(nodeByLabel(state, 'Lisbon')!.data!.description).toContain('Two nights in Lisbon.');
    });

    test('AI10 Chunk it can be asked for better split boundaries', async ({ page }) => {
        await openCanvas(page);
        // Cut after block 0 only, whatever the headings would have done.
        await stubAI(page, { text: ['{"cuts":[0]}'] });

        const node = await addNote(page, 'Long note');
        await selectNode(node);
        await focusEditor(page, node);
        await page.keyboard.type('First idea');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Second idea');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Third idea');
        await page.keyboard.press('Escape');

        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: { getState: () => { nodes: Array<{ id: string; data: { label?: string } }>; setChunkItNodeId: (id: string) => void } } }).__appStore;
            const state = store!.getState();
            const card = state.nodes.find((n) => n.data.label === 'Long note');
            if (card) state.setChunkItNodeId(card.id);
        });

        const improve = page.getByRole('button', { name: /Improve splits/ });
        await expect(improve).toBeVisible();
        await improve.click();

        // Two sections: the AI asked for a cut after the first block.
        await expect(page.getByText(/AI suggested semantic boundaries|AI kept this as one cohesive section/)).toBeVisible();
        await expect(page.getByText('2 sections')).toBeVisible();
    });
});
