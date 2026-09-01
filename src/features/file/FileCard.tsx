import { useState } from 'react';
import { formatBytes } from '../editor/mediaTypes';
import { FileArt } from './FileArt';
import styles from './FileCard.module.css';

export interface FileCardProps {
    name?: string;
    mime?: string;
    size?: number;
    /** A rendered picture of the first page, once one exists. */
    poster?: string;
    /** Opens the file into its expanded view. */
    onOpen?: () => void;
    onRename?: (name: string) => void;
    readOnly?: boolean;
    /** Edge of the artwork. The node is 120px; 92 leaves room for the label. */
    artSize?: number;
}

/**
 * The closed state of a file: the artwork, its name, its weight.
 *
 * Deliberately the same shape as the folder card — art above, an editable label
 * below, no card chrome behind it — because a file and a folder are the same
 * kind of object to someone scanning a board, and they should scan alike.
 * Double-click opens it, the same gesture that opens a picture into its
 * lightbox everywhere else in the editor.
 */
export function FileCard({
    name,
    mime,
    size,
    poster,
    onOpen,
    onRename,
    readOnly,
    artSize = 92,
}: FileCardProps) {
    const label = name || 'File';
    /* Null means "not being edited", and the field shows the stored name. That
       is what keeps a rename made elsewhere — in the peek header, or by an undo
       — visible here without an effect syncing two copies of the same string. */
    const [draft, setDraft] = useState<string | null>(null);

    const commit = () => {
        const next = draft?.trim();
        setDraft(null);
        if (next && next !== label) onRename?.(next);
    };

    return (
        <div
            className={styles.card}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onOpen?.();
            }}
        >
            <FileArt name={label} mime={mime} poster={poster} size={artSize} />

            <input
                className={`${styles.label} nodrag`}
                value={draft ?? label}
                readOnly={readOnly}
                title={label}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setDraft(label)}
                onBlur={commit}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                        setDraft(null);
                        e.currentTarget.blur();
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    e.currentTarget.select();
                }}
            />

            {typeof size === 'number' && <span className={styles.size}>{formatBytes(size)}</span>}
        </div>
    );
}
