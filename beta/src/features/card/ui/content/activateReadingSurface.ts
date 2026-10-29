/** Restore a native caret after a reading host acquires editing behavior.
 * Coordinates stay in screen pixels so transformed canvas cards work too. */
export function focusReadingDestination(root: HTMLElement, blockId: string | undefined, row: string | undefined,
    column: string | undefined, x?: number, y?: number) {
    const block = (blockId ? root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`) : null) ?? root;
    const cell = row !== undefined && column !== undefined
        ? block?.querySelector<HTMLElement>(`[data-table-row="${row}"][data-table-column="${column}"][contenteditable="true"]`)
        : null;
    const target = cell ?? block?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!target) return;
    target.focus({ preventScroll: true });
    if (x === undefined || y === undefined) return;
    const doc = target.ownerDocument;
    const position = doc.caretPositionFromPoint?.(x, y);
    const range = position ? doc.createRange() : doc.caretRangeFromPoint?.(x, y);
    if (range && position) range.setStart(position.offsetNode, position.offset);
    if (!range || !target.contains(range.startContainer)) return;
    range.collapse(true);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

/** Preserve the first native selection gesture across a host replacement.
 * Only a real held mouse gesture is observed; no input events are replayed. */
export function continueReadingSelection(root: HTMLElement) {
    const doc = root.ownerDocument;
    const selection = doc.getSelection();
    const anchor = selection?.anchorNode;
    const offset = selection?.anchorOffset ?? 0;
    if (!anchor || !root.contains(anchor)) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const stop = () => controller.abort();
    window.addEventListener('pointermove', event => {
        if (!root.isConnected) { stop(); return; }
        const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
        const range = position ? null : doc.caretRangeFromPoint?.(event.clientX, event.clientY);
        const node = position?.offsetNode ?? range?.startContainer;
        const end = position?.offset ?? range?.startOffset ?? 0;
        if (node && root.contains(node) && anchor.isConnected) doc.getSelection()?.setBaseAndExtent(anchor, offset, node, end);
    }, { signal, capture: true });
    window.addEventListener('pointerup', stop, { signal, once: true, capture: true });
    window.addEventListener('mouseup', stop, { signal, once: true, capture: true });
    window.addEventListener('pointercancel', stop, { signal, once: true, capture: true });
    window.addEventListener('blur', stop, { signal, once: true });
}
