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

interface RowData {
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

const BlockRow = memo(function BlockRow({ index, style, ...rowProps }: { 
    ariaAttributes: any; 
    index: number; 
    style: React.CSSProperties; 
} & RowData) {
    const block = rowProps.blocks[index];
    if (!block) return null;

    return (
        <div style={style}>
            <BlockItem
                block={block}
                isSelected={rowProps.selectedBlockIds.has(block.id)}
                readOnly={rowProps.readOnly}
                nodeId={rowProps.nodeId}
                hideBlockHandles={rowProps.hideBlockHandles}
                promoteBlockHandles={rowProps.promoteBlockHandles}
                disableMediaControls={rowProps.disableMediaControls}
                onUpdateBlock={rowProps.onUpdateBlock}
                onKeyDown={rowProps.onKeyDown}
                onPaste={rowProps.onPaste}
                onMoveBlock={rowProps.onMoveBlock}
                onDragStart={rowProps.onDragStart}
                onMenuOpen={rowProps.onMenuOpen}
                onSelectionClick={rowProps.onSelectionClick}
                onSelectionMouseDown={rowProps.onSelectionMouseDown}
                onRegisterRef={rowProps.onRegisterRef}
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
    containerWidth: _containerWidth,
}: VirtualBlockListProps) {
    const listRef = useRef<any>(null);

    const rowProps = useMemo((): RowData => ({
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
            rowCount={blocks.length}
            rowHeight={ITEM_HEIGHT}
            rowProps={rowProps}
            rowComponent={BlockRow as any}
            overscanCount={OVERSCAN_COUNT}
            style={{ height: containerHeight }}
        />
    );
});
