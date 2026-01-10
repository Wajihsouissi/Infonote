import { useEffect } from 'react';
import { Undo, Redo } from 'lucide-react';
import { useStore as useZustandStore } from 'zustand';
import { useStore } from '../../store/useStore';
import styles from './HistoryControls.module.css';

export function HistoryControls() {
    const { pastStates, futureStates, undo, redo } = useZustandStore(useStore.temporal);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    useStore.temporal.getState().redo();
                } else {
                    e.preventDefault();
                    useStore.temporal.getState().undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                useStore.temporal.getState().redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const canUndo = pastStates.length > 0;
    const canRedo = futureStates.length > 0;

    return (
        <div className={styles.historyControls}>
            <button
                className={styles.historyBtn}
                onClick={() => undo()}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
            >
                <Undo size={18} />
            </button>
            <button
                className={styles.historyBtn}
                onClick={() => redo()}
                disabled={!canRedo}
                title="Redo (Ctrl+Y/Shift+Ctrl+Z)"
            >
                <Redo size={18} />
            </button>
        </div>
    );
}
