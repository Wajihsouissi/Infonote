import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Markdown shortcut reliability.
 *
 * The bug these guard against was intermittent: the same keystrokes produced a
 * heading on one run and a plain paragraph on the next. A single pass proves
 * nothing, so the conversion tests repeat, and they run at BOTH a human typing
 * speed and zero delay — the fast path is the one that used to fail, because
 * the editor receives "# Hello" in a single event rather than "# " on its own.
 */

const MOUNT_TIMEOUT = 40000
const REPEATS = 8

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

async function openCanvas(page: Page) {
  await page.goto('/canvas')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
  await page.waitForTimeout(700)
  await dismissReminder(page)
}

/** The type + text of the block the caret is currently in. */
async function currentBlock(node: Locator) {
  const blocks = await node
    .locator('[data-block-type]')
    .evaluateAll((els) => els.map((el) => ({ type: el.getAttribute('data-block-type'), text: (el.textContent || '').trim() })))
    .catch(() => [])
  return blocks[blocks.length - 1] ?? { type: null, text: '' }
}

/** Focus the last (empty) block, ready to type a fresh line. */
async function focusLast(page: Page, node: Locator) {
  const b = node.locator('[contenteditable="true"]').last()
  await b.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await b.click({ timeout: 8000 })
  await b.press('End')
  return b
}

test.use({ viewport: { width: 1440, height: 900 } })

/**
 * One conversion, from a clean empty block, checked for BOTH the resulting type
 * and that the marker characters are gone from the visible text.
 */
const CONVERSIONS: Array<{ typed: string; expect: string; rest: string }> = [
  { typed: '# Heading one', expect: 'heading1', rest: 'Heading one' },
  { typed: '## Heading two', expect: 'heading2', rest: 'Heading two' },
  { typed: '### Heading three', expect: 'heading3', rest: 'Heading three' },
  { typed: '* Bullet item', expect: 'bullet', rest: 'Bullet item' },
  { typed: '- Dash bullet', expect: 'bullet', rest: 'Dash bullet' },
  { typed: '1. Numbered item', expect: 'numbered', rest: 'Numbered item' },
  { typed: '[] Task item', expect: 'todo', rest: 'Task item' },
  { typed: '> Quoted line', expect: 'quote', rest: 'Quoted line' },
]

for (const delay of [60, 0]) {
  test(`shortcuts convert every time at ${delay === 0 ? 'full speed' : 'human speed'}`, async ({ page }) => {
    test.setTimeout(300000)
    await openCanvas(page)
    const note = await addNoteCard(page)
    await focusLast(page, note)

    const failures: string[] = []

    for (let round = 0; round < REPEATS; round++) {
      /* Re-centre before each round. The note grows by eight blocks a round and
         eventually scrolls out of view, at which point the app unmounts its
         editor entirely (cards render lazily) — every block vanishes from the
         DOM and the checks below would report "no block" as a conversion
         failure. */
      await bringIntoView(page, note)
      await focusLast(page, note)

      for (const c of CONVERSIONS) {
        await page.keyboard.type(c.typed, { delay })
        await page.waitForTimeout(220)

        const got = await currentBlock(note)
        if (got.type !== c.expect) {
          failures.push(`round ${round}: "${c.typed}" -> ${got.type} (expected ${c.expect})`)
        } else if (!got.text.includes(c.rest)) {
          failures.push(`round ${round}: "${c.typed}" kept wrong text "${got.text}"`)
        } else if (got.text.includes(c.typed)) {
          // The whole typed string survived, marker and all — the conversion
          // fired but failed to consume its own marker characters.
          failures.push(`round ${round}: "${c.typed}" left the marker visible: "${got.text}"`)
        }

        /* Get back to a clean empty paragraph for the next case.
           Enter carries list types over (a bullet begets a bullet), and
           Backspace on an empty *text* block deletes it and drops the caret
           into the previous block — which would make every later case type
           into the heading above. So only press Backspace when the new block
           actually inherited a type that needs escaping. */
        await page.keyboard.press('Enter')
        await page.waitForTimeout(200)
        if ((await currentBlock(note)).type !== 'text') {
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(200)
        }
      }
    }

    expect(failures, `\n${failures.join('\n')}\n`).toEqual([])
  })
}

test('typing a shortcut inside a code block leaves it literal', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusLast(page, note)

  await page.keyboard.type('``` ')
  await page.waitForTimeout(400)
  expect((await currentBlock(note)).type, 'should be a code block first').toBe('code')

  await page.keyboard.type('# not a heading')
  await page.waitForTimeout(500)

  const got = await currentBlock(note)
  expect(got.type, 'a code block must never auto-convert').toBe('code')
  expect(got.text).toContain('# not a heading')
})

test('Backspace straight after a conversion gives the characters back', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  await focusLast(page, note)

  await page.keyboard.type('# ')
  await page.waitForTimeout(400)
  expect((await currentBlock(note)).type).toBe('heading1')

  await page.keyboard.press('Backspace')
  await page.waitForTimeout(500)

  const got = await currentBlock(note)
  expect(got.type, 'should be an ordinary line again').toBe('text')
  expect(got.text, 'the literal characters should be back').toContain('#')
})

test('pasted markdown produces the same blocks as typing it', async ({ page }) => {
  test.setTimeout(180000)
  await openCanvas(page)
  const note = await addNoteCard(page)
  const target = await focusLast(page, note)

  await target.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '# Heading\n- Bullet one\n- Bullet two\n1. Step one\n> Quote line\n[] Task')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(1000)

  const types = await note
    .locator('[data-block-type]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-block-type')))

  // `- ` must arrive as a bullet, matching what typing it now does.
  expect(types).toEqual(expect.arrayContaining(['heading1', 'bullet', 'numbered', 'quote', 'todo']))
  expect(types.filter((t) => t === 'bullet').length, 'both dash lines should be bullets').toBeGreaterThanOrEqual(2)
})
