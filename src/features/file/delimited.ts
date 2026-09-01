/**
 * delimited
 * --------------------------------------------------------------------------
 * A CSV/TSV reader, written out rather than pulled in.
 *
 * The whole point of the file feature's renderer policy is that a preview must
 * not cost a dependency, and a correct-enough delimited parser is about forty
 * lines: quoted fields, embedded delimiters, embedded quotes via `""`, and
 * CRLF. It does not attempt dialect sniffing beyond the delimiter, because a
 * viewer that shows you the file is allowed to be simpler than a library that
 * has to round-trip it.
 */

/** Rows are capped so a 200k-line export cannot lock the main thread. */
export const MAX_ROWS = 500;

export interface Table {
    header: string[];
    rows: string[][];
    /** Rows in the file beyond those parsed, so the viewer can say so. */
    truncated: number;
}

/** Tabs win when the first line has more of them than commas. */
const sniffDelimiter = (text: string): string => {
    const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
    const tabs = (firstLine.match(/\t/g) ?? []).length;
    const commas = (firstLine.match(/,/g) ?? []).length;
    if (tabs > commas) return '\t';
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    return semicolons > commas ? ';' : ',';
};

export function parseDelimited(text: string, delimiter = sniffDelimiter(text)): Table {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    const endField = () => { row.push(field); field = ''; };
    const endRow = () => { endField(); rows.push(row); row = []; };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (quoted) {
            if (ch !== '"') { field += ch; continue; }
            // A doubled quote inside a quoted field is a literal quote.
            if (text[i + 1] === '"') { field += '"'; i++; continue; }
            quoted = false;
            continue;
        }

        if (ch === '"' && field === '') { quoted = true; continue; }
        if (ch === delimiter) { endField(); continue; }
        if (ch === '\r') continue;
        if (ch === '\n') {
            endRow();
            if (rows.length > MAX_ROWS) break;
            continue;
        }
        field += ch;
    }
    // A file with no trailing newline still has a last row.
    if (field !== '' || row.length) endRow();

    // A trailing newline leaves one empty row behind; it is not data.
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();

    const [header = [], ...body] = rows;
    const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
    const pad = (r: string[]) => (r.length === width ? r : [...r, ...Array(width - r.length).fill('')]);

    const total = text.split('\n').filter((l) => l.trim() !== '').length;
    return {
        header: pad(header),
        rows: body.map(pad),
        truncated: Math.max(0, total - rows.length),
    };
}
