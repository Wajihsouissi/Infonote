import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { serializeInline } from '../../text/inlineFormat';
import { renderContentWithLinks } from '../../text/pasteUtils';
import { TableCellSurface } from './TableCellSurface';
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
    row,
    column,
}: {
    value: string;
    align?: TableAlign;
    placeholder?: string;
    readOnly?: boolean;
    onChange: (row: number, column: number, text: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, row: number, column: number) => void;
    setRef: (el: HTMLDivElement | null) => void;
    row: number;
    column: number;
}) {
    const internalRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);
    const isComposing = useRef(false);
    const registerRef = useCallback((el: HTMLDivElement | null) => {
        internalRef.current = el;
        setRef(el);
    }, [setRef]);

    useLayoutEffect(() => {
        if (!internalRef.current || isFocused.current || isComposing.current) return;
        const expectedHTML = renderContentWithLinks(value);
        if (internalRef.current.innerHTML !== expectedHTML) internalRef.current.innerHTML = expectedHTML;
    }, [value]);

    return (
        <TableCellSurface
            ref={registerRef}
            align={align}
            data-table-row={row}
            data-table-column={column}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            data-placeholder={placeholder}
            data-is-empty={!value ? 'true' : 'false'}
            onFocus={() => { isFocused.current = true; }}
            onBlur={() => {
                isFocused.current = false;
                if (isComposing.current) return;
                if (internalRef.current) {
                    const expectedHTML = renderContentWithLinks(value);
                    if (internalRef.current.innerHTML !== expectedHTML) internalRef.current.innerHTML = expectedHTML;
                }
            }}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={(e) => {
                isComposing.current = false;
                onChange(row, column, serializeInline(e.currentTarget));
            }}
            // Same composition guard as useContentEditable — this editor
            // hand-rolls the pattern instead of using the hook.
            onInput={(e) => {
                if (isComposing.current) return;
                onChange(row, column, serializeInline(e.currentTarget));
            }}
            onKeyDown={(e) => {
                if (isComposing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
                onKeyDown(e, row, column);
            }}
        />
    );
});
