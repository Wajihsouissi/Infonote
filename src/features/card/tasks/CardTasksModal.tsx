/**
 * A card's task list, opened from wherever the card is showing.
 *
 * One modal with two views rather than two stacked modals: the list, and one
 * task opened. Stacking dialogs means two backdrops, two Escape handlers and a
 * focus trap inside a focus trap, all to express "deeper in the same thing" —
 * which a back button says perfectly well.
 *
 * It is driven by `tasksCardId` on the store, so a board card and a calendar
 * chip open it the same way without either of them owning it, and it is
 * mounted once by the canvas. That id is deliberately independent of the other
 * panel ids (see store/types.ts): this opens over a board, and closing it
 * should put you back on that board.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

import { useStore } from '../../../store/useStore';
import { getNodeById } from '../../../store/nodeIndex';
import { X } from '../../../components/icons';
import { taskProgress } from '../cardTasks';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import styles from './CardTasks.module.css';

export function CardTasksModal() {
    const tasksCardId = useStore((s) => s.tasksCardId);
    const setTasksCardId = useStore((s) => s.setTasksCardId);
    const node = useStore((s) => getNodeById(s.nodes, tasksCardId ?? undefined));
    const updateNodeData = useStore((s) => s.updateNodeData);
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);

    const close = useCallback(() => {
        setOpenTaskId(null);
        setTasksCardId(null);
    }, [setTasksCardId]);

    /* Escape steps back out of a task before it closes the modal — one level
       per press, which is what the back button does too. */
    useEffect(() => {
        if (!tasksCardId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (openTaskId) setOpenTaskId(null);
            else close();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [tasksCardId, openTaskId, close]);

    /* A card deleted while its tasks are open simply stops rendering — the
       guard below is the whole fix. An effect that cleared `tasksCardId` here
       would be a setState during render's commit for no gain: the stale id
       shows nothing and is replaced by the next open. */
    const isNote = node?.type === 'note';
    const progress = isNote ? taskProgress(node.data) : null;

    return createPortal(
        <AnimatePresence>
            {tasksCardId && isNote && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={close}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.18 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Tasks for ${node.data.label || 'this card'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className={styles.modalHead}>
                            <div className={styles.modalTitles}>
                                <h2 className={styles.modalTitle}>{node.data.label?.trim() || 'Untitled'}</h2>
                                {progress && progress.total > 0 && (
                                    <span className={styles.modalCount}>
                                        {progress.done} of {progress.total} done
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                className={`${styles.closeBtn} nodrag`}
                                onClick={close}
                                aria-label="Close tasks"
                            >
                                <X size={15} />
                            </button>
                        </header>

                        <div className={styles.modalBody}>
                            {openTaskId ? (
                                <TaskDetail
                                    data={node.data}
                                    onPatch={(patch) => updateNodeData(node.id, patch as Record<string, unknown>)}
                                    taskId={openTaskId}
                                    onBack={() => setOpenTaskId(null)}
                                />
                            ) : (
                                <TaskList
                                    data={node.data}
                                    onPatch={(patch) => updateNodeData(node.id, patch as Record<string, unknown>)}
                                    onOpenTask={setOpenTaskId}
                                />
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
