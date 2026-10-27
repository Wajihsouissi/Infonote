import type { BlockDropPosition } from '../types';

let active: HTMLElement | null = null;
let listening = false;

export function nearestBlockDropTarget(root: Element, ids: string[], y: number): {blockId:string;position:BlockDropPosition} | null {
    let last: {blockId:string;position:BlockDropPosition} | null = null;
    for (const id of ids) {
        const frame = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
        if (!frame || !frame.getClientRects().length) continue;
        const box = frame.getBoundingClientRect();
        if (y < box.bottom) return {blockId:id,position:y < box.top+box.height/2 ? 'top':'bottom'};
        last = {blockId:id,position:'bottom'};
    }
    return last;
}

export function clearBlockDropIndicator(): void {
    active?.removeAttribute('data-external-drop-target');
    active = null;
    if (listening) {
        document.removeEventListener('drop', clearBlockDropIndicator, true);
        window.removeEventListener('dragend', clearBlockDropIndicator, true);
        window.removeEventListener('keydown', onKeyDown, true);
        listening = false;
    }
}
function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') clearBlockDropIndicator();
}

/** The line is decoration. The whole target receives the native drop. */
export function showBlockDropIndicator(element: HTMLElement, position: BlockDropPosition): void {
    if (active !== element) active?.removeAttribute('data-external-drop-target');
    active = element;
    if (element.dataset.externalDropTarget !== position) element.dataset.externalDropTarget = position;
    if (!listening) {
        document.addEventListener('drop', clearBlockDropIndicator, true);
        window.addEventListener('dragend', clearBlockDropIndicator, true);
        window.addEventListener('keydown', onKeyDown, true);
        listening = true;
    }
}
