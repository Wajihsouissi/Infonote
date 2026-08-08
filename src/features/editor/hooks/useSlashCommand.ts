import { useState, useCallback, useRef } from 'react';
import type { Block, BlockType, BlockMetadata } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { createGalleryMetadata, getGalleryItems, isGalleryMember } from '../galleryTypes';

interface SlashCommandProps {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocks: Block[];
    blocksRef: React.MutableRefObject<Block[]>; // Added blocksRef
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    setFocusId: (id: string | null) => void;
    nodeId?: string;
}

export function useSlashCommand({
    editorRef,
    blocksRef,
    setBlocks,
    debouncedOnUpdate,
    setFocusId,
    nodeId
}: SlashCommandProps) {
    const [slashMenuState, setSlashMenuState] = useState<{ anchorRect: DOMRect | { top: number; left: number; bottom: number }, blockId: string } | null>(null);
    const slashMenuStateRef = useRef(slashMenuState);

    // Sync ref
    slashMenuStateRef.current = slashMenuState;

    const convertBlock = useCallback((id: string | undefined, type: BlockType, metadata?: BlockMetadata, content?: string) => {
        const targetId = id || (slashMenuStateRef.current ? slashMenuStateRef.current.blockId : null);
        if (!targetId) return;

        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === targetId);
            if (index === -1) return prev;

            const updated = [...prev];
            const currentBlock = updated[index];

            let finalContent = content;
            if (content === '') {
                // Parse out the text following the first slash command word
                // e.g. "/h1 Introduction" -> matches "/h1" + spaces, captures "Introduction"
                const match = currentBlock.content.match(/^\/[a-zA-Z0-9]*\s*(.*)/);
                finalContent = match ? match[1] : '';
            } else if (content === undefined) {
                finalContent = currentBlock.content;
            }

            /* Turning a block into a gallery. A picture converts into a board of
               one rather than being thrown away, and the board's `content` is its
               TITLE — so a media block's content (a data URL) must never carry
               over into it, which converting from the block menu would otherwise
               do. Only text becomes a title. */
            const wasGallery = currentBlock.type === 'gallery';
            const wasMedia = isGalleryMember(currentBlock) && !wasGallery;
            const galleryItems = wasGallery
                ? getGalleryItems(currentBlock)
                : (wasMedia && currentBlock.content?.trim() ? [{ ...currentBlock, id: uuidv4() }] : []);
            const galleryTitle = wasGallery ? currentBlock.content : (wasMedia ? '' : (finalContent || ''));

            updated[index] = {
                ...currentBlock,
                type,
                content: type === 'gallery' ? galleryTitle : (finalContent || ''),
                metadata: type === 'columns' ? {
                    columns: Array.from({ length: metadata?.count || 2 }).map(() => ({
                        id: uuidv4(),
                        content: [{ id: uuidv4(), type: 'text', content: '' }]
                    }))
                } : type === 'gallery' ? createGalleryMetadata(galleryItems)
                : (metadata !== undefined ? { ...currentBlock.metadata, ...metadata } : currentBlock.metadata)
            };

            // Converting a toggle to a non-toggle: outdent its nested children by one level so
            // they don't end up orphaned (indented with no parent toggle). Mirrors convertSelectedBlocks.
            if (currentBlock.type === 'toggle' && type !== 'toggle') {
                const targetIndent = currentBlock.indent || 0;
                let j = index + 1;
                while (j < updated.length) {
                    const childIndent = updated[j].indent || 0;
                    if (childIndent > targetIndent) {
                        updated[j] = { ...updated[j], indent: Math.max(0, childIndent - 1) };
                        j++;
                    } else {
                        break;
                    }
                }
            }

            debouncedOnUpdate(updated);
            return updated;
        });

        // Auto-split logic removed per user request for better document formatting
        // if (['heading1', 'heading2', 'heading3', 'toggle', 'divider'].includes(type)) {
        //     if (nodeId) {
        //         const index = blocksRef.current.findIndex(b => b.id === targetId);
        //         if (index > 0) {
        //             useStore.getState().splitNode(nodeId, targetId, blocksRef.current);
        //         }
        //     }
        // }

        setFocusId(targetId);
        setSlashMenuState(null);
    }, [debouncedOnUpdate, nodeId, setBlocks, setFocusId, blocksRef]); // Removed blocks from dependency

    const handleSlashOpen = useCallback((id: string) => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editorRef.current) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSlashMenuState({
                anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
                blockId: id
            });
        }
    }, [editorRef]);

    return {
        slashMenuState,
        setSlashMenuState,
        slashMenuStateRef,
        convertBlock,
        handleSlashOpen
    };
}
