import { useState, useCallback, useRef } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';

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

    const convertBlock = useCallback((id: string | undefined, type: BlockType, metadata?: any, content?: string) => {
        const targetId = id || (slashMenuStateRef.current ? slashMenuStateRef.current.blockId : null);
        if (!targetId) return;

        setBlocks(prev => {
            const newBlocks = prev.map(b =>
                b.id === targetId
                    ? {
                        ...b,
                        type,
                        content: content !== undefined ? content : b.content,
                        metadata: type === 'columns' ? {
                            columns: Array.from({ length: metadata?.count || 2 }).map(() => ({ id: uuidv4(), content: [] }))
                        } : b.metadata
                    }
                    : b
            );
            debouncedOnUpdate(newBlocks);
            return newBlocks;
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
                anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right } as any,
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
