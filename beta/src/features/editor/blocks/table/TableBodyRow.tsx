import { memo } from 'react';
import { GripVertical } from '../../../../shared/icons';
import { TableCellEditor } from './TableCell';
import type { TableAlign } from './tableCellCaret';
import tableStyles from './TableBlock.module.css';

interface TableBodyRowProps {
    row: string[];
    index: number;
    height?: number;
    alignments?: TableAlign[];
    readOnly?: boolean;
    selected: boolean;
    selectedColumn: number | null;
    reorderClass: string;
    columnClasses: string[];
    resizing: boolean;
    setCellRef: (r: number, c: number) => (el: HTMLDivElement | null) => void;
    onChange: (r: number, c: number, value: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, r: number, c: number) => void;
    onShellMouseDown: (event: React.MouseEvent, r: number, c: number) => void;
    onReorder: (type: 'col' | 'row', index: number, event: React.MouseEvent) => void;
    onMenu: (type: 'col' | 'row', index: number, event: React.MouseEvent) => void;
    onResize: (event: React.MouseEvent, index: number) => void;
}

/** Unchanged rows retain their data and handlers while another cell is typed. */
export const TableBodyRow = memo(function TableBodyRow({
    row, index, height, alignments, readOnly, selected, selectedColumn,
    reorderClass, columnClasses, resizing, setCellRef, onChange, onKeyDown,
    onShellMouseDown, onReorder, onMenu, onResize,
}: TableBodyRowProps) {
    return (
        <tr className={`${selected ? tableStyles.rowSelected : ''} ${reorderClass}`}
            style={{ height: height && height > 0 ? `${height}px` : undefined }}>
            {row.map((cell, ci) => (
                <td key={ci}
                    className={`${tableStyles.tableData} ${selectedColumn === ci ? tableStyles.colSelected : ''} ${columnClasses[ci] || ''}`}
                    onMouseDown={event => onShellMouseDown(event, index, ci)}>
                    {!readOnly && ci === 0 && (
                        <button type="button"
                            className={`${tableStyles.rowGrip} ${selected ? tableStyles.gripActive : ''}`}
                            title="Drag to reorder · click for row options" aria-label="Row options"
                            onMouseDown={event => onReorder('row', index, event)}
                            onClick={event => onMenu('row', index, event)}>
                            <GripVertical size={11} />
                        </button>
                    )}
                    <TableCellEditor row={index} column={ci} setRef={setCellRef(index, ci)}
                        align={alignments?.[ci] || 'left'} value={cell} readOnly={readOnly}
                        onChange={onChange} onKeyDown={onKeyDown} />
                    {!readOnly && (
                        <div className={`${tableStyles.rowResizeHandle} ${resizing ? tableStyles.resizeActive : ''}`}
                            onMouseDown={event => onResize(event, index)} />
                    )}
                </td>
            ))}
        </tr>
    );
});
