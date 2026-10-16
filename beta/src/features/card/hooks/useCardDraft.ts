import { useCallback, useState } from 'react';
import type { NoteData } from '../../../types';

type DraftField = 'label' | 'description';

/**
 * Title and description editing for a card.
 *
 * While a field is being edited it shows a local draft; everywhere else it
 * shows the stored value, so an edit made elsewhere (a side peek, undo) is
 * never overwritten by a stale copy. On commit only a field that actually
 * changed is written — never the whole card.
 */
export function useCardDraft(
    id: string,
    data: Pick<NoteData, DraftField>,
    onUpdate: (id: string, patch: Partial<NoteData>) => void,
) {
    const [draft, setDraft] = useState<Partial<Record<DraftField, string>>>({});

    const valueOf = (field: DraftField): string => draft[field] ?? data[field] ?? '';

    const edit = useCallback((field: DraftField, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
    }, []);

    const commit = useCallback((field: DraftField) => {
        const value = draft[field];
        if (value === undefined) return;
        setDraft(({ [field]: _committed, ...rest }) => rest);
        if (value !== (data[field] ?? '')) onUpdate(id, { [field]: value });
    }, [data, draft, id, onUpdate]);

    return { valueOf, edit, commit };
}
