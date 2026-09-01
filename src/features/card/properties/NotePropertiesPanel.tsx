
import type { NoteData } from '../../../types';
import { StatusProperty } from './StatusProperty';
import { DateProperty } from './DateProperty';
import { UrlProperty } from './UrlProperty';
import { PriorityProperty } from './PriorityProperty';
import { AssigneeProperty } from './AssigneeProperty';
import { ProgressProperty } from './ProgressProperty';
import { TaskList } from '../tasks/TaskList';
import { cardTasks } from '../cardTasks';
import { AddPropertyMenu, getPropertyIcon } from './AddPropertyMenu';
import styles from './Properties.module.css';

interface NotePropertiesPanelProps {
    data: NoteData;
    onUpdate: (data: Partial<NoteData>) => void;
}

export function NotePropertiesPanel({ data, onUpdate }: NotePropertiesPanelProps) {
    // Define all possible properties definition
    // "key" must match fields in NoteData
    const allProperties = [
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'progress', label: 'Progress' },
        { key: 'tasks', label: 'Tasks' },
        { key: 'url', label: 'URL' },
    ] as const;

    // A property is visible if it has a value OR if we want to default-show it.
    // Ideally we track specific "visibility" in a separate state if users want to show empty fields.
    // For now, let's say: show if value exists.

    // To support "Add Property" -> "Show Empty Field", we'd need local state for "forceVisible".
    // But since `onUpdate` persists to `data`, we can just ensure that if we "add" a property,
    // we set it to a default non-null value (or empty string) so it persists.

    const isVisible = (key: string) => {
        /* Tasks are the one property that can exist without its own field being
           set: a checklist typed into the body IS a task list, and hiding the
           section until someone happened to add a metadata task would leave the
           panel disagreeing with the card. */
        if (key === 'tasks') return cardTasks(data).length > 0 || Array.isArray(data.tasks);
        const val = data[key as keyof NoteData];
        return val !== undefined && val !== null;
    };

    const handleAdd = (key: string) => {
        // Initialize with default value to make it visible
        let defaultVal: string | number | string[] = '';
        if (key === 'status') defaultVal = 'todo';
        if (key === 'priority') defaultVal = 'medium';
        if (key === 'progress') defaultVal = 0;
        if (key === 'tasks') defaultVal = [];

        onUpdate({ [key]: defaultVal } as Partial<NoteData>);
    };

    const handleHide = (key: string) => {
        // Setting to undefined hides it
        onUpdate({ [key]: undefined });
    };

    const handleChange = (key: string, val: unknown) => {
        onUpdate({ [key]: val } as Partial<NoteData>);
    };

    // Calculate available (hidden) properties for the menu
    const availableToAdd = allProperties
        .filter(p => !isVisible(p.key))
        .map(p => ({ ...p, icon: getPropertyIcon(p.key) }));

    return (
        <div className={styles.container} style={{ display: 'flex', flexDirection: 'column', padding: '0 24px 12px' }}>
            {/* Render Visible Properties */}

            {isVisible('status') && (
                <StatusProperty
                    value={data.status}
                    onChange={(v) => handleChange('status', v)}
                    onHide={() => handleHide('status')}
                />
            )}

            {isVisible('priority') && (
                <PriorityProperty
                    value={data.priority}
                    onChange={(v) => handleChange('priority', v)}
                    onHide={() => handleHide('priority')}
                />
            )}

            {/* Start then due, in the order the pair reads — and both, so an
                event on the hour grid can be given its two ends from here. */}
            {isVisible('startDate') && (
                <DateProperty
                    label="Start Date"
                    value={data.startDate}
                    onChange={(v) => handleChange('startDate', v)}
                    onHide={() => handleHide('startDate')}
                />
            )}

            {isVisible('dueDate') && (
                <DateProperty
                    value={data.dueDate}
                    onChange={(v) => handleChange('dueDate', v)}
                    onHide={() => handleHide('dueDate')}
                />
            )}

            {isVisible('assignee') && (
                <AssigneeProperty
                    value={data.assignee}
                    onChange={(v) => handleChange('assignee', v)}
                    onHide={() => handleHide('assignee')}
                />
            )}

            {isVisible('progress') && (
                <ProgressProperty
                    value={data.progress}
                    onChange={(v) => handleChange('progress', v)}
                    onHide={() => handleHide('progress')}
                />
            )}

            {/* The same list the metadata panel and the task modal show, so a
                checklist typed into the body appears here too and the three
                surfaces cannot disagree about what a task is. */}
            {isVisible('tasks') && (
                <TaskList data={data} onPatch={onUpdate} dense />
            )}

            {isVisible('url') && (
                <UrlProperty
                    value={data.url}
                    onChange={(v) => handleChange('url', v)}
                    onHide={() => handleHide('url')}
                />
            )}

            {/* Add Button */}
            <AddPropertyMenu
                availableProperties={availableToAdd}
                onAdd={handleAdd}
            />
        </div>
    );
}

