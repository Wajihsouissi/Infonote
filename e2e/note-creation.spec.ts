import { test, expect, type Page } from '@playwright/test'

/**
 * Types a markdown shortcut + text into the currently focused block, then
 * presses Enter to create the next block. BlockEditor auto-converts the
 * leading markdown token (e.g. "# ") into the corresponding block type.
 */
async function addBlock(page: Page, markdown: string) {
  await page.keyboard.type(markdown)
  await page.keyboard.press('Enter')
  // Focus handoff to the new block happens on the next frame; back-to-back
  // synthetic input with zero delay can outrun it and land in the block that
  // just lost focus (a real, if narrow, race — see BlockEditor.tsx's
  // useLayoutEffect focus handler).
  await page.waitForTimeout(75)
}

test('rich note creation: all block types, then reopen to verify organization', async ({ page }) => {
  await page.goto('/canvas')

  const canvas = page.locator('.react-flow__pane')
  await expect(canvas).toBeVisible()

  const nodesBefore = await page.locator('.react-flow__node').count()

  // "Add New Note Card" creates a proper multi-block note (type 'note', not
  // the special standalone canvas-block that spawns a new node on Enter).
  await page.getByTitle('Add New Note Card (Hover for modes)').click()

  await page.mouse.move(600, 650) // avoid lingering on the add button and opening its hover flyout
  const node = page.locator('.react-flow__node').nth(nodesBefore)
  await expect(node).toBeVisible()

  // Select and focus the card first: it settles the card's hover/drag
  // overlay, which otherwise can still intercept the very next click.
  await node.click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('f')

  // Click into the body's first (empty) block to focus it. The placeholder
  // text is CSS-generated from data-placeholder, so target the editable div.
  // The live block editor mounts on a scheduler (staggered after node
  // creation to avoid jank), so give it time to appear.
  const firstBlock = node.locator('[contenteditable="true"]').first()
  await expect(firstBlock).toBeVisible({ timeout: 10000 })
  await firstBlock.click()

  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('contenteditable', 'true')

  // Build one block of every major type via markdown auto-convert shortcuts.
  await addBlock(page, 'Plain paragraph text')
  await addBlock(page, '# Heading One')
  await addBlock(page, '## Heading Two')
  await addBlock(page, '### Heading Three')
  await addBlock(page, '* Bullet item')
  await addBlock(page, '1. Numbered item')
  await addBlock(page, '[] Todo item')
  await addBlock(page, '> Quoted text')
  // Converting to a divider auto-creates and focuses an empty block right
  // after it (dividers have no editable content of their own) — so type the
  // marker only, no trailing Enter, and keep typing straight into that block.
  // Three dashes are enough; the divider no longer waits for a trailing space,
  // which would otherwise land as leading whitespace in the block below and
  // stop the code fence on the next line from being recognised.
  await page.keyboard.type('---')
  await page.waitForTimeout(200)
  await page.keyboard.type('``` console.log("hello")')

  // Click away to blur/commit the last block.
  await page.keyboard.press('Escape')

  // Sanity-check block types landed correctly while still in the inline editor.
  await expect(node.locator('[data-block-type="text"]', { hasText: 'Plain paragraph text' })).toBeVisible()
  await expect(node.locator('[data-block-type="heading1"]', { hasText: 'Heading One' })).toBeVisible()
  await expect(node.locator('[data-block-type="heading2"]', { hasText: 'Heading Two' })).toBeVisible()
  await expect(node.locator('[data-block-type="heading3"]', { hasText: 'Heading Three' })).toBeVisible()
  await expect(node.locator('[data-block-type="bullet"]', { hasText: 'Bullet item' })).toBeVisible()
  await expect(node.locator('[data-block-type="numbered"]', { hasText: 'Numbered item' })).toBeVisible()
  await expect(node.locator('[data-block-type="todo"]', { hasText: 'Todo item' })).toBeVisible()
  await expect(node.locator('[data-block-type="quote"]', { hasText: 'Quoted text' })).toBeVisible()
  await expect(node.locator('[data-block-type="divider"]')).toBeVisible()
  await expect(node.locator('[data-block-type="code"]', { hasText: 'console.log("hello")' })).toBeVisible()

  // Enter the card (double-click opens the expanded/full editing view) to see
  // how the note is organized end to end.
  await node.dblclick()

  const expandedBlocks = node.locator('[data-block-type]')
  await expect(expandedBlocks.filter({ hasText: 'Plain paragraph text' })).toBeVisible()

  // Order should be preserved top-to-bottom in the reopened card.
  const types = await expandedBlocks.evaluateAll((els) => els.map((el) => el.getAttribute('data-block-type')))
  expect(types).toEqual([
    'text',
    'heading1',
    'heading2',
    'heading3',
    'bullet',
    'numbered',
    'todo',
    'quote',
    'divider',
    'code',
  ])

  // Todo checkbox should be present and untouched (unchecked).
  const todoCheckbox = node.locator('[data-block-type="todo"] input[type="checkbox"]')
  await expect(todoCheckbox).toBeVisible()
  await expect(todoCheckbox).not.toBeChecked()
})
