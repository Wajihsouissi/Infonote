import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Case study: a user plans a 2-day trip to Prague using the canvas.
 *
 * One continuous scenario (not split into many test() blocks) so it can be
 * watched end to end in a headed browser. Soft assertions are used
 * throughout so one broken feature doesn't hide the results of the rest —
 * everything gets checked, and the final report shows exactly what passed
 * and what didn't.
 */

const MOUNT_TIMEOUT = 40000 // live block editor mounts on a frame-paced scheduler; can take several seconds

/**
 * The "sign in to keep your work safe" reminder can pop up mid-run (it's
 * timer-based, not tied to anything this test does) and its backdrop
 * intercepts clicks across the whole page until dismissed. Clear it
 * whenever present so it doesn't block an otherwise-unrelated step.
 */
async function dismissSaveReminderIfPresent(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss reminder' })
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 2000 }).catch(() => {})
  }
}

/**
 * Re-selects and re-centers a card that may have drifted off a safe position
 * (e.g. after another card's own auto-pan). "Focus selected node" (f) fits
 * the node tightly to the viewport, which for a tall card can leave its top
 * edge right under the app's fixed header bar — nudge the canvas down
 * afterward so later interactions land on the card, not the header.
 */
async function recenterOn(page: Page, node: Locator) {
  await node.click({ position: { x: 20, y: 20 }, timeout: 8000, force: true })
  await page.keyboard.press('f')
  await page.waitForTimeout(400)

  // "f" fits the node tightly to the viewport but doesn't know about the
  // app's fixed header, so a tall card's top edge can end up behind it. Measure
  // the actual overlap and nudge by that much, re-checking rather than
  // guessing a fixed offset (wheel-delta-to-screen-pixel isn't 1:1 once zoom
  // is involved).
  const headerBox = await page.locator('header').first().boundingBox().catch(() => null)
  const headerBottom = headerBox ? headerBox.y + headerBox.height : 0
  const viewportHeight = page.viewportSize()?.height ?? 720

  for (let attempt = 0; attempt < 4; attempt++) {
    const box = await node.boundingBox()
    if (!box) break
    const overlapTop = headerBottom - box.y // >0 : card's top is under the header
    const overflowBottom = (box.y + box.height) - viewportHeight // >0 : card's bottom is below the viewport
    if (overlapTop <= 0 && overflowBottom <= 0) break

    const wheelDelta = overlapTop > 0 ? -(overlapTop + 20) : (overflowBottom + 20)
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, wheelDelta)
    await page.waitForTimeout(200)
  }
}

async function addNoteCard(page: Page, nodesBefore: number): Promise<{ node: Locator; mountMs: number }> {
  await page.getByTitle('Add New Note Card (Hover for modes)').click()
  // Move the mouse away immediately: lingering over the add button opens its
  // "Card Modes" hover flyout after 1s and covers the new card.
  await page.mouse.move(600, 650)
  const node = page.locator('.react-flow__node').nth(nodesBefore)
  await expect(node).toBeVisible()
  // The block editor only mounts once the card is within (or near) the
  // viewport — see the case-study report for why this matters. Select the
  // new card and focus it (the app's own "Focus selected node" shortcut)
  // rather than Fit View, which zooms out to fit every card and can shrink
  // the new one to an unclickable sliver.
  await node.click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  const firstBlock = node.locator('[contenteditable="true"]').first()
  const start = Date.now()
  await expect(firstBlock).toBeVisible({ timeout: MOUNT_TIMEOUT })
  return { node, mountMs: Date.now() - start }
}

async function setTitle(page: Page, node: Locator, title: string) {
  const titleInput = node.locator('input[placeholder="Untitled"]').first()
  await titleInput.click({ timeout: 8000 })
  await titleInput.press('Control+A')
  await titleInput.type(title)
  await titleInput.press('Enter') // blurs the title field per NoteExpandedContent's onKeyDown
}

/**
 * Types a markdown-shortcut block, then Enter to create the next block below it.
 *
 * The short pause after Enter is load-bearing, not decorative: block creation
 * hands focus to the new block asynchronously, and typing immediately after
 * Enter lands back in the block that just lost focus instead. Confirmed via a
 * standalone repro — see the case-study report. Real users type slowly enough
 * to never notice; scripted/fast input does not clear that timing window.
 */
async function markdownBlock(page: Page, markdown: string) {
  await page.keyboard.type(markdown)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}

/** Opens the slash menu, filters to `query`, and picks the top match. */
async function slashBlock(page: Page, query: string) {
  await page.keyboard.type('/')
  await page.waitForTimeout(200) // menu mount + its own search input taking focus
  await page.keyboard.type(query)
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}

test('Prague trip case study: plan a 2-day trip using the canvas', async ({ page }) => {
  test.setTimeout(150000)
  const results: { step: string; ok: boolean; note?: string }[] = []
  const record = (step: string, ok: boolean, note?: string) => {
    results.push({ step, ok, note })
  }

  await test.step('Load the canvas', async () => {
    await page.goto('/canvas')
    const canvas = page.locator('.react-flow__pane')
    try {
      await expect(canvas).toBeVisible()
      record('Canvas loads', true)
    } catch (e) {
      record('Canvas loads', false, String(e))
    }
  })

  let itinerary!: Locator

  await test.step('Create the itinerary card', async () => {
    const before = await page.locator('.react-flow__node').count()
    try {
      const { node, mountMs } = await addNoteCard(page, before)
      itinerary = node
      record('Create note card via "Add New Note Card"', true, `block editor mounted after ${mountMs}ms`)
    } catch (e) {
      record('Create note card via "Add New Note Card"', false, String(e))
      throw e
    }

    try {
      await setTitle(page, itinerary, 'Prague Trip – 2 Days')
      await expect.soft(itinerary.locator('input[placeholder="Untitled"]').first()).toHaveValue('Prague Trip – 2 Days')
      record('Set card title', true)
    } catch (e) {
      record('Set card title', false, String(e))
    }
  })

  await test.step('Write the itinerary using multiple block types', async () => {
    const firstBlock = itinerary.locator('[contenteditable="true"]').first()
    await firstBlock.click()

    await markdownBlock(page, 'Two days in Prague, packed with castles, bridges and good beer.')
    await markdownBlock(page, '# Overview')
    try {
      await slashBlock(page, 'callout')
      await page.keyboard.type('Schengen area — no visa needed for stays under 90 days. Currency: Czech koruna (CZK), not euros.')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(150)
      record('Insert callout block via slash menu', true)
    } catch (e) {
      record('Insert callout block via slash menu', false, String(e))
    }
    await markdownBlock(page, '## Day 1 — Old Town & Castle')
    await markdownBlock(page, '* Prague Castle and St. Vitus Cathedral')
    await markdownBlock(page, '* Charles Bridge at sunrise, before the crowds')
    await markdownBlock(page, '* Old Town Square and the Astronomical Clock')
    await markdownBlock(page, '* Dinner in Lesser Town')
    await markdownBlock(page, '## Day 2 — Vyšehrad & Museums')
    await markdownBlock(page, '1. Vyšehrad fortress and the river views')
    await markdownBlock(page, '1. National Museum')
    await markdownBlock(page, '1. Dancing House photo stop')
    await markdownBlock(page, '1. Farewell dinner with traditional guláš')
    await markdownBlock(page, '[] Passport (check expiry date)')
    await markdownBlock(page, '[] EU power adapter')
    await markdownBlock(page, '[] Comfortable walking shoes')
    await markdownBlock(page, '> Book Prague Castle tickets online — the queue at the gate can run over an hour.')
    // Code blocks treat plain Enter as a newline within the block (by
    // design), not "next block" — use Ctrl+Enter to add a block below it.
    await page.keyboard.type('``` flight: LHR-PRG 07:20, return PRG-LHR day 2 21:45')
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(150)
    // Divider goes last deliberately: converting a block to type "divider"
    // unmounts its contenteditable, and focus is not handed to anything
    // afterward. There is no way to keep typing right after inserting one —
    // see the case-study report.
    await page.keyboard.type('--- ')

    await page.keyboard.press('Escape')
  })

  await test.step('Verify each block type rendered with the right content', async () => {
    const checks: [string, string, string][] = [
      ['text', 'Two days in Prague', 'Intro paragraph (text block)'],
      ['heading1', 'Overview', 'Heading 1'],
      ['callout', 'Schengen area', 'Callout'],
      ['heading2', 'Day 1', 'Heading 2 (Day 1)'],
      ['bullet', 'Prague Castle and St. Vitus', 'Bullet list item'],
      ['heading2', 'Day 2', 'Heading 2 (Day 2)'],
      ['numbered', 'Vyšehrad fortress', 'Numbered list item'],
      ['todo', 'Passport', 'To-do item'],
      ['quote', 'Book Prague Castle tickets', 'Quote'],
      ['divider', '', 'Divider'],
      ['code', 'LHR-PRG', 'Code block'],
    ]
    for (const [type, text, label] of checks) {
      const locator = text
        ? itinerary.locator(`[data-block-type="${type}"]`, { hasText: text })
        : itinerary.locator(`[data-block-type="${type}"]`)
      const ok = await locator.first().isVisible().catch(() => false)
      record(`Block renders: ${label}`, ok)
      await expect.soft(locator.first()).toBeVisible()
    }
  })

  await test.step('Reopen the card and confirm block order is preserved', async () => {
    await itinerary.dblclick()
    const blocks = itinerary.locator('[data-block-type]')
    try {
      await expect.soft(blocks.first()).toBeVisible()
      const types = await blocks.evaluateAll((els) => els.map((el) => el.getAttribute('data-block-type')))
      // Converting to a divider now auto-creates and focuses a trailing empty
      // text block, since dividers have no editable content of their own to
      // hand focus back to (fixed — see the case-study report's finding).
      const expectedOrder = ['text', 'heading1', 'callout', 'heading2', 'bullet', 'bullet', 'bullet', 'bullet', 'heading2', 'numbered', 'numbered', 'numbered', 'numbered', 'todo', 'todo', 'todo', 'quote', 'code', 'divider', 'text']
      const ok = JSON.stringify(types) === JSON.stringify(expectedOrder)
      record('Block order preserved on reopen', ok, ok ? undefined : `got: ${JSON.stringify(types)}`)
    } catch (e) {
      record('Block order preserved on reopen', false, String(e))
    }
  })

  await test.step('Create a linked Packing List card', async () => {
    try {
      // Deselect the itinerary card first: "Focus selected node" (f) fits
      // the view to whatever is currently selected, and if the itinerary
      // were still selected alongside the new card it would fit both at
      // once, potentially shrinking the new card's title input to nothing.
      await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } })
      const before = await page.locator('.react-flow__node').count()
      const { node: packing, mountMs } = await addNoteCard(page, before)
      record('Second card block editor mount time', true, `${mountMs}ms`)
      await setTitle(page, packing, 'Packing List')
      const firstBlock = packing.locator('[contenteditable="true"]').first()
      await firstBlock.click({ timeout: 8000 })
      await markdownBlock(page, '[] Passport and boarding passes')
      await markdownBlock(page, '[] Phone charger')
      await page.keyboard.type('[] Umbrella (Prague rains in spring)')
      await page.keyboard.press('Escape')
      record('Create second linked card (Packing List)', true)

      // Connect Prague itinerary -> Packing List via a canvas edge. Creating
      // the packing card may have auto-panned the view (off-screen-card fix
      // above), potentially leaving the itinerary card partly under the
      // fixed top bar — re-select and focus it to bring it back into a safe,
      // fully-visible position first.
      await dismissSaveReminderIfPresent(page)
      await recenterOn(page, itinerary)
      const edgesBefore = await page.locator('.react-flow__edge').count()
      await itinerary.hover({ timeout: 8000 })
      const sourceHandle = itinerary.locator('.react-flow__handle-right')
      // The handle is pointer-events:none until ".card:hover" flips it on,
      // so a plain .hover() can stall waiting for it to "receive events". A
      // short bounded timeout keeps a genuine failure here from burning the
      // whole test's budget and cascading into every later step.
      await sourceHandle.hover({ timeout: 8000, force: true })
      const box = await sourceHandle.boundingBox()
      const targetBox = await packing.boundingBox()
      if (!box || !targetBox) throw new Error('Could not measure handle/card bounding boxes')

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
      await page.mouse.up()

      const edgesAfter = await page.locator('.react-flow__edge').count()
      const ok = edgesAfter > edgesBefore
      record('Connect the two cards with a canvas edge', ok, `edges before=${edgesBefore} after=${edgesAfter}`)
      await expect.soft(edgesAfter).toBeGreaterThan(edgesBefore)
    } catch (e) {
      record('Create second linked card / connect edge', false, String(e))
    }
  })

  await test.step('Search the canvas for the Prague card', async () => {
    try {
      await page.getByTitle('Search (Ctrl+F)').click({ timeout: 8000 })
      await page.keyboard.type('Prague')
      await page.waitForTimeout(500)
      const found = await page.getByText('Prague Trip', { exact: false }).first().isVisible().catch(() => false)
      record('Search finds the Prague card', found)
      await page.keyboard.press('Escape')
    } catch (e) {
      record('Search finds the Prague card', false, String(e))
    }
  })

  await test.step('Outline panel lists the itinerary headings', async () => {
    try {
      // Same re-centering as above — the itinerary card's on-screen position
      // can drift after other cards are created/focused.
      await dismissSaveReminderIfPresent(page)
      await recenterOn(page, itinerary)
      await itinerary.dblclick({ timeout: 8000 })
      // dblclick focuses a block for editing; blur it first so 't' hits the
      // global shortcut instead of being typed as a literal character.
      await page.keyboard.press('Escape')
      await page.keyboard.press('t')
      await page.waitForTimeout(500)
      const overviewListed = await page.getByText('Overview', { exact: false }).first().isVisible().catch(() => false)
      record('Outline panel lists headings', overviewListed)
      await page.keyboard.press('t')
    } catch (e) {
      record('Outline panel lists headings', false, String(e))
    }
  })

  await test.step('Zoom controls and fit view', async () => {
    try {
      const canvas = page.locator('.react-flow__viewport')
      const before = await canvas.getAttribute('style')
      await page.getByTitle('Zoom In').click({ timeout: 8000 })
      await page.getByTitle('Zoom In').click({ timeout: 8000 })
      const afterZoomIn = await canvas.getAttribute('style')
      await page.getByTitle('Fit View').click({ timeout: 8000 })
      await page.waitForTimeout(300)
      const afterFit = await canvas.getAttribute('style')
      const ok = before !== afterZoomIn && afterZoomIn !== afterFit
      record('Zoom in / Fit View change the viewport', ok, `before=${before} afterZoomIn=${afterZoomIn} afterFit=${afterFit}`)
    } catch (e) {
      record('Zoom in / Fit View change the viewport', false, String(e))
    }
  })

  await test.step('Undo restores a deleted card', async () => {
    try {
      const before = await page.locator('.react-flow__node').count()
      await itinerary.click({ position: { x: 10, y: 10 }, timeout: 8000 })
      await page.keyboard.press('Delete')
      await page.waitForTimeout(300)
      const afterDelete = await page.locator('.react-flow__node').count()
      await page.keyboard.press('Control+z')
      await page.waitForTimeout(300)
      const afterUndo = await page.locator('.react-flow__node').count()
      const ok = afterDelete === before - 1 && afterUndo === before
      record('Delete + Undo restores the card', ok, `before=${before} afterDelete=${afterDelete} afterUndo=${afterUndo}`)
    } catch (e) {
      record('Delete + Undo restores the card', false, String(e))
    }
  })

  await test.step('Report', async () => {
    const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.step}${r.note ? `  (${r.note})` : ''}`)
    console.log('\n=== PRAGUE TRIP CASE STUDY REPORT ===\n' + lines.join('\n') + '\n')
    await test.info().attach('case-study-report.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
    const failures = results.filter((r) => !r.ok)
    expect.soft(failures, `${failures.length} step(s) failed:\n${failures.map(f => f.step).join('\n')}`).toEqual([])
  })
})
