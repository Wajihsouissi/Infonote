import React, { memo, useCallback } from 'react';
import { SortableBlockWrapper } from './SortableBlockWrapper';
import {
    TextBlock, HeadingBlock, TodoBlock, QuoteBlock, ImageBlock, ListBlock, CalloutBlock,
    DividerBlock, PageBlock, ContainerBlock, VideoBlock, FileBlock, ColumnsBlock, CodeBlock,
    TableBlock, AIBlock
} from './BlockComponents';
import { ColorBlock } from './ColorBlock';
import { LinkBlock } from './LinkBlock';
import type { Block } from './types';

interface BlockItemProps {
    block: Block;
    isSelected: boolean;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;
    parentToggleIndent?: number;

    // Stable Handlers
    onUpdateBlock: (id: string, content: string, metadata?: any) => void;
    onKeyDown: (e: React.KeyboardEvent, id: string, content: string) => void;
    onPaste: (e: React.ClipboardEvent, id: string) => void;

    // Sortable Wrapper Props
    onMoveBlock: (sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => void;
    onDragStart: (e: React.DragEvent, block: Block) => void;
    onMenuOpen: (e: React.MouseEvent, id: string) => void;

    // Deletion Props
    onDeleteBlock?: (id: string) => void;

    // Selection Props
    onSelectionClick: (e: React.MouseEvent, id: string) => void;
    onSelectionMouseDown: (e: React.MouseEvent, id: string) => void;

    // Ref Registration
    onRegisterRef: (id: string, el: HTMLDivElement | null) => void;
    hasChildren?: boolean;
    minimal?: boolean;
    isFirstChildOfToggle?: boolean;
}

export const BlockItem = memo(function BlockItem({
    block,
    isSelected,
    readOnly,
    nodeId,
    hideBlockHandles,
    promoteBlockHandles,
    disableMediaControls,
    parentToggleIndent,
    onUpdateBlock,
    onKeyDown,
    onPaste,
    onMoveBlock,
    onDragStart,
    onMenuOpen,
    onDeleteBlock,
    onSelectionClick,
    onSelectionMouseDown,
    onRegisterRef,
    index,
    hasChildren,
    minimal,
    isFirstChildOfToggle
}: BlockItemProps & { index?: number }) {

    // Memoized wrapper handlers
    const handleWrapperMouseDown = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isInteractive = target.isContentEditable ||
                              target.tagName === 'INPUT' || 
                              target.tagName === 'TEXTAREA' || 
                              target.closest('button') || 
                              target.closest('a');
                              
        if (isInteractive) {
            onSelectionClick(e as unknown as React.MouseEvent, block.id);
            return;
        }
        
        onSelectionMouseDown(e, block.id);
    }, [block.id, onSelectionMouseDown, onSelectionClick]);

    // Memoized block handlers
    const handleChange = useCallback((content: string, metadata?: any) => {
        onUpdateBlock(block.id, content, metadata);
    }, [block.id, onUpdateBlock]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Read live DOM text instead of potentially stale React state
        const target = e.target as HTMLElement;
        const liveContent = target.isContentEditable ? target.innerText : block.content;
        onKeyDown(e, block.id, liveContent);
    }, [block.id, block.content, onKeyDown]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        onPaste(e, block.id);
    }, [block.id, onPaste]);

    const handleRegisterRef = useCallback((el: HTMLDivElement | null) => {
        onRegisterRef(block.id, el);
    }, [block.id, onRegisterRef]);

    const handleDelete = useCallback(() => {
        onDeleteBlock?.(block.id);
    }, [block.id, onDeleteBlock]);

    const renderBlockContent = () => {
        const props = {
            block,
            readOnly,
            onChange: handleChange,
            onKeyDown: handleKeyDown,
            onPaste: handlePaste,
            disableMediaControls,
            domRef: handleRegisterRef,
            index, // Pass to children (ListBlock needs it)
            hasChildren, // Pass to children
            minimal,
            onDeleteBlock: handleDelete,
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
            case 'container': return <ContainerBlock block={block} onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data as any)} readOnly={readOnly} nodeId={nodeId} />;
            case 'columns': return (
                <ColumnsBlock 
                    block={block} 
                    onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data as any)} 
                    readOnly={readOnly} 
                    nodeId={nodeId} 
                    hideBlockHandles={hideBlockHandles}
                    promoteBlockHandles={promoteBlockHandles}
                    disableMediaControls={disableMediaControls}
                />
            );
            case 'table': return <TableBlock {...props} />;
            case 'divider': return <DividerBlock />;
            case 'file': return <FileBlock {...props} />;
            case 'code': return <CodeBlock {...props} />;
            case 'color': return <ColorBlock {...props} />;
            case 'link': return <LinkBlock {...props} />;
            case 'ai': return <AIBlock {...props} />;
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
            style={{ paddingLeft: `${Math.max(0, ((block.indent || 0) - (parentToggleIndent || 0)) * 24)}px` }}
            hideHandle={hideBlockHandles}
            promoteBlockHandles={promoteBlockHandles}
            isFirstChildOfToggle={isFirstChildOfToggle}
        >
            {renderBlockContent()}
        </SortableBlockWrapper>
    );
});
