# Inline formatting and links

Use the same text controls in a card, fused note, or text block on the canvas. Select the node first, then click its text to edit. Selecting several nodes keeps their bodies in move mode.

## Format selected words

Select text to open the Text formatting toolbar. Toggle bold, italic, underline, strike, or inline code. Clicking a format again removes that format from the selection. Other marks and neighboring words are retained.

| Action | Windows / Linux | macOS |
|---|---|---|
| Bold | Ctrl+B | Cmd+B |
| Italic | Ctrl+I | Cmd+I |
| Underline | Ctrl+U | Cmd+U |
| Strike | Ctrl+Shift+S | Cmd+Shift+S |
| Inline code | Ctrl+E | Cmd+E |
| Default highlight / remove current highlight | Ctrl+Shift+H | Cmd+Shift+H |
| Link | Ctrl+K | Cmd+K |

Text inside inline code is displayed literally. Markdown marks, link syntax, and HTML-looking text inside backticks do not become formatting, links, or elements.

The Highlight palette offers rose, amber, citrine, olive, jade, teal, azure, indigo, violet, and magenta. The shortcut uses citrine when the selection has no highlight.

Press Enter inside formatted text to split the paragraph. Marks and link labels stay with their respective text. Selecting text and pressing Enter replaces the selection with the paragraph break.

## Add, edit, or remove a web link

1. Select its label and open Link from the toolbar or shortcut.
2. Enter an HTTP or HTTPS address. A bare host such as `example.com/help` becomes HTTPS.
3. Press Enter or activate Apply link. Invalid or unsupported addresses show an error and keep the field open.

Open Link again while selecting a linked label to change its destination or choose Remove link. Escape or Cancel returns to the text selection. Normal clicks in the editor edit the label; Ctrl/Cmd-click opens a web link in a separate tab.

Only HTTP and HTTPS are accepted. Script addresses, data URLs, local files and raw HTML are not executable links. `mailto:` and `tel:` are not supported by this link control.

## Pages and source citations

Internal page chips open their existing page. Source citation chips select their source and, when necessary, move to its parent canvas. Focus a chip and press Enter or Space to activate it. Missing or deleted targets leave the current page and selection unchanged.

In AI answers, hovering an existing citation previews its source. Clicking it reveals the actual source node. These controls work with completed answers already in the workspace.

## Saving and troubleshooting

Wait for **Saved on this device** before reloading or closing the browser. Formatting and internal target identifiers are included in local workspace storage. This validation does not establish authenticated cloud saving or Supabase behavior.

If formatting appears to have no effect, confirm that one node is selected and the text selection is inside its editor. A node selected as part of a group stays in move mode. Invalid URLs remain in the link field until corrected or canceled.

**Not saved** means the latest workspace changes have not been confirmed on this device. Keep the workspace open and use **Backup and sign-in** to make a portable backup while investigating the displayed error.

QA evidence and the engine/platform limits are recorded in `qa/scrum-28/REPORT-EN.md`. The macOS shortcuts above describe the implemented modifier mapping; this run validates Windows browsers.
