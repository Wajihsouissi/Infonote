/**
 * One task, opened.
 *
 * Everything a checklist line cannot hold: a description, a start and a due
 * date, a picture, and subtasks of its own. Where each of those is actually
 * stored is cardTasks.ts's problem — a due date goes onto the body block that
 * already had a field for it, the rest onto the overlay entry — and this view
 * only ever calls `setTaskDetails`.
 *
 * Dates go through CustomDatePicker, the same control the card's own metadata
 * uses, so a task date and a card date are set the same way and stored in the
 * same shape (see src/utils/cardDate.ts).
 *
 * The image is an `asset:` reference like every other upload in the app: bytes
 * live in IndexedDB, never in the document.
 */

import { memo, useCallback, useRef, useState } from 'react';
import { ChevronLeft, ImagePlus, Trash2 } from '../../../components/icons';

import { AssetImage, makeAssetRef, putAsset } from '../../../services/assets';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import type { NoteData } from '../../../types';
import {
    addTask,
    cardTasks,
    removeTask,
    renameTask,
    setTaskDetails,
    toggleTask,
    type CardTask,
} from '../cardTasks';
import styles from './CardTasks.module.css';

export interface TaskDetailProps {
    data: NoteData;
    /** Applies a patch from cardTasks — see the note on TaskListProps. */
    onPatch: (patch: Partial<NoteData>) => void;
    taskId: string;
    onBack: () => void;
}

export const TaskDetail = memo(({ data, onPatch, taskId, onBack }: TaskDetailProps) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [subDraft, setSubDraft] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);

    const tasks = cardTasks(data);
    const task = tasks.find((t) => t.id === taskId);

    const apply = useCallback((patch: Partial<NoteData>) => {
        if (Object.keys(patch).length === 0) return;
        onPatch(patch);
    }, [onPatch]);

    /* Subtasks of THIS task, which is not the same as "the rows under it": a
       task's own subtasks are the ones whose parent it is, and reading them
       from the flattened list means depth, not adjacency. */
    const children = task
        ? (() => {
            const at = tasks.findIndex((t) => t.id === taskId);
            const out: CardTask[] = [];
            for (let i = at + 1; i < tasks.length; i++) {
                if (tasks[i].depth <= task.depth) break;
                out.push(tasks[i]);
            }
            return out;
        })()
        : [];

    const handleImage = useCallback(async (file: File) => {
        setUploadError(null);
        try {
            const record = await putAsset(file);
            apply(setTaskDetails(data, taskId, { image: makeAssetRef(record.id) }));
        } catch {
            setUploadError('That image could not be stored on this device.');
        }
    }, [apply, data, taskId]);

    if (!task) {
        return (
            <div className={styles.detail}>
                <p className={styles.taskEmpty}>That task is gone.</p>
                <button type="button" className={styles.backBtn} onClick={onBack}>
                    <ChevronLeft size={14} /> Back to tasks
                </button>
            </div>
        );
    }

    return (
        <div className={styles.detail}>
            <header className={styles.detailHead}>
                <button
                    type="button"
                    className={`${styles.backBtn} nodrag`}
                    onClick={onBack}
                    aria-label="Back to the task list"
                >
                    <ChevronLeft size={14} />
                    Tasks
                </button>

                {task.blockId && (
                    <span className={styles.detailOrigin} title="This task is a checklist line in the note body">
                        In the note
                    </span>
                )}
            </header>

            <div className={styles.detailTitleRow}>
                <button
                    type="button"
                    className={`${styles.taskBox} ${styles.detailBox} nodrag`}
                    role="checkbox"
                    aria-checked={task.completed}
                    aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
                    data-done={task.completed || undefined}
                    onClick={() => apply(toggleTask(data, task.id))}
                />
                <input
                    className={`${styles.detailTitle} nodrag nopan`}
                    defaultValue={task.text}
                    key={task.id}
                    placeholder="Untitled task"
                    aria-label="Task title"
                    onBlur={(e) => apply(renameTask(data, task.id, e.target.value.trim()))}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                />
            </div>

            <div className={styles.detailGrid}>
                <label className={styles.detailField}>
                    <span className={styles.detailLabel}>Start</span>
                    <CustomDatePicker
                        value={task.startDate ?? ''}
                        placeholder="No start date"
                        withTime
                        onChange={(v) => apply(setTaskDetails(data, task.id, { startDate: v || undefined }))}
                    />
                </label>

                <label className={styles.detailField}>
                    <span className={styles.detailLabel}>Due</span>
                    <CustomDatePicker
                        value={task.dueDate ?? ''}
                        placeholder="No due date"
                        withTime
                        onChange={(v) => apply(setTaskDetails(data, task.id, { dueDate: v || undefined }))}
                    />
                </label>
            </div>

            <label className={styles.detailField}>
                <span className={styles.detailLabel}>Description</span>
                <textarea
                    className={`${styles.detailNote} nodrag nopan`}
                    defaultValue={task.description ?? ''}
                    key={`${task.id}-desc`}
                    rows={3}
                    placeholder="What does done look like?"
                    onBlur={(e) => apply(setTaskDetails(data, task.id, { description: e.target.value.trim() || undefined }))}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                />
            </label>

            <div className={styles.detailField}>
                <span className={styles.detailLabel}>Image</span>
                {task.image ? (
                    <div className={styles.detailImage}>
                        <AssetImage src={task.image} alt="" />
                        <button
                            type="button"
                            className={`${styles.imageRemove} nodrag`}
                            title="Remove image"
                            aria-label="Remove image"
                            onClick={() => apply(setTaskDetails(data, task.id, { image: undefined }))}
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className={`${styles.imageDrop} nodrag`}
                        onClick={() => fileRef.current?.click()}
                    >
                        <ImagePlus size={15} />
                        Upload an image
                    </button>
                )}
                {uploadError && <p className={styles.detailError}>{uploadError}</p>}
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleImage(file);
                    }}
                />
            </div>

            <div className={styles.detailField}>
                <span className={styles.detailLabel}>
                    Subtasks
                    {children.length > 0 && (
                        <span className={styles.detailCount}>
                            {children.filter((c) => c.completed).length}/{children.length}
                        </span>
                    )}
                </span>

                {children.length > 0 && (
                    <ul className={styles.taskRows}>
                        {children.map((child) => (
                            <li key={child.id} className={styles.taskRow} data-done={child.completed || undefined}>
                                <button
                                    type="button"
                                    className={`${styles.taskBox} nodrag`}
                                    role="checkbox"
                                    aria-checked={child.completed}
                                    aria-label={child.text || 'Untitled subtask'}
                                    onClick={() => apply(toggleTask(data, child.id))}
                                />
                                <span className={styles.taskText}>{child.text || 'Untitled subtask'}</span>
                                <button
                                    type="button"
                                    className={`${styles.taskAction} ${styles.taskDelete} nodrag`}
                                    title="Delete subtask"
                                    aria-label={`Delete ${child.text || 'subtask'}`}
                                    onClick={() => apply(removeTask(data, child.id))}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className={styles.composer}>
                    <input
                        className={`${styles.composerInput} nodrag nopan`}
                        value={subDraft}
                        placeholder="Add a subtask"
                        aria-label="Add a subtask"
                        onChange={(e) => setSubDraft(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && subDraft.trim()) {
                                const { taskId: _id, ...patch } = addTask(data, subDraft.trim(), task.id);
                                apply(patch);
                                setSubDraft('');
                            }
                        }}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
        </div>
    );
});

TaskDetail.displayName = 'TaskDetail';
