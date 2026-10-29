import { memo, useCallback, useMemo } from 'react';
import { useStableCallback } from '../../../../utils/useStableCallback';
import { Plus, Minus, X } from '../../../../shared/icons';
import { v4 as uuidv4 } from 'uuid';
import { BlockEditor } from '../../ui/surface/BlockEditor';
import type { Block, ColumnData } from '../../types';
import styles from './ColumnsBlock.module.css';

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 20;

interface ColumnsBlockProps {
    block: Block;
    onUpdate: (data: Partial<Block>) => void;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;
}

const makeColumn = (): ColumnData => ({
    id: uuidv4(),
    content: [{ id: uuidv4(), type: 'text', content: '' }],
});

function legacyColumnContent(column: unknown): Block[] {
    if (!column || typeof column !== 'object') return [];
    const value = column as { content?: unknown; blocks?: unknown };
    const nested = Array.isArray(value.content) ? value.content : Array.isArray(value.blocks) ? value.blocks : [];
    const valid = (block: unknown): block is Block => Boolean(
        block &&
        typeof block === 'object' &&
        typeof (block as Block).id === 'string' &&
        typeof (block as Block).type === 'string' &&
        typeof (block as Block).content === 'string',
    );
    return nested.every(valid) ? nested as Block[] : nested.filter(valid);
}

export const ColumnsBlock = ({
    block,
    onUpdate,
    readOnly,
    nodeId,
    hideBlockHandles,
    promoteBlockHandles,
    disableMediaControls
}: ColumnsBlockProps) => {
    const columns = useMemo(() => (block.metadata?.columns || []).map((column, index): ColumnData => {
        const content = legacyColumnContent(column);
        return column.id && content === column.content ? column : {
            ...column, id: column.id || `${block.id}-legacy-column-${index}`, content,
        };
    }), [block.id, block.metadata?.columns]);
    const columnCount = columns.length;
    // Allow up to 20 columns in a single row without forced wrapping
    const gridColumnCount = columnCount;

    const commitColumns = useCallback((newColumns: ColumnData[]) => {
        onUpdate({
            metadata: {
                ...block.metadata,
                columns: newColumns
            }
        });
    }, [block.metadata, onUpdate]);

    const handleColumnUpdate = useStableCallback((columnId: string, newBlocks: Block[]) => {
        const colIndex = columns.findIndex(column => column.id === columnId);
        if (colIndex < 0 || columns[colIndex].content === newBlocks) return;
        const newColumns = [...columns];
        newColumns[colIndex] = {
            ...newColumns[colIndex],
            content: newBlocks
        };
        commitColumns(newColumns);
    });

    const handleAddColumn = useCallback(() => {
        if (columnCount >= MAX_COLUMNS) return;
        commitColumns([...columns, makeColumn()]);
    }, [columns, columnCount, commitColumns]);

    const handleRemoveColumn = useCallback((colIndex: number) => {
        if (columnCount <= MIN_COLUMNS) return;
        commitColumns(columns.filter((_, i: number) => i !== colIndex));
    }, [columns, columnCount, commitColumns]);

    return (
        <div className={styles.columnsWrapper}>
            {!readOnly && (
                <div className={styles.columnsToolbar} contentEditable={false}>
                    <button
                        type="button"
                        className={styles.toolbarBtn}
                        title="Remove column"
                        disabled={columnCount <= MIN_COLUMNS}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleRemoveColumn(columnCount - 1)}
                    >
                        <Minus size={14} />
                    </button>
                    <span className={styles.toolbarCount}>{columnCount} columns</span>
                    <button
                        type="button"
                        className={styles.toolbarBtn}
                        title="Add column"
                        disabled={columnCount >= MAX_COLUMNS}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleAddColumn}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            )}
            <div className={styles.columnsContainer} style={{ gridTemplateColumns: `repeat(${gridColumnCount}, 1fr)` }}>
                {columns.map((col, index: number) => (
                    <div key={col.id || index} className={styles.column}>
                        {!readOnly && columnCount > MIN_COLUMNS && (
                            <button
                                type="button"
                                className={styles.removeColumnBtn}
                                title="Remove this column"
                                contentEditable={false}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleRemoveColumn(index)}
                            >
                                <X size={12} />
                            </button>
                        )}
                        <ColumnEditor
                            column={col}
                            onUpdate={handleColumnUpdate}
                            readOnly={readOnly}
                            nodeId={nodeId}
                            hideBlockHandles={hideBlockHandles}
                            promoteBlockHandles={promoteBlockHandles}
                            disableMediaControls={disableMediaControls}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

/* A sibling edit does not reconcile an unchanged column's entire document. */
const ColumnEditor = memo(function ColumnEditor({ column, onUpdate, ...props }: {
    column: ColumnData;
    onUpdate: (id: string, blocks: Block[]) => void;
} & Omit<ColumnsBlockProps, 'block' | 'onUpdate'>) {
    const update = useCallback((blocks: Block[]) => onUpdate(column.id, blocks), [column.id, onUpdate]);
    return <BlockEditor {...props} initialContent={column.content} onUpdate={update} minimal={false} syncUpdate editorId={column.id} />;
});
