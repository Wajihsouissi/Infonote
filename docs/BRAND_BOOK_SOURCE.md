# chnk it — Brand Book Source

> Upload-ready brand foundations for **chnk it**, a spatial note-taking / thinking canvas.
> This document is the raw material for generating a full brand book. Every color, font,
> and value here is the product's real, shipping design system — the "Paper & Ink" direction.
> Source of truth in code: `design-system.css`.

---

## 1. Brand at a glance

| | |
|---|---|
| **Name** | chnk it (lowercase, always) |
| **Category** | Spatial notes & thinking canvas — cards on an infinite dot-grid |
| **Design system** | "Paper & Ink" |
| **Essence** | A surface you write on, not a screen that performs at you |
| **Personality** | Warm · Flat · Quiet · Editorial · Honest |
| **Emotional target** | Focused calm — unhurried, trustworthy, out of the way |
| **One-line** | The calm canvas for thinking in chunks |

---

## 2. Brand story & positioning

chnk it treats the screen like a **well-set page in a quality notebook** — warm paper,
confident ink, hairline rules, and one decisive accent of color. It is the opposite of the
"cosmic dark / neon SaaS" aesthetic: no glass, no glow, no particles, no purple. Depth comes
from whitespace and hairlines, not spotlights.

The interface **recedes so the user's content is the loudest thing on screen.** Chrome is
understated; color is spent sparingly and therefore means something. The product should feel
lamp-lit, not fluorescent.

**Positioning statement**
For people who think by arranging ideas spatially, chnk it is a note canvas that feels like
paper and ink — calm, tactile, and honest — instead of another glossy, attention-seeking app.

---

## 3. Brand personality — five words

1. **Warm** — nothing is pure black, pure white, or cold blue-grey. Darks are warm graphite; lights are warm off-white; the accent is a lived-in persimmon.
2. **Flat** — elevation is a whisper. Hairlines, spacing, and restraint create hierarchy — never glass, blur, or heavy shadow.
3. **Quiet** — the UI is understated so content dominates. Accent color is earned, not sprayed.
4. **Editorial** — mono overlines, numbered sections (`01 / 02 / 03`), serif for the human moment. It reads like a considered print layout.
5. **Honest** — real status over hype. It speaks to a person doing work, not a lead being converted.

### Anti-brand (explicitly banned)
Never reintroduce these under any name:
- **Glassmorphism** — frosted/translucent panels, backdrop blur, white rim-lights.
- **Glow** — neon halos, colored/blurred shadows, radial "ambient" washes, text-shadow halos, SVG glow filters.
- **Particles & motes** — floating dots, drifting sparkles, ambient decoration.
- **Cosmic palette** — purple, violet, fuchsia, cyan, indigo as brand/chrome colors; cold blue-grey surfaces.
- **In-app marketing copy** — "Sign up free", "No credit card", growth-hack phrasing shown to active users.

> If an idea needs blur or glow to look good, it's the wrong idea for this brand.

---

## 4. Logo

- **Wordmark:** `chnk it`, set lowercase. Asset: `ChnkLogo.svg`.
- **Clear space:** keep at least the cap-height of the wordmark clear on all sides.
- **Color:** ink (`--text-main`) on paper, or the persimmon accent for a branded moment. Never a cool gradient, never on a busy/blurred background.
- **Don't:** add glow, drop shadows, outlines, gradients outside the warm family, or set it on a translucent glass panel.

*(Brand book should render the wordmark in both themes: warm-off-white on graphite, and graphite on paper.)*

---

## 5. Color

The palette is **dual-theme**: **Ink** (dark, the default) and **Paper** (light). Every UI
element must be legible in both. The system is one accent (persimmon) + one supporting hue
(amber) + warm neutrals. Categorical/functional color is a separate, permitted system (§9).

### 5.1 Brand accent — Persimmon
The single brand voice. Primary actions, focus, active states, key emphasis. Spend sparingly.

| Role | Ink (dark) | Paper (light) |
|---|---|---|
| Accent (fills) | `#f95d2e` | `#c9411a` |
| Accent hover | `#ff7040` | `#b53a15` |
| Accent ink (text/icons/borders) | `#ff8a5f` | `#c2410c` |
| Accent deep (gradient end) | `#d94e22` | `#a53312` |
| On-accent (label on a fill) | `#1c0e07` | `#fff8f3` |
| RGB channels | `249, 93, 46` | `201, 65, 26` |

### 5.2 Supporting hue — Warm Amber
Secondary actions, complementary accents, the far end of a warm gradient. Never competes with persimmon for "primary".

| Role | Ink | Paper |
|---|---|---|
| Secondary (fill) | `#e3a24f` | `#b07818` |
| Secondary ink (text/icons) | `#ecc07f` | `#8f620f` |
| RGB channels | `227, 162, 79` | `176, 120, 24` |

### 5.3 Neutrals — Surfaces
Warm graphite in Ink, warm off-white in Paper. Layer base → raised toward the user.

| Role | Ink | Paper |
|---|---|---|
| Base / "the desk" | `#131215` | `#f6f4ee` |
| Rail / sidebar | `#161519` | `#f1efe7` |
| Card / resting panel | `#18171b` | `#fdfcf9` |
| Inset / input well | `#100f12` | `#edebe3` |
| Raised / modal · menu | `#1e1d22` | `#ffffff` |

### 5.4 Neutrals — Text (three weights of ink)

| Role | Ink | Paper |
|---|---|---|
| Primary text / headings | `#eeeae0` | `#211e18` |
| Secondary text | `#b4b0a4` | `#5c584e` |
| Tertiary / captions | `#7d7a70` | `#8b8779` |

### 5.5 Hairlines & washes
The connective tissue. Borders are near-invisible warm hairlines; interaction is a faint wash, never a fill.

| Role | Ink | Paper |
|---|---|---|
| Hairline border/divider | `rgba(240,236,227,0.08)` | `rgba(28,24,16,0.10)` |
| Strong border / hover | `rgba(240,236,227,0.17)` | `rgba(28,24,16,0.20)` |
| Hover wash | `rgba(240,236,227,0.06)` | `rgba(28,24,16,0.05)` |
| Active/selected wash | `rgba(240,236,227,0.12)` | `rgba(28,24,16,0.10)` |
| Canvas dot-grid | `rgba(240,236,227,0.14)` | `rgba(28,24,16,0.18)` |

### 5.6 Feedback colors
Muted, warm-leaning. Used for meaning, not decoration.

| Role | Ink | Paper |
|---|---|---|
| Success | `#7fc98b` | `#2f7d43` |
| Warning | `#e5b567` | `#9c6f14` |
| Error / destructive | `#e5766a` | `#b3402f` |

### 5.7 Color usage rules
- **Accent is earned** — roughly one persimmon element per view carries the primary action or focus.
- **Fills vs. ink** — `accent`/`secondary` are for fills; the `-ink` variants are the contrast-safe versions for colored text, icons, and borders; `on-accent` is the label on top of a fill.
- **Warm gradients only** — e.g. persimmon → amber, or accent-deep → accent. Never persimmon → indigo or any cool stop.
- **Gradient text** must be theme-aware (e.g. `text-main → accent`), never starting from pure white (invisible on Paper).

---

## 6. Typography

| Role | Typeface | Use |
|---|---|---|
| **Sans (primary)** | **Outfit** | All UI — body, labels, buttons, most headings |
| **Serif (display)** | **Iowan Old Style** (→ Palatino, Georgia fallbacks) | The human moment — greetings, largest titles. Editorial warmth. |
| **Mono (structural)** | `ui-monospace` (Cascadia Mono / SF Mono / Menlo …) | Overlines, section numbers `01 / 02 / 03`, code, metadata |

**Type voice:** left-aligned, honest, document-like. Serif appears rarely and deliberately — the
one place warmth turns up. Mono overlines (small, uppercase, often numbered) introduce sections
like a print layout. Generous whitespace is the primary hierarchy tool.

---

## 7. Shape, space & elevation

- **Radius scale:** `4 · 7 · 9 · 12 · 14 px`, plus a `999px` pill. Snap to the scale; no off-scale radii.
- **Squircles:** every rounded rectangle uses Apple-style continuous curvature (`superellipse(2)`) — corners flow into the sides. True circles/pills (avatars, icon buttons, the create orb, dots, swatches, handles) stay perfectly round.
- **Elevation ladder (in order of preference):** hairline → whitespace → `shadow-sm` → `shadow-lg`. Nothing else.
  - `shadow-sm` (resting lift): `0 6px 18px rgba(0,0,0,0.28)` Ink / `rgba(38,28,14,0.08)` Paper
  - `shadow-lg` (modals): `0 18px 44px rgba(0,0,0,0.45)` Ink / `rgba(38,28,14,0.12)` Paper
- **Banned for depth:** blur, glass translucency, colored/glow shadows, gradients-as-fake-light.

---

## 8. Motion

Gentle and purposeful — it eases things into place; it does not bounce or sparkle.

| Role | Curve / duration |
|---|---|
| Hover / small state | `0.15s ease` |
| Panels / larger transitions | `0.4s cubic-bezier(0.25,0.8,0.25,1)` |
| Enter (rise + settle) | `cubic-bezier(0.22,0.9,0.3,1)` |

No infinite pulsing glows, no floating loops, no attention-seeking idle motion. Respect
`prefers-reduced-motion`.

---

## 9. Functional / categorical color (permitted exception)

The single-accent rule governs **brand and chrome**. It does **not** govern color that carries
*user meaning* — kanban/tag categories, the note color picker, status dots, collaborator
cursors, syntax highlighting. Those may use a broader, saturated palette **because the color is
information, not decoration**. Two rules:

1. Keep it in a clearly functional context (a picker, a tag, a status dot) — never as page chrome or brand gradients.
2. **Label honestly** — a swatch called "Cyan" must render cyan.

---

## 10. Voice & tone

- **Calm and direct.** Short, plain sentences. No hype, no growth-hacking.
- **Honest status.** Say what works today and what's on the bench. Trust over spin.
- **Speaks to a maker at work**, never a lead being converted. No "Sign up free / No credit card" inside the product.
- **Lowercase brand,** editorial cadence. Confident, not loud.

**On-brand:** "Drop a card anywhere. Arrange later."
**Off-brand:** "🚀 Supercharge your productivity — start free today!"

---

## 11. Applications & do / don't

**Surfaces to design:** the infinite dot-grid canvas, note/block cards, the create orb (FAB),
slash & context menus, modals, the marketing site, auth screens.

**Do**
- Let content dominate; keep chrome quiet.
- Separate with a single hairline and whitespace before reaching for a shadow.
- Test every surface in **both** Ink and Paper.
- Use persimmon once, deliberately, per view.

**Don't**
- Add glass, blur, glow, or particles.
- Introduce a second brand hue or any cool/cosmic color as chrome.
- Use pure `#fff`/`#000` for text or surfaces.
- Put marketing copy in front of working users.

---

## 12. Quick reference card

```
Brand:        chnk it   (lowercase)
System:       Paper & Ink
Voice:        warm · flat · quiet · editorial · honest
Accent:       Persimmon  #f95d2e (Ink) / #c9411a (Paper)
Secondary:    Amber      #e3a24f (Ink) / #b07818 (Paper)
Ink surface:  #131215 base · #eeeae0 text
Paper surface:#f6f4ee base · #211e18 text
Type:         Outfit (sans) · Iowan Old Style (serif) · mono for structure
Shape:        squircles, radius 4/7/9/12/14, round for circles/pills
Depth:        hairline → whitespace → soft shadow. No glass, no glow.
```
