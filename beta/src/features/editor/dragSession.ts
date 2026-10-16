/**
 * What the drag in flight is carrying, remembered in this page.
 *
 * Every drag here — a block between cards, a tile within a board, a card onto
 * the canvas — starts and ends in one page, but the payload has been travelling
 * through `dataTransfer` as if it were crossing to another application. That is
 * the only way to reach another window, so it stays; the trouble is that custom
 * types are not carried everywhere. WebKit's Windows build replaces
 * `application/chnk-it-…` with `text/plain`, `text/uri-list` and `text/html`
 * between `dragstart` and `dragover`, so a board stopped recognising its own
 * tiles and dropped them back where they came from.
 *
 * So the page remembers too. `dataTransfer` stays the source of truth wherever
 * the engine hands it back — behaviour is unchanged in Chrome, Firefox, Edge
 * and Safari — and this fills the gap where it does not, which is also what
 * makes those paths testable in every engine we run.
 *
 * The session clears itself on the first `drop` or `dragend` after it starts,
 * so nothing survives into the next drag.
 */

export type DragEntries = Record<string, string>;

let session: DragEntries | null = null;
let listening = false;
let endTimer: number | undefined;

function stopListening(): void {
    if (!listening) return;
    listening = false;
    document.removeEventListener('drop', scheduleEnd, true);
    window.removeEventListener('dragend', scheduleEnd, true);
}

/**
 * Forget the drag after the handlers for this event have run.
 *
 * The listeners below are on the capture phase, so they see `drop` before the
 * target does — clearing there took the payload away from the very handler
 * that needed it. A timeout of zero lands after the whole event has been
 * dispatched, which is late enough for the drop and early enough that nothing
 * survives into the next drag.
 */
function scheduleEnd(): void {
    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(end, 0);
}

function end(): void {
    window.clearTimeout(endTimer);
    endTimer = undefined;
    session = null;
    stopListening();
}

/**
 * Put `entries` on the drag and remember them. Call once from `dragstart`,
 * in place of the `setData` calls it replaces.
 */
export function startDragSession(dataTransfer: DataTransfer, entries: DragEntries): void {
    session = { ...entries };
    for (const [mime, value] of Object.entries(entries)) {
        dataTransfer.setData(mime, value);
    }
    if (!listening) {
        listening = true;
        // Capture: a handler that stops propagation must not strand the session.
        document.addEventListener('drop', scheduleEnd, true);
        window.addEventListener('dragend', scheduleEnd, true);
    }
}

/** Forget the drag in flight. The failsafes above usually get there first. */
export function endDragSession(): void {
    end();
}

/** Whether the drag carries `mime` — by the event, or by what the page kept. */
export function dragHasType(event: { dataTransfer: DataTransfer | null }, mime: string): boolean {
    if (event.dataTransfer?.types.includes(mime)) return true;
    return session?.[mime] !== undefined;
}

/** The value the drag carries for `mime`, or '' when it carries none. */
export function readDragData(event: { dataTransfer: DataTransfer | null }, mime: string): string {
    const fromEvent = event.dataTransfer?.getData(mime) ?? '';
    return fromEvent || session?.[mime] || '';
}
