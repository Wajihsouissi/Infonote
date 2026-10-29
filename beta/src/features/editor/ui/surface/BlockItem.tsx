import React, { lazy, memo, Suspense, useCallback } from 'react';
import { SortableBlockWrapper } from './SortableBlockWrapper';
import {
    TextBlock, HeadingBlock, TodoBlock, QuoteBlock, ListBlock, CalloutBlock, DividerBlock, PageBlock,
} from '../../blocks/text/TextBlocks';
import { AIBlock } from '../../blocks/ai/AIBlock';
import { CodeBlock } from '../../blocks/code/CodeBlock';
import { MediaBlock, ImageBlock, VideoBlock, FileBlock } from '../../blocks/media/MediaBlocks';
import { TableBlock } from '../../blocks/table/TableBlock';
import { ContainerBlock } from '../../blocks/layout/ContainerBlock';
import { ColumnsBlock } from '../../blocks/layout/ColumnsBlock';
import type { EditOptions } from '../../blocks/types';
import { ColorBlock } from '../../blocks/color/ColorBlock';
import { LinkBlock } from '../../blocks/link/LinkBlock';
import { GalleryBlock } from '../../gallery/GalleryBlock';
import { serializeInline } from '../../text/inlineFormat';
import type { Block, BlockMetadata, BlockDropPosition } from '../../types';

const IntelligentUIBlock = lazy(() => import('../../../intelligent-ui/ui/block/IntelligentUIBlock').then(m => ({ default: m.IntelligentUIBlock })));

interface BlockItemProps {
    block: Block;
    isSelected: boolean;
    readOnly?: boolean;
    nodeId?: string;
    hideBlockHandles?: boolean;
    promoteBlockHandles?: boolean;
    disableMediaControls?: boolean;
    imageAlignmentOnly?: boolean;
    parentToggleIndent?: number;

    // Stable Handlers
    onUpdateBlock: (id: string, contentOrPatch: string | Partial<Block>, metadata?: BlockMetadata, opts?: EditOptions) => void;
    onKeyDown: (e: React.KeyboardEvent, id: string, content: string) => void;
    onPaste: (e: React.ClipboardEvent, id: string) => void;

    // Sortable Wrapper Props
    onMoveBlock: (sourceId: string, targetId: string, position: BlockDropPosition, dataTransfer?: DataTransfer) => void;
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
    useStoredListNumber?: boolean;
    minimal?: boolean;
    deferOffscreen?: boolean;
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
    imageAlignmentOnly,
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
    useStoredListNumber,
    minimal,
    deferOffscreen,
    isFirstChildOfToggle
}: BlockItemProps & { index?: number }) {

    // Memoized wrapper handlers
    const handleWrapperMouseDown = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // A grip press carries the existing selection into dragstart.
        if (target.closest('[class*="dragHandle"]')) return;
        if (e.shiftKey) { onSelectionMouseDown(e, block.id); return; }
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
    const handleChange = useCallback((content: string, metadata?: BlockMetadata, opts?: EditOptions) => {
        // `opts` carries what caused the edit (typing vs. undo vs. composition),
        // which the markdown shortcuts need in order to fire only on real input.
        onUpdateBlock(block.id, content, metadata, opts);
    }, [block.id, onUpdateBlock]);

    const handleReplace = useCallback((patch: Partial<Block>) => {
        onUpdateBlock(block.id, patch);
    }, [block.id, onUpdateBlock]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        // Ordinary typing is handled by onInput. Do not serialize a long
        // paragraph a second time merely to discover this key has no command.
        if (!e.ctrlKey && !e.metaKey && !['Enter', 'Backspace', 'Delete', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        // Commands persist live DOM as Markdown. Caret/split logic separately
        // uses DOM ranges so formatting markers never count as visible text.
        const target = e.target as HTMLElement;
        const liveContent = target.isContentEditable ? serializeInline(target) : block.content;
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
            onReplace: handleReplace,
            onKeyDown: handleKeyDown,
            onPaste: handlePaste,
            disableMediaControls,
            domRef: handleRegisterRef,
            index, // Pass to children (ListBlock needs it)
            hasChildren, // Pass to children
            useStoredListNumber,
            minimal,
            onDeleteBlock: handleDelete,
        };

        switch (block.type) {
            case 'heading1': return <HeadingBlock {...props} level={1} />;
            case 'heading2': return <HeadingBlock {...props} level={2} />;
            case 'heading3': return <HeadingBlock {...props} level={3} />;
            case 'todo': return <TodoBlock {...props} />;
            case 'quote': return <QuoteBlock {...props} />;
            case 'media': return <MediaBlock {...props} />;
            case 'image': return <ImageBlock {...props} alignmentOnly={imageAlignmentOnly} />;
            case 'video': return <VideoBlock {...props} />;
            case 'gallery': return <GalleryBlock {...props} />;
            case 'bullet':
            case 'numbered':
            case 'toggle': return <ListBlock {...props} />;
            case 'callout': return <CalloutBlock {...props} />;
            case 'page': return <PageBlock {...props} />;
            case 'container': return <ContainerBlock block={block} onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data)} readOnly={readOnly} nodeId={nodeId} />;
            case 'columns': return (
                <ColumnsBlock
                    block={block}
                    onUpdate={(data: Partial<Block>) => onUpdateBlock(block.id, data)}
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
            case 'intelligent-ui': return <Suspense fallback={<div role="status">Loading interactive interface…</div>}><IntelligentUIBlock {...props} /></Suspense>;
            default: return <TextBlock {...props} />;
        }
    };

    return (
        <SortableBlockWrapper
            id={block.id}
            readOnly={readOnly}
            block={block}
            deferOffscreen={deferOffscreen}
            nodeId={nodeId}
            isSelected={isSelected}
            onMoveBlock={onMoveBlock}
            onDragStart={onDragStart}
            onMenuOpen={onMenuOpen}
            onMouseDown={handleWrapperMouseDown}
            // Indent is published as a CSS variable rather than an inline
            // padding-left, so the wrapper's own left gutter can compose with it
            // (`calc(gutter + indent)`). As an inline padding it always won the
            // cascade and flattened the gutter to 0 for every unindented block.
            style={{ '--block-indent': `${Math.max(0, ((block.indent || 0) - (parentToggleIndent || 0)) * 24)}px` } as React.CSSProperties}
            hideHandle={hideBlockHandles}
            promoteBlockHandles={promoteBlockHandles}
            isFirstChildOfToggle={isFirstChildOfToggle}
        >
            {renderBlockContent()}
        </SortableBlockWrapper>
    );
});
