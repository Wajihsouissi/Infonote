# Paper &amp; Ink — Design System Guideline

> The single, binding description of how **chnk it** looks, feels, and is coded.
> Every UI element, screen, illustration, and marketing surface must obey this.
> The machine-readable source of truth is [`design-system.css`](./design-system.css); this file is the *why* and the *how*.

---

## 1. The feeling

**Paper &amp; Ink is editorial, not cosmic.** Think of a well-set page in a quality notebook or a print magazine: warm paper, confident ink, hairline rules, one decisive accent of color. It is calm, tactile, and honest. The interface should feel like a *surface you write on*, not a screen that performs at you.

Three words to hold in your head while designing:

- **Warm** — nothing is pure black or pure white or cold blue-grey. Darks are a warm graphite ("Ink"); lights are a warm off-white ("Paper"). The accent is a lived-in persimmon, the secondary a soft amber. The whole palette feels lamp-lit, not fluorescent.
- **Flat** — depth comes from *hairlines, spacing, and restraint*, not from glass, blur, glow, or heavy drop shadows. Elevation is a whisper, never a spotlight.
- **Quiet** — the UI recedes so the user's content is the loudest thing on screen. Chrome is understated; color is spent sparingly and therefore means something.

The emotional target is **focused calm**. A user should feel the tool is unhurried, trustworthy, and out of the way.

### What we explicitly rejected

Paper &amp; Ink replaced an older "cosmic dark" direction. These are **banned** — do not reintroduce them under any name:

- **Glassmorphism** — frosted/translucent panels, `backdrop-filter: blur()`, saturated glass, white rim-lights.
- **Glow** — neon halos, `box-shadow` color glows, `filter: blur()` orbs, radial-gradient "ambient" washes, `text-shadow` glows, SVG glow filters.
- **Particles &amp; motes** — floating dots, drifting sparkles, animated ambient decoration.
- **The cosmic palette** — purple, violet, fuchsia, cyan, indigo as *brand/chrome* colors, and cold blue-grey surfaces.
- **In-app marketing copy** — "Sign up free", "No credit card", growth-hack phrasing shown to people already using the product. Speak to a user doing work, not a lead being converted.

If a design idea needs blur or glow to look good, it is the wrong idea for this system.

### The one sanctioned exception

**The canvas FAB** (`.special-primary-btn`, §7 of `design-system.css`) is deliberately exempt from the no-glow and no-idle-motion rules. It keeps a warm accent glow, a white rim-light, and a slow `orbBreathe` animation because it is the single hero action in the product. This is intentional — do not "fix" it during a consistency pass, and **do not copy the treatment onto any other control**. Its colour still comes from tokens, so it stays theme-aware. Nothing else in the app may glow.

---

## 2. First principles (the non-negotiable laws)

1. **Consume tokens, never hardcode.** Every color, font, radius, shadow, and motion value comes from a `var(--…)` token. A raw hex/rgb brand color in a component is a bug. (Exceptions: contexts that *cannot* read CSS variables — see §10.)
2. **Theme-aware by default.** Every element must be legible and correct in **both** Ink (dark) and Paper (light). White text and dark surfaces are not "the design" — they are one theme's *value* of a token. Never assume the theme.
3. **One accent.** Persimmon is the single brand accent; amber is its warm supporting voice. Do not add a second brand hue. Functional/categorical colors are a separate, permitted system (see §5).
4. **Flat, hairline-driven.** Separate and group with `--line` rules and whitespace first; elevation second; never with glass or glow.
5. **Restraint is the aesthetic.** Empty space, a single rule, a lone accent dot. When in doubt, remove.
6. **Content first.** Chrome is quiet. The user's notes, canvas, and text are the visual priority.

---

## 3. Foundations — tokens

All values below are defined in `design-system.css`. Two themes: **Ink** (dark, the default) and **Paper** (light). The app flips them via `:root[data-theme='dark'|'light']`; components never need to know which is active.

### 3.1 Surfaces

Warm graphite in Ink, warm off-white in Paper. Layer from base → raised as you come "up" toward the user.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--bg-base` | App background / the "desk" | `#131215` | `#f6f4ee` |
| `--bg-rail` | Rails, sidebars, footers | `#161519` | `#f1efe7` |
| `--bg-card` | Cards, resting panels | `#18171b` | `#fdfcf9` |
| `--bg-inset` | Wells, inputs, sunken areas | `#100f12` | `#edebe3` |
| `--bg-raised` | Modals, menus, popovers (top layer) | `#1e1d22` | `#ffffff` |

Rule: a modal/menu uses `--bg-raised`; a card at rest uses `--bg-card`; an input/well uses `--bg-inset`. Never a translucent cosmic colour like `rgba(20,22,32,…)`.

### 3.2 Hairlines &amp; washes

The connective tissue of the system. Borders are near-invisible warm hairlines; interaction is a faint wash, never a fill.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--line` | Default hairline border/divider | `rgba(240,236,227,0.08)` | `rgba(28,24,16,0.10)` |
| `--line-strong` | Emphasised border, hover border | `rgba(240,236,227,0.17)` | `rgba(28,24,16,0.20)` |
| `--hover-wash` | Hover background tint | `rgba(240,236,227,0.06)` | `rgba(28,24,16,0.05)` |
| `--active-wash` | Active/selected background tint | `rgba(240,236,227,0.12)` | `rgba(28,24,16,0.10)` |
| `--dot` | Canvas dot-grid | `rgba(240,236,227,0.14)` | `rgba(28,24,16,0.18)` |

### 3.3 Text

Three weights of ink. Never use raw `#fff`/`#000` or a white-alpha for text.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--text-main` | Primary text, headings | `#eeeae0` | `#211e18` |
| `--text-soft` | Secondary text, descriptions | `#b4b0a4` | `#5c584e` |
| `--text-faint` | Tertiary, captions, metadata | `#7d7a70` | `#8b8779` |

### 3.4 Accent — persimmon

The single brand voice. Primary actions, focus, active states, key emphasis. Spend it sparingly.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--accent` | Primary accent, button fills | `#f95d2e` | `#c9411a` |
| `--accent-hover` | Hover state of accent | `#ff7040` | `#b53a15` |
| `--accent-ink` | Accent for **text/icons/borders** (contrast-safe) | `#ff8a5f` | `#c2410c` |
| `--accent-deep` | Deeper accent, gradient ends | `#d94e22` | `#a53312` |
| `--accent-dim` | Faint accent background/tint | `rgba(249,93,46,0.13)` | `rgba(201,65,26,0.10)` |
| `--accent-wash` | Slightly stronger accent tint | `rgba(249,93,46,0.16)` | `rgba(201,65,26,0.12)` |
| `--on-accent` | Text/icons **on** an accent fill | `#1c0e07` | `#fff8f3` |
| `--accent-rgb` | Raw channels for custom alphas | `249, 93, 46` | `201, 65, 26` |

> Use `--accent` for a fill, `--accent-ink` for coloured text/icons/borders (it stays legible on both themes), and `--on-accent` for the label sitting on top of a persimmon fill.

### 3.5 Secondary — warm amber

The supporting hue. Secondary actions, complementary accents, the far end of a warm gradient. Never competes with persimmon for "primary".

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--secondary` | Amber fill | `#e3a24f` | `#b07818` |
| `--secondary-ink` | Amber for text/icons/borders | `#ecc07f` | `#8f620f` |
| `--secondary-dim` | Faint amber tint | `rgba(227,162,79,0.14)` | `rgba(176,120,24,0.12)` |
| `--secondary-rgb` | Raw channels for custom alphas | `227, 162, 79` | `176, 120, 24` |

### 3.6 Feedback

Muted, warm-leaning status colours. Used for meaning, not decoration.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--ok` | Success | `#7fc98b` | `#2f7d43` |
| `--warn` | Warning | `#e5b567` | `#9c6f14` |
| `--danger` | Error / destructive | `#e5766a` | `#b3402f` |

### 3.7 Elevation

Depth is a whisper. Two shadows only, plus a focus ring. No coloured shadows, no glows.

| Token | Role | Ink | Paper |
|---|---|---|---|
| `--shadow-sm` | Resting lift (cards, menus) | `0 6px 18px rgba(0,0,0,0.28)` | `0 6px 18px rgba(38,28,14,0.08)` |
| `--shadow-lg` | Modals, high overlays | `0 18px 44px rgba(0,0,0,0.45)` | `0 18px 44px rgba(38,28,14,0.12)` |
| `--focus-ring` | Keyboard focus | `0 0 0 3px var(--accent-dim)` | same |

### 3.8 Typography

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | `'Outfit', sans-serif` | Everything UI — body, labels, buttons, most headings |
| `--font-serif` | `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif` | Display moments — the greeting, big section titles. Editorial warmth. |
| `--font-mono` | `ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace` | Overlines, section numbers (`01 / 02 / 03`), code, metadata, technical labels |

Never `Georgia`, `Poppins`, `monospace`, or raw `sans-serif` in a component — use the token so the stack is consistent and swappable.

### 3.9 Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `4px` | Tiny chips, tags, inline marks |
| `--radius-sm` | `7px` | Small buttons, inputs, icon buttons |
| `--radius-md` | `9px` | Standard controls, small cards |
| `--radius-lg` | `12px` | Cards, panels |
| `--radius-xl` | `14px` | Modals, large surfaces |
| `--radius-pill` | `999px` | Pills, toggles, fully-round chips |

Never a raw `16px`, `20px`, `28px`. Snap to the scale.

### 3.10 Corner shape — Apple squircles

`design-system.css` sets `corner-shape: superellipse(2)` on `*` globally, so **every rounded rectangle is a continuous-curvature squircle** without touching components. Corners flow into the sides instead of snapping to a circular arc.

- True circles &amp; pills (avatars, icon buttons, the FAB, dots, swatches, badges, react-flow handles) are pinned back to `corner-shape: round` via a curated substring-selector reset in section 5 of the CSS.
- **When you add a new circular/pill primitive**, add its class substring to that reset list, or it will render as a rounded-square.
- Degrades gracefully to normal rounded corners on browsers without `corner-shape` support (Chrome 139+ required for the effect).

### 3.11 Motion

Motion is gentle and purposeful — it eases things into place, it does not bounce or sparkle.

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `0.15s ease` | Hover, small state changes |
| `--transition-smooth` | `0.4s cubic-bezier(0.25,0.8,0.25,1)` | Panels, larger transitions |
| `--ease-rise` | `cubic-bezier(0.22,0.9,0.3,1)` | Enter animations (rise + settle) |

No infinite pulsing glows, no floating loops, no attention-seeking idle motion.

---

## 4. Colour usage rules

- **Accent is earned.** One persimmon element per view carries the primary action or focus. If everything is accented, nothing is.
- **Fills vs. ink.** `--accent`/`--secondary` are for fills; `--accent-ink`/`--secondary-ink` are the contrast-safe versions for coloured *text, icons, and borders*. On top of an accent fill, labels use `--on-accent`.
- **Custom alphas go through the channels.** Need a 20%-persimmon wash? Write `rgba(var(--accent-rgb), 0.2)`, never `rgba(249, 93, 46, 0.2)`. Same for `--secondary-rgb`.
- **Warm gradients only.** A brand gradient runs within the warm family — e.g. `linear-gradient(135deg, var(--accent), var(--secondary))` or `… var(--accent-deep), var(--accent)`. Never persimmon → indigo, amber → blue, or any cool stop.
- **Gradient text** (for a display heading) must be theme-aware: `linear-gradient(135deg, var(--text-main), var(--accent))`, never starting from `#fff`/`#ffffff` (invisible in Paper).

---

## 5. Functional &amp; categorical colour (the permitted exception)

The single-accent rule governs **brand and chrome**. It does **not** govern colour that carries *user meaning*:

- Tag category colours, the note/icon colour picker, status greens/reds/blues, collaborator cursor colours, syntax highlighting.

These may use a broader, saturated palette **because the colour is information**, not decoration. Two guardrails:

1. Keep them in a clearly *functional* context (a picker, a tag, a status dot) — never as page chrome, section accents, or brand gradients.
2. **Label them honestly.** A swatch called "Cyan" must render cyan. (A past migration force-substituted brand values into these slots and left the labels lying — never do that.)

If a colour is decorative rather than informational, it must be persimmon, amber, or a neutral token — not a categorical hue.

---

## 6. Layout &amp; composition

The editorial grammar of the system:

- **Hairline rules** (`--line`) divide and group. A single 1px rule does the work a box or shadow would in other systems.
- **Mono overlines + numbers.** Sections are introduced by a small uppercase mono label, often numbered `01 / 02 / 03`. Quiet, structural, print-like.
- **Serif display for the human moment.** The greeting and the largest titles use `--font-serif` — the one place warmth turns up. Everything else is `--font-sans`.
- **Generous whitespace.** Space is the primary tool for hierarchy and calm. Crowding is off-brand.
- **Left-aligned, honest structure.** Content reads like a document. Center only deliberately (empty states, focused modals).
- **Honest content.** Show real status — what works today, what is on the bench, house rules — over hype. This is a product used by someone doing work.

---

## 7. Component patterns

How the tokens resolve into the elements you build. When adding a component, match these.

- **Primary button** — `--accent` fill, `--on-accent` label, `--radius-sm/-md`, `--transition-fast` hover to `--accent-hover`. No glow shadow; at most `--shadow-sm` if it must lift.
- **Secondary / ghost button** — transparent or `--bg-card`, `--line` border, `--text-main` label, `--hover-wash` on hover.
- **Card** — `--bg-card`, `1px solid var(--line)`, `--radius-lg`, `--text-main` body. Rest with no shadow; `--shadow-sm` only when genuinely floating.
- **Modal / menu / popover** — `--bg-raised`, `--line` border, `--radius-xl` (modal) / `--radius-md` (menu), `--shadow-lg`. Overlay scrim is a plain dark wash (e.g. `rgba(0,0,0,0.5)`) with **no blur**. Font `--font-sans`.
- **Input / textarea / well** — `--bg-inset`, `--line` border, `--text-main` value, `--text-faint` placeholder, `--focus-ring` on focus.
- **Badge / chip / overline** — `--accent-dim`/`--secondary-dim` background, `--accent-ink`/`--secondary-ink` text, `--radius-xs`/`--radius-pill`, often `--font-mono` uppercase.
- **Avatar** — round (pinned in the squircle reset). Warm brand gradient `linear-gradient(135deg, var(--accent), var(--secondary))`, `--on-accent` initials. Never a cool gradient.
- **Icon button / dot / handle** — round, `--hover-wash` interaction, `--accent-ink` when active.
- **Focus** — always visible, always `--focus-ring`. Accessibility is not optional.

---

## 8. Theming contract

- The app stamps `data-theme="dark"` or `"light"` on `:root`. Ink is the default.
- Because everything is tokenised, **a correctly-built component needs zero theme-specific code** — it just works in both.
- Test every new element in **both themes** before shipping. The classic failure is dark-only design: hardcoded `#fff` text or a `rgba(20,22,32,…)` surface that turns into white-on-white or a dark box floating on Paper.

---

## 9. What "elevation" and "separation" may use

Allowed, in order of preference: **hairline (`--line`) → whitespace → `--shadow-sm` → `--shadow-lg`**.
Banned for depth: blur, glass translucency, coloured/glow shadows, gradients-as-fake-light, `mix-blend-mode` screen.

---

## 10. Code conventions

- **`var(--…)` everywhere it's possible.** CSS, CSS Modules, and inline React styles can all read tokens (`style={{ background: 'var(--bg-raised)' }}`).
- **Legacy aliases still resolve** (`--color-primary`, `--glass-bg`, `--border`, …) and now point at Paper &amp; Ink values, but **prefer the new token names** in new code. Treat `--glass-*` as "flat near-solid panel", not glass.
- **Fallbacks mirror the token, never a cold default.** `var(--accent, #f95d2e)` is fine; `var(--color-accent, #6366f1)` is a bug (also: `--color-accent` isn't even defined, so it *always* renders indigo). If you write a fallback, it must equal the token's real value.
- **Contexts that cannot use `var()`** — `<canvas>` 2D context, SVG presentation attributes (`fill="…"`, `stroke="…"`), and persisted/serialised data — **mirror the literal**: `#f95d2e` (accent), `#e3a24f` (secondary). Keep these literals in sync with the tokens. Prefer `style={{ fill: 'var(--accent)' }}` over a `fill=` attribute when the element is real DOM.
- **No new raw brand hexes.** Persimmon `#f95d2e/#c9411a`, amber `#e3a24f/#b07818`, and their family belong only in `design-system.css` (and the sanctioned mirrors above).
- **Recommended guardrail:** a lint rule that bans raw brand hexes and `backdrop-filter` outside `design-system.css`, so drift can't regress.

---

## 11. Ship checklist

Before any UI element or screen is done, it must pass all of these:

- [ ] Uses **only tokens** — no raw brand hex, no raw white/black text, no off-scale radius.
- [ ] Correct and legible in **both Ink and Paper** (checked, not assumed).
- [ ] **No glass** — zero `backdrop-filter`; surfaces are solid token backgrounds.
- [ ] **No glow** — no coloured/blurred shadows, no radial ambient washes, no `text-shadow` halos, no SVG glow filters, no particles.
- [ ] **One accent** carrying primary focus; colour spent sparingly.
- [ ] Fonts are `--font-sans/-serif/-mono` (no Georgia/Poppins/raw generics).
- [ ] Depth is hairline → whitespace → `--shadow-sm/-lg`, nothing else.
- [ ] Custom alphas use `rgba(var(--accent-rgb) | var(--secondary-rgb), …)`.
- [ ] Categorical colours (if any) are genuinely *informational* and **honestly labelled**.
- [ ] Focus state is visible via `--focus-ring`.
- [ ] New circular/pill primitive? Added to the squircle `round` reset list.
- [ ] No in-app marketing copy; content speaks to a user doing work.

---

*Extend this direction — never the old glass/cosmic one. When a token is missing (e.g. an rgb channel for a shade), add it to `design-system.css` rather than hardcoding around it.*
