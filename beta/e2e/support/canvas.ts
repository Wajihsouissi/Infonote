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
    // `/` is the landing page for a guest; the canvas has its own address.
    await page.goto('/canvas');
    await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
    // The workspace hydrates from IndexedDB before the store is live.
    await page.waitForFunction(() => Boolean((window as unknown as { __appStore?: unknown }).__appStore));
    await page.waitForTimeout(600);
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
    if (await node.locator('[data-complete-reader]').count()) {
        // Expanded content owns reading/editing gestures now. Select by the
        // upper header padding rather than clicking through its document body.
        const box = await node.boundingBox();
        await node.click({ modifiers, position: { x: box!.width / 2, y: Math.min(4, box!.height * .01) } });
        return;
    }
    await node.locator('.custom-drag-handle').first().click({ force: true, modifiers });
}

/**
 * Creates a note card with Ctrl+N and returns a locator frozen to its id.
 *
 * The new card is found by its visible "New Note" title input rather than by
 * node count: React Flow mounts and unmounts unrelated nodes as its culling
 * band settles, so the mounted set is not a stable oracle.
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

    if (label) {
        // New cards have a drag shield until selected. Filling the obscured
        // title loses focus and the app keeps "New Note".
        await selectNode(node);
        await setTitle(node, label);
    }
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

/** Brings a card to the centre of the viewport with the F shortcut. */
export async function focusNode(page: Page, node: Locator): Promise<void> {
    await selectNode(node);
    await blurEditor(page);
    await node.hover({ force: true }).catch(() => { /* off-screen; selection is enough */ });
    await page.keyboard.press('f');
    await page.waitForTimeout(900);
}

/**
 * Takes focus out of a card's block editor. Canvas shortcuts bail out while
 * focus is in an editable field, so without this `Delete` edits text instead
 * of removing the card and `f` is typed into the note.
 */
export async function blurEditor(page: Page): Promise<void> {
    const isEditing = () => page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    });
    if (!(await isEditing())) return;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect
        .poll(isEditing, { message: 'focus stayed inside the editor after Escape, so canvas shortcuts will be swallowed' })
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
    // '5' is the app's fit-view shortcut.
    await page.keyboard.press('5');
    await page.waitForTimeout(700);
}

/**
 * Finds a card by title after a reload and makes sure it is mounted. React Flow
 * culls off-screen nodes, so resolve the id from live state and fit the board.
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

/**
 * Waits until the workspace has actually been written to this device.
 *
 * Saving is debounced, so a reload that races it drops the last edit and the
 * test then blames the app for losing work the test never gave it time to
 * store.
 */
export async function waitForLocalSave(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const store = (window as unknown as {
                        __appStore?: { getState: () => { storage: { isLocalDirty: boolean } } };
                    }).__appStore;
                    return store?.getState().storage.isLocalDirty ?? null;
                }),
            { message: 'the workspace was still unsaved', timeout: 15_000 },
        )
        .toBe(false);
}

/** Reloads and waits for the canvas to come back up. */
export async function reload(page: Page): Promise<void> {
    await waitForLocalSave(page);
    await page.reload();
    await expect(page.locator(PANE)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
}
