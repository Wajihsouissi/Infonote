import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Block } from '../types';
import { throttle } from '../../../utils/throttle';

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

    // Throttled selection calculation to improve performance
    const throttledCalculateSelection = useMemo(
        () => throttle((dragSel: { startX: number, startY: number, currentX: number, currentY: number }, editorEl: HTMLDivElement, blockElements: typeof blockRefs.current, currentBlocks: Block[]) => {
            const left = Math.min(dragSel.startX, dragSel.currentX);
            const top = Math.min(dragSel.startY, dragSel.currentY);
            const width = Math.abs(dragSel.currentX - dragSel.startX);
            const height = Math.abs(dragSel.currentY - dragSel.startY);
            const selectionBox = { left, top, right: left + width, bottom: top + height };

            const newSelected = new Set<string>();
            const editorRect = editorEl.getBoundingClientRect();
            const computedStyle = getComputedStyle(editorEl);
            const transform = computedStyle.transform || 'matrix(1, 0, 0, 1, 0, 0)';
            const scaleMatch = transform.match(/matrix\(([^)]+)\)/);
            const scale = scaleMatch ? 
                parseFloat(scaleMatch[1].split(',')[3] || '1') : 
                (editorRect.width && editorEl.offsetWidth ? 
                 editorRect.width / editorEl.offsetWidth : 1);

            currentBlocks.forEach(block => {
                const el = blockElements[block.id];
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
        }, 16), // ~60fps
        [setSelectedBlockIds]
    );

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

                    const computedStyle = editorRef.current ? getComputedStyle(editorRef.current) : null;
                    const transform = computedStyle?.transform || 'matrix(1, 0, 0, 1, 0, 0)';
                    const scaleMatch = transform.match(/matrix\(([^)]+)\)/);
                    const scale = scaleMatch ? 
                        parseFloat(scaleMatch[1].split(',')[3] || '1') : 
                        (editorRect.width && editorRef.current?.offsetWidth ? 
                         editorRect.width / editorRef.current.offsetWidth : 1);
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
                const computedStyle = editorRef.current ? getComputedStyle(editorRef.current) : null;
                const transform = computedStyle?.transform || 'matrix(1, 0, 0, 1, 0, 0)';
                const scaleMatch = transform.match(/matrix\(([^)]+)\)/);
                const scale = scaleMatch ? 
                    parseFloat(scaleMatch[1].split(',')[3] || '1') : 
                    (editorRect.width && editorRef.current?.offsetWidth ? 
                     editorRect.width / editorRef.current.offsetWidth : 1);
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
            throttledCalculateSelection(dragSelection, editorRef.current, blockRefs.current, blocks);
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
            
            // Improved portals handling
            if (target.closest('[data-portal="true"]') || 
                target.closest('[data-radix-popper-content-wrapper]') || 
                target.closest('[role="dialog"]') || 
                target.closest('.modal') || 
                target.closest('.popover') || 
                target.closest('.dropdown') ||
                target.closest('.fullscreen-modal') ||
                target.closest('.center-modal')) return;

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
