import { useCallback } from 'react';
import { BlockEditor } from './BlockEditor';
import type { Block } from './types';
import styles from './ContainerBlock.module.css';

interface ContainerBlockProps {
    block: Block;
    onUpdate: (data: Partial<Block>) => void;
    readOnly?: boolean;
    nodeId?: string;
}

export const ContainerBlock = ({ block, onUpdate, readOnly, nodeId }: ContainerBlockProps) => {
    // The blocks are stored in metadata.blocks
    // If not present, default empty
    const childBlocks = block.metadata?.blocks || [];

    const handleUpdate = useCallback((newBlocks: Block[]) => {
        onUpdate({
            metadata: {
                ...block.metadata,
                blocks: newBlocks
            }
        });
    }, [block.metadata, onUpdate]);

    return (
        <div className={styles.containerBlock}>
            {/* Visual group without label */}
            <BlockEditor
                initialContent={childBlocks}
                onUpdate={handleUpdate}
                readOnly={readOnly}
                minimal={true}
                mode="atomic"
                nodeId={nodeId}
            />
        </div>
    );
};
