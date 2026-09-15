/**
 * Fast, browser-free check that AI-written Markdown never reaches a card or the
 * AI panel as literal markers.
 *
 * Run: npm run check:ai-markdown
 *
 * Every case below is a shape a model actually produced, or one that showed as
 * raw `#`, `-`, `>` or `<br>` characters before `repairAIMarkdown` existed:
 * dividers glued to headings, HTML line breaks inside table cells, HTML emphasis,
 * escaped entities, compact list markers, and a quote that came out as `>>`.
 */
import { parseAIContent, repairAIMarkdown } from '../src/features/editor/pasteUtils.ts';
import type { Block } from '../src/features/editor/types.ts';

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

const shape = (blocks: Block[]) => blocks
    .filter((b) => !(b.type === 'text' && !b.content.trim()))
    .map((b) => (b.type === 'table' ? 'table' : b.type === 'divider' ? 'divider' : `${b.type}:${b.content}`));

console.log('glued markers');
check('divider glued to a heading', shape(parseAIContent('---### Key Exam Criteria & Examiner Focus Areas')),
    ['divider', 'heading3:Key Exam Criteria & Examiner Focus Areas']);
check('divider stranded after text, before a heading', shape(parseAIContent('Last point.---## Next')),
    ['text:Last point.', 'divider', 'heading2:Next']);
check('heading glued to the previous sentence', shape(parseAIContent('That is the end.### Glued heading')),
    ['text:That is the end.', 'heading3:Glued heading']);
check('a lone divider is still a divider', shape(parseAIContent('Intro.\n\n---\n\n## Section')),
    ['text:Intro.', 'divider', 'heading2:Section']);
check('a paragraph straight before --- keeps its divider', shape(parseAIContent('A full sentence about the topic.\n---\n## Section')),
    ['text:A full sentence about the topic.', 'divider', 'heading2:Section']);
check('a short standalone title over --- is still a setext heading', shape(parseAIContent('Overview\n---')),
    ['heading2:Overview']);
check('***bold italic*** is not a divider', shape(parseAIContent('***Important***')).length, 1);

console.log('list and heading markers');
check('#### collapses to the deepest native heading', shape(parseAIContent('#### Criterion A')), ['heading3:Criterion A']);
check('compact bullet', shape(parseAIContent('-Define terms precisely')), ['bullet:Define terms precisely']);
check('1) numbered step', shape(parseAIContent('1) Step one')), ['numbered:Step one']);

console.log('quotes');
check('> stays a quote, never a literal >>', shape(parseAIContent('> **Tip:** read the question twice')),
    ['quote:**Tip:** read the question twice']);

console.log('HTML and entities');
check('<br> between prose lines becomes lines', shape(parseAIContent('Line one<br>Line two<br/>Line three')),
    ['text:Line one', 'text:Line two', 'text:Line three']);
check('<strong>/<em> become Markdown emphasis', repairAIMarkdown('- <strong>Bold</strong> and <em>italic</em>'),
    '- **Bold** and *italic*');
check('entities are decoded', shape(parseAIContent('&gt; quoted &amp; kept')), ['quote:quoted & kept']);
check('a real less-than survives', shape(parseAIContent('Keep costs < revenue')), ['text:Keep costs < revenue']);
{
    const table = parseAIContent('| Term | Meaning |\n| --- | --- |\n| Evaluate | • Weigh strengths<br>• Conclude |')
        .find((b) => b.type === 'table');
    const rows = (table?.metadata as { rows?: string[][] } | undefined)?.rows ?? [];
    check('<br> inside a table cell keeps the table intact', rows.length, 2);
    check('and reads as a space, not a tag', rows[1]?.[1], '• Weigh strengths • Conclude');
}

console.log('code is left alone');
check('markup inside a fence is untouched', repairAIMarkdown('```\n<br>---### x\n```'), '```\n<br>---### x\n```');

if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll AI markdown checks passed.');
