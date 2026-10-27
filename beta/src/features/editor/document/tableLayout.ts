/**
 * tableLayout
 * --------------------------------------------------------------------------
 * Geometry constants and index maths shared by the table block and the canvas
 * node that hosts it. They live here because the two sides must agree: the
 * column handles inside the table and the node's own resize handle both write
 * `metadata.columnWidths`, and a floor enforced on one side only would let the
 * other push columns past it.
 *
 * Every number is in LAYOUT px — never screen px. On the canvas the table sits
 * inside a scaled React Flow viewport, so anything measured with
 * getBoundingClientRect has to be divided by the viewport scale before it
 * meets these values (see `elementScale`).
 */

/** Narrowest a column may be dragged. */
export const MIN_COL_W = 56;

/** Shortest a row may be dragged. Content can still push a row past this — a
 *  row height is a floor, not a lid, so text never gets clipped by a drag. */
export const MIN_ROW_H = 32;

/** Width handed to a column inserted into an already hand-sized table. */
export const NEW_COL_W = 120;

/** Pointer travel before a grip drag counts as a reorder rather than a click. */
export const REORDER_THRESHOLD_PX = 4;

/**
 * Screen px per layout px for `el` — canvas zoom, browser zoom, any ancestor
 * transform. Divide pointer deltas by this to keep drags in layout px.
 */
export const elementScale = (el: HTMLElement): number => {
    const rendered = el.getBoundingClientRect().width;
    return el.offsetWidth > 0 && rendered > 0 ? rendered / el.offsetWidth : 1;
};

/** `arr` with the item at `from` moved to index `to` (both index the original). */
export const moveItem = <T>(arr: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || from >= arr.length) return arr;
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item);
    return copy;
};

/** Index of the column under `clientX`, clamped to the table. */
export const columnAt = (table: HTMLTableElement, clientX: number): number => {
    const ths = [...table.querySelectorAll('thead th')] as HTMLElement[];
    const i = ths.findIndex((th) => clientX < th.getBoundingClientRect().right);
    return i === -1 ? Math.max(0, ths.length - 1) : i;
};

/** Index of the body row under `clientY`, in whole-table terms (header is 0). */
export const rowAt = (table: HTMLTableElement, clientY: number): number => {
    const trs = [...table.querySelectorAll('tbody tr')] as HTMLElement[];
    const i = trs.findIndex((tr) => clientY < tr.getBoundingClientRect().bottom);
    return (i === -1 ? Math.max(0, trs.length - 1) : i) + 1;
};
