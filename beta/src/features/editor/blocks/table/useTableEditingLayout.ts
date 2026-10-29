import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';
import { elementScale } from '../../document/tableLayout';
import { useStableCallback } from '../../../../utils/useStableCallback';

const EMPTY_WIDTHS: number[] = [];

/** Auto layout need not re-solve every row while one cell is being typed.
 * Keep the measured columns for the edit session, then restore automatic
 * sizing. This is transient DOM state; it never persists user column widths. */
export function useTableEditingLayout(tableRef: RefObject<HTMLTableElement | null>, widths: number[] | undefined, columnCount: number) {
    const columnWidths = widths ?? EMPTY_WIDTHS;
    const lock = useRef<{
        table: HTMLTableElement; layout: string;
        cancelBlur: () => void; blur: () => void; cleanup: () => void;
    } | null>(null);
    const sized = columnWidths.length === columnCount && columnCount > 0 && columnWidths.every(width => width > 0);

    const release = useStableCallback(() => {
        const previous = lock.current;
        if (!previous) return;
        lock.current = null;
        previous.cleanup();
        previous.table.style.tableLayout = previous.layout;
        previous.table.querySelectorAll<HTMLTableColElement>('colgroup > col').forEach((col, index) => {
            col.style.width = columnWidths[index] > 0 ? `${columnWidths[index]}px` : '';
        });
    });
    const acquire = useStableCallback(() => {
        const table = tableRef.current;
        if (!table || sized || lock.current) return;
        const cells = Array.from(table.tHead?.rows[0]?.cells ?? []);
        if (!cells.length) return;
        // Complete all geometry reads before writing column styles.
        const scale = elementScale(table);
        const measured = cells.map(cell => cell.getBoundingClientRect().width / scale);
        // A blur during mousedown must not move the target before mouseup.
        // Keep geometry through the complete click, including controls below
        // the table. Only the actively locked table installs these listeners.
        const pointers = new Set<number>();
        let pending = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancelBlur = () => { pending = false; clearTimeout(timer); };
        const down = (event: PointerEvent) => { pointers.add(event.pointerId); };
        const finish = () => {
            if (!pointers.size && pending) timer = setTimeout(release, 0);
        };
        const up = (event: PointerEvent) => { pointers.delete(event.pointerId); finish(); };
        const windowBlur = () => { pointers.clear(); finish(); };
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', up, true);
        window.addEventListener('blur', windowBlur);
        lock.current = {
            table, layout: table.style.tableLayout, cancelBlur,
            blur: () => { if (pointers.size) pending = true; else release(); },
            cleanup: () => {
                clearTimeout(timer);
                window.removeEventListener('pointerdown', down, true);
                window.removeEventListener('pointerup', up, true);
                window.removeEventListener('pointercancel', up, true);
                window.removeEventListener('blur', windowBlur);
            },
        };
        table.querySelectorAll<HTMLTableColElement>('colgroup > col').forEach((col, index) => {
            if (measured[index] > 0) col.style.width = `${measured[index]}px`;
        });
        table.style.tableLayout = 'fixed';
    });
    useLayoutEffect(() => {
        release();
        if (tableRef.current?.contains(document.activeElement) && (document.activeElement as HTMLElement)?.isContentEditable) acquire();
    }, [acquire, release, tableRef, columnWidths, columnCount]);
    useLayoutEffect(() => () => release(), [release]);

    const onFocus = useStableCallback((event: FocusEvent) => {
        lock.current?.cancelBlur();
        if ((event.target as HTMLElement).isContentEditable) acquire();
    });
    const onBlur = useStableCallback((event: FocusEvent) => {
        // Row/column controls belong to the same editing session.
        if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) lock.current?.blur();
    });
    return { onFocus, onBlur, release };
}
