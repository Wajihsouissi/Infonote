import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './DragChip.module.css';

/**
 * A magical, glowing floating block icon that follows the cursor
 * while a canvas node is being dragged.
 */
export function DragChip() {
    const activeNodeData = useStore(s => {
        const id = s.interactionState.draggedNodeId;
        if (!id) return null;
        const n = s.nodes.find(x => x.id === id);
        if (n && (n.className ?? '').includes('chnk-it-drag-source')) {
            return n;
        }
        return null;
    });

    const isChipActive = !!activeNodeData;
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isChipActive) return;
        const onMove = (e: PointerEvent) => {
            const el = ref.current;
            if (!el) return;
            // Center the icon on the cursor
            el.style.left = `${e.clientX}px`;
            el.style.top = `${e.clientY}px`;
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%, -50%) scale(1)';
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [isChipActive]);

    if (!isChipActive || !activeNodeData) return null;

    // Use node color or fallback to magical purple
    const data: any = activeNodeData.data || {};
    const color = data.color || '#a855f7'; 
    const styleVars = {
        '--chip-color': color,
        '--chip-color-rgb': hexToRgb(color)
    } as React.CSSProperties;

    return createPortal(
        <div ref={ref} className={styles.dragChipContainer} style={styleVars}>
            <div className={styles.glowRing1} />
            <div className={styles.glowRing2} />
            <div className={styles.magicalBlock}>
                <Box size={24} className={styles.icon} />
                <div className={styles.sparkle1} />
                <div className={styles.sparkle2} />
            </div>
        </div>,
        document.body
    );
}

// Simple helper to generate rgb comma-separated string for box-shadows
function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '168, 85, 247'; // fallback to purple
    return `${r}, ${g}, ${b}`;
}
