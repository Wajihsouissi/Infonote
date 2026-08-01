---
target: src/features/block/BlockNode.tsx
total_score: 23
max_score: 32
na_heuristics: 9,10
p0_count: 0
p1_count: 1
timestamp: 2026-07-31T22-05-44Z
slug: src-features-block-blocknode-tsx
---
#### Report header provenance
⚠️ DEGRADED: single-context (spawn_agent unavailable in this session)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Clear visual feedback for dragging, connecting, and skeleton states. |
| 2 | Match System / Real World | 3 | Block metaphor works well for the canvas. |
| 3 | User Control and Freedom | 3 | Double-click handle to reset block size is a good escape hatch. |
| 4 | Consistency and Standards | 3 | Consistent use of the Paper & Ink spine pattern. |
| 5 | Error Prevention | 3 | N/A |
| 6 | Recognition Rather Than Recall | 2 | Crucial controls (Convert, Resize) are completely hidden until hover. |
| 7 | Flexibility and Efficiency | 3 | Resizing and converting offer good flexibility. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean base state, but hover states bleed far outside the block. |
| 9 | Error Recovery | n/a | Node-level error boundaries are not present here. |
| 10 | Help and Documentation | n/a | No contextual help within the node itself. |
| **Total** | | **23/32** | **Acceptable** |

#### Design Specificity Verdict

**LLM assessment**: The visual execution is very specific to the Paper & Ink world. The `spine` accent overlay and hairlines create a crisp, editorial feel that distinguishes it from generic SaaS canvas nodes. However, the interaction model (especially hover controls) feels more like a generic wireframing tool than a fluid thought-canvas.

**Deterministic scan**: 0 issues found in `BlockNode.tsx`. The markup and structure passed the automated checks.

**Visual overlays**: No user-visible overlay was generated because this is a component file rather than a fully rendered route.

#### Overall Impression
The visual aesthetic is perfectly dialed into the brand, but the interaction design relies on precarious hover-states that break out of the component's physical boundaries, creating a frustrating experience when the canvas gets crowded.

#### What's Working
- **The Spine Pattern**: The top accent line (`--node-spine-w`) creates a strong, consistent identity across all block types without adding bulky borders.
- **Intrinsic vs User Sizing**: The logic that allows blocks to grow with content by default, but respects a manual resize floor, is excellent.
- **Skeleton State**: The pulsing skeleton with the `Loader2` is a great way to handle async AI generation locally.

#### Priority Issues

- **[P1] Out-of-Bounds Controls**: The "Convert to Card" button (`top: -32px; right: -32px`) and the Resize Handle (`bottom: -20px; right: -20px`) sit far outside the block's physical footprint.
  - **Why it matters**: On a dense canvas, hovering near one block will accidentally trigger the controls of an adjacent block. Interaction targets outside the bounding box cause severe misclicks.
  - **Fix**: Move the convert button inside the block (e.g., a small floating toolbar that appears *on selection* rather than hover), and inset the resize handle to sit flush with the bottom-right corner.
  - **Suggested command**: `$impeccable layout`

- **[P2] Invisible Discoverability**: Critical features like "Convert to Card" and resizing are completely hidden until the user hovers over the exact node.
  - **Why it matters**: Users rely on recognition. If they don't know a block can be converted to a rich card, they won't use the feature.
  - **Fix**: Show a subtle indicator on selection, or make the handle permanently visible (but muted) for the currently active node.
  - **Suggested command**: `$impeccable clarify`

- **[P2] Hardcoded Placeholder Rigidness**: The `.mediaPlaceholderBlock` enforces a strict `208px` width via `!important`.
  - **Why it matters**: If a user drops a media block into a wider column or layout, it awkwardly snaps to a tiny box until filled.
  - **Fix**: Allow the placeholder to inherit `100%` width of its container up to a max, instead of forcing `208px`.
  - **Suggested command**: `$impeccable polish`

#### Persona Red Flags

**Alex (Power User)**: Will get extremely frustrated if trying to arrange blocks densely. The out-of-bounds hover targets will block Alex from selecting nearby items. Alex expects to select a block and hit a keyboard shortcut to convert to a card, not chase a hover button.

**Casey (Distracted Mobile User)**: Hover states don't exist on touch devices. The `-32px` convert button and `-20px` resize handle will be completely inaccessible or require awkward tap-and-hope interactions.

#### Minor Observations
- The `isHoveredColorBlock` interaction logic manually overrides React Flow's drag, which is clever but brittle.
- The `z-index: 10000 !important` on `.dragging` is a sledgehammer approach that might conflict with modals or overlays (like `z-index: 9999` on the linking overlay).

#### Questions to Consider
- "What if the block had a focused toolbar instead of scattered hover buttons?"
- "Do we really need a manual resize handle on text blocks, or should text always flow intrinsically?"
