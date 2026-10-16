import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { setStreaming } from './viewportStreamingStore';

/** Quiet period after the last viewport event before rich detail returns.
 *  Trackpad and wheel zooms arrive as many tiny, separate gestures; this keeps
 *  the canvas in its cheap movement state across the gaps between them. */
const VIEWPORT_SETTLE_MS = 130;

const isDirectViewportGesture = (event?: MouseEvent | TouchEvent | null) => event instanceof WheelEvent
    || (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent)
    || (event instanceof MouseEvent && event.buttons !== 0);

interface UseViewportStreamingOptions {
    canvasAreaRef: React.RefObject<HTMLDivElement | null>;
    /** Class set on the canvas area while the camera is being moved by hand. */
    movingClassName: string;
    currentParentId: string | null;
    /** Re-cull after a camera change; cheap enough for every frame. */
    handleViewportChange: () => void;
    /** Bring culling fully up to date once the camera settles. */
    flushViewportChange: () => void;
}

/**
 * Keeps camera movement cheap. While the canvas pans or zooms it is
 * "streaming": new card editors wait to mount and the selected card shows its
 * static preview; both come back once the camera has been still for a moment. Zoom is published to CSS (`--rf-zoom`) only on settle,
 * because mutating an inherited custom property every wheel tick invalidated
 * the styles of the whole canvas.
 */
export function useViewportStreaming({
    canvasAreaRef,
    movingClassName,
    currentParentId,
    handleViewportChange,
    flushViewportChange,
}: UseViewportStreamingOptions) {
    const { getViewport } = useReactFlow();
    const settleTimerRef = useRef<number | null>(null);
    const frameRef = useRef<number | null>(null);
    const lastPublishedZoomRef = useRef<number | null>(null);

    const setMoving = useCallback((moving: boolean) => {
        canvasAreaRef.current?.classList.toggle(movingClassName, moving);
    }, [canvasAreaRef, movingClassName]);

    const publishZoom = useCallback(() => {
        const canvasArea = canvasAreaRef.current;
        const { zoom } = getViewport();
        if (!canvasArea || lastPublishedZoomRef.current === zoom) return;
        lastPublishedZoomRef.current = zoom;
        // Scoped to the canvas: only card chrome inside it counter-scales.
        canvasArea.style.setProperty('--rf-zoom', String(zoom));
    }, [canvasAreaRef, getViewport]);

    const clearSettleTimer = useCallback(() => {
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, []);

    const settle = useCallback(() => {
        setMoving(false);
        setStreaming(false);
        flushViewportChange();
        publishZoom();
    }, [flushViewportChange, publishZoom, setMoving]);

    const onMoveStart = useCallback((event?: MouseEvent | TouchEvent | null) => {
        clearSettleTimer();
        // Programmatic camera moves (fit, pan-to-new-card) must stay clickable,
        // and a bare pointer-down is not a move: only freeze hit-testing once
        // the camera actually changes (see onMove).
        if (!isDirectViewportGesture(event)) setMoving(false);
        setStreaming(true);
    }, [clearSettleTimer, setMoving]);

    const onMove = useCallback((event?: MouseEvent | TouchEvent | null) => {
        // Some wheel devices never fire a fresh onMoveStart per tick, so any
        // transform counts as active movement.
        clearSettleTimer();
        setMoving(isDirectViewportGesture(event));
        setStreaming(true);
        // Coalesce raw events to one re-cull per paint.
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            handleViewportChange();
        });
    }, [clearSettleTimer, handleViewportChange, setMoving]);

    const onMoveEnd = useCallback((immediate = false) => {
        clearSettleTimer();
        if (immediate) {
            settle();
            return;
        }
        settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            settle();
        }, VIEWPORT_SETTLE_MS);
    }, [clearSettleTimer, settle]);

    /* React Flow normally closes a gesture through onMoveEnd. A pointerup that
       lands outside its pane (a fast pan off the window edge) would otherwise
       leave the canvas streaming forever, so the window closes it as well. */
    useEffect(() => {
        const canvasArea = canvasAreaRef.current;
        const release = () => onMoveEnd();
        const releaseNow = () => onMoveEnd(true);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('mouseup', release);
        window.addEventListener('blur', releaseNow);
        return () => {
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
            window.removeEventListener('mouseup', release);
            window.removeEventListener('blur', releaseNow);
            clearSettleTimer();
            canvasArea?.classList.remove(movingClassName);
        };
    }, [canvasAreaRef, clearSettleTimer, movingClassName, onMoveEnd]);

    // fitView on mount (and on entering a canvas) settles the camera without
    // ever firing onMove.
    useEffect(() => {
        publishZoom();
    }, [publishZoom, currentParentId]);

    useEffect(() => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    }, []);

    return { onMoveStart, onMove, onMoveEnd };
}
