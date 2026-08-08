/**
 * The block drag "lock": `window.chnkItBlockDragging` plus the
 * `chnk-it-block-dragging` body class, both raised while a block is being dragged.
 *
 * The class is not cosmetic — it paints a `::before` overlay across every
 * `.sortableWrapper` (BlockEditor.module.css) to widen the drop hit-test zone, and
 * the flag makes selection, focus-restore and canvas blur handlers stand down. If
 * either leaks, the editor looks normal but swallows every click: no caret, no
 * typing, until a reload.
 *
 * Releasing on `dragend` alone leaks. A cross-node drop deletes the dragged block
 * from its source editor, React unmounts the source element while handling `drop`,
 * and a detached element's `dragend` is dispatched into nothing — it never reaches
 * document or window, so neither the wrapper's handler nor the global fallback runs.
 * That is the "after a few drags the editor freezes" case.
 *
 * So the lock is released by whichever of these happens first:
 *   - `drop` anywhere in the document (the drop target is always still mounted),
 *   - `dragend` (covers drags cancelled or dropped outside the window),
 *   - Escape,
 *   - any real pointer movement, which the browser only emits once no native drag
 *     is in flight.
 */

const RELEASE_DELAY_MS = 100;

/* A drag start is committed on the next tick, and a mousemove queued just before it
   can still land after. Ignore pointer movement until the drag is really underway. */
const POINTER_GRACE_MS = 300;

let armed = false;
let armedAt = 0;
let releaseTimer: number | undefined;

function cancelPendingRelease() {
    if (releaseTimer !== undefined) {
        clearTimeout(releaseTimer);
        releaseTimer = undefined;
    }
}

/* The drop handlers that run right after a drag need the flag to survive a beat so a
   trailing pointerdown isn't read as a fresh canvas click. */
function scheduleRelease() {
    cancelPendingRelease();
    releaseTimer = window.setTimeout(() => {
        releaseTimer = undefined;
        endBlockDrag();
    }, RELEASE_DELAY_MS);
}

function handleDrop() {
    scheduleRelease();
}

function handleDragEnd() {
    scheduleRelease();
}

function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') endBlockDrag();
}

function handlePointerMove() {
    if (Date.now() - armedAt < POINTER_GRACE_MS) return;
    endBlockDrag();
}

function addFailsafes() {
    document.addEventListener('drop', handleDrop, { capture: true });
    window.addEventListener('dragend', handleDragEnd, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('pointermove', handlePointerMove, { capture: true });
}

function removeFailsafes() {
    document.removeEventListener('drop', handleDrop, true);
    window.removeEventListener('dragend', handleDragEnd, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('pointermove', handlePointerMove, true);
}

/** Raise the lock and arm the release failsafes. Call from `dragstart`. */
export function beginBlockDrag() {
    cancelPendingRelease();
    if (armed) removeFailsafes();

    armed = true;
    armedAt = Date.now();
    window.chnkItBlockDragging = true;
    /* Stale from a previous drag whose dragend never fired — it would make the next
       drag skip its selection cleanup entirely. */
    window.chnkItCrossEditorDropHandled = false;
    document.body.classList.add('chnk-it-block-dragging');

    addFailsafes();
}

/** Drop the lock immediately. Safe to call repeatedly and when no drag is active. */
export function endBlockDrag() {
    cancelPendingRelease();
    if (armed) {
        removeFailsafes();
        armed = false;
    }
    window.chnkItBlockDragging = false;
    document.body.classList.remove('chnk-it-block-dragging');
}
