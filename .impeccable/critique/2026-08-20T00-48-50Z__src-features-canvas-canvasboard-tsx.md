---
target: all canvas blocks
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-20T00-48-50Z
slug: src-features-canvas-canvasboard-tsx
---
## Canvas UI Report

### Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Modes and exits are not always persistent. |
| 2 | Match between system and real world | 3 | Note/Block/Fused Note taxonomy is unclear. |
| 3 | User control and freedom | 3 | History is strong; mode exits are easy to miss. |
| 4 | Consistency and standards | 3 | Multiple card interaction metaphors compete. |
| 5 | Error prevention | 2 | Dense action surfaces invite accidental mode changes. |
| 6 | Recognition rather than recall | 2 | Hover-only affordances and shortcuts require memory. |
| 7 | Flexibility and efficiency | 4 | Excellent shortcuts, paste, selection, and linking support. |
| 8 | Aesthetic and minimalist design | 3 | Canvas is composed well but can collect too much chrome. |
| 9 | Error recovery | 2 | Undo exists, but recovery paths are not explicit. |
| 10 | Help and documentation | 2 | Shortcut help exists; contextual first-use guidance is absent. |
| **Total** | | **27/40** | **Acceptable — significant improvement needed** |

### Design Specificity Verdict

The editorial canvas is product-specific: framed dot-grid, restrained paper-and-ink surfaces, compact rails, and differentiated block families feel authored. It loses clarity when a single card exposes overlapping models for editing, dragging, resizing, connecting, and opening in multiple views.

The mechanical scan reported two warnings, both false positives: `CanvasBoard.module.css:123` transitions SVG `stroke-width`, not layout width; `BottomMenu.module.css:894` uses transform/opacity-only dot bounce. No errors were found in the scoped canvas, block, card, kanban, and menu sources.

### What is Working

- Calm, premium canvas shell with strong framing and navigational composition.
- Fast creative workflows: direct paste, slash menu, templates, keyboard shortcuts, and collision-aware placement.
- Robust infrastructure for dense work: viewport culling, memoized overlays, minimap, history, multi-select, and linking.

### Priority Issues

1. **[P1] Simplify the card interaction model.** Consolidate view/open options, reserve hover chrome for secondary actions, and make drag/edit/connect/resize distinguishable at a glance.
2. **[P1] Make active modes and exits persistent.** Linking, selection, and focus need a visible status and clear exit action.
3. **[P1] Repair canvas accessibility naming.** Default note title inputs are inconsistently labelled; the canvas nodes lack semantic naming in the inspected state. Give every editable title an explicit label and expose node type/title to assistive technology.
4. **[P2] Reveal selected-node affordances.** Make connection and resize cues subtly visible when selected, not only on hover.
5. **[P2] Increase compact control targets.** React Flow controls measure about 28x24px and AI/search about 40x40px. Use 44px targets where touch is supported.

### Persona Red Flags

- **Alex, power user:** Will enjoy shortcuts and multi-select, but mode exits and competing view states can still interrupt flow.
- **Jordan, first-timer:** Cannot reliably infer whether to drag, edit, resize, or connect a new card without first-use guidance.
- **Sam, accessibility-dependent:** Unlabelled title fields and unnamed React Flow nodes weaken keyboard and screen-reader navigation.

### Minor Observations

- The 116px minimap/control stack is compact but visually and physically tight.
- Mobile viewport test did not overflow, but desktop-positioned nodes sit offscreen and need panning; focused canvas CSS has no responsive media rules.
- Fullscreen/center modal focus management is a verified positive: obscured canvas content is made inert.

### Questions to Consider

1. Can a new user distinguish drag, edit, resize, and connect within five seconds?
2. Which card view mode is the default in practice, and why does a card open there?
3. At 30–50 mixed blocks, what keeps the board scannable without introducing visual noise?
