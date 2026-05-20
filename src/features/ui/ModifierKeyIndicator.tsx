import { useEffect, useRef, useState } from 'react';
import styles from './ModifierKeyIndicator.module.css';

type Props = {
    showCtrl: boolean;
    showShift: boolean;
    showFocus?: boolean;
    suppress?: boolean;
    top?: number;
    persistOnReleaseMs?: number;
};

export function ModifierKeyIndicator({
    showCtrl,
    showShift,
    showFocus = false,
    suppress = false,
    top = 76,
    persistOnReleaseMs = 900,
}: Props) {
    const isActive = showCtrl || showShift || showFocus;
    const [visible, setVisible] = useState(false);
    const hideTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }

        if (suppress) {
            setVisible(false);
            return;
        }

        if (isActive) {
            setVisible(true);
            return;
        }

        if (visible) {
            hideTimerRef.current = window.setTimeout(() => {
                setVisible(false);
                hideTimerRef.current = null;
            }, persistOnReleaseMs);
        }
    }, [isActive, persistOnReleaseMs, suppress, visible]);

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) {
                window.clearTimeout(hideTimerRef.current);
            }
        };
    }, []);

    if (!visible || suppress) return null;

    return (
        <div className={styles.root} style={{ top }} aria-live="polite">
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
        </div>
    );
}
