/**
 * The metadata controls a card grows when it is selected.
 *
 * Everything here already exists elsewhere in the app — the same select, date
 * picker and chip input the properties panel uses. Reusing them is the point: a
 * board is another place to edit a card, not another way to edit one, so
 * priority means the same control here as it does in the panel.
 *
 * It only appears on the selected card. A board with these strips open on every
 * card would be a form, and the reason to look at a board is to see the work
 * rather than its fields.
 */

import { memo } from 'react';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { ChipInput } from '../ui/ChipInput';
import type { NoteData } from '../../types';
import styles from './KanbanCard.module.css';

const PRIORITY_OPTIONS = [
    { label: 'None', value: '' },
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
    { label: 'Urgent', value: 'urgent' },
];

export interface KanbanCardMetaEditorProps {
    data: NoteData;
    onChange: (patch: Partial<NoteData>) => void;
}

export const KanbanCardMetaEditor = memo(({ data, onChange }: KanbanCardMetaEditorProps) => (
    /* `nodrag` and a swallowed pointerdown: this sits inside a card that is a
       drag surface and inside a board that is another one, and a select you
       cannot open because it starts a drag is not a select. */
    <div
        className={`${styles.metaEditor} nodrag nopan`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
    >
        <div className={styles.metaEditorRow}>
            <label className={styles.metaEditorField}>
                <span className={styles.metaEditorLabel}>Priority</span>
                <CustomSelect
                    value={data.priority ?? ''}
                    options={PRIORITY_OPTIONS}
                    placeholder="None"
                    onChange={(v) => onChange({ priority: (v || undefined) as NoteData['priority'] })}
                />
            </label>

            <label className={styles.metaEditorField}>
                <span className={styles.metaEditorLabel}>Due</span>
                <CustomDatePicker
                    value={data.dueDate ?? ''}
                    placeholder="No date"
                    onChange={(v) => onChange({ dueDate: v || undefined })}
                />
            </label>
        </div>

        <label className={styles.metaEditorField}>
            <span className={styles.metaEditorLabel}>Tags</span>
            <ChipInput
                value={data.tags ?? []}
                placeholder="Add tag…"
                onChange={(tags) => onChange({ tags })}
            />
        </label>
    </div>
));

KanbanCardMetaEditor.displayName = 'KanbanCardMetaEditor';
