
import type { NoteData } from '../../../types';
import { StatusProperty } from './StatusProperty';
import { DateProperty } from './DateProperty';
import { UrlProperty } from './UrlProperty';
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
        { key: 'dueDate', label: 'Due Date' },
        { key: 'url', label: 'URL' },
        // { key: 'assignee', label: 'Assignee' }, // Future
    ] as const;

    // A property is visible if it has a value OR if we want to default-show it.
    // Ideally we track specific "visibility" in a separate state if users want to show empty fields.
    // For now, let's say: show if value exists.

    // To support "Add Property" -> "Show Empty Field", we'd need local state for "forceVisible".
    // But since `onUpdate` persists to `data`, we can just ensure that if we "add" a property,
    // we set it to a default non-null value (or empty string) so it persists.

    const isVisible = (key: string) => {
        const val = data[key as keyof NoteData];
        return val !== undefined && val !== null;
    };

    const handleAdd = (key: string) => {
        // Initialize with default value to make it visible
        let defaultVal: any = '';
        if (key === 'status') defaultVal = 'todo';

        onUpdate({ [key]: defaultVal });
    };

    const handleHide = (key: string) => {
        // Setting to undefined hides it
        onUpdate({ [key]: undefined });
    };

    const handleChange = (key: string, val: any) => {
        onUpdate({ [key]: val });
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

            {isVisible('dueDate') && (
                <DateProperty
                    value={data.dueDate}
                    onChange={(v) => handleChange('dueDate', v)}
                    onHide={() => handleHide('dueDate')}
                />
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
