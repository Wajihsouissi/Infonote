import type { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { addNote, openCanvas, selectNode } from '../../support/canvas';
import { nodeByLabel, waitForCanvasState } from '../../support/canvasState';
import { BODY, PLAN_MINDMAP, PLAN_TWO_CARDS, openAIPanel, stubAI } from '../../support/aiStub';

/**
 * QA scenarios AI1–AI7 — "does the assistant do what it says it did?".
 *
 * The model is stubbed (see support/aiStub.ts) so these assert the parts the
 * app is responsible for: what it sends, what it places, what the trace claims,
 * and that Ask never touches the canvas.
 */

/** The panel's composer, whatever its placeholder says in this mode. */
const composer = (page: Page) => page.getByLabel('Ask AI');

async function send(page: Page, text: string) {
    await composer(page).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
}

/** The assistant turn as the store holds it. */
async function lastTurn(page: Page) {
    return page.evaluate(() => {
        const store = (window as unknown as { __appStore?: { getState: () => { aiMessages: Array<Record<string, unknown>> } } }).__appStore;
        const messages = store?.getState().aiMessages ?? [];
        return [...messages].reverse().find((m) => m.role === 'assistant') as
            | { status: string; text: string; error?: string; createdNodeIds: string[]; steps: Array<{ text: string; status?: string }> }
            | undefined;
    });
}

async function waitForTurn(page: Page, what: string) {
    await expect.poll(async () => (await lastTurn(page))?.status, { message: what, timeout: 20_000 }).toBe('done');
    return (await lastTurn(page))!;
}

test.describe('core: AI panel (AI)', () => {
    test('AI1 an Ask turn answers in the panel and leaves the canvas alone', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, {
            text: ['{"route":"answer","reason":"A general question."}'],
            stream: ['Lisbon is best seen on foot.'],
        });
        await openAIPanel(page, 'ask');

        await send(page, 'What is Lisbon like in spring?');

        const turn = await waitForTurn(page, 'the answer to finish');
        expect(turn.text).toContain('Lisbon is best seen on foot.');
        expect(turn.createdNodeIds, 'Ask must not place anything').toHaveLength(0);

        const state = await waitForCanvasState(page, () => true, 'the canvas');
        expect(state.nodes, 'the canvas is untouched by an Ask turn').toHaveLength(0);
        // The question reached the model; the canvas did not.
        expect(stub.prompts.some((p) => p.includes('What is Lisbon like in spring?'))).toBe(true);
        expect(stub.prompts.every((p) => !p.includes('[CARDS THE USER IS POINTING AT]'))).toBe(true);
    });

    test('AI2 a Create turn plans, places and fills in the cards it promised', async ({ page }) => {
        await openCanvas(page);
        const stub = await stubAI(page, {
            text: ['{"route":"create","shapes":["note"]}', PLAN_TWO_CARDS],
            stream: [BODY],
        });
        await openAIPanel(page, 'create');

        await send(page, 'Two cards about a weekend in Lisbon');

        const turn = await waitForTurn(page, 'the cards to be written');
        expect(turn.createdNodeIds).toHaveLength(2);

        const state = await waitForCanvasState(
            page,
            (s) => Boolean(nodeByLabel(s, 'Trains') && nodeByLabel(s, 'Food')),
            'both planned cards on the canvas',
        );
        const trains = nodeByLabel(state, 'Trains')!;
        const body = JSON.stringify(trains.data?.content ?? []);
        expect(body, 'the card carries the written body, not just its title').toContain('Trains run every ten minutes');
        expect(trains.data?.aiProvenance, 'an AI card records where it came from').toBeTruthy();

        // The run is a plan call plus one body call per card, each labelled so
        // the server can bucket them.
        expect(stub.phases).toContain('plan');
        expect(stub.phases).toContain('body');
    });

    test('AI3 a mind map is placed as connected nodes', async ({ page }) => {
        await openCanvas(page);
        await stubAI(page, { text: ['{"route":"create","shapes":["mindmap"]}', PLAN_MINDMAP] });
        await openAIPanel(page, 'create');

        await send(page, 'Mindmap of a weekend in Lisbon');

        await waitForTurn(page, 'the map to be placed');
        const state = await waitForCanvasState(page, (s) => s.nodes.length >= 3, 'the map nodes');
        expect(state.nodes.length).toBe(3);
        expect(state.edges.length, 'every child hangs off the root').toBe(2);
    });

    test('AI4 nothing is placed when the plan comes back unusable', async ({ page }) => {
        await openCanvas(page);
        // Malformed on the first pass and on the repair retry.
        await stubAI(page, { text: ['{"route":"create"}', 'sorry, I cannot do that', 'still not JSON'] });
        await openAIPanel(page, 'create');

        await send(page, 'Three cards about anything');

        await expect
            .poll(async () => (await lastTurn(page))?.status, { message: 'the turn to settle', timeout: 20_000 })
            .toBe('error');
        const turn = (await lastTurn(page))!;
        expect(turn.error).toContain('Nothing was added to the canvas');

        const state = await waitForCanvasState(page, () => true, 'the canvas');
        expect(state.nodes, 'a bad plan must never leave a half-made card').toHaveLength(0);
    });

    test('AI5 an edit turn rewrites the selected card and can be put back', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Rough notes');
        await selectNode(node);

        await stubAI(page, {
            text: [
                '{"route":"edit"}',
                JSON.stringify({ title: 'Trip notes', description: 'Tidied up', content: 'A clean paragraph about the trip.' }),
            ],
        });
        await openAIPanel(page, 'create');

        await send(page, 'Tidy this card up');
        await waitForTurn(page, 'the card to be rewritten');

        const after = await waitForCanvasState(page, (s) => Boolean(nodeByLabel(s, 'Trip notes')), 'the renamed card');
        const card = nodeByLabel(after, 'Trip notes')!;
        expect(JSON.stringify(card.data?.content)).toContain('A clean paragraph');

        // "Restore edited cards" puts the user's own writing back. Its
        // toolbar is revealed by hovering the turn, like every bubble action.
        const turnBubble = page.locator('[class*="assistantTurn"]').last();
        await turnBubble.hover();
        await page.getByRole('button', { name: 'Restore edited cards' }).click();
        await waitForCanvasState(page, (s) => Boolean(nodeByLabel(s, 'Rough notes')), 'the card as it was');
    });

    test('AI6 an answer can be kept on the canvas as a card', async ({ page }) => {
        await openCanvas(page);
        await stubAI(page, {
            text: ['{"route":"answer"}'],
            stream: ['## Getting around\n\nWalk, then take the 28.'],
        });
        await openAIPanel(page, 'ask');

        await send(page, 'How should I get around Lisbon?');
        await waitForTurn(page, 'the answer');

        await page.getByRole('button', { name: 'Create card' }).click();
        const state = await waitForCanvasState(page, (s) => s.nodes.length === 1, 'the kept answer');
        expect(JSON.stringify(state.nodes[0].data?.content)).toContain('Walk, then take the 28');
        expect(state.nodes[0].data?.aiProvenance, 'a kept answer is still AI-made').toBeTruthy();
    });

    test('AI7 the canvas is only read when it is attached', async ({ page }) => {
        await openCanvas(page);
        const node = await addNote(page, 'Budget');
        await selectNode(node);

        const stub = await stubAI(page, { text: ['{"route":"answer"}'], stream: ['Noted.'] });
        await openAIPanel(page, 'ask');

        // Selected, but not attached: the selection is not permission.
        await send(page, 'What am I missing?');
        await waitForTurn(page, 'the first answer');
        expect(stub.prompts.every((p) => !p.includes('Budget')), 'a selection alone must not be sent').toBe(true);

        // Attaching the canvas is what grants it.
        await page.evaluate(() => {
            const store = (window as unknown as { __appStore?: { getState: () => { addAIScopeSource: (s: unknown) => void; currentParentId: string | null } } }).__appStore;
            const state = store!.getState();
            state.addAIScopeSource({ kind: 'canvas', parentId: state.currentParentId });
        });
        await send(page, 'Now what am I missing?');
        await expect
            .poll(() => stub.prompts.filter((p) => p.includes('Now what am I missing?')).length, { message: 'the second question' })
            .toBeGreaterThan(0);

        const state = await waitForCanvasState(page, () => true, 'the canvas');
        expect(state.nodes, 'Ask still places nothing').toHaveLength(1);
    });
});
