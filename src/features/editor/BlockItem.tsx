import React, { memo, useCallback } from 'react';
import { SortableBlockWrapper } from './SortableBlockWrapper';
import {
    TextBlock, HeadingBlock, TodoBlock, QuoteBlock, ImageBlock, ListBlock, CalloutBlock,
    DividerBlock, PageBlock, ContainerBlock, VideoBlock, FileBlock, ColumnsBlock, CodeBlock
} from './BlockComponents';
import type { Block } from './types';

interface BlockItemProps {
    block: Block;
    isSelected: boolean;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;

    // Stable Handlers
    onUpdateBlock: (id: string, content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent, id: string, content: string) => void;
    onPaste: (e: React.ClipboardEvent, id: string) => void;

    // Sortable Wrapper Props
    onMoveBlock: (sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => void;
    onDragStart: (e: React.DragEvent, block: Block) => void;
    onMenuOpen: (e: React.MouseEvent, id: string) => void;

    // Selection Props
    onSelectionClick: (e: React.MouseEvent, id: string) => void;
    onSelectionMouseDown: (e: React.MouseEvent, id: string) => void;

    // Ref Registration
    onRegisterRef: (id: string, el: HTMLDivElement | null) => void;
}

export const BlockItem = memo(function BlockItem({
    block,
    isSelected,
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
    // onSelectionClick, // not used in implementation
    onSelectionMouseDown,
    onRegisterRef,
    index // New Prop
}: BlockItemProps & { index?: number }) {

    // Memoized wrapper handlers
    const handleWrapperMouseDown = useCallback((e: React.MouseEvent) => {
        onSelectionMouseDown(e, block.id);
    }, [block.id, onSelectionMouseDown]);

    // Memoized block handlers
    const handleChange = useCallback((content: string, metadata?: any) => {
        onUpdateBlock(block.id, content, metadata);
    }, [block.id, onUpdateBlock]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        onKeyDown(e, block.id, block.content);
    }, [block.id, block.content, onKeyDown]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        onPaste(e, block.id);
    }, [block.id, onPaste]);

    const handleRegisterRef = useCallback((el: HTMLDivElement | null) => {
        onRegisterRef(block.id, el);
    }, [block.id, onRegisterRef]);

    const renderBlockContent = () => {
        const props = {
            block,
            readOnly,
            onChange: handleChange,
            onKeyDown: handleKeyDown,
            onPaste: handlePaste,
            disableMediaControls,
            domRef: handleRegisterRef,
            index // Pass to children (ListBlock needs it)
        };

        switch (block.type) {
            case 'heading1': return <HeadingBlock {...props} level={1} />;
            case 'heading2': return <HeadingBlock {...props} level={2} />;
            case 'heading3': return <HeadingBlock {...props} level={3} />;
            case 'todo': return <TodoBlock {...props} />;
            case 'quote': return <QuoteBlock {...props} />;
            case 'image': return <ImageBlock {...props} />;
            case 'video': return <VideoBlock {...props} />;
            case 'bullet':
            case 'numbered':
            case 'toggle': return <ListBlock {...props} />;
            case 'callout': return <CalloutBlock {...props} />;
            case 'page': return <PageBlock {...props} />;
            case 'container': return <ContainerBlock block={block} onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data as any)} readOnly={readOnly} />;
            case 'columns': return <ColumnsBlock block={block} onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data as any)} readOnly={readOnly} nodeId={nodeId} />;
            case 'divider': return <DividerBlock />;
            case 'file': return <FileBlock {...props} />;
            case 'code': return <CodeBlock {...props} />;
            default: return <TextBlock {...props} />;
        }
    };

    return (
        <SortableBlockWrapper
            id={block.id}
            readOnly={readOnly}
            block={block}
            nodeId={nodeId}
            isSelected={isSelected}
            onMoveBlock={onMoveBlock}
            onDragStart={onDragStart}
            onMenuOpen={onMenuOpen}
            onMouseDown={handleWrapperMouseDown}
            style={{ paddingLeft: `${(block.indent || 0) * 24}px` }}
            hideHandle={hideBlockHandles}
            promoteBlockHandles={promoteBlockHandles}
        >
            {renderBlockContent()}
        </SortableBlockWrapper>
    );
});
