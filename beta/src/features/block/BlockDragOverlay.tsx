import { useEffect, useRef, type RefObject } from 'react';
import overlayStyles from './BlockDragOverlay.module.css';

/** Movement under which a press on an empty media node counts as a click. */
const CLICK_SLOP_PX = 4;
const SCROLLABLE = '.ProseMirror, .infonote-scrollable, [data-scrollable="true"]';

interface BlockDragOverlayProps {
    nodeRef: RefObject<HTMLDivElement | null>;
    /** An empty media node: clicks and dropped files go to its picker. */
    isMediaEmpty: boolean;
    /** Double-click action: open/close a file, or view filled media. */
    onDoubleClick?: () => void;
}

/**
 * Covers an unselected block so the whole node is a drag handle — the editor
 * underneath would otherwise swallow the press. The few gestures that should
 * still reach the content are forwarded to it explicitly.
 */
export function BlockDragOverlay({ nodeRef, isMediaEmpty, onDoubleClick }: BlockDragOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    /** Where a press on an empty media node started, to tell a click from a drag. */
    const pressRef = useRef<{ x: number; y: number } | null>(null);

    /* Scrolling over a block with overflowing content scrolls the content, not
       the canvas. Non-passive, because it has to be able to cancel the zoom. */
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const onWheel = (e: WheelEvent) => {
            const scrollArea = nodeRef.current?.querySelector(SCROLLABLE);
            if (!scrollArea) return;
            const before = scrollArea.scrollTop;
            scrollArea.scrollTop += e.deltaY;
            if (Math.abs(scrollArea.scrollTop - before) > 0.5) {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        overlay.addEventListener('wheel', onWheel, { passive: false });
        return () => overlay.removeEventListener('wheel', onWheel);
    }, [nodeRef]);

    const mediaTrigger = () => nodeRef.current?.querySelector<HTMLElement>('.mediaPlaceholderTrigger');

    return (
        <div
            ref={overlayRef}
            // `interaction-overlay` is the e2e suite's hook for this surface.
            className={`interaction-overlay custom-drag-handle ${overlayStyles.dragOverlay}`}
            /* An empty media node is nothing but a call to action, so a press
               that never moved is handed to the picker. A real drag moves the
               pointer, fails the slop test and is left alone. */
            onPointerDown={isMediaEmpty ? (e) => { pressRef.current = { x: e.clientX, y: e.clientY }; } : undefined}
            onClick={isMediaEmpty ? (e) => {
                const start = pressRef.current;
                pressRef.current = null;
                if (!start) return;
                if (Math.abs(e.clientX - start.x) > CLICK_SLOP_PX || Math.abs(e.clientY - start.y) > CLICK_SLOP_PX) return;
                mediaTrigger()?.click();
            } : undefined}
            // Files dropped on the node would otherwise land here and be lost.
            // The picker is not an ancestor of the overlay, so the forwarded
            // event cannot come back around.
            onDragOver={isMediaEmpty ? (e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            } : undefined}
            onDrop={isMediaEmpty ? (e) => {
                if (!e.dataTransfer.files?.length) return;
                e.preventDefault();
                e.stopPropagation();
                mediaTrigger()?.dispatchEvent(
                    new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: e.dataTransfer }),
                );
            } : undefined}
            onDoubleClick={onDoubleClick ? (e) => {
                e.stopPropagation();
                onDoubleClick();
            } : undefined}
        />
    );
}
