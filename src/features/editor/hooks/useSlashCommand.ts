import { useState, useCallback, useRef } from 'react';
import type { Block, BlockType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';

interface SlashCommandProps {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocks: Block[];
    setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
    debouncedOnUpdate: (newBlocks: Block[]) => void;
    setFocusId: (id: string | null) => void;
    nodeId?: string;
}

export function useSlashCommand({ 
    editorRef, 
    blocks, 
    setBlocks, 
    debouncedOnUpdate, 
    setFocusId,
    nodeId 
}: SlashCommandProps) {
    const [slashMenuState, setSlashMenuState] = useState<{ anchorRect: DOMRect | { top: number; left: number; bottom: number }, blockId: string } | null>(null);
    const slashMenuStateRef = useRef(slashMenuState);
    
    // Sync ref
    slashMenuStateRef.current = slashMenuState;

    const convertBlock = useCallback((id: string | undefined, type: BlockType, metadata?: any) => {
        const targetId = id || (slashMenuStateRef.current ? slashMenuStateRef.current.blockId : null);
        if (!targetId) return;

        setBlocks(prev => {
            const newBlocks = prev.map(b =>
                b.id === targetId
                    ? {
                        ...b,
                        type,
                        metadata: type === 'columns' ? {
                            columns: Array.from({ length: metadata?.count || 2 }).map(() => ({ id: uuidv4(), content: [] }))
                        } : b.metadata
                    }
                    : b
            );
            debouncedOnUpdate(newBlocks);
            return newBlocks;
        });

        if (['heading1', 'heading2', 'heading3', 'toggle', 'divider'].includes(type)) {
            if (nodeId) {
                const index = blocks.findIndex(b => b.id === targetId);
                if (index > 0) {
                    useStore.getState().splitNode(nodeId, targetId, blocks);
                }
            }
        }

        setFocusId(targetId);
        setSlashMenuState(null);
    }, [debouncedOnUpdate, nodeId, blocks, setBlocks, setFocusId]);

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
