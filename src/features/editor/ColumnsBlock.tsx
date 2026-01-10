import { useCallback } from 'react';
import { BlockEditor } from './BlockEditor';
import type { Block } from './types';
import styles from './ColumnsBlock.module.css';

interface ColumnsBlockProps {
    block: Block;
    onUpdate: (data: Partial<Block>) => void;
    readOnly?: boolean;
    nodeId?: string;
}

export const ColumnsBlock = ({ block, onUpdate, readOnly, nodeId }: ColumnsBlockProps) => {
    const columns = block.metadata?.columns || []; // Array of { id: string, content: Block[] }
    const columnCount = columns.length;

    const handleColumnUpdate = useCallback((colIndex: number, newBlocks: Block[]) => {
        const newColumns = [...columns];
        newColumns[colIndex] = {
            ...newColumns[colIndex],
            content: newBlocks
        };
        onUpdate({
            metadata: {
                ...block.metadata,
                columns: newColumns
            }
        });
    }, [columns, block.metadata, onUpdate]);

    return (
        <div className={styles.columnsWrapper}>
            <div className={styles.columnsContainer} style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
                {columns.map((col: any, index: number) => (
                    <div key={col.id || index} className={styles.column}>
                        <BlockEditor
                            initialContent={col.content}
                            onUpdate={(blocks) => handleColumnUpdate(index, blocks)}
                            readOnly={readOnly}
                            minimal={false} // Allow full editing features in columns
                            nodeId={nodeId}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};
