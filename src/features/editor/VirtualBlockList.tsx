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

const ITEM_HEIGHT = 40;
const OVERSCAN_COUNT = 10;

interface ItemData {
    blocks: Block[];
    selectedBlockIds: Set<string>;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;
    onUpdateBlock: (id: string, content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent, id: string, content: string) => void;
    onPaste: (e: React.ClipboardEvent, id: string) => void;
    onMoveBlock: (sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => void;
    onDragStart: (e: React.DragEvent, block: Block) => void;
    onMenuOpen: (e: React.MouseEvent, id: string) => void;
    onSelectionClick: (e: React.MouseEvent, id: string) => void;
    onSelectionMouseDown: (e: React.MouseEvent, id: string) => void;
    onRegisterRef: (id: string, el: HTMLDivElement | null) => void;
}

const BlockRow = memo(function BlockRow({ index, style, data }: { index: number; style: React.CSSProperties; data: ItemData }) {
    const block = data.blocks[index];
    if (!block) return null;

    return (
        <div style={style}>
            <BlockItem
                block={block}
                isSelected={data.selectedBlockIds.has(block.id)}
                readOnly={data.readOnly}
                nodeId={data.nodeId}
                hideBlockHandles={data.hideBlockHandles}
                promoteBlockHandles={data.promoteBlockHandles}
                disableMediaControls={data.disableMediaControls}
                onUpdateBlock={data.onUpdateBlock}
                onKeyDown={data.onKeyDown}
                onPaste={data.onPaste}
                onMoveBlock={data.onMoveBlock}
                onDragStart={data.onDragStart}
                onMenuOpen={data.onMenuOpen}
                onSelectionClick={data.onSelectionClick}
                onSelectionMouseDown={data.onSelectionMouseDown}
                onRegisterRef={data.onRegisterRef}
            />
        </div>
    );
});

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
    
    const itemData = useMemo<ItemData>(() => ({
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
            ref={listRef}
            height={containerHeight}
            width={containerWidth}
            itemCount={blocks.length}
            itemSize={ITEM_HEIGHT}
            itemData={itemData}
            overscanCount={OVERSCAN_COUNT}
        >
            {BlockRow}
        </List>
    );
});