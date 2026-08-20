import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Verification for the new copy / cut / paste layer.
 *
 * Each test builds its own canvas from scratch. The earlier audit shared one
 * canvas across every scenario and results swung between runs depending on what
 * ran before — independence is what makes these trustworthy.
 */

const MOUNT_TIMEOUT = 40000

async function dismissReminder(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss reminder' })
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click({ timeout: 2000 }).catch(() => {})
}

const nodeIds = (page: Page) =>
  page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getAttribute('data-id') || ''))

async function normalizeZoom(page: Page) {
  for (let i = 0; i < 14; i++) {
    const z = await page
      .locator('.react-flow__viewport')
      .evaluate((el) => {
        const m = /scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform || '')
        return m ? parseFloat(m[1]) : 1
      })
      .catch(() => 1)
    if (z >= 0.85 && z <= 1.2) return
    const btn = page.getByTitle(z < 0.85 ? 'Zoom In' : 'Zoom Out').first()
    if (!(await btn.isEnabled().catch(() => false))) return
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
}

/** Centre a card and leave it selected + interactive. */
async function bringIntoView(page: Page, node: Locator) {
  await dismissReminder(page)
  await normalizeZoom(page)
  const id = await node.getAttribute('data-id').catch(() => null)
  if (id) {
    await page.evaluate((n) => window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: n } })), id)
    await page.waitForTimeout(700)
  }
  const header = await page.locator('header').first().boundingBox().catch(() => null)
  const headerBottom = header ? header.y + header.height : 0
  for (let i = 0; i < 3; i++) {
    const box = await node.boundingBox().catch(() => null)
    if (!box) break
    const overlap = headerBottom - box.y
    if (overlap <= 8) break
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, -(overlap + 24))
    await page.waitForTimeout(200)
  }
  await node.click({ position: { x: 20, y: 20 }, force: true, timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(450)
}

const blurActive = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {})

/** Select a card and make sure focus is out of any text field, so canvas shortcuts fire. */
async function armCard(page: Page, node: Locator) {
  await bringIntoView(page, node)
  await node.click({ position: { x: 6, y: 6 }, force: true, timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
  await blurActive(page)
  await page.waitForTimeout(200)
  return node.evaluate((el) => el.classList.contains('selected')).catch(() => false)
}

async function addNoteCard(page: Page): Promise<Locator> {
  const before = new Set(await nodeIds(page))
  await dismissReminder(page)
  await page.getByTitle('Add New Note Card (Hover for modes)').click()
  await page.mouse.move(600, 650)
  await page.waitForTimeout(600)
  const after = await nodeIds(page)
  const fresh = after.find((id) => id && !before.has(id))
  const node = fresh
    ? page.locator(`.react-flow__node[data-id="${fresh}"]`)
    : page.locator('.react-flow__node').nth(after.length - 1)
  await expect(node).toBeVisible()
  await bringIntoView(page, node)
  await expect(node.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: MOUNT_TIMEOUT })
  return node
}

async function ensureVisible(page: Page, b: Locator) {
  await b.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  const header = await page.locator('header').first().boundingBox().catch(() => null)
  const top = header ? header.y + header.height : 0
  const bottom = (page.viewportSize()?.height ?? 900) - 120
  for (let i = 0; i < 4; i++) {
    const box = await b.boundingBox().catch(() => null)
    if (!box) return
    const above = top - box.y
    const below = box.y + box.height - bottom
    if (above <= 0 && below <= 0) return
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, above > 0 ? -(above + 30) : below + 30)
    await page.waitForTimeout(220)
    await b.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
  }
}

async function focusBlock(page: Page, node: Locator, index = 0) {
  const b = node.locator('[contenteditable="true"]').nth(index)
  await ensureVisible(page, b)
  await b.click({ timeout: 8000 })
  return b
}

async function blocksOf(node: Locator) {
  return node
    .locator('[data-block-type]')
    .evaluateAll((els) => els.map((el) => ({ type: el.getAttribute('data-block-type'), text: (el.textContent || '').trim() })))
    .catch(() => [])
}

/** Type markdown-shortcut lines, one block each. */
async function typeBlocks(page: Page, lines: string[]) {
  for (const line of lines) {
    await page.keyboard.type(line)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(120)
  }
}

async function openCanvas(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto('/canvas')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
  await page.waitForTimeout(700)
  await dismissReminder(page)
}

/** Shift+click a range of blocks. Returns the selection label, if any. */
async function selectBlocks(page: Page, node: Locator, from: number, to: number) {
  await focusBlock(page, node, from)
  await page.waitForTimeout(150)
  const end = node.locator('[contenteditable="true"]').nth(to)
  await ensureVisible(page, end)
  await end.click({ modifiers: ['Shift'], timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  return (await page.getByText(/Blocks? Selected/i).first().textContent().catch(() => null)) || ''
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 900 } })

test('blocks: Ctrl+C then Ctrl+V keeps headings, lists and to-dos intact', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusBlock(page, note)
  await typeBlocks(page, ['# Heading here', '* Bullet one', '[] Task one'])
  await page.keyboard.press('Escape')

  const label = await selectBlocks(page, note, 0, 2)
  expect(label, 'a multi-block selection should be possible').toBeTruthy()

  await page.keyboard.press('Control+c')
  await page.waitForTimeout(600)

  // The clipboard should carry readable text AND our structured payload.
  const html = await page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) if (item.types.includes('text/html')) return (await item.getType('text/html')).text()
    } catch {
      /* ignore */
    }
    return ''
  })
  expect(html, 'copy should write a rich HTML flavour carrying the blocks').toContain('data-chnkit-clipboard')

  const before = await blocksOf(note)
  const last = note.locator('[contenteditable="true"]').last()
  await ensureVisible(page, last)
  await last.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(1200)

  const after = await blocksOf(note)
  const gained = after.slice(before.length)
  const kinds = gained.map((g) => g.type)
  expect(kinds, `pasted blocks should keep their types, got ${kinds.join(', ')}`).toEqual(
    expect.arrayContaining(['heading1', 'bullet', 'todo']),
  )
})

test('blocks: Ctrl+X removes the selected blocks', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusBlock(page, note)
  await typeBlocks(page, ['First line', 'Second line', 'Third line'])
  await page.keyboard.press('Escape')

  const before = (await blocksOf(note)).length
  await selectBlocks(page, note, 0, 1)
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(900)

  const after = (await blocksOf(note)).length
  expect(after, `cut should remove blocks (had ${before})`).toBeLessThan(before)
})

test('blocks: pasting over selected text replaces it instead of duplicating', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  const block = await focusBlock(page, note)
  await page.keyboard.type('REPLACEME tail')
  await page.waitForTimeout(300)

  await page.evaluate(() => navigator.clipboard.writeText('NEWTEXT'))
  await block.dblclick() // select the word under the caret
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(800)

  const text = ((await block.textContent()) || '').trim()
  expect(text, `block reads "${text}"`).toContain('NEWTEXT')
  expect(text, 'the replaced word must not survive alongside the pasted text').not.toContain('REPLACEME')
})

test('cards: Ctrl+C then Ctrl+V produces a real copy of the card', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusBlock(page, note)
  await page.keyboard.type('Card body text')
  await page.keyboard.press('Escape')

  const titleInput = note.locator('input[placeholder="Untitled"]').first()
  await titleInput.click()
  await titleInput.press('Control+A')
  await titleInput.type('ORIGINAL')
  await titleInput.press('Enter')

  expect(await armCard(page, note), 'card should be selected').toBe(true)
  const before = await nodeIds(page)
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(600)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(1500)

  const after = await nodeIds(page)
  const freshId = after.find((id) => !before.includes(id))
  expect(freshId, 'a new card should appear').toBeTruthy()

  const clone = page.locator(`.react-flow__node[data-id="${freshId}"]`)
  const cloneTitle = (await clone.locator('input[placeholder="Untitled"]').first().inputValue().catch(() => '')) || ''
  expect(cloneTitle, `the copy should carry the original's title, got "${cloneTitle}"`).toContain('ORIGINAL')
})

test('cards: Ctrl+X removes the card and Ctrl+V brings it back', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  const titleInput = note.locator('input[placeholder="Untitled"]').first()
  await titleInput.click()
  await titleInput.press('Control+A')
  await titleInput.type('CUTME')
  await titleInput.press('Enter')

  expect(await armCard(page, note)).toBe(true)
  const before = (await nodeIds(page)).length
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(1000)
  const afterCut = (await nodeIds(page)).length
  expect(afterCut, 'cut should remove the card').toBeLessThan(before)

  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 400 } })
  await blurActive(page)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(1500)

  const restored = await page
    .locator('.react-flow__node input[placeholder="Untitled"]')
    .evaluateAll((els) => els.some((e) => (e as HTMLInputElement).value.includes('CUTME')))
    .catch(() => false)
  expect(restored, 'the cut card should paste back').toBe(true)
})

test('cards: duplicating two joined cards keeps the connection', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const a = await addNoteCard(page)
  const b = await addNoteCard(page)

  // Draw a connection from a -> b.
  await bringIntoView(page, a)
  await a.hover({ force: true }).catch(() => {})
  await page.waitForTimeout(300)
  const handle = a.locator('.react-flow__handle-right').first()
  const hb = await handle.boundingBox().catch(() => null)
  const tb = await b.boundingBox().catch(() => null)
  test.skip(!hb || !tb, 'could not reach the connection handle to build the fixture')
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + tb!.height / 2, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(800)

  const edgesBefore = await page.locator('.react-flow__edge').count()
  test.skip(edgesBefore === 0, 'no connection was created to test with')

  await armCard(page, a)
  await b.click({ position: { x: 6, y: 6 }, force: true, modifiers: ['Shift'] }).catch(() => {})
  await blurActive(page)
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+d')
  await page.waitForTimeout(1400)

  const edgesAfter = await page.locator('.react-flow__edge').count()
  expect(edgesAfter, `connections should be duplicated too (was ${edgesBefore})`).toBeGreaterThan(edgesBefore)
})

test('text copied out of the app is readable, with correct list numbering', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusBlock(page, note)
  await typeBlocks(page, ['1. Step one', '1. Step two', '1. Step three'])
  await page.keyboard.press('Escape')

  const label = await selectBlocks(page, note, 0, 2)
  expect(label).toBeTruthy()
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(600)

  const text = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  const markers = (text.match(/^\s*\d+\./gm) || []).map((m) => m.trim())
  expect(markers.length, `expected numbered markers, clipboard was "${text}"`).toBeGreaterThanOrEqual(3)
  expect(new Set(markers).size, `numbering should increment, got ${markers.join(' ')}`).toBeGreaterThanOrEqual(3)
})
