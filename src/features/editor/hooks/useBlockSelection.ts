import { useState, useCallback, useEffect, useRef } from 'react';
import type { Block } from '../types';

interface SelectionProps {
    editorRef: React.RefObject<HTMLDivElement | null>;
    blocks: Block[];
    blockRefs: React.MutableRefObject<{ [key: string]: HTMLElement | null }>;
}

export function useBlockSelection({ editorRef, blocks, blockRefs }: SelectionProps) {
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
    const [dragSelection, setDragSelection] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [mouseDownBlock, setMouseDownBlock] = useState<{ id: string, startX: number, startY: number, initialRect: DOMRect, isInteractive: boolean } | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const wasDraggingRef = useRef(false);

    const selectedBlockIdsRef = useRef(selectedBlockIds);
    useEffect(() => {
        selectedBlockIdsRef.current = selectedBlockIds;
    }, [selectedBlockIds]);

    // Selection Logic Effect
    useEffect(() => {
        if (!dragSelection && !mouseDownBlock) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!editorRef.current) return;
            const editorRect = editorRef.current.getBoundingClientRect();

            if (mouseDownBlock && !dragSelection) {
                const { initialRect } = mouseDownBlock;
                const isOutside =
                    e.clientY < initialRect.top ||
                    e.clientY > initialRect.bottom ||
                    e.clientX < initialRect.left - 50 ||
                    e.clientX > initialRect.right + 50;

                if (isOutside) {
                    window.getSelection()?.removeAllRanges();
                    if (editorRef.current) {
                        editorRef.current.focus();
                    }

                    const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;
                    const relX = (mouseDownBlock.startX - editorRect.left) / scale;
                    const relY = (mouseDownBlock.startY - editorRect.top) / scale;
                    const currentRelX = (e.clientX - editorRect.left) / scale;
                    const currentRelY = (e.clientY - editorRect.top) / scale;

                    setDragSelection({
                        startX: relX,
                        startY: relY,
                        currentX: currentRelX,
                        currentY: currentRelY
                    });
                    setSelectedBlockIds(new Set([mouseDownBlock.id]));
                    wasDraggingRef.current = true;
                    return;
                }
            }

            if (dragSelection) {
                const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;
                const cx = (e.clientX - editorRect.left) / scale;
                const cy = (e.clientY - editorRect.top) / scale;

                if (!wasDraggingRef.current && (Math.abs(cx - dragSelection.startX) > 5 || Math.abs(cy - dragSelection.startY) > 5)) {
                    wasDraggingRef.current = true;
                }

                setDragSelection(prev => prev ? {
                    ...prev,
                    currentX: cx,
                    currentY: cy
                } : null);
            }
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            if (!wasDraggingRef.current && mouseDownBlock) {
                if (!e.shiftKey && !e.ctrlKey) {
                    if (mouseDownBlock.isInteractive) {
                        if (selectedBlockIds.size > 0) setSelectedBlockIds(new Set());
                    } else {
                        if (selectedBlockIds.size !== 1 || !selectedBlockIds.has(mouseDownBlock.id)) {
                            setSelectedBlockIds(new Set([mouseDownBlock.id]));
                        }
                    }
                }
            }

            setDragSelection(null);
            setMouseDownBlock(null);
            setTimeout(() => { wasDraggingRef.current = false; }, 0);
        };

        if (dragSelection && editorRef.current) {
            const left = Math.min(dragSelection.startX, dragSelection.currentX);
            const top = Math.min(dragSelection.startY, dragSelection.currentY);
            const width = Math.abs(dragSelection.currentX - dragSelection.startX);
            const height = Math.abs(dragSelection.currentY - dragSelection.startY);
            const selectionBox = { left, top, right: left + width, bottom: top + height };

            const newSelected = new Set<string>();
            const editorRect = editorRef.current.getBoundingClientRect();
            const scale = editorRect.width ? (editorRect.width / editorRef.current.offsetWidth) : 1;

            blocks.forEach(block => {
                const el = blockRefs.current[block.id];
                if (el) {
                    const blockRect = el.getBoundingClientRect();
                    const blockRelative = {
                        left: (blockRect.left - editorRect.left) / scale,
                        top: (blockRect.top - editorRect.top) / scale,
                        right: (blockRect.right - editorRect.left) / scale,
                        bottom: (blockRect.bottom - editorRect.top) / scale
                    };

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
        }

        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragSelection, blocks, mouseDownBlock, editorRef, blockRefs, selectedBlockIds.size, selectedBlockIds]);

    // Clear selection when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!editorRef.current) return;
            const target = e.target as HTMLElement;
            if (editorRef.current.contains(target)) return;
            
            // Portals handling (SlashMenu, FloatingToolbar)
            if (target.closest('[data-portal="true"]')) return;

            if (selectedBlockIds.size > 0) {
                setSelectedBlockIds(new Set());
            }
        };

        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [selectedBlockIds, editorRef]);

    // Selection Monitor for Floating Toolbar
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                setSelectionRect(null);
                return;
            }

            const range = selection.getRangeAt(0);
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
                const rect = range.getBoundingClientRect();
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
    }, [editorRef]);

    const handleSelectionMouseDown = useCallback((e: React.MouseEvent, id: string) => {
        if (e.shiftKey && selectedBlockIdsRef.current.size > 0) {
            const lastSelectedId = Array.from(selectedBlockIdsRef.current).pop();
            if (lastSelectedId) {
                const startIdx = blocks.findIndex(b => b.id === lastSelectedId);
                const endIdx = blocks.findIndex(b => b.id === id);
                if (startIdx !== -1 && endIdx !== -1) {
                    e.preventDefault();
                    const min = Math.min(startIdx, endIdx);
                    const max = Math.max(startIdx, endIdx);
                    const rangeIds = blocks.slice(min, max + 1).map(b => b.id);
                    setSelectedBlockIds(new Set(rangeIds));
                    return;
                }
            }
        }

        if (e.button === 0) {
            const target = e.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            setMouseDownBlock({
                id: id,
                startX: e.clientX,
                startY: e.clientY,
                initialRect: rect,
                isInteractive: false
            });
            e.stopPropagation();
        }
    }, [blocks]);

    return {
        selectedBlockIds,
        setSelectedBlockIds,
        dragSelection,
        setDragSelection,
        mouseDownBlock,
        setMouseDownBlock,
        selectionRect,
        wasDraggingRef,
        handleSelectionMouseDown,
        selectedBlockIdsRef
    };
}
