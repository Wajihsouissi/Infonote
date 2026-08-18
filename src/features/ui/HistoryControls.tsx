import { useEffect } from 'react';
import { Undo, Redo } from '../../components/icons';
import { useStore as useZustandStore } from 'zustand';
import { useStore } from '../../store/useStore';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import styles from './HistoryControls.module.css';

export function HistoryControls() {
    const { pastStates, futureStates, undo, redo } = useZustandStore(useStore.temporal);

    useEffect(() => {
        const isEditingText = (target: EventTarget | null): boolean => {
            const el = target as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return (
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                el.isContentEditable
            );
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            // While typing in a note/field, let the editor's native text undo
            // handle Ctrl+Z — don't hijack it for canvas-level undo.
            if (isEditingText(e.target)) return;

            // `e.key` is uppercase 'Z' when Shift is held, so normalize.
            const key = e.key.toLowerCase();

            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    useStore.temporal.getState().redo();
                } else {
                    useStore.temporal.getState().undo();
                }
            } else if (key === 'y') {
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
                <DuotoneIcon icon={Undo} size={18} />
            </button>
            <button
                className={styles.historyBtn}
                onClick={() => redo()}
                disabled={!canRedo}
                title="Redo (Ctrl+Y/Shift+Ctrl+Z)"
            >
                <DuotoneIcon icon={Redo} size={18} />
            </button>
        </div>
    );
}
