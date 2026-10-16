import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp,
    Columns3, Eraser, GripHorizontal, GripVertical, Plus, Trash2,
} from '../../../components/icons';
import { normalizeTableRows } from '../pasteUtils';
import {
    MIN_COL_W, MIN_ROW_H, NEW_COL_W, REORDER_THRESHOLD_PX,
    elementScale, moveItem, columnAt, rowAt,
} from '../tableLayout';
import { emptyTableMetadata } from '../menuBlocks';
import styles from '../BlockEditor.module.css';
import tableStyles from './TableBlock.module.css';
import type { BlockMetadata } from '../types';
import type { BlockProps } from './types';
import { TableCellEditor } from './TableCell';
import {
    getCellCaretOffsets, placeCaretInCell, type PersistableEl, type TableAlign,
} from './tableCellCaret';

export const TableBlock = memo(({ block, readOnly, onChange }: BlockProps) => {
    /* Repaired on the way in, not only at parse time: a table that was already
       saved with a delimiter row glued to its first data row (see
       `normalizeTableRows`) would otherwise keep rendering seven cells under a
       three-column header until someone retyped it. Rows that are already
       rectangular pass straight through, so nothing is rewritten needlessly. */
    const rows: string[][] = useMemo(
        () => normalizeTableRows(block.metadata?.rows || []),
        [block.metadata?.rows],
    );
    const savedWidths: number[] = block.metadata?.columnWidths || [];
    const savedHeights: number[] = block.metadata?.rowHeights || [];
    const alignments: TableAlign[] = block.metadata?.alignments || [];

    const colCount = rows[0]?.length || 0;
    const rowCount = rows.length;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pendingFocus = useRef<{ key: string; toEnd: boolean } | null>(null);

    const [activeResize, setActiveResize] = useState<{ type: 'col' | 'row'; index: number } | null>(null);
    const [menu, setMenu] = useState<{ type: 'col' | 'row'; index: number; x: number; y: number } | null>(null);
    const dragData = useRef<{ type: 'col' | 'row'; index: number; startPos: number; startSize: number } | null>(null);
    /* Grip drag = reorder. `moved` is what tells a reorder from a click: the
       grip's click handler opens the options menu, so it has to stand down
       when the same gesture was a drag. */
    const [reorder, setReorder] = useState<{ type: 'col' | 'row'; from: number; to: number } | null>(null);
    const reorderRef = useRef<{ type: 'col' | 'row'; from: number; to: number; moved: boolean } | null>(null);
    /* Click suppression is a SEPARATE flag, not a leftover `reorderRef`: the
       ref is the live drag, and deferring its teardown to clear it later let a
       stale timer wipe the next drag's state mid-gesture. This one is only
       ever written `false` by the timer, so it can't eat a live drag. */
    const suppressGripClick = useRef(false);

    const commit = (patch: Partial<BlockMetadata>) => onChange(block.content, { ...block.metadata, ...patch });

    /* handleCellChange is recreated every render (it closes over the latest
       `rows`), but the cell ref callbacks below are cached and only run once
       on mount — so the persist hook they stash on each cell's DOM node reads
       through this ref instead of closing over a stale handleCellChange. */
    const handleCellChangeRef = useRef<(r: number, c: number, value: string) => void>(() => {});

    /* Cells register here. The callback per cell is cached by key: returning a
       fresh `(el) => …` each render would make React detach and re-attach
       every cell ref on every render. */
    const cellRefCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
    const setCellRef = useCallback((r: number, c: number) => {
        const key = `${r}:${c}`;
        let cb = cellRefCallbacks.current.get(key);
        if (!cb) {
            cb = (el: HTMLDivElement | null) => {
                if (el) {
                    cellRefs.current.set(key, el);
                    // Read by BlockEditor's toolbar-driven persistHost: a table
                    // cell isn't a whole block, so its content can't be persisted
                    // through the normal updateBlock(blockId, text) path.
                    (el as PersistableEl).__persistInline = (text: string) => handleCellChangeRef.current(r, c, text);
                } else {
                    cellRefs.current.delete(key);
                }
            };
            cellRefCallbacks.current.set(key, cb);
        }
        return cb;
    }, []);

    const focusCell = (r: number, c: number, toEnd = true) => {
        const key = `${r}:${c}`;
        const el = cellRefs.current.get(key);
        if (el) {
            el.focus();
            placeCaretInCell(el, toEnd);
        } else {
            // Cell doesn't exist yet (just inserted) — focus once it mounts.
            pendingFocus.current = { key, toEnd };
        }
    };

    /* A cell can be taller than its own text — a hand-resized row, or a row
       stretched by a neighbour that wrapped. Clicking that empty space should
       start editing rather than do nothing, so the whole cell is the edit
       target, matching the highlight. Only fires for the cell itself: clicks
       on the textarea, the grips or the resize handles are theirs to keep. */
    const focusCellFromShell = (e: React.MouseEvent, r: number, c: number) => {
        if (readOnly || e.target !== e.currentTarget) return;
        e.preventDefault();
        focusCell(r, c);
    };

    // Apply a focus queued before its target cell existed.
    useLayoutEffect(() => {
        const pending = pendingFocus.current;
        if (!pending) return;
        const el = cellRefs.current.get(pending.key);
        if (el) {
            el.focus();
            placeCaretInCell(el, pending.toEnd);
        }
        pendingFocus.current = null;
    });

    // New tables are created seeded (menuBlocks.emptyTableMetadata); this only
    // repairs an empty one that arrived some other way, such as old saved data.
    useLayoutEffect(() => {
        if (rowCount === 0) commit(emptyTableMetadata());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowCount]);

    // Dismiss the row/column menu on outside click or Escape.
    useEffect(() => {
        if (!menu) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            // Grips toggle the menu themselves — don't pre-close on their mousedown.
            if (t.closest(`.${tableStyles.colGrip}`) || t.closest(`.${tableStyles.rowGrip}`)) return;
            const m = wrapperRef.current?.querySelector(`.${tableStyles.tableMenu}`);
            if (m && !m.contains(t)) setMenu(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
        const newRows = rows.map((row, ri) =>
            ri === rowIndex ? row.map((cell, ci) => (ci === cellIndex ? value : cell)) : [...row]
        );
        commit({ rows: newRows });
    };
    useLayoutEffect(() => { handleCellChangeRef.current = handleCellChange; });

    const insertRow = (at: number) => {
        const newRow = Array(colCount || 2).fill('');
        const newRows = [...rows.slice(0, at), newRow, ...rows.slice(at)];
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedHeights.length > 0) patch.rowHeights = [...savedHeights.slice(0, at), 0, ...savedHeights.slice(at)];
        commit(patch);
        focusCell(at, 0, false);
    };

    const insertColumn = (at: number) => {
        const newRows = rows.map(row => [...row.slice(0, at), '', ...row.slice(at)]);
        const patch: Partial<BlockMetadata> = {
            rows: newRows,
            alignments: [...alignments.slice(0, at), 'left' as TableAlign, ...alignments.slice(at)],
        };
        // A hand-sized table stays hand-sized: a 0 here would drop the whole
        // table back to auto layout and throw away every column the user set.
        if (savedWidths.length > 0) patch.columnWidths = [...savedWidths.slice(0, at), NEW_COL_W, ...savedWidths.slice(at)];
        commit(patch);
        focusCell(0, at, false);
    };

    const deleteRow = (rowIndex: number) => {
        if (rowCount <= 2) return; // keep the header plus at least one body row
        const newRows = rows.filter((_, ri) => ri !== rowIndex);
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedHeights.length > 0) patch.rowHeights = savedHeights.filter((_, ri) => ri !== rowIndex);
        commit(patch);
        setMenu(null);
    };

    const deleteColumn = (colIndex: number) => {
        if (colCount <= 1) return;
        const newRows = rows.map(row => row.filter((_, ci) => ci !== colIndex));
        const patch: Partial<BlockMetadata> = { rows: newRows };
        if (savedWidths.length > 0) patch.columnWidths = savedWidths.filter((_, ci) => ci !== colIndex);
        if (alignments.length > 0) patch.alignments = alignments.filter((_, ci) => ci !== colIndex);
        commit(patch);
        setMenu(null);
    };

    const clearRow = (rowIndex: number) => {
        commit({ rows: rows.map((row, ri) => ri === rowIndex ? row.map(() => '') : row) });
        setMenu(null);
    };

    /* Reorder. Every per-column array has to travel with its column, or the
       widths and alignments end up describing the wrong data. */
    const moveColumn = (from: number, to: number) => {
        if (from === to) return;
        const patch: Partial<BlockMetadata> = { rows: rows.map(row => moveItem(row, from, to)) };
        if (alignments.length === colCount) patch.alignments = moveItem(alignments, from, to);
        if (savedWidths.length === colCount) patch.columnWidths = moveItem(savedWidths, from, to);
        commit(patch);
    };

    /* Body rows only — the header is row 0 and stays there. */
    const moveRow = (from: number, to: number) => {
        if (from === to || from < 1 || to < 1) return;
        const body = rows.slice(1);
        const patch: Partial<BlockMetadata> = { rows: [rows[0], ...moveItem(body, from - 1, to - 1)] };
        if (savedHeights.length === rowCount) {
            patch.rowHeights = [savedHeights[0], ...moveItem(savedHeights.slice(1), from - 1, to - 1)];
        }
        commit(patch);
    };

    /* The way back out of hand-sized columns: drops every stored width so the
       table returns to filling whatever holds it (and, on canvas, gives the
       node its own resize handle back). */
    const resetColumnWidths = () => {
        commit({ columnWidths: undefined });
        setMenu(null);
    };

    const clearColumn = (colIndex: number) => {
        commit({ rows: rows.map(row => row.map((cell, ci) => ci === colIndex ? '' : cell)) });
        setMenu(null);
    };

    const setColumnAlign = (colIndex: number, align: TableAlign) => {
        const next: TableAlign[] = Array.from({ length: colCount }, (_, i) => alignments[i] || 'left');
        next[colIndex] = align;
        commit({ alignments: next });
        setMenu(null);
    };

    /* Grip drag → reorder. Starts on mousedown but only commits to a reorder
       once the pointer has actually travelled, so a plain click still falls
       through to openMenu below. */
    const startReorder = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
        if (readOnly) return;
        e.stopPropagation();
        const table = tableRef.current;
        if (!table) return;

        const startX = e.clientX;
        const startY = e.clientY;
        reorderRef.current = { type, from: index, to: index, moved: false };

        const onMouseMove = (moveEvent: MouseEvent) => {
            const d = reorderRef.current;
            if (!d) return;
            if (!d.moved) {
                if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < REORDER_THRESHOLD_PX) return;
                d.moved = true;
                setMenu(null);
                document.body.style.cursor = 'grabbing';
            }
            d.to = type === 'col' ? columnAt(table, moveEvent.clientX) : rowAt(table, moveEvent.clientY);
            setReorder({ type, from: d.from, to: d.to });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKey);
            document.body.style.cursor = '';

            const d = reorderRef.current;
            reorderRef.current = null;
            setReorder(null);
            if (!d?.moved) return;

            // Swallow the click this mouseup is about to produce, so the grip's
            // options menu doesn't pop open at the end of a drag.
            suppressGripClick.current = true;
            window.setTimeout(() => { suppressGripClick.current = false; }, 0);

            if (type === 'col') moveColumn(d.from, d.to);
            else moveRow(d.from, d.to);
        };

        const onKey = (keyEvent: KeyboardEvent) => {
            if (keyEvent.key !== 'Escape') return;
            if (reorderRef.current) reorderRef.current.to = reorderRef.current.from;
            onMouseUp();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKey);
    };

    const openMenu = (type: 'col' | 'row', index: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (suppressGripClick.current) { suppressGripClick.current = false; return; } // end of a drag
        if (menu && menu.type === type && menu.index === index) { setMenu(null); return; }
        const wrap = wrapperRef.current;
        if (!wrap) return;
        const gripRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (type === 'col') {
            setMenu({ type, index, x: gripRect.left - wrapRect.left, y: gripRect.bottom - wrapRect.top + 4 });
        } else {
            setMenu({ type, index, x: gripRect.right - wrapRect.left + 4, y: gripRect.top - wrapRect.top });
        }
    };

    const handleCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, r: number, c: number) => {
        const el = e.currentTarget;
        const caret = getCellCaretOffsets(el);
        const atStart = !!caret && caret.start === 0 && caret.end === 0;
        const atEnd = !!caret && caret.start === caret.length && caret.end === caret.length;

        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                if (c > 0) focusCell(r, c - 1);
                else if (r > 0) focusCell(r - 1, colCount - 1);
            } else if (c < colCount - 1) {
                focusCell(r, c + 1);
            } else if (r < rowCount - 1) {
                focusCell(r + 1, 0);
            } else {
                insertRow(rowCount); // last cell → grow the table and step into it
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (r < rowCount - 1) {
                focusCell(r + 1, c);
            } else {
                insertRow(rowCount);
                pendingFocus.current = { key: `${rowCount}:${c}`, toEnd: false }; // stay in the same column
            }
            return;
        }

        if (e.key === 'ArrowDown' && atEnd && r < rowCount - 1) { e.preventDefault(); focusCell(r + 1, c); return; }
        if (e.key === 'ArrowUp' && atStart && r > 0) { e.preventDefault(); focusCell(r - 1, c); return; }
        if (e.key === 'ArrowRight' && atEnd && c < colCount - 1) { e.preventDefault(); focusCell(r, c + 1, false); return; }
        if (e.key === 'ArrowLeft' && atStart && c > 0) { e.preventDefault(); focusCell(r, c - 1); return; }
        if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
    };

    /* Column resize.
       Two rules make this behave, and breaking either is what made the old
       version drift (the last column worst of all, since with `table-layout:
       auto` it absorbed every rounding error in the row):
         1. Work in LAYOUT px, never screen px. On the canvas the table is
            inside a scaled React Flow viewport, so a client-rect width at
            zoom 2 is double the width we store — feed that back in and every
            drag doubles the column. `offsetWidth` is transform-free, and the
            pointer delta is divided by the same scale.
         2. Pin EVERY column, not just the dragged one. A single sized column
            leaves the rest auto, so the browser re-solves the whole row and
            the neighbours (and the table's own width) move under the cursor. */
    const handleColResizeStart = (e: React.MouseEvent, colIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const ths = [...table.querySelectorAll('thead th')] as HTMLElement[];
        if (!ths[colIndex]) return;

        const scale = elementScale(table);
        const startWidths = ths.map(th => Math.round(th.offsetWidth));
        const startX = e.clientX;
        // The colgroup is always rendered, so there is exactly one and its
        // cols line up with the header cells.
        const cols = [...(table.querySelector('colgroup')?.children || [])] as HTMLElement[];
        let nextWidths = [...startWidths];
        let moved = false;

        // Pin the current widths before the table flips to fixed layout, so the
        // first frame of the drag looks exactly like the last frame before it.
        cols.forEach((col, i) => { if (startWidths[i] > 0) col.style.width = `${startWidths[i]}px`; });

        dragData.current = { type: 'col', index: colIndex, startPos: startX, startSize: startWidths[colIndex] };
        setActiveResize({ type: 'col', index: colIndex });

        document.body.style.cursor = 'col-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = (moveEvent.clientX - startX) / scale;
            if (delta !== 0) moved = true;
            nextWidths = [...startWidths];
            nextWidths[colIndex] = Math.round(Math.max(MIN_COL_W, startWidths[colIndex] + delta));
            cols.forEach((col, i) => {
                if (nextWidths[i] > 0) col.style.width = `${nextWidths[i]}px`;
            });
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            /* A click that never moved must not commit: it would pin every
               column at its current width and silently flip the whole table
               into hand-sized mode, which is not what clicking a divider asks
               for. Same reasoning as the row handle below. */
            if (moved) {
                // Commit the numbers the drag painted, so the re-render is a no-op.
                onChange(block.content, { ...block.metadata, columnWidths: nextWidths });
            } else {
                // Undo the widths pinned on mousedown for the fixed-layout flip.
                cols.forEach((col, i) => {
                    col.style.width = savedWidths[i] > 0 ? `${savedWidths[i]}px` : '';
                });
            }

            dragData.current = null;
            setActiveResize(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /* Row resize.
       A stored row height is a FLOOR, not a fixed height: it lands on the <tr>
       as `height`, which table layout treats as a minimum, so a row you made
       tall stays tall and a row whose text outgrows the drag still expands
       instead of clipping. That is also why untouched rows keep a 0 here —
       writing every row's current height would freeze them all at whatever
       their content happened to need at the moment of one drag. */
    const handleRowResizeStart = (e: React.MouseEvent, rowIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        const table = tableRef.current;
        if (!table) return;

        const trs = [...table.querySelectorAll('tr')] as HTMLElement[];
        const tr = trs[rowIndex];
        if (!tr) return;

        const scale = elementScale(table);
        const startHeight = Math.round(tr.offsetHeight);
        const startY = e.clientY;
        let nextHeight = startHeight;
        let moved = false;

        dragData.current = { type: 'row', index: rowIndex, startPos: startY, startSize: startHeight };
        setActiveResize({ type: 'row', index: rowIndex });

        document.body.style.cursor = 'row-resize';
        document.body.classList.add('chnk-it-resizing-active');

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = (moveEvent.clientY - startY) / scale;
            if (delta !== 0) moved = true;
            nextHeight = Math.round(Math.max(MIN_ROW_H, startHeight + delta));
            tr.style.height = `${nextHeight}px`;
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');

            /* A grab zone runs along every row divider, so a plain click lands
               on one often. It must be a no-op, not a commit that pins the row
               at whatever height its text happened to need. */
            if (moved) {
                const next = savedHeights.length === rowCount ? [...savedHeights] : Array(rowCount).fill(0);
                next[rowIndex] = nextHeight;
                onChange(block.content, { ...block.metadata, rowHeights: next });
            } else {
                tr.style.height = savedHeights[rowIndex] > 0 ? `${savedHeights[rowIndex]}px` : '';
            }

            dragData.current = null;
            setActiveResize(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    /* Every column sized ⇒ the table owns its width (fixed layout, horizontal
       scroll past the container). Anything else ⇒ auto layout, and the table
       is exactly as wide as whatever holds it. */
    const hasWidths = savedWidths.length === colCount && colCount > 0 && savedWidths.every(w => w > 0);
    /* Mid-drag counts as sized even before the commit: under auto layout the
       table can't exceed its container, so dragging a column wider silently
       squeezed its neighbours and the handle drifted away from the cursor. */
    const isSized = hasWidths || activeResize?.type === 'col';
    const alignOf = (c: number): TableAlign => alignments[c] || 'left';

    /* Reorder feedback: the column/row being dragged fades, and the one it
       would land on takes an accent edge on the side it is arriving from. */
    const colClass = (ci: number): string => {
        if (!reorder || reorder.type !== 'col' || reorder.from === reorder.to) return '';
        if (ci === reorder.from) return tableStyles.reorderSource;
        if (ci !== reorder.to) return '';
        return reorder.to > reorder.from ? tableStyles.dropAfterCol : tableStyles.dropBeforeCol;
    };

    const rowClass = (r: number): string => {
        if (!reorder || reorder.type !== 'row' || reorder.from === reorder.to) return '';
        if (r === reorder.from) return tableStyles.reorderSource;
        if (r !== reorder.to) return '';
        return reorder.to > reorder.from ? tableStyles.dropAfterRow : tableStyles.dropBeforeRow;
    };

    if (rowCount === 0) {
        // First paint of a fresh table — the init effect will populate it.
        return <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false} />;
    }

    return (
        /* data-table-sized is read by the canvas node (BlockNode.module.css):
           once the columns own the width, the node shrink-wraps to them so no
           gap can open up between the table's edge and the node's ring. Keyed
           off the COMMITTED widths, not the in-flight drag, so a column drag
           doesn't re-lay-out the canvas on every frame. */
        <div className={styles.tableWrapper} ref={wrapperRef} contentEditable={false} data-table-sized={hasWidths ? 'true' : undefined}>
            <div className={tableStyles.tableScroll}>
                <div className={`${tableStyles.tableInner} ${isSized ? tableStyles.tableInnerSized : ''}`}>
                    <div className={tableStyles.tableRow}>
                    <div className={tableStyles.tableMain}>
                        <table className={`${tableStyles.table} ${isSized ? tableStyles.tableSized : ''}`} ref={tableRef}>
                            {/* Always present: the resize drag writes straight to
                                these cols, and a second colgroup created on the
                                fly would fight the one React renders. */}
                            <colgroup>
                                {(rows[0] || []).map((_, ci) => (
                                    <col key={ci} style={{ width: savedWidths[ci] && savedWidths[ci] > 0 ? `${savedWidths[ci]}px` : undefined }} />
                                ))}
                            </colgroup>
                            <thead>
                                {/* `height` on a row, not `min-height`: table layout ignores
                                    min-height on rows entirely (which is why the stored
                                    heights used to do nothing) and treats height as a floor. */}
                                <tr
                                    className={rowClass(0)}
                                    style={{ height: savedHeights[0] && savedHeights[0] > 0 ? `${savedHeights[0]}px` : undefined }}
                                >
                                    {rows[0]?.map((cell, ci) => {
                                        const colSelected = menu?.type === 'col' && menu.index === ci;
                                        return (
                                            <th
                                                key={ci}
                                                scope="col"
                                                className={`${tableStyles.tableHeader} ${colSelected ? tableStyles.colSelected : ''} ${colClass(ci)}`}
                                                onMouseDown={(e) => focusCellFromShell(e, 0, ci)}
                                            >
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        className={`${tableStyles.colGrip} ${colSelected ? tableStyles.gripActive : ''}`}
                                                        title="Drag to reorder · click for column options"
                                                        aria-label="Column options"
                                                        onMouseDown={(e) => startReorder('col', ci, e)}
                                                        onClick={(e) => openMenu('col', ci, e)}
                                                    >
                                                        <GripHorizontal size={11} />
                                                    </button>
                                                )}
                                                <TableCellEditor
                                                    setRef={setCellRef(0, ci)}
                                                    align={alignOf(ci)}
                                                    value={cell}
                                                    readOnly={readOnly}
                                                    onChange={(v) => handleCellChange(0, ci, v)}
                                                    onKeyDown={(e) => handleCellKeyDown(e, 0, ci)}
                                                    placeholder="Header"
                                                />
                                                {!readOnly && (
                                                    <div
                                                        className={`${tableStyles.colResizeHandle} ${activeResize?.type === 'col' && activeResize?.index === ci ? tableStyles.resizeActive : ''}`}
                                                        onMouseDown={(e) => handleColResizeStart(e, ci)}
                                                    />
                                                )}
                                                {/* Every cell carries one, so the bar joins up across the
                                                    row and the divider is grabbable along its whole length. */}
                                                {!readOnly && (
                                                    <div
                                                        className={`${tableStyles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === 0 ? tableStyles.resizeActive : ''}`}
                                                        onMouseDown={(e) => handleRowResizeStart(e, 0)}
                                                    />
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(1).map((row, ri) => {
                                    const r = ri + 1;
                                    const rowSelected = menu?.type === 'row' && menu.index === r;
                                    return (
                                        <tr
                                            key={r}
                                            className={`${rowSelected ? tableStyles.rowSelected : ''} ${rowClass(r)}`}
                                            style={{ height: savedHeights[r] && savedHeights[r] > 0 ? `${savedHeights[r]}px` : undefined }}
                                        >
                                            {row.map((cell, ci) => {
                                                const colSelected = menu?.type === 'col' && menu.index === ci;
                                                return (
                                                    <td
                                                        key={ci}
                                                        className={`${tableStyles.tableData} ${colSelected ? tableStyles.colSelected : ''} ${colClass(ci)}`}
                                                        onMouseDown={(e) => focusCellFromShell(e, r, ci)}
                                                    >
                                                        {!readOnly && ci === 0 && (
                                                            <button
                                                                type="button"
                                                                className={`${tableStyles.rowGrip} ${rowSelected ? tableStyles.gripActive : ''}`}
                                                                title="Drag to reorder · click for row options"
                                                                aria-label="Row options"
                                                                onMouseDown={(e) => startReorder('row', r, e)}
                                                                onClick={(e) => openMenu('row', r, e)}
                                                            >
                                                                <GripVertical size={11} />
                                                            </button>
                                                        )}
                                                        <TableCellEditor
                                                            setRef={setCellRef(r, ci)}
                                                            align={alignOf(ci)}
                                                            value={cell}
                                                            readOnly={readOnly}
                                                            onChange={(v) => handleCellChange(r, ci, v)}
                                                            onKeyDown={(e) => handleCellKeyDown(e, r, ci)}
                                                        />
                                                        {!readOnly && (
                                                            <div
                                                                className={`${tableStyles.rowResizeHandle} ${activeResize?.type === 'row' && activeResize?.index === r ? tableStyles.resizeActive : ''}`}
                                                                onMouseDown={(e) => handleRowResizeStart(e, r)}
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {!readOnly && (
                        <button type="button" className={styles.addColBtn} onClick={() => insertColumn(colCount)} title="Add column" aria-label="Add column">
                            <Plus size={14} />
                        </button>
                    )}
                    </div>
                    {!readOnly && (
                        <button type="button" className={styles.addRowBtn} onClick={() => insertRow(rowCount)} title="Add row" aria-label="Add row">
                            <Plus size={14} />
                        </button>
                    )}
                </div>
            </div>

            {!readOnly && menu && (
                <div className={tableStyles.tableMenu} style={{ top: menu.y, left: menu.x }} role="menu">
                    {menu.type === 'col' ? (
                        <>
                            <button type="button" className={tableStyles.menuItem} onClick={() => { insertColumn(menu.index); setMenu(null); }}><ArrowLeft size={14} /> Insert left</button>
                            <button type="button" className={tableStyles.menuItem} onClick={() => { insertColumn(menu.index + 1); setMenu(null); }}><ArrowRight size={14} /> Insert right</button>
                            <div className={tableStyles.menuDivider} />
                            <div className={tableStyles.menuAlignRow}>
                                <button type="button" className={`${tableStyles.alignBtn} ${alignOf(menu.index) === 'left' ? tableStyles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'left')} title="Align left" aria-label="Align left"><AlignLeft size={14} /></button>
                                <button type="button" className={`${tableStyles.alignBtn} ${alignOf(menu.index) === 'center' ? tableStyles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'center')} title="Align center" aria-label="Align center"><AlignCenter size={14} /></button>
                                <button type="button" className={`${tableStyles.alignBtn} ${alignOf(menu.index) === 'right' ? tableStyles.alignActive : ''}`} onClick={() => setColumnAlign(menu.index, 'right')} title="Align right" aria-label="Align right"><AlignRight size={14} /></button>
                            </div>
                            <div className={tableStyles.menuDivider} />
                            <button type="button" className={tableStyles.menuItem} onClick={resetColumnWidths} disabled={!hasWidths}><Columns3 size={14} /> Fit columns to width</button>
                            <button type="button" className={tableStyles.menuItem} onClick={() => clearColumn(menu.index)}><Eraser size={14} /> Clear contents</button>
                            <button type="button" className={`${tableStyles.menuItem} ${tableStyles.menuDanger}`} onClick={() => deleteColumn(menu.index)} disabled={colCount <= 1}><Trash2 size={14} /> Delete column</button>
                        </>
                    ) : (
                        <>
                            <button type="button" className={tableStyles.menuItem} onClick={() => { insertRow(menu.index); setMenu(null); }}><ArrowUp size={14} /> Insert above</button>
                            <button type="button" className={tableStyles.menuItem} onClick={() => { insertRow(menu.index + 1); setMenu(null); }}><ArrowDown size={14} /> Insert below</button>
                            <div className={tableStyles.menuDivider} />
                            <button type="button" className={tableStyles.menuItem} onClick={() => clearRow(menu.index)}><Eraser size={14} /> Clear contents</button>
                            <button type="button" className={`${tableStyles.menuItem} ${tableStyles.menuDanger}`} onClick={() => deleteRow(menu.index)} disabled={rowCount <= 2}><Trash2 size={14} /> Delete row</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});
