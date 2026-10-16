import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Upload, X } from '../../components/icons';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { ingestFiles } from '../../services/assets';
import styles from './CoverPicker.module.css';

type CoverTab = 'upload' | 'link';

const TABS: TabItem<CoverTab>[] = [
    { id: 'upload', label: 'Upload', icon: <Upload size={14} /> },
    { id: 'link', label: 'Link', icon: <Link size={14} /> },
];

interface CoverPickerProps {
    currentCover?: string;
    /** An `asset:` reference for an upload, a URL for a link, '' to remove. */
    onSelect: (cover: string) => void;
    onClose: () => void;
}

/**
 * Choosing a card's cover: a picture from this machine, or one on the web.
 *
 * An upload goes into the browser's asset store and the card keeps a reference
 * to it — the same as every other file in the app. Putting the bytes in the
 * card itself would carry a megabyte of base64 through every save, every undo
 * step and every copy of that card.
 */
export function CoverPicker({ currentCover, onSelect, onClose }: CoverPickerProps) {
    const [tab, setTab] = useState<CoverTab>('upload');
    const [url, setUrl] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const takeFile = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('That file is not an image.');
            return;
        }
        setError(null);
        const { files, errors } = await ingestFiles([file]);
        if (files[0]) {
            onSelect(files[0].ref);
            onClose();
            return;
        }
        setError(errors[0] ?? 'That image could not be stored.');
    };

    const takeUrl = () => {
        const trimmed = url.trim();
        if (!trimmed) return;
        onSelect(trimmed);
        onClose();
    };

    return createPortal(
        <div
            className={styles.overlay}
            /* Portalled to body, so its backdrop interaction has to stay local:
               without this a peek behind it reads a successful pick as a
               request to close the whole peek. */
            data-cover-picker
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >
            <div
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Card cover"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h3 className={styles.title}>Cover</h3>
                    <button type="button" className={`${styles.closeBtn} icon-hover`} onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                <Tabs items={TABS} value={tab} onChange={setTab} aria-label="Cover source" fullWidth />

                {tab === 'upload' ? (
                    <div
                        className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            void takeFile(e.dataTransfer.files?.[0]);
                        }}
                        onClick={() => fileInput.current?.click()}
                    >
                        <Upload size={26} />
                        <span className={styles.dropTitle}>Drop a picture here</span>
                        <span className={styles.dropHint}>or click to choose one</span>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => void takeFile(e.target.files?.[0])}
                        />
                    </div>
                ) : (
                    <div className={styles.linkRow}>
                        <input
                            className={styles.linkInput}
                            type="url"
                            value={url}
                            autoFocus
                            placeholder="Paste an image address…"
                            aria-label="Image address"
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && takeUrl()}
                        />
                        <button type="button" className={styles.applyBtn} onClick={takeUrl} disabled={!url.trim()}>
                            Use it
                        </button>
                    </div>
                )}

                {error && <p className={styles.error} role="alert">{error}</p>}

                {currentCover && (
                    <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => {
                            onSelect('');
                            onClose();
                        }}
                    >
                        Remove cover
                    </button>
                )}
            </div>
        </div>,
        document.body,
    );
}
