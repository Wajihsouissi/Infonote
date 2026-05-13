import { useRef, useMemo, memo } from 'react';
import { List } from 'react-window';
import { BlockItem } from './BlockItem';
import type { Block } from './types';

interface VirtualBlockListProps {
    blocks: Block[];
    selectedBlockIds: Set<string>;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;
    
    // Handlers
    onUpdateBlock: (id: string, content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent, id: string, content: string) => void;
    onPaste: (e: React.ClipboardEvent, id: string) => void;
    onMoveBlock: (sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => void;
    onDragStart: (e: React.DragEvent, block: Block) => void;
    onMenuOpen: (e: React.MouseEvent, id: string) => void;
    onSelectionClick: (e: React.MouseEvent, id: string) => void;
    onSelectionMouseDown: (e: React.MouseEvent, id: string) => void;
    onRegisterRef: (id: string, el: HTMLDivElement | null) => void;
    
    // Container ref for measurements
    containerHeight: number;
    containerWidth: number;
}

const ITEM_HEIGHT = 40; // Approximate height per block
const OVERSCAN_COUNT = 10; // Render 10 extra items above/below viewport

// Row renderer
const BlockRow = ({ 
    index, 
    style,
    ariaAttributes,
    ...data 
}: any) => {
    const {
        blocks,
        selectedBlockIds,
        readOnly,
        nodeId,
        hideBlockHandles,
        promoteBlockHandles,
        disableMediaControls,
        onUpdateBlock,
        onKeyDown,
        onPaste,
        onMoveBlock,
        onDragStart,
        onMenuOpen,
        onSelectionClick,
        onSelectionMouseDown,
        onRegisterRef
    } = data;
    
    const block = blocks[index];
    if (!block) return null;
    
    return (
        <div style={style} {...ariaAttributes}>
            <BlockItem
                block={block}
                isSelected={selectedBlockIds.has(block.id)}
                readOnly={readOnly}
                nodeId={nodeId}
                hideBlockHandles={hideBlockHandles}
                promoteBlockHandles={promoteBlockHandles}
                disableMediaControls={disableMediaControls}
                onUpdateBlock={onUpdateBlock}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onMoveBlock={onMoveBlock}
                onDragStart={onDragStart}
                onMenuOpen={onMenuOpen}
                onSelectionClick={onSelectionClick}
                onSelectionMouseDown={onSelectionMouseDown}
                onRegisterRef={onRegisterRef}
            />
        </div>
    );
};

export const VirtualBlockList = memo(function VirtualBlockList({
    blocks,
    selectedBlockIds,
    readOnly,
    nodeId,
    hideBlockHandles,
    promoteBlockHandles,
    disableMediaControls,
    onUpdateBlock,
    onKeyDown,
    onPaste,
    onMoveBlock,
    onDragStart,
    onMenuOpen,
    onSelectionClick,
    onSelectionMouseDown,
    onRegisterRef,
    containerHeight,
    containerWidth
}: VirtualBlockListProps) {
    const listRef = useRef<any>(null);
    
    // Memoize item data to prevent re-renders
    const itemData = useMemo(() => ({
        blocks,
        selectedBlockIds,
        readOnly,
        nodeId,
        hideBlockHandles,
        promoteBlockHandles,
        disableMediaControls,
        onUpdateBlock,
        onKeyDown,
        onPaste,
        onMoveBlock,
        onDragStart,
        onMenuOpen,
        onSelectionClick,
        onSelectionMouseDown,
        onRegisterRef
    }), [
        blocks,
        selectedBlockIds,
        readOnly,
        nodeId,
        hideBlockHandles,
        promoteBlockHandles,
        disableMediaControls,
        onUpdateBlock,
        onKeyDown,
        onPaste,
        onMoveBlock,
        onDragStart,
        onMenuOpen,
        onSelectionClick,
        onSelectionMouseDown,
        onRegisterRef
    ]);
    
    return (
        <List
            listRef={listRef}
            style={{ height: containerHeight, width: containerWidth }}
            rowCount={blocks.length}
            rowHeight={ITEM_HEIGHT}
            rowProps={itemData}
            rowComponent={BlockRow}
            overscanCount={OVERSCAN_COUNT}
        />
    );
});
