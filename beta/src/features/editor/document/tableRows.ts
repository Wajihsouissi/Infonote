import { normalizeTableRows } from '../text/markdownTables';

// Immutable arrays are cache keys; old documents disappear with their owner.
const normalized = new WeakMap<string[][], string[][]>();
const canonical = new WeakMap<string[][], string[][]>();
const EMPTY_ROWS: string[][] = [];

/** Repair external/legacy input once. Internal cell edits retain validation. */
export function readTableRows(input: string[][] = EMPTY_ROWS, canonicalContent = false): string[][] {
    const cached = canonical.get(input) ?? (!canonicalContent ? normalized.get(input) : undefined);
    if (cached) return cached;
    // Once saved by the editor, literal delimiter-looking text is user data.
    // Still repair rectangular geometry on a new external snapshot.
    const width = canonicalContent ? input.reduce((max, row) => Math.max(max, row.length), 0) : 0;
    const rows = canonicalContent ? input.map(row => row.length === width ? row
        : Array.from({ length: width }, (_, i) => row[i] ?? '')) : normalizeTableRows(input);
    (canonicalContent ? canonical : normalized).set(input, rows);
    canonical.set(rows, rows);
    return rows;
}

/** A text change cannot alter a validated table's rectangular structure. */
export function updateTableCell(input: string[][], row: number, column: number, value: string): string[][] {
    const rows = readTableRows(input);
    if (!rows[row] || column < 0 || column >= rows[row].length || rows[row][column] === value) return rows;
    const next = rows.slice();
    next[row] = rows[row].slice();
    next[row][column] = value;
    canonical.set(next, next);
    return next;
}
