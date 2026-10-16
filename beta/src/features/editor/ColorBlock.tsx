import React, { useState, useRef, memo } from 'react';
import styles from './BlockEditor.module.css';
import type { Block, BlockMetadata } from './types';
import { getNearestColorName } from './colorUtils';
import { ColorBlockModal } from './ColorBlockModal';
import { ICON_SIZE } from '../../config/layout';

interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: BlockMetadata) => void;
    disableMediaControls?: boolean;
    minimal?: boolean;
}

export const ColorBlock = memo(({ block, readOnly, onChange, disableMediaControls, minimal }: BlockProps) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const color = block.content || '#1E944A';
    const displayName = block.metadata?.name || getNearestColorName(color);
    const isCanvas = disableMediaControls === true && minimal === true;

    const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        if (isCanvas) {
            // Stop propagation so ReactFlow does NOT start its drag-tracking,
            // which would otherwise swallow the subsequent click event.
            e.stopPropagation();
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!mouseDownPos.current || readOnly) return;
        const dx = e.clientX - mouseDownPos.current.x;
        const dy = e.clientY - mouseDownPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
            setIsModalOpen(true);
        }
        mouseDownPos.current = null;
    };

    return (
        <>
            <div
                className={styles.colorBlockWrapper}
                style={{
                    backgroundColor: color,
                    ...(isCanvas ? {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100%',
                        height: '100%',
                    } : {
                        width: ICON_SIZE,
                        height: ICON_SIZE,
                    })
                }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                title={displayName}
            />
            {isModalOpen && (
                <ColorBlockModal
                    color={color}
                    metadata={block.metadata}
                    displayName={displayName}
                    onChange={onChange}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </>
    );
});
