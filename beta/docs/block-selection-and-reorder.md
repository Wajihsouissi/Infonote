# Block selection and reorder

The grip appears on hover or keyboard focus without moving the text. Drag it to move a block. A simple accent line marks the insertion point: the upper half of a paragraph inserts before it; the lower half inserts after it. Gaps and empty note space also accept drops.

When a reorder opens a gap, one line stays at its center. Moving anywhere within that gap, including either edge, keeps the same destination. The line follows the gap while the neighbors slide; it does not alternate between their top and bottom borders.

While dragging within a document, the insertion line responds immediately. After the pointer settles on a destination for 100 ms, nearby sibling blocks slide into their prospective positions over 180 ms. Passing quickly through other blocks does not shuffle the stack. The carried block stays hidden in the stack. Its rendered content follows the pointer at the current canvas scale, preserving its typography and formatting, without a separate caption, shadow panel or translucent native duplicate. This preview does not save or change the document. Dropping works immediately, including before the preview starts. Reduced motion removes both the delay and transition. Media keeps its explicit before/merge/after zones; changing hierarchy inside a toggle uses the insertion marker rather than flattening the branch for a preview.

- Click a grip to select a block/open its menu. Shift-click another block to extend the range; drag any grip in the range to move it in document order.
- Hold Ctrl and drag to draw a block selection rectangle. Shrinking it back to an empty rectangle clears the selection.
- Ctrl+A selects the current text; press it again to select the document's blocks. A nested editor owns its own selection.
- Delete or Backspace removes selected blocks. A toggle travels or deletes with its descendants, including collapsed content.
- Escape cancels a drag or clears block selection. It leaves the canvas card available for another edit.
- Ctrl+Z undoes a structural move/deletion; Ctrl+Y or Ctrl+Shift+Z redoes it. The workspace header also provides Undo/Redo.
- A focused grip supports Alt+Up/Down. Text editing also has the existing Ctrl+Shift+Up/Down block commands.
- Moving between nested editors updates their common document atomically. An ancestor cannot move into its own descendant.
- A destination card in reading mode accepts a block before/after the paragraph under the pointer without opening its editor.

Wait for **Saved on this device** before closing the workspace. These checks cover browser-local storage. Supabase, cloud saving and authenticated synchronization remain outside this ticket's validation scope by the user's instruction.

Validation procedures and evidence: `qa/scrum-125/`. The headed tests use synthetic isolated contexts on `127.0.0.1:5188`.
