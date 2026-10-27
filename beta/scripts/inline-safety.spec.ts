import assert from 'node:assert/strict';
import { computeInlineFormat, HIGHLIGHT_HUES, serializeInline } from '../src/features/editor/text/inlineFormat';
import { renderContentWithLinks } from '../src/features/editor/text/links';
import { normalizeLinkInput, toSafeHttpUrl } from '../src/features/editor/text/safeLink';
import { hasBlockFocusRequest, requestBlockFocus, takeBlockFocusRequest } from '../src/features/editor/drag/canvasFocusRequest';

let passed = 0, failed = 0;
function check(name: string, run: () => void) {
    try { run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); }
}
for (const format of ['bold', 'italic', 'underline', 'strikeThrough', 'code'] as const) {
    check(`${format} toggles only selected multilingual text`, () => {
        const source = 'Before مرحبا café 😀 after', start = source.indexOf('مرحبا'), end = source.indexOf(' after');
        const one = computeInlineFormat(source, start, end, format);
        const two = computeInlineFormat(one.text, one.selStart, one.selEnd, format);
        assert.equal(two.text, source);
        assert.equal(two.text.slice(two.selStart, two.selEnd), 'مرحبا café 😀');
    });
}
check('all ten supported highlight hues render safely', () => {
    for (const hue of HIGHLIGHT_HUES) assert.match(renderContentWithLinks(`==${hue}|عربي café==`), new RegExp(`<mark[^>]+data-hue="${hue}"[^>]*>عربي café</mark>`));
});
check('script schemes and raw HTML cannot produce executable markup', () => {
    for (const source of ['[bad](javascript:alert(1))', '[bad](data:text/html,<script>alert(1)</script>)', '<img src=x onerror="alert(1)">', '<svg onload=alert(1)>']) {
        const html = renderContentWithLinks(source);
        assert.doesNotMatch(html, /<(?:script|img|svg)\b|href="(?:javascript|data):/i);
    }
});
check('external destinations containing emphasis markers stay exact and are isolated', () => {
    const html = renderContentWithLinks('[**Label**](https://example.test/**path**?q=++x++&v=~~y~~)');
    assert.match(html, /href="https:\/\/example\.test\/\*\*path\*\*\?q=\+\+x\+\+&amp;v=~~y~~"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /<strong>Label<\/strong>/);
});
check('balanced parentheses are retained inside a markdown destination', () => {
    assert.match(renderContentWithLinks('[Article](https://example.test/a(b(c))?q=1)'), /href="https:\/\/example\.test\/a\(b\(c\)\)\?q=1"/);
});
check('a URL-shaped page/citation label does not create nested anchors', () => {
    for (const kind of ['page', 'node']) {
        const html = renderContentWithLinks(`[https://example.test](chnk://${kind}/target)`);
        assert.equal((html.match(/<a\b/g) ?? []).length, 0);
        assert.equal((html.match(/<span\b/g) ?? []).length, 1);
        assert.match(html, /role="link" tabindex="0"/);
    }
});
check('literal private-use characters cannot collide with protected inline tokens', () => {
    const source = '\uE0000\uE001';
    assert.equal(renderContentWithLinks(source), source);
    assert.ok(renderContentWithLinks(`${source} and \`code\``).startsWith(source));
});
check('bare URLs formatted as bold do not absorb the surrounding markers', () => {
    const html = renderContentWithLinks('**https://example.test/path**');
    assert.match(html, /href="https:\/\/example\.test\/path"/);
    assert.match(html, /^<strong><a\b/);
});
check('backticks in URL destinations cannot become code spans or change navigation', () => {
    assert.ok(renderContentWithLinks('[Query](https://example.test/?q=`value`)').includes('href="https://example.test/?q=`value`"'));
});
check('typed domains normalize but unsupported schemes and broken inputs are refused', () => {
    assert.equal(normalizeLinkInput('example.test/path'), 'https://example.test/path');
    assert.equal(normalizeLinkInput(' WWW.EXAMPLE.TEST '), 'https://www.example.test/');
    for (const input of ['javascript:alert(1)', 'data:text/html,test', 'vbscript:test', 'file:///tmp/test', 'mailto:a@example.test', 'https://', 'bad input', '']) assert.equal(normalizeLinkInput(input), null, input);
    assert.equal(toSafeHttpUrl('https://例え.テスト/عربي?q=é'), 'https://xn--r8jz45g.xn--zckzah/%D8%B9%D8%B1%D8%A8%D9%8A?q=%C3%A9');
});

type Shape = { nodeType: number; nodeValue?: string; tagName?: string; childNodes: Shape[]; lastChild?: Shape; textContent: string; getAttribute: (name: string) => string | null };
const text = (value: string): Shape => ({ nodeType: 3, nodeValue: value, childNodes: [], textContent: value, getAttribute: () => null });
const el = (tagName: string, attrs: Record<string, string>, ...children: Shape[]): Shape => ({ nodeType: 1, tagName, childNodes: children, lastChild: children.at(-1), textContent: children.map(n => n.textContent).join(''), getAttribute: name => attrs[name] ?? null });
function dom(run: () => void) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'Node');
    Object.defineProperty(globalThis, 'Node', { configurable: true, value: { TEXT_NODE: 3, ELEMENT_NODE: 1 } });
    try { run(); } finally { if (previous) Object.defineProperty(globalThis, 'Node', previous); else Reflect.deleteProperty(globalThis, 'Node'); }
}
check('AI citation serialization preserves the target identity', () => dom(() => {
    const root = el('div', {}, text('Before '), el('a', { 'data-cite-node': 'source-123' }, text('Source')), text(' after'));
    assert.equal(serializeInline(root as unknown as HTMLElement), 'Before [Source](chnk://node/source-123) after');
}));
check('external links retain nested marks during serialization', () => dom(() => {
    const root = el('div', {}, el('a', { href: 'https://example.test/' }, el('strong', {}, text('bold')), text(' plain')));
    assert.equal(serializeInline(root as unknown as HTMLElement), '[**bold** plain](https://example.test/)');
}));
check('empty formatting remnants do not manufacture literal delimiters', () => dom(() => {
    assert.equal(serializeInline(el('div', {}, text('Before '), el('strong', {}), el('code', {}, text('\u200B')), text('after')) as unknown as HTMLElement), 'Before after');
}));
check('literal backticks inside inline code use a balanced longer fence', () => dom(() => {
    assert.equal(serializeInline(el('div', {}, el('code', {}, text('a`b'))) as unknown as HTMLElement), '``a`b``');
    assert.match(renderContentWithLinks('``a`b``'), />a`b<\/code>/);
}));
check('a matching editor can inspect focus intent without consuming it, then claim once', () => {
    requestBlockFocus('next');assert.equal(hasBlockFocusRequest(['next']),true);assert.equal(hasBlockFocusRequest(['next']),true);
    assert.equal(takeBlockFocusRequest(['next']),'next');assert.equal(takeBlockFocusRequest(['next']),null);
});
check('an unrelated editor cannot consume another block focus request', () => {
    requestBlockFocus('next');assert.equal(takeBlockFocusRequest(['other']),null);assert.equal(takeBlockFocusRequest(['next']),'next');
});
check('newer direct typing intent replaces a stale focus request', () => {
    requestBlockFocus('old');requestBlockFocus('new');assert.equal(hasBlockFocusRequest(['old']),false);assert.equal(takeBlockFocusRequest(['new']),'new');
});
check('expired focus intent cannot redirect a later editor', () => {
    const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=100;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    try {requestBlockFocus('late');now+=3001;assert.equal(hasBlockFocusRequest(['late']),false);assert.equal(takeBlockFocusRequest(['late']),null);}
    finally {if(descriptor)Object.defineProperty(performance,'now',descriptor);else Reflect.deleteProperty(performance,'now');}
});
console.log(`${passed} inline safety checks passed; ${failed} failed.`);
if (failed) throw new Error(`${failed} inline safety contract(s) failed.`);
