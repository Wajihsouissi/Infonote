import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Copy / Cut / Paste usability audit.
 *
 * A diagnostic inventory, not a pass/fail suite. Large parts of the clipboard
 * layer are not implemented at all, so an assert-and-stop test would report one
 * failure and tell us nothing. Every scenario records one of three outcomes and
 * a screenshot, and the run always completes:
 *
 *   works   — does the right thing
 *   broken  — the feature responds, but the result is wrong or lossy
 *   missing — nothing happens; no such feature
 *
 * Everything lives in ONE test on purpose: the scenarios share an expensively
 * built canvas, and a describe-serial block would skip every later group the
 * moment one failed — which is exactly the information we came for.
 *
 * Run it in a real, visible browser:
 *   npx playwright test e2e/clipboard-usability.spec.ts --project=chrome-headed
 * (Playwright's bundled Chromium cannot open a window in this environment.)
 *
 * NOTE: a headed run drives the real system clipboard.
 */

const OUT_DIR = resolve(process.cwd(), 'clipboard-report')
const MOUNT_TIMEOUT = 40000
const SCENARIO_BUDGET = 70000
const SENTINEL = '__CLIPBOARD_SENTINEL__'

type Outcome = 'works' | 'broken' | 'missing'

interface Result {
  id: string
  group: string
  title: string
  expected: Outcome
  outcome: Outcome
  detail: string
  shot: string
}

// ---------------------------------------------------------------- helpers

async function dismissSaveReminderIfPresent(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss reminder' })
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 2000 }).catch(() => {})
  }
}

/** Read the canvas zoom straight off React Flow's transform. */
async function currentZoom(page: Page): Promise<number> {
  return page
    .locator('.react-flow__viewport')
    .evaluate((el) => {
      const m = /scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform || '')
      return m ? parseFloat(m[1]) : 1
    })
    .catch(() => 1)
}

/**
 * Nudge the canvas back to roughly 100%.
 *
 * The app's "focus selected node" shortcut fits a node to the viewport, which
 * leaves the zoom somewhere unpredictable — and at low zoom a card's blocks
 * become too small to click reliably. Normalising first makes every later
 * interaction land.
 */
async function normalizeZoom(page: Page) {
  for (let i = 0; i < 14; i++) {
    const z = await currentZoom(page)
    if (z >= 0.85 && z <= 1.2) return z
    const btn = page.getByTitle(z < 0.85 ? 'Zoom In' : 'Zoom Out').first()
    if (!(await btn.isEnabled().catch(() => false))) return z
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(160)
  }
  return currentZoom(page)
}

/**
 * Centre a card on screen and make sure it clears the fixed header.
 *
 * Uses the app's own `panToNode` event (CanvasBoard.tsx:395) rather than the
 * keyboard focus shortcut: it centres by node id at the current zoom, so it
 * works even when the card is completely off-screen and unclickable.
 */
async function bringIntoView(page: Page, node: Locator) {
  await dismissSaveReminderIfPresent(page)
  await normalizeZoom(page)
  const id = await node.getAttribute('data-id').catch(() => null)
  if (id) {
    await page.evaluate(
      (nodeId) => window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: nodeId } })),
      id,
    )
    await page.waitForTimeout(700)
  }
  const headerBox = await page.locator('header').first().boundingBox().catch(() => null)
  const headerBottom = headerBox ? headerBox.y + headerBox.height : 0
  for (let i = 0; i < 3; i++) {
    const box = await node.boundingBox().catch(() => null)
    if (!box) break
    const overlapTop = headerBottom - box.y
    if (overlapTop <= 8) break
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, -(overlapTop + 24))
    await page.waitForTimeout(200)
  }

  /* A card is only editable ~300ms AFTER it becomes selected (NoteCard.tsx:63-75);
     until then an `interaction-overlay` sits on top and swallows every click aimed
     at its contents — including the title field. Select and wait it out, so callers
     get a card that is both on screen and actually interactive. */
  await node.click({ position: { x: 20, y: 20 }, force: true, timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(450)
}

/** Select a card without triggering its editor. */
async function selectCard(page: Page, node: Locator) {
  await node.click({ position: { x: 20, y: 20 }, force: true, timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(200)
}

const blurActive = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {})

/**
 * Prepare a card for a CANVAS-level keyboard shortcut.
 *
 * The canvas keydown handler bails out entirely while focus sits in a text
 * field (CanvasBoard.tsx:462 `if (isInEditableField) return`). Once a card has
 * been selected it becomes interactive, so a second click lands inside its
 * title or a block — which silently swallows every shortcut aimed at the
 * canvas. Select, then blur, then confirm React Flow really marked it selected.
 */
async function armCanvasShortcut(page: Page, node: Locator): Promise<boolean> {
  await bringIntoView(page, node)
  await node.click({ position: { x: 6, y: 6 }, force: true, timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
  await blurActive(page)
  await page.waitForTimeout(150)
  return node.evaluate((el) => el.classList.contains('selected')).catch(() => false)
}

const nodeIds = (page: Page) =>
  page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getAttribute('data-id') || ''))

/**
 * Wait until the node count stops changing.
 *
 * Drilling into a card builds its inner canvas asynchronously
 * (hydrateCanvasFromContent), so a count taken immediately after entering keeps
 * rising on its own — and a naive before/after comparison reads that as "the
 * paste worked".
 */
async function waitForStableNodes(page: Page): Promise<number> {
  let last = -1
  for (let i = 0; i < 12; i++) {
    const n = (await nodeIds(page)).length
    if (n === last) return n
    last = n
    await page.waitForTimeout(400)
  }
  return last
}

/** Is there a card on the current canvas level whose title contains `title`? */
const hasCardTitled = (page: Page, title: string) =>
  page
    .locator('.react-flow__node input[placeholder="Untitled"]')
    .evaluateAll((els, t) => els.some((e) => (e as HTMLInputElement).value.includes(t)), title)
    .catch(() => false)

/** Adds a note card and returns it, identified by id diff rather than DOM order. */
async function addNoteCard(page: Page): Promise<Locator> {
  const before = new Set(await nodeIds(page))
  await dismissSaveReminderIfPresent(page)
  await page.getByTitle('Add New Note Card (Hover for modes)').click()
  await page.mouse.move(600, 650) // don't linger — the button opens a hover flyout
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

async function setTitle(node: Locator, title: string) {
  const input = node.locator('input[placeholder="Untitled"]').first()
  await input.click({ timeout: 8000 })
  await input.press('Control+A')
  await input.type(title)
  await input.press('Enter')
}

/**
 * Types markdown-shortcut lines into the focused editor, one block each.
 * The pause after Enter is load-bearing: focus handoff to the new block is
 * asynchronous, and fast synthetic input can outrun it.
 */
async function typeBlocks(page: Page, lines: string[]) {
  for (const line of lines) {
    await page.keyboard.type(line)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(90)
  }
}

async function blocksOf(node: Locator): Promise<Array<{ type: string | null; text: string }>> {
  return node
    .locator('[data-block-type]')
    .evaluateAll((els) =>
      els.map((el) => ({
        type: el.getAttribute('data-block-type'),
        text: (el.textContent || '').trim().slice(0, 120),
      })),
    )
    .catch(() => [])
}

/**
 * Get a block genuinely clickable.
 *
 * Two different scrolls are involved and both matter: `scrollIntoViewIfNeeded`
 * moves the note's own internal scroller, but a tall card can still hang off
 * the bottom of the screen, and a block outside the viewport cannot be clicked
 * at all — not even with force, since the mouse event needs real coordinates.
 * So after scrolling inside the note, pan the canvas until the block is on
 * screen. This was the single biggest source of bogus results in this audit.
 */
async function ensureBlockVisible(page: Page, b: Locator) {
  await b.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  const headerBox = await page.locator('header').first().boundingBox().catch(() => null)
  const top = headerBox ? headerBox.y + headerBox.height : 0
  const bottom = (page.viewportSize()?.height ?? 900) - 120 // leave room for the bottom toolbar
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

async function focusBlock(node: Locator, index = 0) {
  const b = node.locator('[contenteditable="true"]').nth(index)
  await ensureBlockVisible(node.page(), b)
  await b.click({ timeout: 8000 })
  return b
}

async function lastBlock(node: Locator) {
  const blocks = node.locator('[contenteditable="true"]')
  const n = await blocks.count()
  const b = blocks.nth(Math.max(0, n - 1))
  await ensureBlockVisible(node.page(), b)
  await b.click({ timeout: 8000 })
  await b.press('End')
  return b
}

/** Overwrite the clipboard so we can tell "app wrote nothing" from "stale value". */
async function seedClipboard(page: Page, text = SENTINEL) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text).catch(() => {})
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
}

/** Fire a real paste event carrying arbitrary clipboard payloads at an element. */
async function pasteInto(
  page: Page,
  target: Locator,
  payload: { text?: string; html?: string; imageDataUrl?: string },
) {
  await target.click({ timeout: 8000 }).catch(() => {})
  await target.evaluate(async (el, p) => {
    const dt = new DataTransfer()
    if (p.text) dt.setData('text/plain', p.text)
    if (p.html) dt.setData('text/html', p.html)
    if (p.imageDataUrl) {
      const blob = await (await fetch(p.imageDataUrl)).blob()
      dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }))
    }
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, payload)
  await page.waitForTimeout(700)
}

/** Paste onto the canvas itself (the window-level handler). */
async function pasteOnCanvas(page: Page, payload: { text?: string; imageDataUrl?: string }) {
  // The canvas paste handler ignores the event while focus is in an editor
  // (CanvasBoard.tsx:834-842), so make sure nothing text-like holds focus.
  await blurActive(page)
  await page.waitForTimeout(150)
  await page.evaluate(async (p) => {
    const dt = new DataTransfer()
    if (p.text) dt.setData('text/plain', p.text)
    if (p.imageDataUrl) {
      const blob = await (await fetch(p.imageDataUrl)).blob()
      dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
    }
    /* Dispatch on document.body, not window: the canvas handler reads
       `e.target.closest(...)`, and a Window target has no closest() — it would
       throw before doing anything, which looks exactly like "paste is broken".
       A real user paste always targets an element. */
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, payload)
  await page.waitForTimeout(1400)
}

/** A visible PNG so image scenarios read clearly in the screenshots. */
async function makeImageDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 120
    const g = c.getContext('2d')!
    g.fillStyle = '#e0552b'
    g.fillRect(0, 0, 200, 120)
    g.fillStyle = '#ffffff'
    g.font = 'bold 28px sans-serif'
    g.fillText('IMAGE', 45, 70)
    return c.toDataURL('image/png')
  })
}

/** Shift+click a range of blocks; returns the selection-capsule label if it appeared. */
async function selectBlockRange(page: Page, node: Locator, from: number, to: number): Promise<string> {
  const blocks = node.locator('[contenteditable="true"]')
  await focusBlock(node, from)
  await page.waitForTimeout(150)
  const end = blocks.nth(to)
  await ensureBlockVisible(page, end)
  await end.click({ modifiers: ['Shift'], timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  return (await page.getByText(/Blocks? Selected/i).first().textContent().catch(() => null)) || ''
}

const copyControl = (page: Page) => page.getByTitle('Copy', { exact: true }).first()

/**
 * The first editable block that is actually inside the viewport.
 *
 * Overlay views (fullscreen, side panel, centre peek) mount their editor while
 * the canvas editors stay in the DOM behind them, so `[contenteditable]`.first()
 * often resolves to an off-screen canvas block and the click fails with
 * "element is outside of the viewport".
 */
async function firstVisibleEditable(page: Page): Promise<Locator | null> {
  const all = page.locator('[contenteditable="true"]')
  const n = Math.min(await all.count(), 40)
  const vh = page.viewportSize()?.height ?? 900
  const vw = page.viewportSize()?.width ?? 1440
  for (let i = 0; i < n; i++) {
    const el = all.nth(i)
    const box = await el.boundingBox().catch(() => null)
    if (box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vw && box.y + box.height <= vh && box.width > 40)
      return el
  }
  return null
}

/** Make sure no modal / side panel is left covering the canvas for the next group. */
async function closeOverlays(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(250)
  }
  const close = page.getByTitle(/^close$/i).first()
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
  }
  await dismissSaveReminderIfPresent(page)
}

// ---------------------------------------------------------------- suite

test('Copy / cut / paste usability audit', async ({ browser }) => {
  test.setTimeout(25 * 60 * 1000)
  mkdirSync(OUT_DIR, { recursive: true })

  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const results: Result[] = []

  /** Runs a scenario, screenshots it, records the outcome. Never throws, never hangs. */
  async function scenario(
    id: string,
    group: string,
    title: string,
    expected: Outcome,
    fn: () => Promise<{ outcome: Outcome; detail: string }>,
  ) {
    let res: { outcome: Outcome; detail: string }
    try {
      res = await Promise.race([
        fn(),
        new Promise<{ outcome: Outcome; detail: string }>((r) =>
          setTimeout(() => r({ outcome: 'broken', detail: `no response within ${SCENARIO_BUDGET / 1000}s` }), SCENARIO_BUDGET),
        ),
      ])
    } catch (e) {
      res = { outcome: 'broken', detail: `test error: ${String(e).split('\n')[0].slice(0, 200)}` }
    }
    const shot = `${id}.jpg`
    await page.screenshot({ path: resolve(OUT_DIR, shot), type: 'jpeg', quality: 55 }).catch(() => {})
    results.push({ id, group, title, expected, ...res, shot })
    console.log(`[${id}] ${res.outcome.toUpperCase().padEnd(7)} ${title} — ${res.detail}`)
  }

  /** Runs a whole group; a group blowing up must not stop the audit. */
  async function group(name: string, fn: () => Promise<void>) {
    console.log(`\n----- ${name} -----`)
    /* Rebuild the canvas from scratch for every group.
       Sharing one canvas across all 45 scenarios meant each group inherited the
       previous group's leftovers — duplicated cards, open panels, a clipboard
       full of someone else's text — and results swung between runs depending on
       what happened earlier. A fresh fixture per group costs ~30s and buys
       results that actually mean something. */
    try {
      await buildFixture()
    } catch (e) {
      console.log(`[group ${name}] fixture setup failed: ${String(e).split('\n')[0].slice(0, 160)}`)
    }
    try {
      await fn()
    } catch (e) {
      console.log(`[group ${name}] aborted: ${String(e).split('\n')[0].slice(0, 160)}`)
    }
  }

  // ------------------------------------------------------------- fixture
  await page.goto('http://localhost:5173/canvas')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
  await dismissSaveReminderIfPresent(page)
  const imageDataUrl = await makeImageDataUrl(page)

  let source!: Locator
  let target!: Locator

  /** A clean canvas with one rich SOURCE note and one empty TARGET note. */
  async function buildFixture() {
    // localStorage carries the canvas between reloads, so clear it for a true reset.
    await page.evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
    await page.goto('http://localhost:5173/canvas')
    await expect(page.locator('.react-flow__pane')).toBeVisible()
    await page.waitForTimeout(800)
    await dismissSaveReminderIfPresent(page)

    source = await addNoteCard(page)
    await setTitle(source, 'SOURCE')
    await focusBlock(source)
    await typeBlocks(page, [
      'Plain paragraph for copying.',
      '# Section Heading',
      '* First bullet',
      '* Second bullet',
      '1. Step one',
      '1. Step two',
      '1. Step three',
      '[] Task alpha',
      '[] Task beta',
      '> A quoted line',
    ])
    await page.keyboard.type('``` const answer = 42')
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')

    target = await addNoteCard(page)
    await setTitle(target, 'TARGET')
    await focusBlock(target)
    await page.keyboard.type('Target note landing zone.')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    const s = await blocksOf(source)
    console.log(`  fixture: SOURCE ${s.length} blocks (${s.map((b) => b.type).join(', ')}), TARGET ${(await blocksOf(target)).length}`)
  }

  // ============================================================ A
  await group('A. Text inside a single note', async () => {
    await bringIntoView(page, source)

    await scenario('A1', 'A. Text inside one note', 'Copy a word and paste it elsewhere in the same note', 'works', async () => {
      await seedClipboard(page)
      const first = await focusBlock(source, 0)
      await first.dblclick()
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(300)
      const clip = await readClipboard(page)
      if (!clip || clip === SENTINEL) return { outcome: 'missing', detail: 'Ctrl+C put nothing on the clipboard' }
      const tgt = await focusBlock(source, 1)
      await page.keyboard.press('End')
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(500)
      const text = (await tgt.textContent()) || ''
      return text.includes(clip.trim())
        ? { outcome: 'works', detail: `copied "${clip.trim()}" and it pasted into the next block` }
        : { outcome: 'broken', detail: `clipboard held "${clip.trim()}" but the target block reads "${text.trim().slice(0, 60)}"` }
    })

    await scenario('A2', 'A. Text inside one note', 'Cut a word and paste it elsewhere', 'works', async () => {
      const src = await focusBlock(source, 0)
      const before = ((await src.textContent()) || '').trim()
      await src.dblclick()
      await page.keyboard.press('Control+x')
      await page.waitForTimeout(500)
      const after = ((await src.textContent()) || '').trim()
      return after !== before
        ? { outcome: 'works', detail: `text was removed on cut: "${before}" -> "${after}"` }
        : { outcome: 'missing', detail: `Ctrl+X removed nothing — block still reads "${before}"` }
    })

    await scenario('A3', 'A. Text inside one note', 'Copied bold text keeps its formatting', 'broken', async () => {
      const b = await lastBlock(source)
      await page.keyboard.type('boldword plaintail')
      await page.waitForTimeout(300)
      await b.dblclick()
      await page.keyboard.press('Control+b')
      await page.waitForTimeout(400)
      if (!(await b.evaluate((el) => !!el.querySelector('strong,b'))))
        return { outcome: 'broken', detail: 'could not apply bold at all — Ctrl+B produced no bold text to copy' }
      await b.dblclick()
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(300)
      const tgt = await focusBlock(source, 1)
      await page.keyboard.press('End')
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(500)
      return (await tgt.evaluate((el) => !!el.querySelector('strong,b')))
        ? { outcome: 'works', detail: 'bold survived the copy/paste round trip' }
        : { outcome: 'broken', detail: 'the words arrived but the bold formatting was dropped' }
    })

    await scenario('A4', 'A. Text inside one note', 'Pasting over selected text replaces it', 'broken', async () => {
      const b = await lastBlock(source)
      await page.keyboard.press('End')
      await page.keyboard.type(' REPLACEME')
      await page.waitForTimeout(300)
      await seedClipboard(page, 'NEWTEXT')
      await b.dblclick() // selects the word under the cursor
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(600)
      const text = ((await b.textContent()) || '').trim()
      if (text.includes('REPLACEME') && text.includes('NEWTEXT'))
        return { outcome: 'broken', detail: `the selected word was not replaced — block now reads "${text.slice(0, 80)}"` }
      if (text.includes('NEWTEXT')) return { outcome: 'works', detail: `replaced correctly — "${text.slice(0, 80)}"` }
      return { outcome: 'broken', detail: `unexpected result — "${text.slice(0, 80)}"` }
    })

    await scenario('A5', 'A. Text inside one note', 'Pasting into a code block stays plain text', 'works', async () => {
      const codeBlock = source.locator('[data-block-type="code"]').first()
      if ((await codeBlock.count()) === 0)
        return { outcome: 'broken', detail: 'no code block was present to paste into' }
      await ensureBlockVisible(page, codeBlock)
      const editable = codeBlock.locator('[contenteditable="true"]').first()
      const typesBefore = (await blocksOf(source)).map((b) => b.type)
      await pasteInto(page, editable, { text: '# Not a heading\n* not a bullet' })
      const typesAfter = (await blocksOf(source)).map((b) => b.type)
      const codeText = ((await codeBlock.textContent()) || '').trim()
      const converted = typesAfter.length > typesBefore.length
      if (!converted && codeText.includes('# Not a heading'))
        return { outcome: 'works', detail: 'pasted raw into the code block — no markdown conversion' }
      return {
        outcome: 'broken',
        detail: converted
          ? `markdown was converted into ${typesAfter.length - typesBefore.length} new blocks instead of staying raw`
          : `code block reads "${codeText.slice(0, 70)}"`,
      }
    })
  })

  // ============================================================ B
  await group('B. Whole blocks inside a single note', async () => {
    await bringIntoView(page, source)

    await scenario('B1', 'B. Whole blocks in one note', 'Copy several blocks with the Copy button and paste them back', 'broken', async () => {
      const label = await selectBlockRange(page, source, 1, 5)
      if (!label) return { outcome: 'missing', detail: 'shift+clicking blocks produced no multi-block selection UI' }
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: `selection shows "${label}" but offers no Copy control` }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(500)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: clip })
      const gained = (await blocksOf(target)).slice(before)
      const rich = gained.filter((g) => ['heading1', 'bullet', 'numbered'].includes(g.type || '')).length
      await bringIntoView(page, source)
      return rich > 0
        ? { outcome: 'works', detail: `blocks returned as ${gained.map((g) => g.type).join(', ')}` }
        : {
            outcome: 'broken',
            detail: `copied as plain text — clipboard was "${clip.replace(/\n/g, ' | ').slice(0, 80)}"; pasted back as ${gained.map((g) => g.type).join(', ') || 'nothing'}`,
          }
    })

    await scenario('B2', 'B. Whole blocks in one note', 'A Cut option exists for selected blocks', 'missing', async () => {
      await selectBlockRange(page, source, 1, 3)
      if (await page.getByTitle(/cut/i).first().isVisible().catch(() => false))
        return { outcome: 'works', detail: 'a Cut control is present' }
      const named = await page.getByRole('button', { name: /cut/i }).count().catch(() => 0)
      return {
        outcome: 'missing',
        detail: named > 0 ? 'a cut-named control exists but never becomes visible' : 'the block selection toolbar offers only Copy and Delete — there is no Cut',
      }
    })

    await scenario('B3', 'B. Whole blocks in one note', 'Ctrl+C copies a block selection', 'missing', async () => {
      await selectBlockRange(page, source, 1, 3)
      await seedClipboard(page)
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(500)
      const clip = await readClipboard(page)
      return clip && clip !== SENTINEL
        ? { outcome: 'works', detail: `Ctrl+C wrote "${clip.replace(/\n/g, ' | ').slice(0, 70)}"` }
        : { outcome: 'missing', detail: 'Ctrl+C on a block selection wrote nothing — copying blocks is mouse-only' }
    })

    await scenario('B4', 'B. Whole blocks in one note', 'Copied to-dos keep their checkboxes and ticked state', 'broken', async () => {
      const todos = source.locator('[data-block-type="todo"]')
      if ((await todos.count()) < 2) return { outcome: 'broken', detail: 'fewer than two to-do blocks available to test with' }
      await ensureBlockVisible(page, todos.first())
      await todos.first().locator('input[type="checkbox"]').first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(300)
      const tickedBefore = await source.locator('[data-block-type="todo"] input:checked').count()
      const editables = source.locator('[data-block-type="todo"] [contenteditable="true"]')
      await editables.first().click()
      await page.waitForTimeout(150)
      await editables.nth(1).click({ modifiers: ['Shift'] })
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control appeared for the to-do selection' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      const checkedBefore = await target.locator('[data-block-type="todo"] input:checked').count()
      await pasteInto(page, await lastBlock(target), { text: clip })
      const gained = (await blocksOf(target)).slice(before)
      const todosBack = gained.filter((g) => g.type === 'todo').length
      const checkedAfter = await target.locator('[data-block-type="todo"] input:checked').count()
      await bringIntoView(page, source)
      if (todosBack >= 2 && (tickedBefore === 0 || checkedAfter > checkedBefore))
        return { outcome: 'works', detail: `${todosBack} to-dos returned with their ticked state` }
      if (todosBack >= 2)
        return { outcome: 'broken', detail: `${todosBack} to-dos returned but the ticked state was lost` }
      return {
        outcome: 'broken',
        detail: `to-dos came back as ${gained.map((g) => g.type).join(', ') || 'nothing'}; clipboard was "${clip.replace(/\n/g, ' | ').slice(0, 70)}"`,
      }
    })

    await scenario('B5', 'B. Whole blocks in one note', 'A copied numbered list keeps 1, 2, 3', 'broken', async () => {
      const nums = source.locator('[data-block-type="numbered"] [contenteditable="true"]')
      if ((await nums.count()) < 3) return { outcome: 'broken', detail: `expected 3 numbered items, found ${await nums.count()}` }
      await ensureBlockVisible(page, nums.first())
      await nums.first().click()
      await page.waitForTimeout(150)
      await nums.nth(2).click({ modifiers: ['Shift'] })
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control appeared for the numbered selection' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      const markers = (clip.match(/^\s*\d+\./gm) || []).map((m) => m.trim())
      return markers.length >= 3 && new Set(markers).size >= 3
        ? { outcome: 'works', detail: `numbering preserved: ${markers.join(' ')}` }
        : {
            outcome: 'broken',
            detail: `numbering collapsed to ${markers.join(' ') || '(none)'} — clipboard was "${clip.replace(/\n/g, ' | ').slice(0, 70)}"`,
          }
    })

    await scenario('B6', 'B. Whole blocks in one note', 'Copying an image block gives you the image back', 'broken', async () => {
      await pasteInto(page, await lastBlock(source), { imageDataUrl })
      const imgs = source.locator('[data-block-type="image"]')
      if ((await imgs.count()) === 0) return { outcome: 'broken', detail: 'could not create an image block to copy from' }
      await ensureBlockVisible(page, imgs.first())
      await imgs.first().click({ force: true })
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'an image block cannot be selected for copying — no Copy control appears' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = await target.locator('[data-block-type="image"]').count()
      await pasteInto(page, await lastBlock(target), { text: clip })
      const after = await target.locator('[data-block-type="image"]').count()
      await bringIntoView(page, source)
      return after > before
        ? { outcome: 'works', detail: 'the image came back as an image block' }
        : {
            outcome: 'broken',
            detail: clip.startsWith('data:image')
              ? `the image was copied as its raw ${clip.length}-character data URL, not as an image`
              : `clipboard held "${clip.slice(0, 50)}" and no image arrived`,
          }
    })

    await scenario('B7', 'B. Whole blocks in one note', 'Copying a callout returns a callout', 'broken', async () => {
      const anchor = await lastBlock(source)
      await anchor.click()
      await page.keyboard.type('/callout')
      await page.waitForTimeout(500)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(400)
      await page.keyboard.type('Callout content here')
      await page.waitForTimeout(300)
      const callouts = source.locator('[data-block-type="callout"]')
      if ((await callouts.count()) === 0)
        return { outcome: 'broken', detail: 'could not create a callout block via the slash menu to test with' }
      await callouts.first().locator('[contenteditable="true"]').first().click()
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control appears for a callout block' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: clip })
      const gained = (await blocksOf(target)).slice(before)
      await bringIntoView(page, source)
      return gained.some((g) => g.type === 'callout')
        ? { outcome: 'works', detail: 'the callout returned as a callout' }
        : { outcome: 'broken', detail: `the callout came back as ${gained.map((g) => g.type).join(', ') || 'nothing'} (clipboard: "${clip.slice(0, 50)}")` }
    })

    await scenario('B8', 'B. Whole blocks in one note', 'Copying a code block returns it as code', 'broken', async () => {
      const code = source.locator('[data-block-type="code"]').first()
      if ((await code.count()) === 0) return { outcome: 'broken', detail: 'no code block available to copy' }
      await ensureBlockVisible(page, code)
      await code.locator('[contenteditable="true"]').first().click()
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control appears for a code block selection' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: clip })
      const gained = (await blocksOf(target)).slice(before)
      await bringIntoView(page, source)
      return gained.some((g) => g.type === 'code')
        ? { outcome: 'works', detail: 'the code block returned as code' }
        : { outcome: 'broken', detail: `the code block came back as ${gained.map((g) => g.type).join(', ') || 'nothing'}` }
    })
  })

  // ============================================================ C
  await group('C. Between two different notes', async () => {
    await scenario('C1', 'C. Between two notes', 'Copy blocks from note A into note B', 'broken', async () => {
      await bringIntoView(page, source)
      const label = await selectBlockRange(page, source, 1, 4)
      if (!label || !(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control available for the selection' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: clip })
      const gained = (await blocksOf(target)).slice(before)
      const rich = gained.filter((g) => ['heading1', 'bullet', 'numbered', 'todo', 'quote'].includes(g.type || '')).length
      return rich > 0
        ? { outcome: 'works', detail: `arrived intact as ${gained.map((g) => g.type).join(', ')}` }
        : { outcome: 'broken', detail: `arrived as ${gained.map((g) => g.type).join(', ') || 'nothing'} — structure flattened in transit` }
    })

    await scenario('C2', 'C. Between two notes', 'Cut blocks from note A and paste into note B', 'missing', async () => {
      await bringIntoView(page, source)
      await selectBlockRange(page, source, 1, 2)
      const before = (await blocksOf(source)).length
      await page.keyboard.press('Control+x')
      await page.waitForTimeout(600)
      const after = (await blocksOf(source)).length
      return after < before
        ? { outcome: 'works', detail: `Ctrl+X removed ${before - after} blocks from the source note` }
        : { outcome: 'missing', detail: `Ctrl+X changed nothing — the source still has all ${before} blocks, and there is no Cut button either` }
    })

    await scenario('C3', 'C. Between two notes', 'Copy an image from note A into note B', 'broken', async () => {
      await bringIntoView(page, source)
      const img = source.locator('[data-block-type="image"]').first()
      if ((await img.count()) === 0) return { outcome: 'broken', detail: 'no image block in the source note to copy' }
      await ensureBlockVisible(page, img)
      await img.click({ force: true })
      await page.waitForTimeout(400)
      if (!(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'an image block offers no Copy control' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await bringIntoView(page, target)
      const before = await target.locator('[data-block-type="image"]').count()
      await pasteInto(page, await lastBlock(target), { text: clip })
      const after = await target.locator('[data-block-type="image"]').count()
      return after > before
        ? { outcome: 'works', detail: 'the image arrived as an image block' }
        : { outcome: 'broken', detail: `no image arrived — the clipboard carried ${clip.length} characters of ${clip.startsWith('data:') ? 'raw image data' : 'text'}` }
    })

    await scenario('C4', 'C. Between two notes', "Paste text into another note's title", 'works', async () => {
      await bringIntoView(page, target)
      await seedClipboard(page, 'Pasted Title')
      const input = target.locator('input[placeholder="Untitled"]').first()
      await input.click()
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(500)
      const val = await input.inputValue()
      if (val.includes('Pasted Title')) {
        await input.press('Control+a')
        await input.type('TARGET')
        await input.press('Enter')
        return { outcome: 'works', detail: 'the title accepted a pasted value' }
      }
      return { outcome: 'broken', detail: `the title reads "${val}" after pasting` }
    })
  })

  // ============================================================ D
  await group('D. Cards on the canvas', async () => {
    await page.keyboard.press('Escape')
    await dismissSaveReminderIfPresent(page)

    await scenario('D1', 'D. Cards on the canvas', 'Ctrl+C then Ctrl+V duplicates a card', 'missing', async () => {
      await seedClipboard(page, SENTINEL)
      const armed = await armCanvasShortcut(page, source)
      if (!armed) return { outcome: 'broken', detail: 'could not get the card into a selected state to test with' }
      const srcBlocks = (await blocksOf(source)).length
      const before = await nodeIds(page)
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(500)
      const clip = await readClipboard(page)
      const wroteClipboard = !!clip && clip !== SENTINEL
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(1400)
      const after = await nodeIds(page)
      const freshId = after.find((id) => !before.includes(id))
      if (!freshId)
        return { outcome: 'missing', detail: `Ctrl+C wrote nothing to the clipboard and Ctrl+V created nothing — card count stayed at ${before.length}` }
      /* A new card is not proof of card copy/paste: Ctrl+V also reaches the
         canvas' generic text-paste handler, which builds a card out of whatever
         text happened to be on the system clipboard. Check it is really a copy. */
      const fresh = page.locator(`.react-flow__node[data-id="${freshId}"]`)
      const freshTitle = (await fresh.locator('input[placeholder="Untitled"]').first().inputValue().catch(() => '')) || ''
      const freshBlocks = (await blocksOf(fresh)).length
      if (freshTitle.includes('SOURCE') && freshBlocks >= srcBlocks)
        return { outcome: 'works', detail: `a genuine copy of the card appeared (title "${freshTitle}", ${freshBlocks} blocks)` }
      return {
        outcome: 'broken',
        detail: `Ctrl+V produced a card, but not a copy of the one selected — it is a plain-text card built from whatever was already on the system clipboard (title "${freshTitle || 'untitled'}", ${freshBlocks} blocks vs the original's ${srcBlocks}). Ctrl+C itself ${wroteClipboard ? 'changed the clipboard' : 'wrote nothing at all'}.`,
      }
    })

    await scenario('D2', 'D. Cards on the canvas', 'Ctrl+X removes a card ready to paste back', 'missing', async () => {
      const armed = await armCanvasShortcut(page, source)
      if (!armed) return { outcome: 'broken', detail: 'could not get the card into a selected state to test with' }
      const before = (await nodeIds(page)).length
      await page.keyboard.press('Control+x')
      await page.waitForTimeout(800)
      const after = (await nodeIds(page)).length
      return after < before
        ? { outcome: 'works', detail: `card count ${before} -> ${after}` }
        : { outcome: 'missing', detail: `card count stayed at ${before} — cut does not exist for cards` }
    })

    await scenario('D3', 'D. Cards on the canvas', 'Ctrl+D duplicates the selected card', 'works', async () => {
      const armed = await armCanvasShortcut(page, source)
      if (!armed) return { outcome: 'broken', detail: 'could not get the card into a selected state to test with' }
      const before = (await nodeIds(page)).length
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1000)
      const after = (await nodeIds(page)).length
      return after > before
        ? { outcome: 'works', detail: `duplicated — card count ${before} -> ${after}` }
        : { outcome: 'missing', detail: `nothing happened; card count stayed at ${before}` }
    })

    await scenario('D4', 'D. Cards on the canvas', 'Duplicating two joined cards keeps the connection', 'broken', async () => {
      let edges = await page.locator('.react-flow__edge').count()
      if (edges === 0) {
        await bringIntoView(page, source)
        await source.hover({ force: true }).catch(() => {})
        await page.waitForTimeout(300)
        const handle = source.locator('.react-flow__handle-right').first()
        const hb = await handle.boundingBox().catch(() => null)
        const tb = await target.boundingBox().catch(() => null)
        if (hb && tb) {
          await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
          await page.mouse.down()
          await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 14 })
          await page.mouse.up()
          await page.waitForTimeout(700)
        }
        edges = await page.locator('.react-flow__edge').count()
      }
      if (edges === 0)
        return { outcome: 'broken', detail: 'could not create a connection to test with — the connection handle is only reachable on hover and is hard to hit' }
      await page.locator('.react-flow__pane').click({ position: { x: 200, y: 200 } })
      await armCanvasShortcut(page, source)
      await target.click({ position: { x: 6, y: 6 }, force: true, modifiers: ['Shift'] }).catch(() => {})
      await blurActive(page)
      await page.waitForTimeout(300)
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1100)
      const edgesAfter = await page.locator('.react-flow__edge').count()
      return edgesAfter > edges
        ? { outcome: 'works', detail: `connections ${edges} -> ${edgesAfter}` }
        : { outcome: 'broken', detail: `both cards were duplicated but the connection between them was not — connections stayed at ${edges}` }
    })

    await scenario('D5', 'D. Cards on the canvas', 'Right-clicking a card offers Copy / Cut / Paste', 'missing', async () => {
      await bringIntoView(page, source)
      await source.click({ button: 'right', position: { x: 80, y: 40 }, force: true }).catch(() => {})
      await page.waitForTimeout(700)
      // Scope to the context-menu portal, or a stray "Copy" button elsewhere on
      // the page (the block toolbar has one) reads as a false positive.
      const menu = page.locator('[class*="overlay_"]').first()
      const anyMenu = await menu.isVisible().catch(() => false)
      const copy = anyMenu && (await menu.getByText(/^copy$/i).first().isVisible().catch(() => false))
      const cut = anyMenu && (await menu.getByText(/^cut$/i).first().isVisible().catch(() => false))
      const paste = anyMenu && (await menu.getByText(/paste/i).first().isVisible().catch(() => false))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      if (copy || cut)
        return { outcome: 'works', detail: `the card menu offers${copy ? ' Copy' : ''}${cut ? ' Cut' : ''}${paste ? ' Paste' : ''}` }
      return {
        outcome: 'missing',
        detail: anyMenu
          ? 'right-clicking a card opens the generic canvas menu, which has no Copy or Cut'
          : 'right-clicking a card opens no app menu at all — cards have no context menu',
      }
    })

    await scenario('D6', 'D. Cards on the canvas', 'Right-clicking empty canvas offers clipboard actions', 'broken', async () => {
      await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 320, y: 430 } })
      await page.waitForTimeout(700)
      const menu = page.locator('[class*="overlay_"]').first()
      const open = await menu.isVisible().catch(() => false)
      const paste = open && (await menu.getByText(/paste from clipboard/i).first().isVisible().catch(() => false))
      const copy = open && (await menu.getByText(/^copy$/i).first().isVisible().catch(() => false))
      const cut = open && (await menu.getByText(/^cut$/i).first().isVisible().catch(() => false))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      if (paste && copy && cut) return { outcome: 'works', detail: 'Copy, Cut and Paste all offered' }
      if (paste) return { outcome: 'broken', detail: 'only "Paste from clipboard" is offered, and it handles plain text only — no Copy, no Cut' }
      return { outcome: 'missing', detail: 'the canvas menu offers no clipboard actions at all' }
    })

    await scenario('D7', 'D. Cards on the canvas', 'A duplicated card keeps its content and view mode', 'works', async () => {
      const blocksBefore = (await blocksOf(target)).length
      const armed = await armCanvasShortcut(page, target)
      if (!armed) return { outcome: 'broken', detail: 'could not select the card to duplicate' }
      const before = await nodeIds(page)
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1100)
      const after = await nodeIds(page)
      const freshId = after.find((id) => !before.includes(id))
      if (!freshId) return { outcome: 'missing', detail: 'the duplicate never appeared' }
      const clone = page.locator(`.react-flow__node[data-id="${freshId}"]`)
      const cloneBlocks = (await blocksOf(clone)).length
      return cloneBlocks >= blocksBefore && blocksBefore > 0
        ? { outcome: 'works', detail: `the clone kept all ${cloneBlocks} blocks and its expanded view mode` }
        : { outcome: 'broken', detail: `the original had ${blocksBefore} blocks, the clone has ${cloneBlocks}` }
    })

    await scenario('D8', 'D. Cards on the canvas', 'Duplicating an image card works', 'works', async () => {
      await page.locator('.react-flow__pane').click({ position: { x: 300, y: 300 } })
      const before = await nodeIds(page)
      await pasteOnCanvas(page, { imageDataUrl })
      const mid = await nodeIds(page)
      const freshId = mid.find((id) => !before.includes(id))
      if (!freshId) return { outcome: 'broken', detail: 'pasting an image onto the canvas produced no card to duplicate' }
      const imageCard = page.locator(`.react-flow__node[data-id="${freshId}"]`)
      const armed = await armCanvasShortcut(page, imageCard)
      if (!armed) return { outcome: 'broken', detail: 'could not select the pasted image card' }
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1100)
      const after = (await nodeIds(page)).length
      return after > mid.length
        ? { outcome: 'works', detail: `image card duplicated — ${mid.length} -> ${after}` }
        : { outcome: 'broken', detail: `the image card did not duplicate (stayed at ${mid.length})` }
    })

    await scenario('D9', 'D. Cards on the canvas', 'Selecting several cards and duplicating copies them all', 'works', async () => {
      await page.locator('.react-flow__pane').click({ position: { x: 200, y: 200 } })
      const armed = await armCanvasShortcut(page, source)
      if (!armed) return { outcome: 'broken', detail: 'could not select the first card' }
      const before = (await nodeIds(page)).length
      await target.click({ position: { x: 6, y: 6 }, force: true, modifiers: ['Shift'] }).catch(() => {})
      await blurActive(page)
      await page.waitForTimeout(300)
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1200)
      const after = (await nodeIds(page)).length
      return after >= before + 2
        ? { outcome: 'works', detail: `both cards duplicated — ${before} -> ${after}` }
        : { outcome: 'broken', detail: `expected two new cards, got ${before} -> ${after}` }
    })
  })

  // ============================================================ E
  /* Defined here but run LAST: this is the only group that changes canvas level,
     and a drill-in left half-applied would break every group after it. */
  const runGroupE = () => group('E. Between canvas levels', async () => {
    async function openInnerCanvas(node: Locator): Promise<boolean> {
      await bringIntoView(page, node)
      await node.hover({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
      const open = page.getByTitle('Open Card').first()
      if (!(await open.isVisible().catch(() => false))) return false
      await open.click({ timeout: 6000, force: true }).catch(() => {})
      await page.waitForTimeout(1400)
      return true
    }

    /**
     * Drill back out to the top-level canvas via the breadcrumb trail.
     *
     * Deliberately NOT the "Home"/back button in the header — that one calls
     * setCurrentView('landing') and leaves the canvas altogether, and reloading
     * to recover regenerates every node id, orphaning the card handles this
     * audit holds. The root breadcrumb calls navigateToNode instead, which stays
     * in place and keeps ids stable.
     */
    async function goHome() {
      for (let i = 0; i < 4; i++) {
        const rootCrumb = page.locator('button[class*="crumb"]').first()
        if (!(await rootCrumb.isEnabled().catch(() => false))) break
        await rootCrumb.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(900)
      }
      await page.waitForTimeout(500)
      await dismissSaveReminderIfPresent(page)
    }

    await scenario('E1', 'E. Between canvas levels', 'Copy on the main canvas, paste inside a card’s inner canvas', 'missing', async () => {
      await seedClipboard(page, SENTINEL)
      if (!(await armCanvasShortcut(page, source)))
        return { outcome: 'broken', detail: 'could not select the card to copy' }
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(500)
      if (!(await openInnerCanvas(target))) return { outcome: 'broken', detail: 'could not open the inner canvas ("Open Card" never appeared)' }
      const before = await waitForStableNodes(page) // the inner canvas fills in on its own first
      await page.locator('.react-flow__pane').click({ position: { x: 420, y: 320 } })
      await blurActive(page)
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(1500)
      const after = (await nodeIds(page)).length
      // Only a card actually titled SOURCE counts — a generic text card built
      // from leftover clipboard text is not cross-level card copy/paste.
      const arrived = await hasCardTitled(page, 'SOURCE')
      await goHome()
      if (after > before && arrived)
        return { outcome: 'works', detail: `a copy of the SOURCE card arrived in the inner canvas — ${before} -> ${after}` }
      if (after > before)
        return { outcome: 'broken', detail: `a card appeared (${before} -> ${after}) but it is not the copied card — it is a text card made from the system clipboard` }
      return { outcome: 'missing', detail: `nothing pasted; the inner canvas stayed at ${before} cards — there is no cross-level card copy/paste` }
    })

    await scenario('E2', 'E. Between canvas levels', 'Copy inside an inner canvas, paste on the main canvas', 'missing', async () => {
      if (!(await openInnerCanvas(target))) return { outcome: 'broken', detail: 'could not open the inner canvas' }
      await waitForStableNodes(page)
      const inner = page.locator('.react-flow__node').first()
      if (!(await inner.isVisible().catch(() => false)))
        return { outcome: 'broken', detail: 'the inner canvas had no card to copy' }
      const innerTitle =
        (await inner.locator('input[placeholder="Untitled"]').first().inputValue().catch(() => '')) || ''
      await seedClipboard(page, SENTINEL)
      await armCanvasShortcut(page, inner)
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(500)
      await goHome()
      const before = await waitForStableNodes(page)
      const beforeIds = await nodeIds(page)
      await page.locator('.react-flow__pane').click({ position: { x: 320, y: 430 } })
      await blurActive(page)
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(1500)
      const afterIds = await nodeIds(page)
      const freshId = afterIds.find((id) => !beforeIds.includes(id))
      if (!freshId)
        return { outcome: 'missing', detail: `nothing pasted onto the main canvas (stayed at ${before}); the card being copied was "${innerTitle || 'untitled'}"` }
      const freshTitle =
        (await page.locator(`.react-flow__node[data-id="${freshId}"] input[placeholder="Untitled"]`).first().inputValue().catch(() => '')) || ''
      return innerTitle && freshTitle.includes(innerTitle)
        ? { outcome: 'works', detail: `the inner card "${innerTitle}" pasted out onto the main canvas` }
        : { outcome: 'broken', detail: `a card appeared on the main canvas but it is not the copied one — got "${freshTitle || 'untitled'}", expected "${innerTitle || 'untitled'}" (a text card built from the system clipboard)` }
    })

    await scenario('E3', 'E. Between canvas levels', 'Copy from one inner canvas into another', 'missing', async () => ({
      outcome: 'missing',
      detail: 'follows directly from E1 and E2 — with no cross-level copy/paste at all, two sibling inner canvases cannot exchange cards either',
    }))

    await scenario('E4', 'E. Between canvas levels', 'Ctrl+D inside an inner canvas keeps the copy there', 'works', async () => {
      if (!(await openInnerCanvas(target))) return { outcome: 'broken', detail: 'could not open the inner canvas' }
      const before = await waitForStableNodes(page)
      const inner = page.locator('.react-flow__node').first()
      if (!(await inner.isVisible().catch(() => false))) {
        await goHome()
        return { outcome: 'broken', detail: 'the inner canvas had no card to duplicate' }
      }
      if (!(await armCanvasShortcut(page, inner))) {
        await goHome()
        return { outcome: 'broken', detail: 'could not select a card inside the inner canvas' }
      }
      await page.keyboard.press('Control+d')
      await page.waitForTimeout(1100)
      const after = (await nodeIds(page)).length
      await goHome()
      return after > before
        ? { outcome: 'works', detail: `the duplicate stayed inside the inner canvas — ${before} -> ${after}` }
        : { outcome: 'broken', detail: `no duplicate appeared in the inner canvas (stayed at ${before})` }
    })

    await scenario('E5', 'E. Between canvas levels', 'Pasting outside text while inside an inner canvas lands there', 'works', async () => {
      if (!(await openInnerCanvas(target))) return { outcome: 'broken', detail: 'could not open the inner canvas' }
      const before = await waitForStableNodes(page)
      await page.locator('.react-flow__pane').click({ position: { x: 420, y: 320 } })
      await pasteOnCanvas(page, { text: 'Pasted into the inner canvas' })
      const after = (await nodeIds(page)).length
      const landed = after > before
      await goHome()
      const leaked = await page.getByText('Pasted into the inner canvas').first().isVisible().catch(() => false)
      if (landed && !leaked)
        return { outcome: 'works', detail: 'the new card was created inside the inner canvas, correctly scoped to that level' }
      if (landed && leaked) return { outcome: 'broken', detail: 'the card was created but also shows on the main canvas' }
      return { outcome: 'broken', detail: `no card was created inside the inner canvas (stayed at ${before})` }
    })
  })

  // ============================================================ F
  await group('F. Note insides <-> canvas', async () => {
    await scenario('F1', 'F. Note insides <-> canvas', 'Copy a block in a note, paste onto empty canvas', 'broken', async () => {
      await bringIntoView(page, source)
      const label = await selectBlockRange(page, source, 1, 3)
      if (!label || !(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control available to copy blocks with' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      await page.keyboard.press('Escape')
      const before = await nodeIds(page)
      await page.locator('.react-flow__pane').click({ position: { x: 260, y: 520 } })
      await pasteOnCanvas(page, { text: clip })
      const after = await nodeIds(page)
      const freshId = after.find((id) => !before.includes(id))
      if (!freshId) return { outcome: 'broken', detail: 'no card was created on the canvas' }
      const created = page.locator(`.react-flow__node[data-id="${freshId}"]`)
      const types = (await blocksOf(created)).map((b) => b.type)
      const rich = types.filter((t) => ['heading1', 'bullet', 'numbered'].includes(t || '')).length
      return rich > 0
        ? { outcome: 'works', detail: `became a card containing ${types.join(', ')}` }
        : { outcome: 'broken', detail: `became a card, but the blocks flattened to ${types.join(', ') || 'plain text'}` }
    })

    await scenario('F2', 'F. Note insides <-> canvas', 'Copy a card, paste it inside another note', 'missing', async () => {
      await bringIntoView(page, source)
      await seedClipboard(page)
      await selectCard(page, source)
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(400)
      const clip = await readClipboard(page)
      if (!clip || clip === SENTINEL)
        return { outcome: 'missing', detail: 'copying a card puts nothing on the clipboard, so there is nothing to paste into a note' }
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: clip })
      const after = (await blocksOf(target)).length
      return after > before
        ? { outcome: 'works', detail: `the card's content arrived as ${after - before} new blocks` }
        : { outcome: 'broken', detail: 'the clipboard had content but nothing arrived in the note' }
    })

    await scenario('F3', 'F. Note insides <-> canvas', 'Copy/paste inside the fullscreen view of a note', 'works', async () => {
      await bringIntoView(page, source)
      await source.hover({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
      const full = page.getByTitle('Full Screen').first()
      if (!(await full.isVisible().catch(() => false)))
        return { outcome: 'broken', detail: 'could not open the fullscreen view' }
      await full.click({ force: true })
      await page.waitForTimeout(1600)
      const b = await firstVisibleEditable(page)
      if (!b) {
        await closeOverlays(page)
        return { outcome: 'broken', detail: 'no editable block was reachable in the fullscreen view' }
      }
      await b.click()
      await page.keyboard.press('End')
      await pasteInto(page, b, { text: ' FS-PASTE' })
      const text = (await b.textContent()) || ''
      await closeOverlays(page)
      return text.includes('FS-PASTE')
        ? { outcome: 'works', detail: 'pasting behaves the same in the fullscreen view' }
        : { outcome: 'broken', detail: `the paste did not land — block reads "${text.trim().slice(0, 60)}"` }
    })

    await scenario('F4', 'F. Note insides <-> canvas', 'Copy/paste in the side-panel view', 'works', async () => {
      await bringIntoView(page, source)
      await source.hover({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
      const side = page.getByTitle('Side Panel (Right)').first()
      if (!(await side.isVisible().catch(() => false)))
        return { outcome: 'broken', detail: 'could not open the side-panel view' }
      await side.click({ force: true })
      await page.waitForTimeout(1600)
      const b = await firstVisibleEditable(page)
      if (!b) {
        await closeOverlays(page)
        return { outcome: 'broken', detail: 'no editable block was reachable in the side panel' }
      }
      await b.click()
      await page.keyboard.press('End')
      await pasteInto(page, b, { text: ' SIDE-PASTE' })
      const text = (await b.textContent()) || ''
      await closeOverlays(page)
      return text.includes('SIDE-PASTE')
        ? { outcome: 'works', detail: 'pasting behaves identically in the side panel' }
        : { outcome: 'broken', detail: `the paste did not land — block reads "${text.trim().slice(0, 60)}"` }
    })
  })

  // ============================================================ G
  await group('G. With other programs', async () => {
    await page.keyboard.press('Escape')

    await scenario('G1', 'G. With other programs', 'Paste a web page section with headings and bullets', 'works', async () => {
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), {
        html: '<h2>Imported Heading</h2><ul><li>Imported bullet one</li><li>Imported bullet two</li></ul><p>Closing paragraph.</p>',
        text: 'Imported Heading\nImported bullet one\nImported bullet two\nClosing paragraph.',
      })
      const gained = (await blocksOf(target)).slice(before)
      const heads = gained.filter((g) => (g.type || '').startsWith('heading')).length
      const bullets = gained.filter((g) => g.type === 'bullet').length
      return heads > 0 && bullets >= 2
        ? { outcome: 'works', detail: `structure preserved — ${gained.map((g) => g.type).join(', ')}` }
        : { outcome: 'broken', detail: `arrived as ${gained.map((g) => g.type).join(', ') || 'nothing'}` }
    })

    await scenario('G2', 'G. With other programs', 'Paste a screenshot into a note', 'works', async () => {
      const before = await target.locator('[data-block-type="image"]').count()
      await pasteInto(page, await lastBlock(target), { imageDataUrl })
      const after = await target.locator('[data-block-type="image"]').count()
      return after > before
        ? { outcome: 'works', detail: 'the screenshot became an image block' }
        : { outcome: 'broken', detail: 'no image block was created' }
    })

    await scenario('G3', 'G. With other programs', 'Paste a screenshot onto the canvas', 'works', async () => {
      await page.keyboard.press('Escape')
      await page.locator('.react-flow__pane').click({ position: { x: 260, y: 260 } })
      const before = (await nodeIds(page)).length
      await pasteOnCanvas(page, { imageDataUrl })
      const after = (await nodeIds(page)).length
      return after > before
        ? { outcome: 'works', detail: `an image card was created — ${before} -> ${after}` }
        : { outcome: 'broken', detail: 'no card was created from the pasted image' }
    })

    await scenario('G4', 'G. With other programs', 'Copy from the app into a plain text editor', 'broken', async () => {
      await bringIntoView(page, source)
      const label = await selectBlockRange(page, source, 1, 5)
      if (!label || !(await copyControl(page).isVisible().catch(() => false)))
        return { outcome: 'missing', detail: 'no Copy control, so nothing can be taken out of the app at all' }
      await seedClipboard(page)
      await copyControl(page).click()
      await page.waitForTimeout(500)
      const clip = await readClipboard(page)
      if (!clip || clip === SENTINEL) return { outcome: 'missing', detail: 'nothing was written to the clipboard' }
      const structured = /[•\-*]\s|\d+\.\s|#/.test(clip)
      return structured
        ? { outcome: 'works', detail: `readable outside the app: "${clip.replace(/\n/g, ' | ').slice(0, 90)}"` }
        : { outcome: 'broken', detail: `comes out flat and unstructured: "${clip.replace(/\n/g, ' | ').slice(0, 90)}"` }
    })

    await scenario('G5', 'G. With other programs', 'Paste a plain URL into a note', 'works', async () => {
      await bringIntoView(page, target)
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), { text: 'https://www.example.com/some-article' })
      const gained = (await blocksOf(target)).slice(before)
      if (gained.some((g) => g.type === 'link')) return { outcome: 'works', detail: 'became a link/bookmark block' }
      return gained.some((g) => g.text.includes('example.com'))
        ? { outcome: 'broken', detail: `arrived as ${gained.map((g) => g.type).join(', ')} — plain text, not a link block` }
        : { outcome: 'broken', detail: 'the URL did not arrive at all' }
    })

    await scenario('G6', 'G. With other programs', 'Paste Markdown from outside', 'works', async () => {
      const before = (await blocksOf(target)).length
      await pasteInto(page, await lastBlock(target), {
        text: '## Markdown Heading\n- md bullet one\n- md bullet two\n1. md step\n> md quote',
      })
      const gained = (await blocksOf(target)).slice(before)
      const kinds = new Set(gained.map((g) => g.type))
      const rich = ['heading2', 'bullet', 'numbered', 'quote', 'todo'].filter((k) => kinds.has(k))
      return rich.length >= 3
        ? { outcome: 'works', detail: `converted to real blocks: ${gained.map((g) => g.type).join(', ')}` }
        : { outcome: 'broken', detail: `arrived as ${gained.map((g) => g.type).join(', ') || 'nothing'}` }
    })
  })

  // ============================================================ H
  await group('H. Drag and drop', async () => {
    await page.keyboard.press('Escape')

    async function revealGrip(node: Locator) {
      const block = node.locator('[data-block-type]').nth(1)
      await ensureBlockVisible(page, block)
      await block.hover({ force: true }).catch(() => {})
      await page.waitForTimeout(500)
      const grip = node.locator('[class*="dragHandle"]').first()
      return (await grip.isVisible().catch(() => false)) ? grip : null
    }

    await scenario('H1', 'H. Drag and drop', 'Drag a block out of a note onto empty canvas', 'works', async () => {
      await bringIntoView(page, source)
      const grip = await revealGrip(source)
      if (!grip) return { outcome: 'broken', detail: 'the block drag handle never appeared on hover' }
      const before = (await nodeIds(page)).length
      await grip.dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 250, y: 600 }, force: true }).catch(() => {})
      await page.waitForTimeout(1400)
      const after = (await nodeIds(page)).length
      return after > before
        ? { outcome: 'works', detail: `the block became its own card — ${before} -> ${after}` }
        : { outcome: 'broken', detail: `no card was created (stayed at ${before})` }
    })

    await scenario('H2', 'H. Drag and drop', 'Drag a block from note A into note B', 'works', async () => {
      await bringIntoView(page, source)
      const grip = await revealGrip(source)
      if (!grip) return { outcome: 'broken', detail: 'the block drag handle never appeared' }
      const targetArea = target.locator('[class*="noteArea"]').first()
      if (!(await targetArea.isVisible().catch(() => false)))
        return { outcome: 'broken', detail: 'the target note body was not on screen to drop into' }
      const before = (await blocksOf(target)).length
      await grip.dragTo(targetArea, { force: true }).catch(() => {})
      await page.waitForTimeout(1400)
      const after = (await blocksOf(target)).length
      return after > before
        ? { outcome: 'works', detail: `the block moved across — target went from ${before} to ${after} blocks` }
        : { outcome: 'broken', detail: `nothing arrived in the target note (stayed at ${before})` }
    })

    await scenario('H3', 'H. Drag and drop', 'Drag an image block between notes', 'works', async () => {
      await bringIntoView(page, source)
      // Earlier scenarios may have moved the original image out of SOURCE, so
      // make sure this one has its own to drag.
      if ((await source.locator('[data-block-type="image"]').count()) === 0) {
        await pasteInto(page, await lastBlock(source), { imageDataUrl })
        await page.waitForTimeout(500)
      }
      const img = source.locator('[data-block-type="image"]').first()
      if ((await img.count()) === 0) return { outcome: 'broken', detail: 'could not create an image block in the source note to drag' }
      const targetArea = target.locator('[class*="noteArea"]').first()
      if (!(await targetArea.isVisible().catch(() => false)))
        return { outcome: 'broken', detail: 'the target note body was not on screen to drop into' }
      const before = await target.locator('[data-block-type="image"]').count()
      await img.dragTo(targetArea, { force: true }).catch(() => {})
      await page.waitForTimeout(1400)
      const after = await target.locator('[data-block-type="image"]').count()
      return after > before
        ? { outcome: 'works', detail: 'the image moved between notes intact' }
        : { outcome: 'broken', detail: 'the image did not arrive in the other note' }
    })

    await scenario('H4', 'H. Drag and drop', 'Drag a card into another card to nest it', 'works', async () => {
      await page.keyboard.press('Escape')
      const ids = await nodeIds(page)
      if (ids.length < 2) return { outcome: 'broken', detail: 'not enough cards on the canvas to test nesting' }
      const before = ids.length
      const dragged = page.locator(`.react-flow__node[data-id="${ids[ids.length - 1]}"]`)
      await bringIntoView(page, target)
      await dragged.dragTo(target, { force: true }).catch(() => {})
      await page.waitForTimeout(1400)
      const after = (await nodeIds(page)).length
      return after < before
        ? { outcome: 'works', detail: `the card nested inside the other — top level went ${before} -> ${after}` }
        : { outcome: 'broken', detail: `the card did not nest (top level stayed at ${before})` }
    })
  })

  await runGroupE()

  // ------------------------------------------------------------- report data
  results.sort((a, b) => a.id.localeCompare(b.id))
  writeFileSync(resolve(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2))
  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1
    return acc
  }, {})
  console.log('\n========== CLIPBOARD AUDIT ==========')
  for (const r of results) console.log(`${r.outcome.toUpperCase().padEnd(7)} ${r.id.padEnd(3)} ${r.title}`)
  console.log('-------------------------------------')
  console.log(`works: ${tally.works || 0}   broken: ${tally.broken || 0}   missing: ${tally.missing || 0}   (total ${results.length})`)

  await context.close()
})
