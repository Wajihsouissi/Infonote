import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../../store/useStore';
import type { AppNode } from '../../../../types';
import { isEditableElement } from '../../../../utils/editableTarget';

const BLOCK_SIZE = { width: 300, height: 100 };
/** Rough footprint of a text block, for nudging off cards it would land on. */
const OVERLAP_X = 180;
const OVERLAP_Y = 60;
const MAX_NUDGES = 30;

/** A spot near `start` that does not sit on a card, with a little jitter so
 *  repeated presses do not stack blocks exactly on top of each other. */
function nearbyFreeSpot(start: { x: number; y: number }, nodes: AppNode[], parentId: string | null) {
    let x = start.x + (Math.random() - 0.5) * 120;
    let y = start.y + (Math.random() - 0.5) * 80;
    const siblings = nodes.filter((node) => (node.parentId || null) === parentId);
    for (let attempt = 0; attempt < MAX_NUDGES; attempt++) {
        const blocking = siblings.some((node) =>
            Math.abs(node.position.x - x) < OVERLAP_X && Math.abs(node.position.y - y) < OVERLAP_Y);
        if (!blocking) break;
        x += (Math.random() * 40 + 20) * (Math.random() > 0.5 ? 1 : -1);
        y += (Math.random() * 40 + 20) * (Math.random() > 0.5 ? 1 : -1);
    }
    return { x, y };
}

/**
 * Enter on the canvas (outside any text field or dialog) creates a text block
 * under the pointer, selects it and puts the caret in it.
 */
export function useEnterCreatesBlock(pointerRef: React.RefObject<{ x: number; y: number }>) {
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' || isEditableElement(e.target)) return;
            const target = e.target as Element;
            // Let focused controls keep their native Enter action. Otherwise a
            // keyboard user pressing the theme or panel button creates a block
            // and never activates the button.
            if (target.closest?.('button, a, select, summary, [role="button"], [role="link"], [role="menuitem"]')) return;
            if (target.closest?.('[class*="modal"], [class*="Modal"]')) return;
            e.preventDefault();

            const { nodes, currentParentId, addNode, setSelectedCanvasNodeIds, setLastCreatedCanvasNodeId } = useStore.getState();
            const position = nearbyFreeSpot(screenToFlowPosition(pointerRef.current), nodes, currentParentId);
            const nodeId = uuidv4();
            const block = { id: uuidv4(), type: 'text' as const, content: '' };

            addNode('block', position, { content: [block], isStandaloneBlock: true }, BLOCK_SIZE, currentParentId || undefined, nodeId);
            setSelectedCanvasNodeIds(new Set([nodeId]));
            setLastCreatedCanvasNodeId(nodeId);

            // Two frames: the node mounts, then its editor does.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                document.querySelector<HTMLElement>(`#block-${block.id} [contenteditable="true"]`)?.focus({ preventScroll: true });
                window.dispatchEvent(new CustomEvent('panToNode', { detail: { id: nodeId } }));
            }));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pointerRef, screenToFlowPosition]);
}
