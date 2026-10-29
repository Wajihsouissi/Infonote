# Text and structural blocks

The card editor, fused-note editor and standalone canvas blocks support Text, Heading 1–3, Bullet List, Numbered List, To-do List, Toggle List, Callout, Quote, Code, Divider and Color Block.

## Everyday controls

- In a document, type `/` in an empty paragraph and search the block menu. On empty canvas, right-click and choose **Add Block**.
- Focus an editable block and press **Ctrl+/** for its block menu; **Turn into** changes its type while retaining its identity and text where the target type supports text.
- **Enter** splits text; **Backspace** at the start joins it. **Tab/Shift+Tab** change list indentation; **Ctrl+Shift+ArrowUp/Down** reorder document blocks.
- To-do checkboxes retain both their checked state and text. Toggle disclosure buttons support Enter/Space and affect their indented descendants. Toggle headings retain a heading level in the outline.
- The callout icon button opens the icon picker. Existing saved `Lightbulb` callouts remain supported.
- Code treats markup as literal text. Tab inserts indentation; Shift+Tab removes one leading indent from the caret's current line. **Copy code** copies its literal text; Windows clipboard reads can use CRLF line endings.
- A divider has no editable text. Converting a standalone canvas paragraph to a divider creates a new text block below it for continued typing.
- Open a color swatch with **Edit color**. The dialog offers HEX/RGB/HSL, a name and copy controls. Valid HEX input has 3 or 6 digits. Invalid input shows guidance and retains the last valid swatch. Tab stays within the dialog; Escape closes it and restores focus. If clipboard permission is denied, copy feedback explains how to recover.

## Local durability

Document typing is debounced; pending editor text immediately marks the workspace unsaved. Local persistence publishes pending drafts before taking a graph snapshot. Discrete commands and standalone canvas edits publish immediately. Wait for the saved state before closing the browser: an IndexedDB write is asynchronous, so a forced process termination cannot guarantee its completion.

Supabase authentication and remote/cloud saving are future work under the agreed scope. This guide describes the browser-local application.

## Validation

See `qa/scrum-27/` for the candidate manifest, English/Tunisian reports, scenario results and screenshots. The focused suite is `e2e/scenarios/core/scrum-27.spec.ts`.
