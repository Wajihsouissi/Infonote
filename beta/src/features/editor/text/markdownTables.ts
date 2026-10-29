/**
 * Reading GitHub-flavoured markdown tables: which lines are a table, and how a
 * ragged one is squared off.
 */

/**
 * Parse plain text content, with Markdown detection for ChatGPT-style output.
 * Handles headings, lists, code fences, tables, blockquotes, dividers, etc.
 */
/**
 * One cell of a GFM delimiter row — `---`, `:---`, `---:`, `:---:`. Em and en
 * dashes are accepted because a model that has been writing prose often keeps
 * typing them inside the table.
 */
const isTableDelimiterCell = (cell: string) => /^:?[-–—]+:?$/.test(cell.trim());

/** Cells of one table line. Outer pipes are optional, as GFM allows. */
export function splitTableCells(line: string): string[] {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/** True for a line that is nothing but a delimiter row. */
/** True for a line that is nothing but a delimiter row. */
export const isTableDelimiterLine = (line: string) => {
    const cells = splitTableCells(line);
    return cells.length > 0 && cells.every(isTableDelimiterCell);
};

/**
 * Make a parsed table rectangular, and undo the two shapes models get wrong.
 *
 * A delimiter row is structure, not data, so it never survives as a row. The
 * one that bites is a delimiter row with the first data row glued onto it —
 * `| :--- | :--- | :--- || **Position 0** | … |`, one line where there should
 * be two. Split naively that is seven cells against a three-column header, so
 * the table renders three `:---` cells, a stray empty one, and four columns the
 * header never covers. That is exactly what a generated table looked like.
 *
 * Ragged rows are levelled to the widest row rather than clipped to the header:
 * clipping is what GFM says, but this also runs over tables already saved in
 * someone's notes, and quietly dropping their last column would be worse than
 * showing an empty header cell above it.
 */
export function normalizeTableRows(rows: string[][]): string[][] {
    const repaired: string[][] = [];

    for (const row of rows) {
        if (row.length === 0) continue;
        if (row.every(isTableDelimiterCell)) continue;

        let cells = row;
        const headerWidth = repaired[0]?.length ?? 0;
        if (
            headerWidth > 0
            && cells.length > headerWidth
            && cells.slice(0, headerWidth).every(isTableDelimiterCell)
        ) {
            cells = cells.slice(headerWidth);
            // The `||` seam between the two glued rows leaves one empty cell.
            if (cells[0] === '') cells = cells.slice(1);
        }
        if (cells.length > 0) repaired.push(cells);
    }

    if (repaired.length === 0) return repaired;
    const width = Math.max(...repaired.map((row) => row.length));
    return repaired.map((row) => (
        row.length === width ? row : Array.from({ length: width }, (_, index) => row[index] ?? '')
    ));
}
