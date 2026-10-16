import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from '../canvasConstants';

const ZOOM_FACTOR_PER_FRAME = 1.015;
const PAN_PX_PER_FRAME = 18;

type HeldKey = 'plus' | 'minus' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Canvas keys outside text fields:
 * arrows pan and +/- zoom (smoothly, for as long as they are held, zooming
 * about the pointer), 5 fits the view, K toggles the shortcuts panel, L toggles
 * linking mode (with 2+ cards selected) and Ctrl/Cmd+D duplicates the selection.
 */
export function useCanvasKeyboard({
    isInEditableFieldRef,
    pointerRef,
}: {
    isInEditableFieldRef: React.RefObject<boolean>;
    pointerRef: React.RefObject<{ x: number; y: number }>;
}) {
    const { fitView, getViewport, setViewport, screenToFlowPosition } = useReactFlow();
    const heldRef = useRef<Partial<Record<HeldKey, boolean>>>({});
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        const tick = () => {
            const h = heldRef.current;
            if (!h.plus && !h.minus && !h.ArrowLeft && !h.ArrowRight && !h.ArrowUp && !h.ArrowDown) {
                frameRef.current = null;
                return;
            }

            let { x, y, zoom } = getViewport();
            const nextZoom = h.plus ? Math.min(MAX_CANVAS_ZOOM, zoom * ZOOM_FACTOR_PER_FRAME)
                : h.minus ? Math.max(MIN_CANVAS_ZOOM, zoom / ZOOM_FACTOR_PER_FRAME)
                    : zoom;
            if (nextZoom !== zoom) {
                // Zoom about the pointer: its flow point stays under it.
                const anchor = screenToFlowPosition(pointerRef.current);
                x += anchor.x * (zoom - nextZoom);
                y += anchor.y * (zoom - nextZoom);
                zoom = nextZoom;
            }
            if (h.ArrowLeft) x += PAN_PX_PER_FRAME;
            if (h.ArrowRight) x -= PAN_PX_PER_FRAME;
            if (h.ArrowUp) y += PAN_PX_PER_FRAME;
            if (h.ArrowDown) y -= PAN_PX_PER_FRAME;
            setViewport({ x, y, zoom });

            frameRef.current = requestAnimationFrame(tick);
        };

        const hold = (key: HeldKey) => {
            heldRef.current[key] = true;
            frameRef.current ??= requestAnimationFrame(tick);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInEditableFieldRef.current) return;
            const state = useStore.getState();
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                hold('plus');
            } else if (e.key === '-') {
                e.preventDefault();
                hold('minus');
            } else if (ARROWS.has(e.key)) {
                e.preventDefault();
                hold(e.key as HeldKey);
            } else if (e.key === '5') {
                e.preventDefault();
                fitView({ duration: 400 });
            } else if (e.key === 'k') {
                e.preventDefault();
                state.setShortcutsPanelOpen(!state.isShortcutsPanelOpen);
            } else if (e.key === 'l') {
                e.preventDefault();
                if (state.selectedCanvasNodeIds.size >= 2) state.setIsLinkingMode(!state.isLinkingMode);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (state.selectedCanvasNodeIds.size > 0) state.bulkDuplicateNodes(Array.from(state.selectedCanvasNodeIds));
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === '+' || e.key === '=') heldRef.current.plus = false;
            else if (e.key === '-') heldRef.current.minus = false;
            else if (ARROWS.has(e.key)) heldRef.current[e.key as HeldKey] = false;
        };

        const releaseAll = () => {
            heldRef.current = {};
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', releaseAll);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', releaseAll);
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [fitView, getViewport, isInEditableFieldRef, pointerRef, screenToFlowPosition, setViewport]);
}
