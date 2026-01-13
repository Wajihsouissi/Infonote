import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, BlockType } from './types';
import styles from './BlockEditor.module.css';
import { SortableBlockWrapper } from './SortableBlockWrapper';
import { SlashMenu } from './SlashMenu';
import { BlockMenu } from './BlockMenu';
import { FloatingToolbar } from './FloatingToolbar';
import { TextBlock, HeadingBlock, TodoBlock, QuoteBlock, ImageBlock, ListBlock, CalloutBlock, DividerBlock, PageBlock, ContainerBlock, VideoBlock, FileBlock, ColumnsBlock } from './BlockComponents';
import { parseClipboardData } from './pasteUtils';
import { useStore } from '../../store/useStore';

interface BlockEditorProps {
    initialContent?: string | Block[];
    onUpdate?: (blocks: Block[]) => void;
    readOnly?: boolean;
    autoFocus?: boolean;
    minimal?: boolean;
    mode?: 'document' | 'atomic';
    nodeId?: string; // New prop
    hideBlockHandles?: boolean;
    disableMediaControls?: boolean;
}

import { memo } from 'react';

// ... imports

export const BlockEditor = memo(function BlockEditor({ initialContent, onUpdate, readOnly, autoFocus, minimal, nodeId, hideBlockHandles, disableMediaControls }: BlockEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [blocks, setBlocks] = useState<Block[]>(() => {
        if (Array.isArray(initialContent)) return initialContent;
        // Migration for legacy string content
        return [{ id: uuidv4(), type: 'text', content: typeof initialContent === 'string' ? initialContent : '' }];
    });

    // Slash Menu State
    const [slashMenuState, setSlashMenuState] = useState<{ anchorRect: DOMRect | { top: number; left: number; bottom: number }, blockId: string } | null>(null);
    // Block Menu State
    const [blockMenuState, setBlockMenuState] = useState<{ x: number, y: number, blockId: string } | null>(null);

    // Focus State
    const [focusId, setFocusId] = useState<string | null>(null);
    const blockRefs = useRef<{ [key: string]: HTMLElement | null }>({});

    // Toolbar Selection State
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

    // Multi-selection State
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
    const [dragSelection, setDragSelection] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const wasDraggingRef = useRef(false);

    // Selection Logic Effect
    useEffect(() => {
        if (!dragSelection) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!editorRef.current) return;
            const editorRect = editorRef.current.getBoundingClientRect();

            // Check if moved significantly
            const cx = e.clientX - editorRect.left;
            const cy = e.clientY - editorRect.top;
            // If moved more than 5px, consider it a drag
            if (dragSelection && (Math.abs(cx - dragSelection.startX) > 5 || Math.abs(cy - dragSelection.startY) > 5)) {
                wasDraggingRef.current = true;
            }

            setDragSelection(prev => prev ? {
                ...prev,
                currentX: cx,
                currentY: cy
            } : null);
        };

        const handleGlobalMouseUp = () => {
            setDragSelection(null);
            // wasDraggingRef remains true for the subsequent click event
            setTimeout(() => { wasDraggingRef.current = false; }, 0);
        };

        // Calculate intersections live
        if (!editorRef.current) return;

        // Normalize selection box (relative to editor)
        const left = Math.min(dragSelection.startX, dragSelection.currentX);
        const top = Math.min(dragSelection.startY, dragSelection.currentY);
        const width = Math.abs(dragSelection.currentX - dragSelection.startX);
        const height = Math.abs(dragSelection.currentY - dragSelection.startY);
        const selectionBox = { left, top, right: left + width, bottom: top + height };

        const newSelected = new Set<string>();
        const editorRect = editorRef.current.getBoundingClientRect();

        blocks.forEach(block => {
            const el = blockRefs.current[block.id];
            if (el) {
                const blockRect = el.getBoundingClientRect();

                // Convert block rect to relative coordinates
                const blockRelative = {
                    left: blockRect.left - editorRect.left,
                    top: blockRect.top - editorRect.top,
                    right: blockRect.right - editorRect.left,
                    bottom: blockRect.bottom - editorRect.top
                };

                // Check intersection
                if (
                    blockRelative.left < selectionBox.right &&
                    blockRelative.right > selectionBox.left &&
                    blockRelative.top < selectionBox.bottom &&
                    blockRelative.bottom > selectionBox.top
                ) {
                    newSelected.add(block.id);
                }
            }
        });

        if (newSelected.size > 0) {
            setSelectedBlockIds(newSelected);
        }

        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragSelection, blocks]);

    // Auto-focus effect
    useEffect(() => {
        if (autoFocus && !focusId && blocks.length > 0) {
            const targetId = blocks[blocks.length - 1].id;
            setFocusId(targetId);
        }
    }, []); // Run once on mount

    // Selection Monitor
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                setSelectionRect(null);
                return;
            }

            const range = selection.getRangeAt(0);

            // Validate that range is inside the editor
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
                const rect = range.getBoundingClientRect();
                // Only show if selection width is substantial (avoid flashing on clicks)
                if (rect.width > 2) {
                    setSelectionRect(rect);
                } else {
                    setSelectionRect(null);
                }
            } else {
                setSelectionRect(null);
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    // Sync with external content updates (e.g. Fusion)
    // Sync with external content updates (e.g. Fusion)
    useEffect(() => {
        if (initialContent) {
            const nextContent = Array.isArray(initialContent) ? initialContent : [{ id: uuidv4(), type: 'text' as const, content: typeof initialContent === 'string' ? initialContent : '' }];

            setBlocks(prev => {
                // Optimization: Avoid re-render if content is identical
                if (JSON.stringify(prev) === JSON.stringify(nextContent)) {
                    return prev;
                }
                return nextContent;
            });
        }
    }, [initialContent]);

    useEffect(() => {
        if (focusId && blockRefs.current[focusId]) {
            blockRefs.current[focusId]?.focus();
            setFocusId(null);
        }
    }, [focusId, blocks]);

    // Handle converting the CURRENT block to another type (via slash menu or shortcuts)
    const convertBlock = useCallback((id: string | undefined, type: BlockType, metadata?: any) => {
        const targetId = id || (slashMenuState ? slashMenuState.blockId : null);
        if (!targetId) return;

        setBlocks(prev => {
            const newBlocks = prev.map(b =>
                b.id === targetId
                    ? {
                        ...b,
                        type,
                        // Content preserved by default
                        metadata: type === 'columns' ? {
                            columns: Array.from({ length: metadata?.count || 2 }).map(() => ({ id: uuidv4(), content: [] }))
                        } : b.metadata
                    }
                    : b
            );
            onUpdate?.(newBlocks);
            return newBlocks;
        });

        // Trigger Split Check if it's a structural type
        if (['heading1', 'heading2', 'heading3', 'toggle', 'divider'].includes(type)) {
            checkForSplit(targetId, type);
        }

        setFocusId(targetId); // Keep focus
        setSlashMenuState(null);
    }, [slashMenuState, onUpdate]);

    const updateBlock = useCallback((id: string, contentOrPatch: string | Partial<Block>) => {
        setBlocks(prev => {
            const newBlocks = prev.map(b => {
                if (b.id !== id) return b;

                if (typeof contentOrPatch === 'string') {
                    return { ...b, content: contentOrPatch };
                } else {
                    return { ...b, ...contentOrPatch };
                }
            });
            onUpdate?.(newBlocks);
            return newBlocks;
        });

        if (typeof contentOrPatch === 'string') {
            const content = contentOrPatch;
            // Define auto-split helper (DEBOUNCED or conditional?)
            // We want to trigger it AFTER conversion to type.

            if (content === '# ') {
                convertBlock(id, 'heading1');
                // Immediate split if not first block?
                checkForSplit(id, 'heading1');
                return;
            }
            if (content === '## ') {
                convertBlock(id, 'heading2');
                checkForSplit(id, 'heading2');
                return;
            }
            if (content === '### ') {
                convertBlock(id, 'heading3');
                checkForSplit(id, 'heading3');
                return;
            }
            if (content === '> ') { convertBlock(id, 'quote'); return; }
            if (content === '>> ') { convertBlock(id, 'toggle'); return; }
            if (content === '--- ') { convertBlock(id, 'divider'); return; } // needs space usually to confirm? or just ---
            if (content === '[] ' || content === '- ') { convertBlock(id, 'todo'); return; }

            // Slash menu
            if (content.startsWith('/')) {
                if (!slashMenuState || slashMenuState.blockId !== id) {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0 && editorRef.current) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        setSlashMenuState({
                            anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right } as any,
                            blockId: id
                        });
                    }
                }
            } else if (slashMenuState) {
                setSlashMenuState(null);
            }
        }
    }, [slashMenuState, onUpdate, convertBlock]);

    // NEW Helper to trigger split
    const checkForSplit = (blockId: string, newType: BlockType) => {
        // We have nodeId prop.
        if (!nodeId) return;

        // Check Index: prevent splitting the very first block
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === blockId);
            if (index > 0) {
                // It is NOT the first block. Trigger split.
                // Pass 'prev' as the current content source of truth
                useStore.getState().splitNode(nodeId, blockId, prev);
            }
            return prev;
        });
    };

    const addBlock = useCallback((afterId: string, type: BlockType = 'text', initialIndent: number = 0, initialMetadata?: any) => {
        const newBlock: Block = { id: uuidv4(), type, content: '', indent: initialIndent };

        if (type === 'columns') {
            const count = initialMetadata?.count || 2;
            newBlock.metadata = {
                columns: Array.from({ length: count }).map(() => ({ id: uuidv4(), content: [] }))
            };
        }

        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === afterId);
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            onUpdate?.(newBlocks);
            return newBlocks;
        });
        setFocusId(newBlock.id);
        setSlashMenuState(null);
    }, [onUpdate]);

    const removeBlock = useCallback((id: string) => {
        setBlocks(prev => {
            if (prev.length <= 1) return prev;
            const index = prev.findIndex(b => b.id === id);
            const newBlocks = prev.filter(b => b.id !== id);

            if (index > 0) {
                setFocusId(prev[index - 1].id);
            }
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const duplicateBlock = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;

            const blockToCopy = prev[index];
            const newBlock = { ...blockToCopy, id: uuidv4(), indent: blockToCopy.indent || 0 }; // Explicitly copy indent
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const updateBlockColor = useCallback((id: string, colorData: { type: 'text' | 'background', value: string }) => {
        setBlocks(prev => {
            const newBlocks = prev.map(b => {
                if (b.id !== id) return b;

                const newMetadata = { ...(b.metadata || {}) };
                if (colorData.type === 'text') {
                    newMetadata.textColor = colorData.value;
                } else {
                    newMetadata.backgroundColor = colorData.value;
                }

                return { ...b, metadata: newMetadata };
            });
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleBlockMenuAction = (action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split', value?: any) => {
        if (!blockMenuState) return;
        const { blockId } = blockMenuState;

        switch (action) {
            case 'turnInto':
                convertBlock(blockId, value);
                break;
            case 'color':
                // types: value is { type: 'text' | 'background', value: string }
                updateBlockColor(blockId, value);
                break;
            case 'duplicate':
                duplicateBlock(blockId);
                break;
            case 'delete':
                removeBlock(blockId);
                break;
            case 'split':
                if (nodeId) {
                    useStore.getState().splitNode(nodeId, blockId, blocks);
                }
                break;
        }
        setBlockMenuState(null);
    };

    // Indentation Handlers
    const handleIndent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index <= 0) return prev; // Can't indent first block (or logic to allow it but usually depends on prev)

            // Limit indent to e.g. 8 levels
            const currentIndent = prev[index].indent || 0;
            if (currentIndent >= 8) return prev;

            // Logic: Can only indent if previous block is at least at same level or one less?
            // Notion logic: Indent level <= (prevBlock.indent + 1)
            const prevBlock = prev[index - 1];
            const prevIndent = prevBlock.indent || 0;

            if (currentIndent >= prevIndent + 1) return prev; // Cannot be deeper than parent + 1

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent + 1 };
            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleOutdent = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;

            const currentIndent = prev[index].indent || 0;
            if (currentIndent <= 0) return prev;

            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], indent: currentIndent - 1 };

            // Optional: Outdent children? Notion outdents subtree. 
            // For now simpler: just single block.

            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleKeyDown = (e: React.KeyboardEvent, id: string, content: string) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                handleOutdent(id);
            } else {
                handleIndent(id);
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            if (slashMenuState) return; // Allow Enter to work in SlashMenu
            e.preventDefault();

            // Auto-continuation for lists
            const currentBlock = blocks.find(b => b.id === id);

            // If empty list item -> Outdent or Turn to text
            if (currentBlock && ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type) && content === '') {
                if ((currentBlock.indent || 0) > 0) {
                    handleOutdent(id);
                } else {
                    convertBlock(id, 'text');
                }
                return;
            }

            const typeToCreate = (currentBlock && ['bullet', 'numbered', 'todo', 'toggle'].includes(currentBlock.type))
                ? currentBlock.type
                : 'text';

            // Inherit indentation
            const indent = currentBlock?.indent || 0;
            addBlock(id, typeToCreate, indent); // Need to update addBlock signature
        } else if (e.key === 'Backspace' && content === '') {
            e.preventDefault();
            // If indented, Backspace outdents first
            const currentBlock = blocks.find(b => b.id === id);
            if (currentBlock && (currentBlock.indent || 0) > 0) {
                handleOutdent(id);
            } else {
                removeBlock(id);
            }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (slashMenuState) {
                // handled by SlashMenu global listener
            }
        }
    };

    // Native Reorder Handler
    const handleMoveBlock = useCallback((sourceId: string, targetId: string, position: 'top' | 'bottom', dataTransfer?: DataTransfer) => {
        setBlocks(prev => {
            // Check for multi-block move from external/internal source
            let blocksToMove: Block[] = [];
            let sourceIds: string[] = [];

            if (dataTransfer) {
                try {
                    const rawData = dataTransfer.getData('application/infonote-block-data');
                    if (rawData) {
                        const parsed = JSON.parse(rawData);
                        if (parsed.blocks) {
                            blocksToMove = parsed.blocks;
                            sourceIds = blocksToMove.map(b => b.id);
                        } else if (parsed.block) {
                            blocksToMove = [parsed.block];
                            sourceIds = [parsed.block.id];
                        }
                    }
                } catch (e) { console.error("Failed to parse drop data", e); }
            }

            // Fallback for internal single drag if dataTransfer didn't help (though it should)
            if (blocksToMove.length === 0) {
                const fromIndex = prev.findIndex(b => b.id === sourceId);
                if (fromIndex !== -1) {
                    blocksToMove = [prev[fromIndex]];
                    sourceIds = [sourceId];
                }
            }

            if (blocksToMove.length === 0) return prev;

            // Remove *all* source blocks from current list (logic handles both internal reorder and cross-editor move if IDs match)
            // Filter out blocks that are being moved (so we don't duplicate if internal)
            // Note: If external move, IDs won't be in `prev` (unless collision), so filter does nothing, which is correct.
            const newBlocks = prev.filter(b => !sourceIds.includes(b.id));

            // Find insertion index in the cleaned list
            const targetIndex = newBlocks.findIndex(b => b.id === targetId);
            if (targetIndex === -1 && newBlocks.length > 0) return prev; // Should be rare

            const insertIndex = targetIndex === -1
                ? newBlocks.length // Append if target not found (empty or fail)
                : position === 'top' ? targetIndex : targetIndex + 1;

            newBlocks.splice(insertIndex, 0, ...blocksToMove);

            onUpdate?.(newBlocks);
            return newBlocks;
        });
    }, [onUpdate]);

    const handleBlockDragStart = useCallback((e: React.DragEvent, block: Block) => {
        const isMulti = selectedBlockIds.has(block.id) && selectedBlockIds.size > 1;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('application/infonote-block-id', block.id); // Primary ID for single/legacy
        e.dataTransfer.setData('application/reactflow-block-type', block.type);

        const blocksToDrag = isMulti
            ? blocks.filter(b => selectedBlockIds.has(b.id))
            : [block];

        if (nodeId) {
            e.dataTransfer.setData('application/infonote-block-data', JSON.stringify({
                block, // For legacy receivers
                blocks: blocksToDrag, // For new receivers
                sourceNodeId: nodeId
            }));
        }
    }, [selectedBlockIds, blocks, nodeId]);

    // Handle Global Delete for Selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedBlockIds.size === 0) return;

            // Only handle if editor is focused or one of its children
            if (!editorRef.current?.contains(document.activeElement)) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                // If editing text inside a block, don't delete the block unless empty? 
                // Actually, standard behavior usually deletes selection if not in edit mode.
                // But we are somewhat always in edit mode.
                // Let's check if the user has a text selection range that is collapsed?
                const selection = window.getSelection();
                // If selection spans multiple blocks or we have "Block Selection Mode" active logic:
                // Since we rely on manual selection mode via drag/click, we can assume intent to delete blocks.

                e.preventDefault();
                setBlocks(prev => {
                    const newBlocks = prev.filter(b => !selectedBlockIds.has(b.id));
                    onUpdate?.(newBlocks);
                    return newBlocks;
                });
                setSelectedBlockIds(new Set());
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedBlockIds, onUpdate]);

    const handleBlockPaste = useCallback(async (e: React.ClipboardEvent, blockId: string) => {
        // Prevent default paste
        e.preventDefault();

        const parsedBlocks = await parseClipboardData(e);
        if (parsedBlocks.length === 0) return;

        console.log("Pasted blocks:", parsedBlocks);

        const firstBlock = parsedBlocks[0];
        const remainingBlocks = parsedBlocks.slice(1);

        // 1. Handle the first block
        // If it's text-like, insert into current cursor position
        if (firstBlock.type === 'text') {
            // Using deprecated but effective execCommand to insert text at caret and trigger input events
            if (firstBlock.content) document.execCommand('insertText', false, firstBlock.content);
        } else {
            // If first block is media or structured, treat it as a block to be inserted
            remainingBlocks.unshift(firstBlock);
        }


        // 2. Insert remaining blocks after the current one
        if (remainingBlocks.length > 0) {
            setBlocks(prev => {
                const index = prev.findIndex(b => b.id === blockId);
                if (index === -1) return prev;

                const newBlocks = [...prev];
                newBlocks.splice(index + 1, 0, ...remainingBlocks);
                onUpdate?.(newBlocks);
                return newBlocks;
            });
        }
    }, [onUpdate]);

    const renderBlock = (block: Block) => {
        const props = {
            block,
            readOnly,
            onChange: (val: string, metadata?: any) => {
                if (metadata) {
                    updateBlock(block.id, { content: val, metadata });
                } else {
                    updateBlock(block.id, val);
                }
            },
            onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, block.id, block.content),
            onPaste: (e: React.ClipboardEvent) => handleBlockPaste(e, block.id),
            domRef: (el: HTMLDivElement | null) => { blockRefs.current[block.id] = el; },
            disableMediaControls
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
            case 'container': return <ContainerBlock block={block} onUpdate={(data: Partial<Block>) => updateBlock(block.id, data)} readOnly={readOnly} />;
            case 'columns': return <ColumnsBlock block={block} onUpdate={(data: Partial<Block>) => updateBlock(block.id, data)} readOnly={readOnly} nodeId={nodeId} />;
            case 'divider': return <DividerBlock />;
            case 'file': return <FileBlock {...props} />;
            case 'table':
            // case 'link': // removed as not in type
            default: return <TextBlock {...props} />;
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Handle File Drops
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);

            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        const content = event.target.result as string;
                        let type: BlockType = 'file';
                        if (file.type.startsWith('image/')) type = 'image';
                        if (file.type.startsWith('video/')) type = 'video';

                        const newBlock: Block = {
                            id: uuidv4(),
                            type,
                            content,
                            metadata: {
                                name: file.name,
                                size: file.size,
                                type: file.type
                            }
                        };

                        setBlocks(prev => {
                            const newBlocks = [...prev, newBlock];
                            onUpdate?.(newBlocks);
                            return newBlocks;
                        });
                    }
                };
                reader.readAsDataURL(file);
            });
            return;
        }

        // Handle Sidebar new block drops OR Reorder drops
        const type = e.dataTransfer.getData('application/reactflow-block-type') as BlockType;
        if (type) {
            const sourceBlockId = e.dataTransfer.getData('application/infonote-block-id');
            if (sourceBlockId) {
                // Moved into empty space -> Move to bottom

                // Case: Empty Editor (dropping into empty column)
                if (blocks.length === 0) {
                    try {
                        const rawData = e.dataTransfer.getData('application/infonote-block-data');
                        if (rawData) {
                            const parsed = JSON.parse(rawData);
                            if (parsed.block || parsed.blocks) {
                                // Ensure we don't duplicate if it somehow exists
                                const newBlocks = parsed.blocks || [parsed.block];
                                setBlocks(newBlocks);
                                onUpdate?.(newBlocks);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to drop into empty column", err);
                    }
                    return;
                }

                // Case: Append to end of existing list
                // Pass dataTransfer so handleMoveBlock can extract external data if needed
                const lastId = blocks[blocks.length - 1].id;
                handleMoveBlock(sourceBlockId, lastId, 'bottom', e.dataTransfer);
                return;
            }

            const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : '0';
            addBlock(lastId, type);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleEditorClick = (e: React.MouseEvent) => {
        // If we just finished a drag selection, don't trigger click behavior
        if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            return;
        }

        if (e.target === editorRef.current) {
            e.preventDefault();

            // Clicking empty space clears selection (only if NOT dragging)
            if (selectedBlockIds.size > 0 && !e.ctrlKey) {
                setSelectedBlockIds(new Set());
                return;
            }

            const lastId = blocks.length > 0 ? blocks[blocks.length - 1].id : null;
            if (lastId) {
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock.type === 'text' && lastBlock.content === '') {
                    setFocusId(lastId);
                } else {
                    addBlock(lastId, 'text');
                }
            } else if (blocks.length === 0) {
                const newId = uuidv4();
                setBlocks([{ id: newId, type: 'text', content: '' }]);
                setFocusId(newId);
            }
        }
    };

    const handleBlockMenuOpen = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setBlockMenuState({ x: e.clientX, y: e.clientY, blockId: id });
    };

    return (
        <div
            className={`${styles.editor} ${minimal ? styles.minimal : ''}`}
            ref={editorRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={handleEditorClick}
            onMouseDown={(e) => {
                if (e.ctrlKey && e.button === 0 && editorRef.current) {
                    wasDraggingRef.current = false;
                    // Start Selection
                    const rect = editorRef.current.getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;
                    const relativeY = e.clientY - rect.top;

                    setDragSelection({
                        startX: relativeX,
                        startY: relativeY,
                        currentX: relativeX,
                        currentY: relativeY
                    });
                    // Clear previous if not additive (simple mode)
                    setSelectedBlockIds(new Set());
                }
            }}
        >
            {blocks.map(block => (
                <SortableBlockWrapper
                    key={block.id}
                    id={block.id}
                    readOnly={readOnly}
                    block={block}
                    nodeId={nodeId}
                    isSelected={selectedBlockIds.has(block.id)}
                    onMoveBlock={handleMoveBlock}
                    onDragStart={handleBlockDragStart}
                    onMenuOpen={handleBlockMenuOpen}
                    style={{ paddingLeft: `${(block.indent || 0) * 24}px` }} // Visual Indentation
                    hideHandle={hideBlockHandles}
                >
                    {renderBlock(block)}
                </SortableBlockWrapper>
            ))}

            {slashMenuState && (
                <SlashMenu
                    anchorRect={slashMenuState.anchorRect}
                    filter={blocks.find(b => b.id === slashMenuState.blockId)?.content.substring(1) || ''}
                    onSelect={(type, meta) => convertBlock(undefined, type, meta)}
                    onClose={() => setSlashMenuState(null)}
                />
            )}

            {blockMenuState && (
                <BlockMenu
                    x={blockMenuState.x}
                    y={blockMenuState.y}
                    blockId={blockMenuState.blockId}
                    currentType={blocks.find(b => b.id === blockMenuState.blockId)?.type || 'text'}
                    onClose={() => setBlockMenuState(null)}
                    onAction={handleBlockMenuAction}
                />
            )}
            {/* Floating Toolbar */}
            {selectionRect && !slashMenuState && !blockMenuState && (
                <FloatingToolbar
                    selectionRect={selectionRect}
                    onFormat={(format, value) => {
                        document.execCommand(format, false, value);
                        // Note: execCommand is simple but reliable for contentEditable.
                        // For advanced needs, we'd manually manipulate the range.
                    }}
                />
            )}

            {/* Selection Rect Overlay */}
            {dragSelection && (
                <div
                    className={styles.selectionRect}
                    style={{
                        left: Math.min(dragSelection.startX, dragSelection.currentX),
                        top: Math.min(dragSelection.startY, dragSelection.currentY),
                        width: Math.abs(dragSelection.currentX - dragSelection.startX),
                        height: Math.abs(dragSelection.currentY - dragSelection.startY)
                    }}
                />
            )}
        </div>
    );
});
