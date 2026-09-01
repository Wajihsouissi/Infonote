import { expect, type Locator, type Page } from '@playwright/test';
import { waitForCanvasState } from './canvasState';

/**
 * Interaction helpers for the canvas.
 *
 * Every wait in here exists because of a real asynchrony in the app, not as
 * padding: hydration from IndexedDB, React Flow's culling band settling, the
 * staggered block-editor mount, and the drag shield that owns pointer events
 * until a card has been selected once.
 */

export const PANE = '.react-flow__pane';
export const NODE = '.react-flow__node';
/** Marks the live (editable) block editor mounted on the sole idle selection. */
export const LIVE_EDITOR = '[data-chnk-it-block-editor]';
/** Marks the static read-only body a card falls back to when not selected. */
export const CARD_PREVIEW = '[data-canvas-card-preview="true"]';

/** Opens the canvas and waits until it is genuinely ready to be driven. */
export async function openCanvas(page: Page): Promise<void> {
    await page.goto('/canvas');

    // A fresh local workspace can settle on the dashboard even when the URL is
    // already /canvas; use the product's own entry point when it is offered.
    const entry = page.getByRole('button', { name: /Open your canvas|Open Canvas/i });
    if (await entry.isVisible().catch(() => false)) await entry.click();

    await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
    // Seed cards hydrate asynchronously; acting before that races the store.
    await page.waitForTimeout(1200);
    await dismissAnonReminder(page);
}

/**
 * The anonymous sign-in reminder is a bottom-centre toast that overlaps the
 * bottom menu. It is dismissible by design, so tests dismiss it rather than
 * clicking through it.
 */
export async function dismissAnonReminder(page: Page): Promise<void> {
    const dismiss = page.getByRole('button', { name: 'Dismiss reminder' });
    if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click().catch(() => { /* raced its own auto-hide */ });
    }
}

/** Clears any selection by clicking bare canvas in the top-left corner. */
export async function clickEmptyCanvas(page: Page): Promise<void> {
    await page.locator(PANE).click({ position: { x: 16, y: 16 }, force: true });
}

/**
 * Selects a card. A card keeps a drag shield over its body until it has been
 * selected once, so whichever of the two is currently present is the real
 * click target.
 */
export async function selectNode(node: Locator, modifiers?: Array<'Shift' | 'Control'>): Promise<void> {
    const shield = node.locator('.interaction-overlay');
    if (await shield.count()) {
        await shield.click({ force: true, modifiers });
        return;
    }
    await node.locator('.custom-drag-handle').first().click({ force: true, modifiers });
}

/**
 * Creates a note card with Ctrl+N and returns a locator frozen to its id.
 *
 * Identifying the new card by the visible "New Note" title input rather than
 * by node count is deliberate: React Flow mounts and unmounts unrelated nodes
 * as its culling band settles, so the mounted set is not a stable oracle.
 */
export async function addNote(page: Page, label?: string): Promise<Locator> {
    await page.keyboard.press('Control+n');

    const titleInput = page.locator('input[value="New Note"]:visible').last();
    await expect(titleInput).toBeVisible({ timeout: 15_000 });
    const created = titleInput.locator(
        'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " react-flow__node ")]',
    );
    const id = await created.getAttribute('data-id');
    if (!id) throw new Error('Newly created card has no React Flow data-id');
    const node = nodeById(page, id);

    if (label) await setTitle(node, label);
    return node;
}

export const nodeById = (page: Page, id: string): Locator =>
    page.locator(`${NODE}[data-id="${id}"]`);

export async function nodeId(node: Locator): Promise<string> {
    const id = await node.getAttribute('data-id');
    if (!id) throw new Error('Locator is not a React Flow node');
    return id;
}

/** Sets a card's title through its title input and commits it. */
export async function setTitle(node: Locator, label: string): Promise<void> {
    const input = node.locator('input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(label);
    await input.press('Enter');
}

/**
 * Focuses the card's live block editor and returns the editable body.
 * The editor mounts on a scheduler after selection, hence the long wait.
 */
export async function focusEditor(page: Page, node: Locator): Promise<Locator> {
    await selectNode(node);
    const editor = node.locator(LIVE_EDITOR);
    await expect(editor).toBeVisible({ timeout: 15_000 });
    const firstBlock = editor.locator('[contenteditable="true"]').first();
    await expect(firstBlock).toBeVisible({ timeout: 10_000 });
    await firstBlock.click();
    await expect(page.locator(':focus')).toHaveAttribute('contenteditable', 'true');
    return firstBlock;
}

/**
 * Types a markdown shortcut plus text into the focused block, then opens the
 * next one. The pause covers BlockEditor's focus handoff, which happens on the
 * next frame and can otherwise be outrun by zero-delay synthetic input.
 */
export async function typeBlock(page: Page, markdown: string): Promise<void> {
    await page.keyboard.type(markdown);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(90);
}

/**
 * Brings a card to the centre of the viewport. Cards created near the top of
 * the board sit under the fixed top bar, where their toolbar is unclickable —
 * focusing first is what a user does too.
 */
export async function focusNode(page: Page, node: Locator): Promise<void> {
    await selectNode(node);
    await blurEditor(page);
    await node.hover({ force: true }).catch(() => { /* off-screen; selection is enough */ });
    await page.keyboard.press('f');
    await page.waitForTimeout(900);
}

/**
 * Takes focus out of a card's block editor.
 *
 * Selecting a card mounts its live editor and hands it the caret, and every
 * canvas shortcut bails out early when focus is inside an editable field
 * (CanvasBoard's `isEditable` guard). Without this, `Delete` edits text
 * instead of removing the card and `f` is literally typed into the note.
 */
export async function blurEditor(page: Page): Promise<void> {
    const editing = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    });
    if (!editing) return;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect
        .poll(
            () => page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
            }),
            { message: 'focus stayed inside the editor after Escape, so canvas shortcuts will be swallowed' },
        )
        .toBe(false);
}

/** Selects a card, takes focus off its editor, and deletes it. */
export async function deleteNode(page: Page, node: Locator): Promise<void> {
    await selectNode(node);
    await blurEditor(page);
    await page.keyboard.press('Delete');
    await confirmNodeDeletion(page);
}

/** Confirms the product's protected branch-delete dialog. */
export async function confirmNodeDeletion(page: Page): Promise<void> {
    const dialog = page.getByRole('alertdialog', { name: 'Delete this knowledge branch?' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /^Delete \d+ cards?$/ }).click();
}

export async function fitView(page: Page): Promise<void> {
    // '5' is the app's fit-view shortcut (CanvasBoard keydown handler).
    await page.keyboard.press('5');
    await page.waitForTimeout(700);
}

/**
 * Finds a card by title after a reload and makes sure it is actually mounted.
 *
 * Matching on visible text is unreliable here: React Flow culls off-screen
 * nodes, so a restored card may exist in the document without being in the
 * DOM. Resolve the id from the live canvas state, fit the board, then locate it.
 */
export async function nodeByTitle(page: Page, label: string): Promise<Locator> {
    const state = await waitForCanvasState(
        page,
        (s) => s.nodes.some((n) => n.data?.label === label),
        `a card titled "${label}"`,
    );
    const id = state.nodes.find((n) => n.data?.label === label)!.id;
    await fitView(page);
    const node = nodeById(page, id);
    await expect(node, `card "${label}" exists in the document but never mounted`).toBeVisible({ timeout: 15_000 });
    return node;
}

/** Reloads and waits for the canvas to come back up. */
export async function reload(page: Page): Promise<void> {
    await page.reload();
    await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
}

/**
 * Drag one element onto another through dnd-kit.
 *
 * `dragTo()` and a single `mouse.move` both fail here: the board's PointerSensor
 * is configured with a 4px activation constraint (so that a card stays clickable
 * as well as draggable), and dnd-kit only starts measuring once it has seen
 * movement past that threshold. It wants a real gesture — press, several moves,
 * release — which is what this produces.
 *
 * Used by the board and calendar specs; any future dnd-kit surface should reuse
 * it rather than rediscovering the threshold.
 */
export async function dndDrag(page: Page, from: Locator, to: Locator, steps = 10): Promise<void> {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    if (!a || !b) throw new Error('dndDrag: one of the elements is not laid out');

    const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
            start.x + ((end.x - start.x) * i) / steps,
            start.y + ((end.y - start.y) * i) / steps,
        );
        await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
}
