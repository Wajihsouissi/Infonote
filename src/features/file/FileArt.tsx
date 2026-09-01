import { useId } from 'react';
import { CardIcon } from '../card/iconMap';
import { describeFile } from './fileKinds';
import styles from './FileArt.module.css';

/* solar:file-bold-duotone, split so each half of the sheet can carry its own
   content — the same treatment FolderArt gives the folder, so a file card and a
   folder card read as two members of one family rather than two ideas.

   SHEET is the page: the translucent panel, and the only part a poster
   thumbnail is allowed to fill.

   FOLD is the turned corner, drawn solid. It is the one piece of the silhouette
   that says "document" on its own at 24px, so it always stays opaque and always
   carries the kind's hue at full strength. */
const SHEET =
    'M14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V10C2 6.22876 2 4.34315 3.17157 3.17157C4.34315 2 6.23869 2 10.0298 2C10.6358 2 11.1214 2 11.53 2.01666C11.5166 2.09659 11.5095 2.17813 11.5092 2.26057L11.5 5.09497C11.4999 6.19207 11.4998 7.16164 11.6049 7.94316C11.7188 8.79028 11.9803 9.63726 12.6716 10.3285C13.3628 11.0198 14.2098 11.2813 15.0569 11.3952C15.8385 11.5003 16.808 11.5002 17.9051 11.5001L18 11.5001H21.9574C22 12.0344 22 12.6901 22 13.5629V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22Z';

const FOLD =
    'M11.5092 2.2601L11.5 5.0945C11.4999 6.1916 11.4998 7.16117 11.6049 7.94269C11.7188 8.78981 11.9803 9.6368 12.6716 10.3281C13.3629 11.0193 14.2098 11.2808 15.057 11.3947C15.8385 11.4998 16.808 11.4997 17.9051 11.4996L21.9574 11.4996C21.9698 11.6552 21.9786 11.821 21.9848 11.9995H22C22 11.732 22 11.5983 21.9901 11.4408C21.9335 10.5463 21.5617 9.52125 21.0315 8.79853C20.9382 8.6713 20.8743 8.59493 20.7467 8.44218C19.9542 7.49359 18.911 6.31193 18 5.49953C17.1892 4.77645 16.0787 3.98536 15.1101 3.3385C14.2781 2.78275 13.862 2.50487 13.2915 2.29834C13.1403 2.24359 12.9408 2.18311 12.7846 2.14466C12.4006 2.05013 12.0268 2.01725 11.5 2.00586L11.5092 2.2601Z';

/* The sheet's box, measured off SHEET. A poster is drawn about this centre so
   the crop stays framed on the page however the card is scaled. */
const SHEET_X = 2;
const SHEET_Y = 2;
const SHEET_W = 20;
const SHEET_H = 20;

export interface FileArtProps {
    /** Filename — decides the badge and, with the MIME, the kind. */
    name?: string;
    mime?: string;
    /** A rendered picture of the file's first page, when one has been made. */
    poster?: string;
    /** Edge of the square the sheet is drawn into. */
    size?: number;
}

/**
 * The closed state of a file: a sheet of paper with its corner turned, tinted
 * by what kind of file it is, wearing its extension on a tab.
 *
 * Where FolderArt reads a cover photo into the folder's exposed band, this
 * reads a page poster into the sheet. With neither, it is just a document —
 * which is the honest thing for a spreadsheet or a zip to look like.
 */
export function FileArt({ name, mime, poster, size = 92 }: FileArtProps) {
    /* Scoped per instance: a document-wide id would have every file on the
       canvas clip to whichever card mounted first. */
    const uid = useId();
    const clipId = `${uid}-clip`;
    const vignetteId = `${uid}-vignette`;

    const { icon, hue, badge, label } = describeFile(mime, name);

    return (
        <div
            className={styles.art}
            /* The kind's colour, offered rather than imposed: the stylesheet
               reads `--file-ink` first, so a recoloured node still wins. */
            style={{ width: size, height: size, ['--file-kind' as string]: `var(${hue})` }}
            data-has-poster={poster ? '' : undefined}
            role="img"
            aria-label={label}
        >
            <svg viewBox="0 0 24 24" className={styles.svg} aria-hidden="true">
                <defs>
                    {poster && (
                        <>
                            <clipPath id={clipId}>
                                <path d={SHEET} />
                            </clipPath>

                            {/* Sized over the poster's own box so the falloff
                                tracks the picture rather than the artboard. */}
                            <radialGradient id={vignetteId} gradientUnits="userSpaceOnUse" cx="12" cy="12" r="11">
                                <stop offset="0.5" stopColor="#000" stopOpacity="0" />
                                <stop offset="0.82" stopColor="#000" stopOpacity="0.2" />
                                <stop offset="1" stopColor="#000" stopOpacity="0.58" />
                            </radialGradient>
                        </>
                    )}
                </defs>

                {/* Drawn under the poster too, so a transparent page still reads
                    as a sheet rather than a floating cut-out. */}
                <path d={SHEET} className={styles.sheet} />

                {poster && (
                    <g clipPath={`url(#${clipId})`}>
                        <image
                            href={poster}
                            x={SHEET_X}
                            y={SHEET_Y}
                            width={SHEET_W}
                            height={SHEET_H}
                            preserveAspectRatio="xMidYMid slice"
                        />
                        {/* Clipped with the image, so the darkening stops at the
                            page edge instead of squaring off over it. */}
                        <rect x={SHEET_X} y={SHEET_Y} width={SHEET_W} height={SHEET_H} fill={`url(#${vignetteId})`} />
                    </g>
                )}

                <path d={FOLD} className={styles.fold} />
            </svg>

            {/* The glyph steps aside once there is a poster: the picture already
                says what the file is, and a symbol over it is just noise. */}
            {!poster && (
                <span className={styles.icon}>
                    <CardIcon icon={icon} size={Math.round(size * 0.28)} style={{ color: 'inherit' }} />
                </span>
            )}

            {/* The badge is set in absolute type, so below about 64px it stops
                fitting the sheet and clips to an unreadable stub. At those sizes
                — the fullscreen rail, a dense board — the hue and the glyph are
                already carrying the kind, so the tab simply steps aside. */}
            {badge && size >= 64 && <span className={styles.badge}>{badge}</span>}
        </div>
    );
}
