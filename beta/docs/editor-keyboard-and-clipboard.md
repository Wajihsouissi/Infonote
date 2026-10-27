# Editing with the keyboard and clipboard

## Text and block navigation

Enter splits at the current selection, replacing selected text and keeping the formatting of both remaining halves. Backspace at a block's start joins it to the previous text block. Delete at its end joins the following text block. Empty headings and list items return to ordinary text according to their keyboard rules. Opaque media retains its own boundary behavior.

Up/Down navigate native wrapped lines first, then the neighboring visible block, using the caret's screen column where the browser provides it and clamping to shorter text. Collapsed toggle descendants are skipped. Ctrl+A selects current text; another Ctrl+A selects blocks in that document. Nested editors own their own block selection.

## Block commands

Type `/` at the start of a paragraph to open block search. Use arrows and Enter to choose a type; Escape closes search even with no matches, keeps the paragraph's existing content and returns focus to it. Search input belongs to the menu, rather than adding every search keystroke to the document.

Supported marker shortcuts include `# `, `## `, `### `, `- `, `1. `, `[] `, `> ` and `>> `. Backspace immediately after a conversion restores its literal marker; typing after that does not immediately reconvert it.

## Copy, cut and paste

Select blocks with the grip/range controls, then Ctrl+C or Ctrl+X. A selected toggle includes its descendants, including hidden content. Copying inside a nested editor affects that editor's selection. Internal copies retain nested formatting, metadata and columns, with fresh block/column identities when pasted.

Selection actions stay visible inside the editor, above the card's footer, including in long documents. Toolbar Cut removes blocks only after a successful clipboard write and only if that copied content has not changed while waiting. A refused write or newer edits leave the source intact; allow clipboard access or use native keyboard copy/cut as appropriate.

Pasting after a selected toggle inserts after its complete branch. Pasted structure inherits the destination's nesting level while retaining its internal relative depths; a paste into a toggle body stays inside that body. A collapsed pasted branch returns focus to its visible header.

External HTML/Markdown becomes editable native headings, lists, code, tables and links. Supported inline formatting stays formatted at the caret. Pasting over selected formatted text replaces that selection and preserves both remaining tails. Code-area paste is literal, including its line breaks. Active HTML is not inserted as raw markup. Invalid structured carriers fall back to ordinary visible HTML/text; carriers beyond 128 levels of metadata block nesting are rejected before recursive cloning. This nesting guard does not limit text length or sibling count.

## History and saving

Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes; the workspace header provides the same actions. Structural actions are grouped rather than recording selection or measurement as edits. Browser-native text history and application structural history must be tested in their actual focused contexts.

Typing publishes after a short debounce with a bounded continuous-typing interval. Leaving an editor and lifecycle transitions flush pending writes. Wait for **Saved on this device** before closing. Local pending edits merge with unrelated incoming owner changes; confirmed deletions stay deleted. This is local document reconciliation, not a multi-user/cloud synchronization protocol.

## Composition and access

Composition confirmation must keep the editing host and publish confirmed text once. Automated Chromium browser-composition checks use CDP; these do not certify a real operating-system IME or a screen reader. The remaining OS IME and assistive-technology manual procedures are recorded in `qa/scrum-29/MANUAL-IME-AND-ACCESS.md`.

Validation source, exact browser results, local screenshots and English/Tunisian reports are in `qa/scrum-29/`. Supabase/authenticated cloud saving remains deferred.
