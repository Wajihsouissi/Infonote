import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import { type AppNode, getNodeLabel } from '../../../types';
import { isEditableElement } from '../../../utils/editableTarget';
import { MIN_CANVAS_ZOOM } from '../canvasConstants';

interface UseCanvasNavigationOptions {
    currentParentId: string | null;
    activeParentNode: AppNode | null | undefined;
    visibleNodes: AppNode[];
    canvasAreaRef: React.RefObject<HTMLDivElement | null>;
    /** A card is open over the canvas (fullscreen or centre peek). */
    isCanvasObscured: boolean;
    announce: (message: string) => void;
}

/**
 * Moving between canvases: the camera and keyboard side of nesting.
 *
 * - Entering a canvas fits it; coming back out centres the card just left.
 * - The level change is announced and focus moves to the new canvas.
 * - Keys (captured before React Flow): Enter opens the focused card, Delete
 *   asks to delete the selection, Alt+Up (or Escape on the pane) goes up.
 * - `panToNode` events `{ id }` centre a node.
 */
export function useCanvasNavigation({
    currentParentId,
    activeParentNode,
    visibleNodes,
    canvasAreaRef,
    isCanvasObscured,
    announce,
}: UseCanvasNavigationOptions) {
    const { fitView, getViewport, setCenter } = useReactFlow();
    const lastExitedNodeId = useStore(s => s.lastExitedNodeId);
    const clearLastExitedNodeId = useStore(s => s.clearLastExitedNodeId);
    const visibleNodesRef = useRef(visibleNodes);
    const lastFittedParentRef = useRef<string | null | undefined>(undefined);
    const announcedParentRef = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        visibleNodesRef.current = visibleNodes;
    }, [visibleNodes]);

    // Entering a canvas frames what is on it.
    useEffect(() => {
        if (lastFittedParentRef.current === currentParentId) return;
        lastFittedParentRef.current = currentParentId;
        if (visibleNodesRef.current.length === 0) return;
        const timer = setTimeout(() => {
            fitView({ duration: 400, padding: 0.2, minZoom: MIN_CANVAS_ZOOM, maxZoom: 1 });
        }, 50);
        return () => clearTimeout(timer);
    }, [currentParentId, fitView]);

    // Coming back out lands on the card that was just left.
    useEffect(() => {
        if (!lastExitedNodeId) return;
        const node = visibleNodes.find(n => n.id === lastExitedNodeId);
        if (!node) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const width = node.measured?.width || 300;
            const height = node.measured?.height || 200;
            setCenter(node.position.x + width / 2, node.position.y + height / 2, {
                zoom: Math.max(getViewport().zoom, 1),
                duration: 500,
            });
            clearLastExitedNodeId();
        }));
    }, [lastExitedNodeId, visibleNodes, setCenter, getViewport, clearLastExitedNodeId]);

    useEffect(() => {
        const handlePanToNode = (e: Event) => {
            const nodeId = (e as CustomEvent<{ id?: string }>).detail?.id;
            const node = nodeId ? useStore.getState().nodes.find(n => n.id === nodeId) : undefined;
            if (node) setCenter(node.position.x + 150, node.position.y + 100, { zoom: getViewport().zoom, duration: 400 });
        };
        window.addEventListener('panToNode', handlePanToNode);
        return () => window.removeEventListener('panToNode', handlePanToNode);
    }, [getViewport, setCenter]);

    // Not on first load; after a deliberate level change, put the keyboard and
    // screen reader on the new canvas and say where they landed.
    useEffect(() => {
        if (announcedParentRef.current === undefined) {
            announcedParentRef.current = currentParentId;
            return;
        }
        if (announcedParentRef.current === currentParentId) return;
        announcedParentRef.current = currentParentId;

        const label = activeParentNode ? (getNodeLabel(activeParentNode.data) || 'Untitled card') : '';
        announce(currentParentId
            ? `Opened ${label}'s nested canvas. Press Alt+Up to return to its parent.`
            : 'Returned to the home canvas.');
        requestAnimationFrame(() => canvasAreaRef.current?.focus({ preventScroll: true }));
    }, [activeParentNode, announce, canvasAreaRef, currentParentId]);

    useEffect(() => {
        const handleKeys = (event: KeyboardEvent) => {
            const target = event.target;
            if (
                isCanvasObscured
                || isEditableElement(target)
                || !(target instanceof HTMLElement)
                || (!canvasAreaRef.current?.contains(target) && target !== document.body)
            ) return;

            const { nodes, selectedCanvasNodeIds, navigateToNode, requestNodeDeletion } = useStore.getState();
            const nodeId = target.closest<HTMLElement>('.react-flow__node')?.getAttribute('data-id') ?? null;

            if (event.key === 'Enter' && nodeId) {
                if (nodes.find((node) => node.id === nodeId)?.type === 'note') {
                    event.preventDefault();
                    event.stopPropagation();
                    navigateToNode(nodeId);
                }
                return;
            }

            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (selectedCanvasNodeIds.size > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    requestNodeDeletion(Array.from(selectedCanvasNodeIds));
                }
                return;
            }

            const goUp = (event.altKey && event.key === 'ArrowUp') || (event.key === 'Escape' && !nodeId);
            if (goUp && currentParentId) {
                event.preventDefault();
                event.stopPropagation();
                navigateToNode(nodes.find((node) => node.id === currentParentId)?.parentId ?? null);
            }
        };
        // Capture: React Flow would otherwise delete selected cards before the
        // branch-deletion warning can run.
        document.addEventListener('keydown', handleKeys, true);
        return () => document.removeEventListener('keydown', handleKeys, true);
    }, [canvasAreaRef, currentParentId, isCanvasObscured]);
}
