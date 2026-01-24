import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';

// Selection box state type
export interface SelectionBox {
    screenStartX: number;
    screenStartY: number;
    screenCurrentX: number;
    screenCurrentY: number;
    flowStartX: number;
    flowStartY: number;
    flowCurrentX: number;
    flowCurrentY: number;
}

interface UseCanvasBoxSelectionOptions {
    visibleNodes: AppNode[];
    selectedCanvasNodeIds: Set<string>;
    setSelectedCanvasNodeIds: (ids: Set<string>) => void;
    clearCanvasSelection: () => void;
    toggleCanvasNodeSelection: (id: string) => void;
}

/**
 * Hook that handles Ctrl+drag box selection on the canvas.
 * Manages selection state, keyboard tracking, and visual bounds calculation.
 */
export function useCanvasBoxSelection({
    visibleNodes,
    selectedCanvasNodeIds,
    setSelectedCanvasNodeIds,
    clearCanvasSelection,
    toggleCanvasNodeSelection,
}: UseCanvasBoxSelectionOptions) {
    const { screenToFlowPosition } = useReactFlow();
    
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const justFinishedBoxSelection = useRef(false);

    // Track Ctrl key state
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                setIsCtrlPressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                setIsCtrlPressed(false);
                setSelectionBox(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Handle node click for multi-selection
    const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
        const target = event.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('textarea') ||
            target.closest('[contenteditable="true"]') || target.closest('a')) {
            return;
        }

        if (event.shiftKey) {
            event.stopPropagation();
            toggleCanvasNodeSelection(node.id);
        } else {
            if (selectedCanvasNodeIds.size > 0) {
                clearCanvasSelection();
            }
        }
    }, [toggleCanvasNodeSelection, clearCanvasSelection, selectedCanvasNodeIds.size]);

    // Clear selection when clicking pane
    const handlePaneClick = useCallback((_event: React.MouseEvent) => {
        if (selectionBox || justFinishedBoxSelection.current) return;

        window.getSelection()?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (selectedCanvasNodeIds.size > 0) {
            clearCanvasSelection();
        }
    }, [clearCanvasSelection, selectedCanvasNodeIds.size, selectionBox]);

    // Box selection start
    const handleSelectionStart = useCallback((event: React.MouseEvent) => {
        if (!event.ctrlKey) return;

        const target = event.target as HTMLElement;
        if (!target.classList.contains('react-flow__pane')) return;

        event.preventDefault();

        const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const screenX = event.clientX - containerRect.left;
        const screenY = event.clientY - containerRect.top;

        const flowPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setSelectionBox({
            screenStartX: screenX,
            screenStartY: screenY,
            screenCurrentX: screenX,
            screenCurrentY: screenY,
            flowStartX: flowPosition.x,
            flowStartY: flowPosition.y,
            flowCurrentX: flowPosition.x,
            flowCurrentY: flowPosition.y,
        });
    }, [screenToFlowPosition]);

    // Box selection move
    const handleSelectionMove = useCallback((event: React.MouseEvent) => {
        if (!selectionBox) return;

        const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const screenX = event.clientX - containerRect.left;
        const screenY = event.clientY - containerRect.top;

        const flowPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setSelectionBox(prev => prev ? {
            ...prev,
            screenCurrentX: screenX,
            screenCurrentY: screenY,
            flowCurrentX: flowPosition.x,
            flowCurrentY: flowPosition.y,
        } : null);
    }, [selectionBox, screenToFlowPosition]);

    // Calculate nodes under selection box (for live preview)
    const nodesUnderSelection = useMemo(() => {
        if (!selectionBox) return new Set<string>();

        const left = Math.min(selectionBox.flowStartX, selectionBox.flowCurrentX);
        const right = Math.max(selectionBox.flowStartX, selectionBox.flowCurrentX);
        const top = Math.min(selectionBox.flowStartY, selectionBox.flowCurrentY);
        const bottom = Math.max(selectionBox.flowStartY, selectionBox.flowCurrentY);

        const selectedIds = new Set<string>();

        visibleNodes.forEach(node => {
            const nodeWidth = (node.measured?.width || node.style?.width as number) || 200;
            const nodeHeight = (node.measured?.height || node.style?.height as number) || 100;

            const nodeLeft = node.position.x;
            const nodeRight = node.position.x + nodeWidth;
            const nodeTop = node.position.y;
            const nodeBottom = node.position.y + nodeHeight;

            const intersects = !(
                nodeRight < left ||
                nodeLeft > right ||
                nodeBottom < top ||
                nodeTop > bottom
            );

            if (intersects) {
                selectedIds.add(node.id);
            }
        });

        return selectedIds;
    }, [selectionBox, visibleNodes]);

    // Box selection end
    const handleSelectionEnd = useCallback(() => {
        if (!selectionBox) return;

        if (nodesUnderSelection.size > 0) {
            justFinishedBoxSelection.current = true;
            setTimeout(() => {
                justFinishedBoxSelection.current = false;
            }, 100);

            setSelectedCanvasNodeIds(nodesUnderSelection);
        }

        setSelectionBox(null);
    }, [selectionBox, nodesUnderSelection, setSelectedCanvasNodeIds]);

    // Calculate selection box visual bounds
    const selectionBoxStyle = useMemo(() => {
        if (!selectionBox) return null;

        const left = Math.min(selectionBox.screenStartX, selectionBox.screenCurrentX);
        const top = Math.min(selectionBox.screenStartY, selectionBox.screenCurrentY);
        const width = Math.abs(selectionBox.screenCurrentX - selectionBox.screenStartX);
        const height = Math.abs(selectionBox.screenCurrentY - selectionBox.screenStartY);

        return { left, top, width, height };
    }, [selectionBox]);

    return {
        selectionBox,
        isCtrlPressed,
        nodesUnderSelection,
        selectionBoxStyle,
        onNodeClick,
        handlePaneClick,
        handleSelectionStart,
        handleSelectionMove,
        handleSelectionEnd,
    };
}
