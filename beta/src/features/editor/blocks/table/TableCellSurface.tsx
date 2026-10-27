import type { ComponentProps } from 'react';
import type { TableAlign } from './tableCellCaret';
import styles from './TableBlock.module.css';

/** The table's text geometry is identical with or without input behavior. */
export function TableCellSurface({ align, ...props }: ComponentProps<'div'> & { align?: TableAlign }) {
    return <div {...props} className={styles.tableCell} style={{ textAlign: align }} />;
}
