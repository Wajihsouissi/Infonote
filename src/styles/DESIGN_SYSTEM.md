# Charcoal & Signal — Design System

The machine-readable source of truth is [`design-system.css`](./design-system.css). All UI surfaces and components consume its tokens; components do not add local brand colors.

## Palette contract

The product uses an intentional 80 / 10 / 10 balance:

- **80% pure charcoal UI:** neutral structure, panels, cards, navigation, dividers, and canvas.
- **10% Hot Coral `#FF5040`:** calls to action, selected/active states, focus, and important controls.
- **10% highlights:** pink, green, yellow, and functional status colors. Highlights give meaning; they never become general chrome.

Blue is not part of the design system. The former navy ramp is replaced with a pure grayscale charcoal ladder.

## Foundations

### Dark: default

| Token | Value | Purpose |
|---|---|---|
| `--bg-inset` | `#000000` | Canvas and deepest wells |
| `--bg-base` | `#090909` | App ground |
| `--bg-rail` | `#121212` | Navigation and structural chrome |
| `--bg-card` | `#1A1A1A` | Cards and resting panels |
| `--bg-raised` | `#242424` | Menus, popovers, and modals |
| `--text-main` | `#FFFFFF` | Main text |
| `--text-soft` | `#E6E6E6` | Secondary text |
| `--text-faint` | `#A3A3A3` | Metadata and quiet labels |

### Light

Light mode uses the **Paper & Ink** warm paper hierarchy for its 80% UI foundation: `#FAF9F6` inset wells, `#F8F7F5` app ground, white rails/cards/popovers, warm-brown hairlines, and warm-neutral shadows. Hot Coral remains the only CTA/state colour; the former orange actions stay removed.

### Action and highlights

| Token | Value | Use |
|---|---|---|
| `--accent` | `#FF5040` | Primary CTA, focus, selected and active states |
| `--accent-hover` | `#FF5040` | Primary-action hover, with no hue shift |
| `--accent-ink` | `#FF5040` | Accent text, icons, and borders |
| `--secondary` | `#FF5040` | Compatibility token for existing controls |
| `--ok` | Green | Success |
| `--warn` | Yellow/orange | Warning |
| `--danger` | Red | Destructive action |

## Rules

1. Use tokens (`var(--...)`) rather than component-level brand hex values.
2. Keep the chrome neutral. Charcoal and grayscale do the layout work.
3. Reserve Hot Coral for action and state; if everything is coral, nothing is important.
4. Use functional colors only where they express user-owned data, status, categories, or emphasis.
5. Never add blue or navy surfaces, action colors, gradients, shadows, or glows.
6. Use hairlines, whitespace, and subtle neutral shadows before adding elevation.
7. Check contrast and both themes whenever creating a new component.

## Component patterns

- **Button system:** use `Button`, `ButtonLink`, `IconButton`, or `FloatingActionButton` from `src/components/ui/Button.tsx`. `ButtonLink` is required for navigation CTAs so links do not create a separate visual language. Every native button also inherits the squircle baseline while older feature controls are migrated.
- **Button variants:** `primary` for Hot Coral calls to action; `secondary` for neutral supporting actions; `ghost` for quiet toolbar actions; `danger` for destructive actions.
- **Button sizes:** `sm` (32px), `md` (40px), and `lg` (48px). Icon buttons use the same size scale and are squircles, not circles.
- **Floating Action Button:** the established add/create hero treatment is centralized as `FloatingActionButton`; it remains visually distinctive but uses the shared squircle corner shape.
- **Primary button:** `--accent` fill with `--on-accent` label; hover to `--accent-hover`.
- **Secondary button:** neutral surface with `--line` border and `--text-main` label.
- **Card:** `--bg-card`, `--line` border, neutral shadow only where it floats.
- **Input:** `--bg-inset`, `--line` border, and `--focus-ring` when focused.
- **Menu/modal:** `--bg-raised`, `--line` border, `--shadow-lg`; no blue tint.

## Compatibility

Older aliases such as `--color-primary`, `--color-secondary`, and `--glass-bg` resolve to the current Charcoal & Signal tokens. New work should use the current semantic tokens directly.
