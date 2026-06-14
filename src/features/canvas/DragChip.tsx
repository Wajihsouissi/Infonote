import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Grip } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './DragChip.module.css';

/**
 * A small icon box that follows the cursor while a canvas node is being dragged.
 * The actual node is hidden (see `.chnk-it-drag-source` in index.css), so this chip is
 * the only thing the user sees move — no full-size translucent ghost.
 */
export function DragChip() {
    // Only active while the dragged node is hidden — i.e. it's over a fusion/nesting target.
    // Free repositioning keeps the normal node (not hidden), so no chip shows. Both selectors
    // return stable primitives so the chip doesn't churn on every drag tick.
    const isChipActive = useStore(s => {
        const id = s.interactionState.draggedNodeId;
        if (!id) return false;
        const n = s.nodes.find(x => x.id === id);
        return !!n && (n.className ?? '').includes('chnk-it-drag-source');
    });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isChipActive) return;
        const onMove = (e: PointerEvent) => {
            const el = ref.current;
            if (!el) return;
            el.style.left = `${e.clientX}px`;
            el.style.top = `${e.clientY}px`;
            el.style.opacity = '1';
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [isChipActive]);

    if (!isChipActive) return null;

    return createPortal(
        <div ref={ref} className={styles.dragChip}>
            <Grip size={26} strokeWidth={2} />
        </div>,
        document.body
    );
}
