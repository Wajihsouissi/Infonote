/**
 * Fast, browser-free check of the AI answer part actions (Redo / Delete).
 *
 * Run: npm run check:ai-parts
 *
 * Two promises are under test, and both are ones the feature used to break:
 *
 * 1. A part is addressed by block index, so the array the renderer numbered
 *    and the array the panel splices into must be the same array. Anything
 *    else lands the edit on a neighbouring line.
 * 2. A rewrite replaces the fragment and nothing else. The model is asked for
 *    that; `constrainReplacementBlocks` is what happens when it answers with a
 *    whole document anyway.
 */
import {
    constrainReplacementBlocks,
    getAIResultBlocks,
    serializeAIBlocks,
} from '../src/features/ai/aiResultUtils.ts';

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

const ANSWER = [
    '## Studying for the exam',
    'A short orientation sentence that sets the scene.',
    '- Read the syllabus first',
    '- Draft a weekly plan',
    '- [ ] Book a revision slot',
    '',
    '### Next steps',
    '1. Summarise each chapter',
    '2. Test yourself on the summaries',
].join('\n');

console.log('index alignment');
{
    const blocks = getAIResultBlocks(ANSWER);
    // The renderer measures a part against this array; the panel splices into
    // it. Round-tripping must not move any block.
    const roundTripped = getAIResultBlocks(serializeAIBlocks(blocks));
    check('round trip keeps the block count', roundTripped.length, blocks.length);
    check(
        'round trip keeps every block type',
        roundTripped.map((block) => block.type),
        blocks.map((block) => block.type),
    );
    check(
        'round trip keeps every block content',
        roundTripped.map((block) => block.content),
        blocks.map((block) => block.content),
    );

    // Deleting the third bullet must delete exactly that line.
    const start = blocks.findIndex((block) => block.content.startsWith('Draft a weekly plan'));
    check('the target line is found', start > 0, true);
    const afterDelete = [...blocks.slice(0, start), ...blocks.slice(start + 1)];
    check('delete removes one block', afterDelete.length, blocks.length - 1);
    check(
        'delete leaves its neighbours untouched',
        [afterDelete[start - 1].content, afterDelete[start].content],
        ['Read the syllabus first', 'Book a revision slot'],
    );
}

console.log('a line rewrite stays one line');
{
    const blocks = getAIResultBlocks(ANSWER);
    const start = blocks.findIndex((block) => block.content.startsWith('Draft a weekly plan'));
    const original = blocks.slice(start, start + 1);

    // What the freeform prompt used to produce for a one-bullet Redo.
    const overshoot = getAIResultBlocks([
        'Here is a better version:',
        '',
        '## Weekly planning',
        '- Draft a realistic weekly plan',
        '- [ ] Block two study evenings',
        '| Day | Focus |',
        '| --- | --- |',
        '| Mon | Chapter 1 |',
    ].join('\n'));

    const constrained = constrainReplacementBlocks(overshoot, original, 'line');
    check('collapses to exactly one block', constrained.length, 1);
    check('keeps the original block type', constrained[0].type, original[0].type);
    check('keeps the original indent', constrained[0].indent ?? 0, original[0].indent ?? 0);
    check('skips the lead-in and takes the rewrite', constrained[0].content, 'Draft a realistic weekly plan');

    const spliced = [...blocks.slice(0, start), ...constrained, ...blocks.slice(start + 1)];
    check('the answer keeps its length', spliced.length, blocks.length);
    check(
        'every other line is byte-identical',
        spliced.filter((_, index) => index !== start).map((block) => block.content),
        blocks.filter((_, index) => index !== start).map((block) => block.content),
    );
}

console.log('a task line keeps its checkbox');
{
    const blocks = getAIResultBlocks(ANSWER);
    const start = blocks.findIndex((block) => block.type === 'todo');
    const original = blocks.slice(start, start + 1);
    const constrained = constrainReplacementBlocks(
        getAIResultBlocks('Book a revision slot with the study group'),
        original,
        'line',
    );
    check('stays a todo', constrained[0].type, 'todo');
    check('keeps its checked state', constrained[0].metadata?.checked, original[0].metadata?.checked);
}

console.log('stray wrappers and blank edges');
{
    const original = getAIResultBlocks('- Draft a weekly plan');
    const fenced = getAIResultBlocks('```\n- Draft a realistic weekly plan\n```');
    check('the model really did wrap it in a fence', fenced[0].type, 'code');
    const unwrapped = constrainReplacementBlocks(fenced, original, 'line');
    check('the fence is unwrapped', unwrapped[0].type, 'bullet');
    check('the content survives', unwrapped[0].content, 'Draft a realistic weekly plan');

    const padded = getAIResultBlocks('\n\nDraft a realistic weekly plan\n\n');
    const trimmed = constrainReplacementBlocks(padded, original, 'line');
    check('blank edges are trimmed', trimmed.length, 1);
    check('the content survives the trim', trimmed[0].content, 'Draft a realistic weekly plan');
}

console.log('a section rewrite may stay multi-block');
{
    const original = getAIResultBlocks('### Next steps\n1. Summarise each chapter\n2. Test yourself on the summaries');
    const replacement = getAIResultBlocks('### Next steps\n1. Summarise each chapter in one page\n2. Quiz yourself on those pages');
    const constrained = constrainReplacementBlocks(replacement, original, 'section');
    check('keeps every block', constrained.length, original.length);
    check(
        'keeps the block types',
        constrained.map((block) => block.type),
        original.map((block) => block.type),
    );
}

console.log(failures === 0 ? '\nAll AI part-rewrite checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
