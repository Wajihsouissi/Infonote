/**
 * fileRenderers
 * --------------------------------------------------------------------------
 * How each kind of file gets drawn.
 *
 * The rule is native first. Chrome, Edge, Firefox and Safari all ship a PDF
 * viewer with scrolling, zoom, text selection, search and print already in it;
 * pointing an iframe at a blob URL gets all of that for nothing, which is why
 * the 462 kB react-pdf chunk this replaces was never a good trade. Images,
 * video, audio and HTML are the same story.
 *
 * Only the office formats need code, and that code is fetched the first time
 * someone opens one of them — never before.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink } from '../../components/icons';
import { CardIcon } from '../card/iconMap';
import { FileArt } from './FileArt';
import { parseDelimited } from './delimited';
import { describeFile, type FileKind } from './fileKinds';
import styles from './fileRenderers.module.css';

export interface FileRenderProps {
    /** Blob (or remote) URL for the bytes. */
    url: string;
    name: string;
    mime?: string;
    kind: FileKind;
    /** Rendering on the canvas rather than in a peek — used to keep chrome
     *  proportionate inside a small node. */
    compact?: boolean;
}

/* -------------------------------------------------------------------------
   Native
   ------------------------------------------------------------------------- */

/**
 * The browser's own PDF viewer.
 *
 * Its chrome scales with the surface, because the right amount of furniture is
 * not the same in both places. On a canvas node the browser's toolbar is a 40px
 * grey band across a 432px card — it eats the page it is meant to serve, and it
 * drags a second visual language onto the board. There it is hidden and the
 * card's own header carries the actions. In a peek the file has the whole
 * screen and the reader is actually reading: search, print, page navigation and
 * zoom all earn their space, so the native toolbar stays.
 *
 * `view=FitH` opens on the page fitted to the width it has been given rather
 * than at 100%, which on a narrow node would otherwise land mid-margin.
 *
 * Deliberately not sandboxed: the bytes come from a same-origin blob URL we
 * minted ourselves, and a `sandbox` attribute stops the built-in viewer
 * loading at all in Chromium.
 */
const PdfRenderer = ({ url, name, compact }: FileRenderProps) => (
    <iframe
        src={`${url}#toolbar=${compact ? '0' : '1'}&navpanes=0&view=FitH`}
        title={name}
        className={styles.frame}
    />
);

/** Images, SVG included. An SVG in an `img` cannot run its own scripts, which
 *  is the entire reason it is drawn this way and not in a frame. */
const ImageRenderer = ({ url, name }: FileRenderProps) => (
    <div className={styles.centered}>
        <img src={url} alt={name} className={styles.image} />
    </div>
);

const VideoRenderer = ({ url }: FileRenderProps) => (
    <div className={styles.centered}>
        <video src={url} controls className={styles.video} />
    </div>
);

const AudioRenderer = ({ url, name, mime }: FileRenderProps) => {
    const { icon, hue } = describeFile(mime, name);
    return (
        <div className={styles.audio} style={{ ['--file-kind' as string]: `var(${hue})` }}>
            <span className={styles.audioGlyph}>
                <CardIcon icon={icon} size={40} style={{ color: 'inherit' }} />
            </span>
            <audio src={url} controls className={styles.audioPlayer} />
        </div>
    );
};

/**
 * User-supplied HTML, fully sandboxed: no scripts, no forms, no same-origin
 * access, no top-level navigation. An uploaded page is content to look at, not
 * code to run.
 */
const HtmlRenderer = ({ url, name }: FileRenderProps) => (
    <iframe src={url} title={name} sandbox="" className={styles.frame} />
);

/* -------------------------------------------------------------------------
   Text
   ------------------------------------------------------------------------- */

const TEXT_LIMIT = 500_000;

/** Plain text, markdown source, code and delimited data. Read straight off the
 *  blob URL — no parser, no dependency, and it is honest about what the file
 *  actually contains. */
const TextRenderer = ({ url, kind }: FileRenderProps) => {
    /* Result and the URL it came from are stored together, so a change of file
       reads as "not loaded yet" during render instead of needing the effect to
       clear stale text on the way in. */
    const [read, setRead] = useState<{ url: string; text: string | null } | null>(null);

    useEffect(() => {
        let live = true;
        fetch(url)
            .then((r) => r.text())
            .then((body) => {
                if (!live) return;
                setRead({
                    url,
                    text:
                        body.length > TEXT_LIMIT
                            ? `${body.slice(0, TEXT_LIMIT)}\n\n… truncated — download the file to read the rest.`
                            : body,
                });
            })
            .catch(() => live && setRead({ url, text: null }));
        return () => {
            live = false;
        };
    }, [url]);

    if (read?.url !== url) return <div className={styles.note}>Reading…</div>;
    if (read.text === null) return <div className={styles.note}>That file could not be read as text.</div>;

    /* A spreadsheet shown as a wall of commas is the viewer contradicting its
       own header. Delimited files get an actual table, built with the app's
       table tokens so it matches a table block. */
    if (kind === 'csv') return <DelimitedTable text={read.text} />;

    return (
        <pre className={kind === 'code' ? styles.code : styles.prose}>
            {read.text}
        </pre>
    );
};

/** Right-align anything that reads as a number, the way a spreadsheet would. */
const isNumeric = (value: string) => value !== '' && !Number.isNaN(Number(value.replace(/[,%$\s]/g, '')));

const DelimitedTable = ({ text }: { text: string }) => {
    const table = useMemo(() => parseDelimited(text), [text]);

    if (!table.header.length) return <div className={styles.note}>That file has no rows.</div>;

    return (
        <div className={styles.sheet}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {/* The row-number gutter is what makes a grid read as a
                            sheet rather than a list of records. */}
                        <th className={styles.gutter} aria-hidden="true" />
                        {table.header.map((cell, i) => (
                            <th key={i} scope="col" className={styles.th}>{cell}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((row, r) => (
                        <tr key={r}>
                            <td className={styles.gutter}>{r + 1}</td>
                            {row.map((cell, c) => (
                                <td key={c} className={isNumeric(cell) ? styles.tdNumeric : styles.td}>{cell}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {table.truncated > 0 && (
                <p className={styles.tableMore}>
                    {table.truncated.toLocaleString()} more rows — download the file to see them all.
                </p>
            )}
        </div>
    );
};

/* -------------------------------------------------------------------------
   Fallback
   ------------------------------------------------------------------------- */

/**
 * Nothing in the browser can draw this one.
 *
 * Written as a real destination rather than an apology: the artwork is the same
 * sheet the closed card shows, so the file still looks like itself, and the
 * action is the thing you actually came to do. Saying "cannot be previewed" and
 * stopping there is what makes a viewer feel broken.
 */
const FallbackRenderer = ({ url, name, mime }: FileRenderProps) => {
    const { label } = describeFile(mime, name);
    return (
        <div className={styles.fallback}>
            <FileArt name={name} mime={mime} size={104} />
            <p className={styles.fallbackTitle}>{label}</p>
            <p className={styles.fallbackText}>
                Nothing in the browser can open this one. It is saved here in full — take it
                to the app it belongs to.
            </p>
            <span className={styles.fallbackActions}>
                <a className={styles.primaryAction} href={url} download={name}>
                    <Download size={15} />
                    Download
                </a>
                <a className={styles.secondaryAction} href={url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink size={14} />
                    Open in a tab
                </a>
            </span>
        </div>
    );
};

/* -------------------------------------------------------------------------
   Registry
   ------------------------------------------------------------------------- */

/**
 * Written as a switch rather than a kind-to-component lookup on purpose: a
 * component picked out of a map at render time is a *new* component identity
 * as far as React is concerned, so every re-render would unmount and remount
 * the viewer — which for a PDF means the browser reloading the document and
 * throwing away the reader's scroll position.
 */
export function FileRenderer(props: FileRenderProps) {
    switch (props.kind) {
        case 'pdf':
            return <PdfRenderer {...props} />;
        case 'image':
            return <ImageRenderer {...props} />;
        case 'video':
            return <VideoRenderer {...props} />;
        case 'audio':
            return <AudioRenderer {...props} />;
        case 'html':
            return <HtmlRenderer {...props} />;
        case 'text':
        case 'markdown':
        case 'code':
        case 'csv':
            return <TextRenderer {...props} />;
        // Office formats get their converters in a later pass; until then they
        // are honestly a download rather than a broken preview.
        default:
            return <FallbackRenderer {...props} />;
    }
}
