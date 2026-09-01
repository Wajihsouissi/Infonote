/**
 * A card's tasks, as a list you can work.
 *
 * Shared by the metadata panel and the task modal so the two cannot drift into
 * showing the same card differently. Everything it does goes through
 * cardTasks.ts — it never reaches into `content` or `tasks` itself, so where a
 * task lives (a body block, or an entry of its own) stays that module's
 * business and not this one's.
 *
 * Subtasks are indented by their depth, which comes from the body's own indent
 * for a written checklist and from the parent link for one added here.
 */

import { memo, useCallback, useState } from 'react';
import { ChevronRight, CornerDownRight, Plus, Trash2 } from '../../../components/icons';

import type { NoteData } from '../../../types';
import {
    MAX_TASK_DEPTH,
    addTask,
    cardTasks,
    removeTask,
    renameTask,
    syncTaskToBody,
    toggleTask,
    type CardTask,
} from '../cardTasks';
import styles from './CardTasks.module.css';

export interface TaskListProps {
    data: NoteData;
    /**
     * Applies a patch from cardTasks.
     *
     * Taken as a prop rather than read from the store so this works on all
     * three surfaces that show tasks — the metadata panel, the properties
     * panel and the modal — two of which hand their card down as plain data
     * with no node id in sight.
     */
    onPatch: (patch: Partial<NoteData>) => void;
    /** Opens a task's own detail view. Omitted where there is nowhere to go. */
    onOpenTask?: (taskId: string) => void;
    /** Adds the composer row at the foot of the list. */
    allowAdd?: boolean;
    /** A compact variant for the metadata panel's narrower column. */
    dense?: boolean;
}

export const TaskList = memo(({ data, onPatch, onOpenTask, allowAdd = true, dense }: TaskListProps) => {
    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const tasks = cardTasks(data);

    /* An empty patch is dropped rather than written — `updateNodeData` stamps
       `updatedAt` and marks the document cloud-dirty whatever it is handed. */
    const apply = useCallback((patch: Partial<NoteData>) => {
        if (Object.keys(patch).length === 0) return;
        onPatch(patch);
    }, [onPatch]);

    const commitDraft = useCallback((parentId?: string) => {
        const text = draft.trim();
        if (!text) return;
        const { taskId: _taskId, ...patch } = addTask(data, text, parentId);
        apply(patch);
        setDraft('');
    }, [draft, data, apply]);

    const renderTask = (task: CardTask) => {
        const indent = Math.min(task.depth, MAX_TASK_DEPTH);
        const isEditing = editingId === task.id;

        return (
            <li
                key={task.id}
                className={styles.taskRow}
                style={{ ['--task-depth' as string]: indent }}
                data-done={task.completed || undefined}
                data-sub={task.depth > 0 || undefined}
            >
                <button
                    type="button"
                    className={`${styles.taskBox} nodrag`}
                    role="checkbox"
                    aria-checked={task.completed}
                    aria-label={task.text || 'Untitled task'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        apply(toggleTask(data, task.id));
                    }}
                />

                {isEditing ? (
                    <input
                        className={`${styles.taskEdit} nodrag nopan`}
                        defaultValue={task.text}
                        autoFocus
                        aria-label="Task text"
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                            apply(renameTask(data, task.id, e.target.value.trim()));
                            setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { setEditingId(null); }
                        }}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                ) : (
                    <button
                        type="button"
                        className={`${styles.taskText} nodrag`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenTask) onOpenTask(task.id);
                            else setEditingId(task.id);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingId(task.id);
                        }}
                    >
                        {task.text || <span className={styles.taskUntitled}>Untitled task</span>}
                    </button>
                )}

                {/* What a task carries beyond its text, said in one line so the
                    row stays a row. The detail view is where these are set. */}
                <span className={styles.taskMarks}>
                    {task.description && <span className={styles.taskMark} title="Has a description">¶</span>}
                    {task.image && <span className={styles.taskMark} title="Has an image">▣</span>}
                    {(task.dueDate || task.startDate) && (
                        <span className={styles.taskMark} title="Has dates">◷</span>
                    )}
                </span>

                {/* A task that lives only in the metadata can be written into
                    the body on request — see cardTasks.syncTaskToBody. */}
                {!task.blockId && (
                    <button
                        type="button"
                        className={`${styles.taskAction} nodrag`}
                        title="Add this task to the note body"
                        aria-label={`Add ${task.text || 'task'} to the note body`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            apply(syncTaskToBody(data, task.id));
                        }}
                    >
                        <CornerDownRight size={12} />
                    </button>
                )}

                {onOpenTask && (
                    <button
                        type="button"
                        className={`${styles.taskAction} nodrag`}
                        title="Open task"
                        aria-label={`Open ${task.text || 'task'}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenTask(task.id);
                        }}
                    >
                        <ChevronRight size={13} />
                    </button>
                )}

                <button
                    type="button"
                    className={`${styles.taskAction} ${styles.taskDelete} nodrag`}
                    title={task.blockId ? 'Delete task and its line in the body' : 'Delete task'}
                    aria-label={`Delete ${task.text || 'task'}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        apply(removeTask(data, task.id));
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </li>
        );
    };

    return (
        <div className={styles.taskList} data-dense={dense || undefined}>
            {tasks.length > 0 && <ul className={styles.taskRows}>{tasks.map(renderTask)}</ul>}

            {tasks.length === 0 && (
                <p className={styles.taskEmpty}>
                    No tasks yet. Type a checklist in the note, or add one here.
                </p>
            )}

            {allowAdd && (
                <div className={styles.composer}>
                    <Plus size={13} className={styles.composerIcon} />
                    <input
                        className={`${styles.composerInput} nodrag nopan`}
                        value={draft}
                        placeholder="Add a task"
                        aria-label="Add a task"
                        onChange={(e) => setDraft(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitDraft();
                            if (e.key === 'Escape') setDraft('');
                        }}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
});

TaskList.displayName = 'TaskList';
