import { useCallback } from 'react';
import { Plus, Minus, X } from '../../components/icons';
import { v4 as uuidv4 } from 'uuid';
import { BlockEditor } from './BlockEditor';
import type { Block, ColumnData } from './types';
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
    return nested.filter((block): block is Block => Boolean(
        block &&
        typeof block === 'object' &&
        typeof (block as Block).id === 'string' &&
        typeof (block as Block).type === 'string' &&
        typeof (block as Block).content === 'string',
    ));
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
    const columns = (block.metadata?.columns || []).map((column, index): ColumnData => ({
        ...column,
        id: column.id || `${block.id}-legacy-column-${index}`,
        content: legacyColumnContent(column),
    }));
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

    const handleColumnUpdate = useCallback((colIndex: number, newBlocks: Block[]) => {
        const newColumns = [...columns];
        newColumns[colIndex] = {
            ...newColumns[colIndex],
            content: newBlocks
        };
        commitColumns(newColumns);
    }, [columns, commitColumns]);

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
                        <BlockEditor
                            initialContent={col.content}
                            onUpdate={(blocks) => handleColumnUpdate(index, blocks)}
                            readOnly={readOnly}
                            minimal={false} // Allow full editing features in columns
                            nodeId={nodeId}
                            hideBlockHandles={hideBlockHandles}
                            promoteBlockHandles={promoteBlockHandles}
                            disableMediaControls={disableMediaControls}
                            syncUpdate={true}
                            editorId={col.id}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};
