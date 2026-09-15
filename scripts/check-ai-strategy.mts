/**
 * Fast, network-free check of the AI router's guarantees.
 *
 * Run: npm run check:ai-strategy
 *
 * The model proposes a strategy; `resolveRoute` decides what is allowed. These
 * cases pin the promises that make routing safe to leave on: Ask never touches
 * the canvas, an explicit web toggle always wins, "make X from these cards"
 * creates instead of rewriting the selection, and a clarifying form only
 * appears on a genuinely vague first message.
 */
import { resolveRoute, routeLabel, ruleRoute, type RouteInput } from '../src/features/ai/aiStrategy.ts';

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

const base: RouteInput = {
    query: 'What changed in the latest release of React?',
    mode: 'ask',
    effort: 'efficient',
    hasSelection: false,
    hasScope: false,
    hasAttachments: false,
    isFollowUp: false,
    webSearchOn: false,
    allowClarify: true,
};
const ask = (patch: Partial<RouteInput> = {}): RouteInput => ({ ...base, ...patch });
const create = (patch: Partial<RouteInput> = {}): RouteInput => ({ ...base, mode: 'create', query: 'Plan our beta launch', ...patch });

console.log('rules (no model)');
check('ask answers directly', ruleRoute(ask()).strategy, 'answer');
check('ask with the web toggle searches', ruleRoute(ask({ webSearchOn: true })).strategy, 'web');
check('create with no selection creates', ruleRoute(create()).strategy, 'create');
check('create with a selection edits (the pre-router behaviour)', ruleRoute(create({ hasSelection: true })).strategy, 'edit');

console.log('ask mode');
check('web is honoured', resolveRoute({ route: 'web', reason: 'needs current info' }, ask()).strategy, 'web');
check('reason is honoured', resolveRoute({ route: 'reason' }, ask()).strategy, 'reason');
check('ask never creates on the canvas', resolveRoute({ route: 'create', shapes: ['board'] }, ask()).strategy, 'answer');
check('ask never edits cards', resolveRoute({ route: 'edit' }, ask({ hasSelection: true })).strategy, 'answer');
check('an explicit web toggle beats "reason"', resolveRoute({ route: 'reason' }, ask({ webSearchOn: true })).strategy, 'web');

console.log('create mode');
check('"make a mindmap from these" creates instead of rewriting the selection',
    resolveRoute({ route: 'create', shapes: ['mindmap'] }, create({ hasSelection: true, query: 'Make a mindmap from these' })),
    { strategy: 'create', shapes: ['mindmap'], reason: '', source: 'model' });
check('edit with a selection is honoured', resolveRoute({ route: 'edit' }, create({ hasSelection: true })).strategy, 'edit');
check('edit without a selection becomes create', resolveRoute({ route: 'edit' }, create()).strategy, 'create');
check('answer in create mode still creates', resolveRoute({ route: 'answer' }, create()).strategy, 'create');
check('shapes are filtered, deduplicated and capped',
    resolveRoute({ route: 'create', shapes: ['board', 'spreadsheet', 'board', 'timeline', 'note', 'mindmap'] }, create()).shapes,
    ['board', 'timeline', 'note']);
check('shapes only accompany create', resolveRoute({ route: 'edit', shapes: ['board'] }, create({ hasSelection: true })).shapes, []);

console.log('clarify');
check('a vague first message may be clarified', resolveRoute({ route: 'clarify' }, ask({ query: 'help me with my project' })).strategy, 'clarify');
check('not mid-conversation', resolveRoute({ route: 'clarify' }, ask({ query: 'help me with my project', isFollowUp: true })).strategy, 'answer');
check('not when context is attached', resolveRoute({ route: 'clarify' }, ask({ query: 'summarize this', hasScope: true })).strategy, 'answer');
check('not on a long, specific request',
    resolveRoute({ route: 'clarify' }, ask({ query: 'write a detailed comparison of our three pricing tiers against the two main competitors for the board meeting' })).strategy,
    'answer');
check('not on Fast', resolveRoute({ route: 'clarify' }, create({ query: 'my project', effort: 'fast' })).strategy, 'create');
check('not when replaying an answered form', resolveRoute({ route: 'clarify' }, create({ query: 'my project', allowClarify: false })).strategy, 'create');

console.log('bad replies fall back to the rules');
check('unknown route', resolveRoute({ route: 'dance' }, create({ hasSelection: true })), ruleRoute(create({ hasSelection: true })));
check('not an object', resolveRoute('web', ask()), ruleRoute(ask()));
check('array', resolveRoute([{ route: 'web' }], ask()), ruleRoute(ask()));

console.log('labels');
check('create names its shapes', routeLabel({ strategy: 'create', shapes: ['board', 'fused-note'], reason: '', source: 'model' }), 'Building a board and a document');
check('reason', routeLabel({ strategy: 'reason', shapes: [], reason: '', source: 'model' }), 'Thinking it through step by step');

if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log('\nAll AI strategy checks passed.');
