import { caretOffsetIn, splitInlineSelection, offsetsToRange } from '../src/features/editor/text/caret';
import { renderContentWithLinks } from '../src/features/editor/text/links';

/** Browser-only checks for real DOM ranges; no simulated layout or DOM shim. */
export function runEditorDomChecks(): string[] {
    const host = document.createElement('div');
    host.contentEditable = 'true';
    document.body.appendChild(host);
    const results: string[] = [];
    const check = (source: string, start: number, end: number, expectedBefore: string, expectedAfter: string) => {
        host.innerHTML = renderContentWithLinks(source);
        const range = offsetsToRange(host, start, end);
        if (!range) throw new Error(`Could not select ${source}`);
        const selection = window.getSelection()!;
        selection.removeAllRanges(); selection.addRange(range);
        const actual = splitInlineSelection(host);
        if (!actual || actual.before !== expectedBefore || actual.after !== expectedAfter) {
            throw new Error(`Split ${source}: ${JSON.stringify(actual)}`);
        }
        if (caretOffsetIn(host) !== end) throw new Error('Caret and visible offsets diverged.');
        results.push(`PASS ${source} at ${start}:${end}`);
    };
    try {
        check('Before **boldword** after', 9, 9, 'Before **bo**', '**ldword** after');
        check('*italic*', 2, 2, '*it*', '*alic*');
        check('++underlined++', 5, 5, '++under++', '++lined++');
        check('~~deleted~~', 3, 3, '~~del~~', '~~eted~~');
        check('`inline`', 2, 2, '`in`', '`line`');
        check('[linked](https://example.com)', 3, 3, '[lin](https://example.com/)', '[ked](https://example.com/)');
        check('==jade|highlight==', 4, 4, '==jade|high==', '==jade|light==');
        check('**bold**', 0, 0, '', '**bold**');
        check('**bold**', 4, 4, '**bold**', '');
        check('Before **boldword** after', 8, 12, 'Before **b**', '**ord** after');
        return results;
    } finally {
        window.getSelection()?.removeAllRanges();
        host.remove();
    }
}
