import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './DragChip.module.css';

/**
 * Small drag indicator — follows the cursor only when dragging a node
 * over a valid fusion/nesting target (dropTarget is set).
 */
export function DragChip() {
    const dropTarget = useStore(s => s.interactionState.dropTarget);
    const ref = useRef<HTMLDivElement>(null);
    const pointRef = useRef({ x: 0, y: 0 });
    const frameRef = useRef<number | null>(null);

    const isActive = !!dropTarget;

    useEffect(() => {
        if (!isActive) return;
        const onMove = (e: PointerEvent) => {
            pointRef.current = { x: e.clientX, y: e.clientY };
            if (frameRef.current !== null) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                const el = ref.current;
                if (!el) return;
                const { x, y } = pointRef.current;
                el.style.opacity = '1';
                el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(1)`;
            });
        };
        window.addEventListener('pointermove', onMove);
        return () => {
            window.removeEventListener('pointermove', onMove);
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
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
