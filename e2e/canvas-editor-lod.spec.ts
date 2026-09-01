import { test, expect, type Locator, type Page } from '@playwright/test';

async function addExpandedNote(page: Page, label: string): Promise<Locator> {
  await page.keyboard.press('Control+n');
  // React Flow may mount/unmount unrelated nodes as its culling band settles.
  // The newly created card is brought into view, so identify its visible title
  // rather than comparing the unstable set of mounted node IDs.
  const title = page.locator('input[value="New Note"]:visible').last();
  await expect(title).toBeVisible();
  const createdNote = title.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " react-flow__node ")]');
  await expect(createdNote).toBeVisible();
  const id = await createdNote.getAttribute('data-id');
  if (!id) throw new Error('New canvas note has no React Flow id');
  // `title.last()` is a live locator; freeze the node identity before another
  // card is created or it would begin pointing at the later card.
  const note = page.locator(`.react-flow__node[data-id="${id}"]`);

  // A card keeps its drag shield briefly after selection so React Flow can
  // finish its click bookkeeping before the editor claims pointer events.
  await selectNote(note);
  await expect(note.locator('[data-chnk-it-block-editor]')).toBeVisible({ timeout: 10000 });
  const cardTitle = note.locator('input[type="text"]').first();
  await cardTitle.fill(label);
  await cardTitle.press('Enter');
  return note;
}

async function selectNote(note: Locator, modifiers?: Array<'Shift'>) {
  const shield = note.locator('.interaction-overlay');
  if (await shield.count()) {
    await shield.click({ force: true, modifiers });
    return;
  }
  await note.locator('.custom-drag-handle').first().click({ force: true, modifiers });
}

test('canvas nodes keep their real block editors mounted when unselected', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/canvas');
  // A fresh local workspace can finish hydration on the dashboard even when
  // the URL is already `/canvas`; use the product navigation to enter it.
  const openCanvas = page.getByRole('button', { name: 'Open your canvas' });
  if (await openCanvas.isVisible().catch(() => false)) {
    await openCanvas.click();
  }
  await expect(page.locator('.react-flow__pane')).toBeVisible();
  // Seed cards hydrate asynchronously from the local workspace before keyboard
  // creation can be measured by node count.
  await page.waitForTimeout(800);

  const first = await addExpandedNote(page, 'LOD test first card');
  const previewText = 'Canvas read-only content stays real';
  await first.locator('[data-chnk-it-block-editor] [contenteditable="true"]').first().fill(previewText);
  await page.locator('.react-flow__pane').click({ position: { x: 16, y: 16 }, force: true });
  const second = await addExpandedNote(page, 'LOD test second card');
  expect(await first.getAttribute('data-id')).not.toEqual(await second.getAttribute('data-id'));
  // Creation may leave React Flow's selection callback one frame behind; make
  // the intended single selection explicit before asserting editor ownership.
  await page.locator('.react-flow__pane').click({ position: { x: 16, y: 16 }, force: true });
  await selectNote(second);

  // Changing the selection must not replace either card with a semantic preview.
  await expect(first.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(second.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(first.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);
  await expect(second.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);

  // Start from an explicit empty selection so this assertion is independent of
  // React Flow's asynchronous selected-node bookkeeping after card creation.
  await page.locator('.react-flow__pane').click({ position: { x: 16, y: 16 }, force: true });
  await selectNote(first);
  await expect(first.locator('[data-chnk-it-block-editor]')).toBeVisible({ timeout: 10000 });
  await expect(second.locator('[data-chnk-it-block-editor]')).toHaveCount(1);

  // Multi-selection changes interaction affordances, not the rendered content.
  await selectNote(second, ['Shift']);
  await expect(first.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(second.locator('[data-chnk-it-block-editor]')).toHaveCount(1);

  // The original content remains present through subsequent selection changes.
  await page.locator('.react-flow__pane').click({ position: { x: 16, y: 16 }, force: true });
  await selectNote(first);
  await expect(first.locator('[data-chnk-it-block-editor]')).toBeVisible({ timeout: 10000 });

  // Panning must not replace the real content with a semantic preview either.
  const pane = page.locator('.react-flow__pane');
  const box = await pane.boundingBox();
  if (!box) throw new Error('Canvas pane has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 30, { steps: 8 });
  await expect(first.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(first.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);
  await page.mouse.up({ button: 'middle' });
  await expect(first.locator('[data-chnk-it-block-editor]')).toBeVisible({ timeout: 10000 });
  await expect(first.locator('[data-chnk-it-block-editor]')).toContainText(previewText);
});

test('continuous zoom-out keeps the real card content mounted', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/canvas');
  const openCanvas = page.getByRole('button', { name: 'Open your canvas' });
  if (await openCanvas.isVisible().catch(() => false)) await openCanvas.click();
  const pane = page.locator('.react-flow__pane');
  await expect(pane).toBeVisible();
  await page.waitForTimeout(500);

  const note = await addExpandedNote(page, 'Zoom-out LOD card');
  const editor = note.locator('[data-chnk-it-block-editor]');
  await expect(editor).toBeVisible({ timeout: 10_000 });

  const box = await pane.boundingBox();
  if (!box) throw new Error('Canvas pane has no bounding box');
  // Use bare canvas, not the selected editor which intentionally owns its
  // own scroll wheel for article scrolling.
  await page.mouse.move(box.x + 24, box.y + 24);
  // Multiple small deltas reproduce a trackpad/wheel zoom, rather than a
  // one-off programmatic viewport jump.
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.wheel(0, 90);
  }

  await expect(editor).toBeVisible();
  await expect(note.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);
});

test('standalone canvas blocks remain live and never use snapshots', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/canvas');
  const openCanvas = page.getByRole('button', { name: 'Open your canvas' });
  if (await openCanvas.isVisible().catch(() => false)) await openCanvas.click();
  const pane = page.locator('.react-flow__pane');
  await expect(pane).toBeVisible();

  const standaloneNodes = page.locator('.react-flow__node-block');
  const existingIds = new Set(await standaloneNodes.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-id')).filter((id): id is string => Boolean(id)),
  ));
  const box = await pane.boundingBox();
  if (!box) throw new Error('Canvas pane has no bounding box');

  // The visible canvas context menu is the product's stable way of creating a
  // standalone block. Keyboard shortcuts are intentionally selection-aware,
  // which makes them the wrong setup for this rendering assertion.
  await page.mouse.click(box.x + 40, box.y + 40, { button: 'right' });
  await page.getByText('Add Block', { exact: true }).hover();
  await page.locator('[class*="submenuItem"]').filter({ hasText: /^Text$/ }).click();
  await expect.poll(async () => {
    const ids = await standaloneNodes.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-id')).filter((id): id is string => Boolean(id)),
    );
    return ids.find(id => !existingIds.has(id));
  }).not.toBeUndefined();
  const newId = await standaloneNodes.evaluateAll((nodes, oldIds) =>
    nodes.map(node => node.getAttribute('data-id')).find(id => id && !oldIds.includes(id)),
  [...existingIds]);
  if (!newId) throw new Error('Context menu did not create a standalone block');
  const standalone = page.locator(`.react-flow__node[data-id="${newId}"]`);
  await expect(standalone).toBeVisible();
  await expect(standalone.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(standalone.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 8 });
  await expect(standalone.locator('[data-chnk-it-block-editor]')).toHaveCount(1);
  await expect(standalone.locator('[data-canvas-card-preview="true"]')).toHaveCount(0);
  await page.mouse.up({ button: 'middle' });
});
