import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './DragChip.module.css';

/**
 * Small drag indicator — follows the cursor only when dragging a node
 * over a valid fusion/nesting target (dropTarget is set).
 */
export function DragChip() {
    const dropTarget = useStore(s => s.interactionState.dropTarget);
    const ref = useRef<HTMLDivElement>(null);

    const isActive = !!dropTarget;

    useEffect(() => {
        if (!isActive) return;
        const onMove = (e: PointerEvent) => {
            const el = ref.current;
            if (!el) return;
            el.style.left = `${e.clientX}px`;
            el.style.top = `${e.clientY}px`;
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%, -50%) scale(1)';
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [isActive]);

    if (!isActive) return null;

    return createPortal(
        <div ref={ref} className={styles.dragChipContainer}>
            <div className={styles.magicalBlock}>
                <Box size={24} className={styles.icon} />
            </div>
        </div>,
        document.body
    );
}
