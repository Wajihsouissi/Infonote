/**
 * Whether input at this element belongs to a text field rather than the canvas.
 *
 * One definition for every canvas shortcut, paste, copy and blur rule: typing
 * in a card must never pan the canvas, create a block or copy whole cards.
 */
const EDITABLE_CONTAINER = '[contenteditable], [data-chnk-it-block-editor], [class*="BlockEditor"], [class*="editor"]';

export function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLElement
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return true;
    }
    return target.closest(EDITABLE_CONTAINER) !== null;
}
