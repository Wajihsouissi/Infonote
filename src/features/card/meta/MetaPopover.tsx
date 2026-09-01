/**
 * The editor that opens off a metadata chip.
 *
 * Portalled to `document.body` and positioned `fixed` from the chip's own
 * client rect. That is not a detail — it is the whole reason this exists as a
 * component rather than an absolutely-positioned div inside the bar. An
 * expanded card clips its own overflow and lives on a zoomed canvas, so a
 * popover anchored inside it is cropped at the card's edge and mis-scaled
 * besides. IconPicker portals out for the same reason; see the note at
 * KanbanCard.tsx:268.
 *
 * A client rect and `position: fixed` are both in viewport coordinates, so the
 * two agree at any canvas zoom without anything having to divide by it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './CardMetaBar.module.css';

/** Kept clear of the viewport edge so a flipped panel never sits flush. */
const MARGIN = 10;
const GAP = 6;

export interface MetaPopoverProps {
    /** The chip this belongs to. Position is read from it, once, on open. */
    anchor: HTMLElement | null;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function MetaPopover({ anchor, onClose, title, children }: MetaPopoverProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    /* Measured after paint, before the browser shows the frame: the panel has
       to be in the DOM to know how tall it is, and reading that in an effect
       that runs after paint would show it in the wrong place for one frame. */
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!anchor || !panel) return;

        const a = anchor.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Below the chip, flipped above when there is no room down there.
        const below = a.bottom + GAP;
        const above = a.top - p.height - GAP;
        const top = below + p.height + MARGIN <= vh || above < MARGIN ? below : above;

        const left = Math.max(MARGIN, Math.min(a.left, vw - p.width - MARGIN));

        setPos({ top: Math.max(MARGIN, Math.min(top, vh - p.height - MARGIN)), left });
    }, [anchor]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        /* Capture, and pointerdown rather than click: the canvas listens for
           single-key shortcuts globally, and a click that lands on another chip
           should close this one before opening that one. */
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            const panel = panelRef.current;
            if (!panel) return;
            const target = e.target as Node;
            if (panel.contains(target) || anchor?.contains(target)) return;
            onClose();
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [anchor, onClose]);

    if (!anchor) return null;

    return createPortal(
        <div
            ref={panelRef}
            className={`${styles.popover} nodrag nopan`}
            role="dialog"
            aria-label={title}
            style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                // Hidden until placed, or it flashes at the origin first.
                visibility: pos ? 'visible' : 'hidden',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <p className={styles.popoverTitle}>{title}</p>
            {children}
        </div>,
        document.body,
    );
}
