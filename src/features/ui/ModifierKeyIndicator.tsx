import { useEffect, useRef, useState } from 'react';
import styles from './ModifierKeyIndicator.module.css';

type Props = {
    showCtrl: boolean;
    showShift: boolean;
    showFocus?: boolean;
    showSuccess?: boolean;
    suppress?: boolean;
    top?: number;
    persistOnReleaseMs?: number;
};

export function ModifierKeyIndicator({
    showCtrl,
    showShift,
    showFocus = false,
    showSuccess = false,
    suppress = false,
    top = 76,
    persistOnReleaseMs = 0,
}: Props) {
    const isActive = showCtrl || showShift || showFocus || showSuccess;
    const [render, setRender] = useState(false);
    const [visible, setVisible] = useState(false);
    const hideTimerRef = useRef<number | null>(null);
    const renderTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
        if (renderTimerRef.current) {
            window.clearTimeout(renderTimerRef.current);
            renderTimerRef.current = null;
        }

        if (suppress) {
            setVisible(false);
            setRender(false);
            return;
        }

        if (isActive) {
            setRender(true);
            // Wait a tiny frame to allow DOM mount before applying active animation class
            renderTimerRef.current = window.setTimeout(() => {
                setVisible(true);
            }, 16);
            return;
        }

        if (visible) {
            hideTimerRef.current = window.setTimeout(() => {
                setVisible(false);
                // Unmount component only after transition completes
                renderTimerRef.current = window.setTimeout(() => {
                    setRender(false);
                }, 100);
            }, persistOnReleaseMs);
        }
    }, [isActive, persistOnReleaseMs, suppress, visible]);

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);
        };
    }, []);

    if (!render || suppress) return null;

    return (
        <div 
            className={`${styles.root} ${visible ? styles.visible : ''}`} 
            style={{ top }} 
            aria-live="polite"
        >
            {showCtrl && (
                <div className={styles.line}>
                    <span className={styles.keycap}>Ctrl</span>
                    <span className={styles.join}>+</span>
                    <span className={styles.keycap}>Drag</span>
                    <span className={styles.label}>Box select</span>
                </div>
            )}
            {showShift && (
                <div className={styles.line}>
                    <span className={styles.keycap}>Shift</span>
                    <span className={styles.join}>+</span>
                    <span className={styles.keycap}>Click</span>
                    <span className={styles.label}>Toggle selection</span>
                </div>
            )}
            {showFocus && (
                <div className={styles.line}>
                    <span className={styles.keycap}>F</span>
                    <span className={styles.join}>+</span>
                    <span className={styles.keycap}>Click</span>
                    <span className={styles.label}>Focus view</span>
                </div>
            )}
            {showSuccess && (
                <div className={styles.successLine}>
                    <span className={styles.successBadge}>✓</span>
                    <span className={styles.label} style={{ color: '#34d399', fontWeight: 600 }}>View Focused</span>
                </div>
            )}
        </div>
    );
}
