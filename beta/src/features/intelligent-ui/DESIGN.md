---
name: "Intelligent UI — local extension"
description: "Working visuals embedded in native note content, with quiet host chrome."
colors:
  accent: "var(--accent)"
  on-accent: "var(--on-accent)"
  surface: "var(--bg-card)"
  text: "var(--text-main)"
  muted: "var(--text-soft)"
  border: "var(--line-strong)"
typography:
  body:
    fontFamily: "Outfit, sans-serif"
    fontSize: "var(--block-font)"
    lineHeight: 1.6
  visual-body:
    fontFamily: "Outfit, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  prompt:
    fontFamily: "Outfit, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: "20px"
  label:
    fontFamily: "Outfit, sans-serif"
    fontSize: "0.75rem"
rounded:
  enclosure: "12px"
  field: "6px"
spacing:
  compact: "8px"
  inset: "16px"
components:
  visual-enclosure:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.enclosure}"
    width: "100%"
  prompt:
    textColor: "{colors.text}"
    typography: "{typography.prompt}"
    rounded: "{rounded.field}"
    padding: "8px 6px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    size: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    size: "36px"
  keep-action:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "4px 8px"
---

# Design System: Intelligent UI

## Overview

**Creative North Star: "Visual as Content"**

This is a component-local extension of the existing Paper & Ink / Charcoal & Signal system, not a replacement identity. A working visual belongs in the document alongside native prose. Outfit, paper or charcoal surfaces, thin rules, and the existing persimmon action accent keep it part of the editor.

Host chrome recedes: an empty block presents one prompt row; a completed visual presents its content followed by a compact refinement row. Native document headings and explanatory prose sit outside the visual enclosure. They do not become a second generated presentation layer. The visual carries the interaction; host actions stay compact and secondary.

**Key Characteristics:**
- Native prose before and after a working visual.
- One host enclosure with a quiet refinement rail.
- A visible visual in both canvas states, with controls activated by selection.
- Theme-bound surfaces, text, borders, and action states.
- Fluid width, content-driven height, and restrained motion.

## Colors

The frontmatter binds semantic roles to live upstream CSS properties. Exact palette values and both theme definitions remain authoritative in `../../styles/design/colours.css`, imported by `../../styles/design-system.css`; this module does not fork them.

### Primary
- **Persimmon action:** the existing accent and on-accent pair identify generation, keyboard focus, and meaningful content emphasis. Accent-ink supplies the prompt icon; accent-hover supplies the primary hover state.

### Neutral
- **Paper / charcoal surface:** the existing card surface is shared by the host and embedded visual.
- **Main ink:** primary content and active control text.
- **Soft ink:** placeholders, secondary actions, and passive guidance; disabled controls use faint ink on the raised surface.
- **Hairline:** strong lines define the host edge; the quieter line separates refinement from the visual. Hover wash signals secondary interaction. Errors use the upstream danger role.
- **Embedded controls:** select fields use the inset surface, menus use the raised surface, and hovered or selected options use the existing hover wash. Scrollbar thumbs use strong lines with faint ink on hover, over transparent tracks. Embedded content receives the host color scheme as well as its semantic colors.

**The Inherited Palette Rule.** Consume upstream roles in both themes; never promote the iframe's emergency fallback colors into this system.

## Typography

**Body Font:** Outfit, sans-serif, inherited from the application. The visual receives the computed host font and bundled font data rather than selecting another display family.

### Hierarchy
- **Native prose:** the incumbent editor body and heading ramp remains authoritative. Do not recreate a parallel heading hierarchy in host chrome.
- **Visual body:** compact readable content (14px, line-height 1.5) provides the embedded document baseline; functional visual content may establish its own meaningful hierarchy.
- **Prompt:** compact supporting text (0.8125rem, line-height 20px).
- **Label:** secondary keep action and the subtle streaming preview badge (0.75rem).

**The Native Prose Rule.** Keep document explanations and headings as native editor blocks around the visual, rather than repeating them inside its frame.

## Layout

The visual fills the available width, with zero minimum inline size so it can shrink with its note. Native prose and the visual form one vertical reading flow; assistant answers use a compact gap (8px). The iframe has content-driven height and a restrained interior inset (16px), rather than a fixed presentation canvas.

The prompt row uses flex layout, compact padding and gaps (8px), a flexible textarea, and fixed square action targets (36px). The textarea grows from a single row to its local cap (100px), retaining a compact supporting role. Error content wraps. No module-specific viewport breakpoint is introduced: the same structure must survive narrow note widths.

**The Visible Content Rule.** Keep the visual and its compact composer visible while the canvas node is unselected. Selection activates the controls; it does not reveal previously hidden content. The unselected surface supports direct node dragging through an invisible drag surface, with no visible grip control.

**The Below Trigger Rule.** Menus open below their trigger and never flip above it. The enhanced single-select picker matches its trigger's width, starts just below the field (4px), clamps within the frame's horizontal edges (8px inset), and caps its height (240px) with internal scrolling. The frame temporarily makes room for the open picker and returns to its content-driven height when it closes.

At narrow widths, select fields shrink within their container, option labels wrap, and menu overflow scrolls within the menu rather than widening the note. Vertical and horizontal scrollbars share the same thin treatment.

Normal content height remains bounded (1600px); an open picker may add only its bounded temporary headroom (up to 240px). The working frame and standalone export restore the normal content height on closure.

## Elevation & Depth

The host is flat at rest. A thin enclosing border, surface tone, and the refinement divider establish structure; it adds no decorative shadow, glow, or glass layer. Functional controls and visual groups may retain their own borders.

**The Single Enclosure Rule.** The host owns the enclosing tool surface. Flatten a redundant lone generated outer tool wrapper; preserve borders and grouping that explain controls, grids, diagrams, or application structure.

## Shapes

The host and passive preview use a gently curved block enclosure (12px), aligned with the upstream large block radius. The textarea and streaming preview badge use a small local radius (6px). Native host buttons inherit the application's global button radius and continuous-corner treatment; global `--btn-radius` overrides their local radius declarations. Embedded visual controls remain content-specific rather than receiving that host override.

## Components

### Prompt and refinement

A single borderless field sits inside the enclosing block. Empty state uses one small prompt icon and direct placeholder text. Once content exists, the compact refinement row sits below it behind a thin divider. Do not add an introductory title, description, or repeated instruction above this row. Keyboard submission and accessible labels remain available without adding visible chrome.

### Buttons

Primary generation uses the inherited accent pair; secondary download, restore, and stop actions are transparent with soft ink. Hover applies the upstream wash and main ink to secondary actions. Disabled primary actions become raised neutral surfaces with faint ink. Square targets remain compact (36px); the keep action is a quiet text action with a smaller minimum height (32px). Use one HTML download icon in the completed block's refinement rail and one beside the keep action in the Ask answer footer. Restore and stop retain their established icons and placement within the same compact action row.

Keyboard focus has an accent outline (2px, offset 2px); native buttons also retain the upstream focus shadow. Error recovery uses a bordered text button. Do not substitute text glyphs for the existing SVG icon system.

### Visual enclosure

The iframe is borderless inside the host. It inherits the current card, inset surface, main text, soft text, strong border, accent, and font roles through `--ui-*` properties. Theme changes propagate into the visual. Chart defaults inherit host text, border, and font roles as well. Controls retain their own meaningful borders and focus affordances; host flattening is scoped to a redundant outer wrapper. Visual libraries are available locally on demand and add no provider or library badges to host chrome.

AI follow-up buttons belong to generated content, where their purpose relates to the current visual. They start a new Ask with the current control values; they do not add a second host prompt panel or move surrounding native prose into the frame.

### Passive preview and answer

The unselected canvas projection renders the same visual and compact composer as the selected block, inside the same quiet enclosure. Its host is inert: controls cannot edit saved state, generate content, or send AI follow-ups. Selecting the node enables normal control interaction. Dragging the unselected surface moves the node without adding a grip; selected form controls retain their normal interaction rather than starting native HTML dragging. Do not replace the visual with a selection cue or placeholder.

Assistant output places native prose before and after the enclosed visual and puts the quiet keep and download actions below it.

During generation, an inert visual preview occupies the content area while the host retains its compact progress and stop controls. Its small Preview badge uses the label typography, card surface, and soft ink; it is a state cue rather than a banner. Preview controls are inactive. The working frame becomes available after validation and reports loading and readiness accessibly, without extra explanatory chrome.

### Selects and scrollbars

Prefer native select controls, retaining their keyboard behavior, accessible semantics, and value changes. Single-select menus progressively enhance where supported; the browser's native select remains the fallback. Fields and options use compact targets (36px minimum height), inherited text and font, meaningful borders, and gently curved edges. The chevron stays at the far edge; selected-option checkmarks use the existing accent. Open fields use an accent border, while hovered and selected options use the host hover wash. Disabled options remain visibly muted.

The shared control treatment applies to the working frame, inert streaming preview, and downloaded HTML. Scrollbar tracks and corners stay transparent; both axes use the same thumb thickness (8px where supported), rounded thumbs, and host-bound hover color. Preserve the editor's quiet scroll treatment instead of giving embedded content a separate scrollbar palette.

### Progress and errors

Generation uses a small inline spinner and a stop action. Busy and loading states expose accessible status, and readiness clears the frame's busy state. Reduced motion disables the spinner and embedded visual animation or transitions. Errors are concise, wrapping text in the upstream danger role, with local recovery when available.

## Do's and Don'ts

### Do:
- **Do** inherit upstream theme roles and Outfit rather than copying palette values into this module.
- **Do** keep native prose outside the working visual and preserve a single host enclosure.
- **Do** retain borders that make controls, diagrams, or functional groups understandable.
- **Do** preserve the compact prompt row, visible keyboard focus, and reduced-motion behavior.
- **Do** keep streaming previews inert, expose busy and readiness states accessibly, and let the working visual dominate.
- **Do** keep AI follow-up buttons within generated content and carry current control values into the new Ask.
- **Do** open menus below their triggers, constrain narrow-width overflow, and restore the frame's height when a menu closes.
- **Do** preserve native select semantics and share the host's control and scrollbar treatment across frame, preview, and export.
- **Do** keep the visual and compact composer visible when unselected, activate controls on selection, and support direct dragging from the unselected surface.

### Don't:
- **Don't** add repeated headings, descriptions, or instructional banners to host chrome.
- **Don't** surround a tool with a redundant generated card inside its host enclosure.
- **Don't** flatten meaningful control borders or apply the wrapper rule to every content group.
- **Don't** introduce glass, decorative glows, new brand colors, or an independent display face.
- **Don't** add provider or library badges, export toolbars, or explanatory banners around the visual.
- **Don't** flip menus above their triggers or let long option labels widen the note.
- **Don't** replace an unselected visual with a selection prompt or add a visible drag grip.
