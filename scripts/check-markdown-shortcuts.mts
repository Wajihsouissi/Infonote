/**
 * Fast, browser-free check of the markdown shortcut matcher.
 *
 * Run: node --experimental-strip-types scripts/check-markdown-shortcuts.mts
 *
 * The point of this file is the cases that used to be nondeterministic — the
 * marker followed by text (fast typing) and the invisible space variants.
 */
import { matchMarkerShortcut } from '../src/features/editor/markdownShortcuts.ts';

const NBSP = String.fromCharCode(0x00a0); // non-breaking space
const THIN = String.fromCharCode(0x202f); // narrow no-break space
const FIG = String.fromCharCode(0x2007);  // figure space

type Case = [input: string, expectedType: string | null, expectedRest?: string];

const typed: Case[] = [
    // marker alone — the only shape the old code handled
    ['# ', 'heading1', ''],
    ['## ', 'heading2', ''],
    ['### ', 'heading3', ''],
    ['* ', 'bullet', ''],
    ['- ', 'bullet', ''],
    ['1. ', 'numbered', ''],
    ['[] ', 'todo', ''],
    ['[x] ', 'todo', ''],
    ['> ', 'quote', ''],
    ['>> ', 'toggle', ''],
    ['---', 'divider'],
    ['--- ', 'divider'],
    ['``` ', 'code', ''],

    // marker + text in one event — what fast typing actually delivers
    ['# Hello', 'heading1', 'Hello'],
    ['## Two words', 'heading2', 'Two words'],
    ['* Bullet item', 'bullet', 'Bullet item'],
    ['1. Step one', 'numbered', 'Step one'],
    ['[] Task alpha', 'todo', 'Task alpha'],
    ['> Quoted line', 'quote', 'Quoted line'],

    // invisible space variants the browser substitutes
    [`#${NBSP}`, 'heading1', ''],
    [`#${NBSP}Hello`, 'heading1', 'Hello'],
    [`*${NBSP}Bullet`, 'bullet', 'Bullet'],
    [`#${THIN}Hello`, 'heading1', 'Hello'],
    [`#${FIG}Hello`, 'heading1', 'Hello'],

    // must NOT convert
    ['#Hello', null],
    ['####  x', null],
    ['1.x', null],
    ['--', null],
    ['plain text', null],
    ['', null],
];

const pasted: Case[] = [
    ['- Bullet from a web page', 'bullet', 'Bullet from a web page'],
    ['* Also a bullet', 'bullet', 'Also a bullet'],
    ['3. Third', 'numbered', 'Third'],
    ['- [x] done', 'todo', 'done'],
    ['# Heading', 'heading1', 'Heading'],
    ['---', 'divider'],
];

let failures = 0;

const run = (cases: Case[], context: 'type' | 'paste') => {
    for (const [input, expectedType, expectedRest] of cases) {
        const hit = matchMarkerShortcut(input, context);
        const actualType = hit ? hit.rule.type : null;
        const restOk = expectedRest === undefined || hit?.rest === expectedRest;

        if (actualType !== expectedType || !restOk) {
            failures++;
            console.log(
                `FAIL [${context}] ${JSON.stringify(input)} -> ` +
                `${actualType}${hit ? ` rest=${JSON.stringify(hit.rest)}` : ''}` +
                ` (expected ${expectedType}${expectedRest !== undefined ? ` rest=${JSON.stringify(expectedRest)}` : ''})`,
            );
        }
    }
};

run(typed, 'type');
run(pasted, 'paste');

const total = typed.length + pasted.length;
console.log(failures === 0 ? `all ${total} cases passed` : `${failures} of ${total} FAILED`);
process.exit(failures === 0 ? 0 : 1);
