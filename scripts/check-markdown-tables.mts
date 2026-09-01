/**
 * Fast, browser-free check of Markdown table parsing.
 *
 * Run: npm run check:tables
 *
 * The cases here are the shapes real model output arrives in — a delimiter row
 * glued to the first data row, missing outer pipes, ragged widths — each of
 * which used to reach the canvas as a broken table.
 */
import { normalizeTableRows, parseAIContent } from '../src/features/editor/pasteUtils.ts';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a === b) {
        console.log(`  ok  ${label}`);
        return;
    }
    failures += 1;
    console.error(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`);
}

const tableRows = (text: string): string[][] => {
    const table = parseAIContent(text).find((block) => block.type === 'table');
    return (table?.metadata?.rows ?? []) as string[][];
};

const HEADER = '| Connector | Formula | Example |';
const DELIMITER = '| :--- | :--- | :--- |';
const ROW_1 = '| **Position 0** | `Connector` + `Subject` | Ich habe Hunger, **aber** ich habe kein Geld. |';
const ROW_2 = '| **Position 1** | `Connector` + `Verb` | Ich habe Hunger, **deshalb** kaufe ich ein Brot. |';

const EXPECTED = [
    ['Connector', 'Formula', 'Example'],
    ['**Position 0**', '`Connector` + `Subject`', 'Ich habe Hunger, **aber** ich habe kein Geld.'],
    ['**Position 1**', '`Connector` + `Verb`', 'Ich habe Hunger, **deshalb** kaufe ich ein Brot.'],
];

console.log('a well-formed table');
check('parses to a rectangle', tableRows([HEADER, DELIMITER, ROW_1, ROW_2].join('\n')), EXPECTED);

console.log('the delimiter row glued to the first data row');
{
    // One line where there should be two — what a generated table arrived as.
    const glued = `${DELIMITER}${ROW_1}`;
    check('reads the same as the well-formed table', tableRows([HEADER, glued, ROW_2].join('\n')), EXPECTED);
    check(
        'no ":---" cell survives as data',
        tableRows([HEADER, glued, ROW_2].join('\n')).flat().some((cell) => /^:?-+:?$/.test(cell)),
        false,
    );
}

console.log('a plain delimiter row is never data');
check(
    'left-, right- and centre-aligned delimiters all drop out',
    tableRows(['| A | B | C |', '| :--- | ---: | :---: |', '| one | two | three |'].join('\n')),
    [['A', 'B', 'C'], ['one', 'two', 'three']],
);
check(
    'em dashes drop out too',
    tableRows(['| A | B |', '| :—: | —: |', '| one | two |'].join('\n')),
    [['A', 'B'], ['one', 'two']],
);

console.log('outer pipes are optional');
check(
    'a header + delimiter pair is a table without them',
    tableRows(['Connector | Formula | Example', ':--- | :--- | :---', '**Position 0** | `Connector` | Ich habe Hunger.'].join('\n')),
    [['Connector', 'Formula', 'Example'], ['**Position 0**', '`Connector`', 'Ich habe Hunger.']],
);
check(
    'a sentence containing a pipe is still a sentence',
    parseAIContent('Use grep | head to page the output.').map((block) => block.type),
    ['text'],
);
check(
    'two pipe-ish lines with no delimiter row stay text',
    parseAIContent('name | role\nAlex | writer').map((block) => block.type),
    ['text', 'text'],
);

console.log('ragged rows');
check(
    'short and long rows are levelled without losing a cell',
    tableRows(['| A | B | C |', '| --- | --- | --- |', '| one | two |', '| one | two | three | four |'].join('\n')),
    [['A', 'B', 'C', ''], ['one', 'two', '', ''], ['one', 'two', 'three', 'four']],
);

console.log('normalizeTableRows on already-stored rows');
{
    // What the broken card in a user's notes actually holds.
    const stored = [
        ['Connector', 'Formula', 'Example'],
        [':---', ':---', ':---', '', '**Position 0**', '`Connector` + `Subject`', 'Ich habe Hunger.'],
        ['**Position 1**', '`Connector` + `Verb`', 'Ich habe Brot.'],
    ];
    check('repairs it in place', normalizeTableRows(stored), [
        ['Connector', 'Formula', 'Example'],
        ['**Position 0**', '`Connector` + `Subject`', 'Ich habe Hunger.'],
        ['**Position 1**', '`Connector` + `Verb`', 'Ich habe Brot.'],
    ]);
    const healthy = [['A', 'B'], ['one', 'two']];
    check('leaves a healthy table exactly as it was', normalizeTableRows(healthy), healthy);
    check('an empty table stays empty', normalizeTableRows([]), []);
}

console.log(failures === 0 ? '\nAll Markdown table checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
