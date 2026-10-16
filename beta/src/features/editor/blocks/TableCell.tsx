import { memo, useLayoutEffect, useRef } from 'react';
import { serializeInline } from '../inlineFormat';
import { renderContentWithLinks } from '../pasteUtils';
import tableStyles from './TableBlock.module.css';
import type { TableAlign } from './tableCellCaret';

/** A single table cell's editable surface. Rich-HTML editing like the other
 *  blocks (real <strong>/<em>/<u>/<s> in the DOM, serialized to markdown
 *  markers on input) so the floating format toolbar — which only reacts to
 *  contentEditable selections — works over cell text. */
export const TableCellEditor = memo(function TableCellEditor({
    value,
    align,
    placeholder,
    readOnly,
    onChange,
    onKeyDown,
    setRef,
}: {
    value: string;
    align?: TableAlign;
    placeholder?: string;
    readOnly?: boolean;
    onChange: (text: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    setRef: (el: HTMLDivElement | null) => void;
}) {
    const internalRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);
    const isComposing = useRef(false);

    useLayoutEffect(() => {
        if (!internalRef.current || isFocused.current || isComposing.current) return;
        const expectedHTML = renderContentWithLinks(value);
        if (internalRef.current.innerHTML !== expectedHTML) internalRef.current.innerHTML = expectedHTML;
    }, [value]);

    return (
        <div
            ref={(el) => { internalRef.current = el; setRef(el); }}
            className={tableStyles.tableCell}
            style={{ textAlign: align }}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            data-placeholder={placeholder}
            data-is-empty={!value ? 'true' : 'false'}
            onFocus={() => { isFocused.current = true; }}
            onBlur={() => {
                isFocused.current = false;
                if (internalRef.current) {
                    const expectedHTML = renderContentWithLinks(value);
                    if (internalRef.current.innerHTML !== expectedHTML) internalRef.current.innerHTML = expectedHTML;
                }
            }}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={(e) => {
                isComposing.current = false;
                onChange(serializeInline(e.currentTarget));
            }}
            // Same composition guard as useContentEditable — this editor
            // hand-rolls the pattern instead of using the hook.
            onInput={(e) => {
                if (isComposing.current) return;
                onChange(serializeInline(e.currentTarget));
            }}
            onKeyDown={onKeyDown}
        />
    );
});
