import { useState } from 'react';
import { Download, ExternalLink, X } from '../../components/icons';
import { CardIcon } from '../card/iconMap';
import { formatBytes } from '../editor/mediaTypes';
import { useAssetUrl } from '../../services/assets';
import { describeFile } from './fileKinds';
import { FileArt } from './FileArt';
import { FileRenderer } from './fileRenderers';
import styles from './FileViewer.module.css';

export interface FileViewerProps {
    /** `asset:<id>` reference, or any URL for legacy documents. */
    content: string;
    name?: string;
    mime?: string;
    size?: number;
    /**
     * `node` is the open card on the canvas: tighter header, sits inside the
     * node's own surface. `peek` is the center/side/fullscreen pane, which owns
     * the whole area and gets the fuller chrome.
     */
    variant?: 'node' | 'peek';
    onClose?: () => void;
    /** Rename the file. Absent makes the title read-only. */
    onRename?: (name: string) => void;
    /** A rendered picture of page one, shown in place of the document while
     *  the viewer is not live. */
    poster?: string;
    /**
     * Whether to mount the real renderer.
     *
     * The canvas passes the same eligibility a block editor mounts on, so a
     * board full of open documents costs nothing during a pan. Everything else
     * — the peeks, fullscreen — is always live.
     */
    live?: boolean;
}

/**
 * The open state of a file — the live document, not a picture of one.
 *
 * One component serves the canvas node and all three peeks so a file looks and
 * behaves identically wherever it is opened; only the density of the chrome
 * changes. Which renderer runs is entirely `fileRenderers`' business.
 */
export function FileViewer({
    content,
    name,
    mime,
    size,
    variant = 'node',
    onClose,
    onRename,
    poster,
    live = true,
}: FileViewerProps) {
    const { url, status } = useAssetUrl(content);
    const label = name || 'File';
    const { kind, icon, hue, label: kindLabel } = describeFile(mime, label);

    /* Null means "not being edited", so a rename made anywhere else shows here
       without an effect keeping two copies of the same string in step. */
    const [draft, setDraft] = useState<string | null>(null);
    const commitRename = () => {
        const next = draft?.trim();
        setDraft(null);
        if (next && next !== label) onRename?.(next);
    };

    const meta = [kindLabel, typeof size === 'number' ? formatBytes(size) : null]
        .filter(Boolean)
        .join(' · ');

    const isPeek = variant === 'peek';

    return (
        <div
            className={`${styles.viewer} ${isPeek ? styles.peek : styles.node}`}
        >
            <header className={styles.header}>
                {/* The one piece of the header that carries the kind's colour.
                    Everything else — the spine, the buttons — stays neutral. */}
                <span className={styles.glyph} style={{ ['--file-kind' as string]: `var(${hue})` }}>
                    <CardIcon icon={icon} size={isPeek ? 20 : 18} style={{ color: 'inherit' }} />
                </span>

                <span className={styles.titleGroup}>
                    {/* A file could be renamed on its card but not once it was
                        open, which is backwards: the peek is where you are
                        actually looking at the thing and noticing its name is
                        wrong. Rendered as an input either way so the row does
                        not reflow by a pixel when it gains focus. */}
                    <input
                        className={styles.title}
                        value={draft ?? label}
                        readOnly={!onRename}
                        title={label}
                        aria-label="File name"
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={() => onRename && setDraft(label)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') {
                                setDraft(null);
                                e.currentTarget.blur();
                            }
                        }}
                    />
                    {meta && <span className={styles.meta}>{meta}</span>}
                </span>

                <span className={styles.actions}>
                    {url && (
                        <>
                            <a
                                className={`${styles.actionBtn} icon-hover nodrag`}
                                href={url}
                                download={label}
                                title="Download"
                                aria-label={`Download ${label}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Download size={16} />
                            </a>
                            <a
                                className={`${styles.actionBtn} icon-hover nodrag`}
                                href={url}
                                target="_blank"
                                rel="noreferrer noopener"
                                title="Open in a new tab"
                                aria-label={`Open ${label} in a new tab`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ExternalLink size={16} />
                            </a>
                        </>
                    )}
                    {onClose && (
                        <button
                            className={`${styles.actionBtn} icon-hover nodrag`}
                            onClick={onClose}
                            title={isPeek ? 'Close' : 'Close the file'}
                            aria-label={isPeek ? 'Close' : 'Close the file'}
                            type="button"
                        >
                            <X size={16} />
                        </button>
                    )}
                </span>
            </header>

            <div className={styles.body}>
                {!live ? (
                    /* Standing in for the document while the canvas is moving.
                       Same box, same header above it — only the expensive part
                       is missing, so coming back to life costs no layout. */
                    <div className={styles.resting}>
                        <FileArt name={label} mime={mime} poster={poster} size={128} />
                    </div>
                ) : status === 'loading' ? (
                    <div className={styles.pending} aria-label="Loading file" />
                ) : status === 'missing' ? (
                    <div className={styles.missing}>
                        <FileArt name={label} mime={mime} size={88} />
                        <p className={styles.missingTitle}>This file is not on this device.</p>
                        <p className={styles.missingText}>
                            It was added somewhere else and has not been downloaded here yet.
                        </p>
                    </div>
                ) : url ? (
                    <FileRenderer url={url} name={label} mime={mime} kind={kind} compact={!isPeek} />
                ) : null}
            </div>
        </div>
    );
}
