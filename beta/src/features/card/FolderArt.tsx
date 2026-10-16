import { useId } from 'react';
import { CardIcon } from './iconMap';
import styles from './FolderArt.module.css';

/* solar:folder-open-bold-duotone, split so each half of the folder can carry its
   own content.

   BACK is the translucent panel with the tab — the inside of the folder. Only its
   top band stays uncovered once the front flap is laid over it, and that band is
   exactly where a sheet sticking out of a real folder would show, so it is where
   the cover thumbnail goes.

   POCKET is the front flap. The original artwork cuts a grip slot into it with an
   evenodd hole; POCKET_SOLID is the same flap without that slot, because the slot
   and the card's icon want the same spot. With an icon the flap goes solid and the
   icon sits on it; without one the slot is kept and the folder looks untouched. */
const BACK =
    'M3.5762 12.4846C3.68271 12.3586 3.80034 12.241 3.92792 12.1332C4.79888 11.3975 6.20667 11.3975 9.02227 11.3975H15.9777C18.7933 11.3975 20.2011 11.3975 21.0721 12.1332C21.2 12.2413 21.3179 12.3592 21.4247 12.4857V9.75579C21.4247 8.84687 21.4247 8.09279 21.3394 7.49156C21.2494 6.85704 21.0531 6.29458 20.5839 5.83245C20.5074 5.75707 20.4266 5.68552 20.342 5.61807C19.8302 5.21023 19.2167 5.04345 18.5222 4.96608C17.8531 4.89155 17.0102 4.89157 15.9769 4.89158L15.6242 4.89158C14.6421 4.89158 14.29 4.88587 13.9711 4.80533C13.7837 4.75802 13.604 4.69195 13.4352 4.60878C13.151 4.46867 12.9033 4.25762 12.2077 3.64132L11.7336 3.22128C11.5345 3.04489 11.3987 2.9245 11.2531 2.81755C10.6284 2.35879 9.86779 2.08132 9.07145 2.01534C8.88602 1.99998 8.6968 1.99999 8.41356 2.00002L8.29714 2.00001C7.65647 1.9999 7.23365 1.99983 6.86652 2.0612C5.26167 2.32947 3.96392 3.45143 3.64782 4.93575C3.57591 5.27344 3.57602 5.66035 3.57619 6.21853L3.5762 12.4846Z';

const POCKET_SOLID =
    'M3.35791 12.7787C2.74772 13.7201 2.99956 15.0291 3.50323 17.647C3.8658 19.5316 4.04709 20.4738 4.67523 21.0991C4.8382 21.2614 5.02054 21.4052 5.2186 21.5277C5.98195 21.9999 6.99539 21.9999 9.02227 21.9999H15.9777C18.0046 21.9999 19.0181 21.9999 19.7814 21.5277C19.9795 21.4052 20.1618 21.2614 20.3248 21.0991C20.9529 20.4738 21.1342 19.5316 21.4968 17.647C22.0004 15.0291 22.2523 13.7201 21.6421 12.7787C21.4864 12.5384 21.2943 12.321 21.0721 12.1332C20.2011 11.3975 18.7933 11.3975 15.9777 11.3975H9.02227C6.20667 11.3975 4.79888 11.3975 3.92792 12.1332C3.70566 12.321 3.51363 12.5384 3.35791 12.7787Z';

const POCKET_SLOTTED = `${POCKET_SOLID}M9.69518 17.1806C9.69518 16.7814 10.0376 16.4577 10.4601 16.4577H14.5398C14.9622 16.4577 15.3047 16.7814 15.3047 17.1806C15.3047 17.5798 14.9622 17.9035 14.5398 17.9035H10.4601C10.0376 17.9035 9.69518 17.5798 9.69518 17.1806Z`;

/* The front flap's box, measured off POCKET_SOLID. The blurred cover is drawn
   about this centre rather than the artboard's, so the zoom stays framed on the
   flap however the folder is scaled. */
const FLAP_CX = 12.5;
const FLAP_CY = 16.7;
const FLAP_W = 18.3;
const FLAP_H = 10.6;

/** How far into the cover the flap crops. Larger = fewer, softer shapes. */
const FLAP_ZOOM = 3;

/* Gaussian sigma in viewBox units, where the flap is ~10.6 tall. At the default
   92px render that is roughly a 6px radius on screen — enough that no edge in
   the picture survives, while the colour blocks still move across the flap. */
const FLAP_BLUR = 1.5;

export interface FolderArtProps {
    /** Shown as a thumbnail in the exposed top band of the folder. */
    coverImage?: string;
    /** Lucide icon name or image data URI, laid softly over the front flap. */
    icon?: string;
    /** Edge of the square the folder is drawn into. */
    size?: number;
}

export function FolderArt({ coverImage, icon, size = 92 }: FolderArtProps) {
    /* Scoped per instance: a document-wide id would have every folder on the
       canvas clip to whichever card mounted first. */
    const uid = useId();
    const clipId = `${uid}-clip`;
    const vignetteId = `${uid}-vignette`;
    const flapClipId = `${uid}-flapclip`;
    const blurId = `${uid}-blur`;
    const foldId = `${uid}-fold`;

    return (
        <div className={styles.art} style={{ width: size, height: size }} data-has-cover={coverImage ? '' : undefined}>
            <svg viewBox="0 0 24 24" className={styles.svg} aria-hidden="true">
                <defs>
                    {coverImage && (
                        <>
                            <clipPath id={clipId}>
                                <path d={BACK} />
                            </clipPath>

                            {/* Sized and placed over the thumbnail's own box, so
                                the falloff tracks the image rather than the whole
                                24-unit canvas. */}
                            <radialGradient
                                id={vignetteId}
                                gradientUnits="userSpaceOnUse"
                                cx="12.5"
                                cy="7.3"
                                r="10"
                            >
                                <stop offset="0.45" stopColor="#000" stopOpacity="0" />
                                <stop offset="0.78" stopColor="#000" stopOpacity="0.22" />
                                <stop offset="1" stopColor="#000" stopOpacity="0.62" />
                            </radialGradient>
                        </>
                    )}

                    {coverImage && (
                        <>
                            <clipPath id={flapClipId} clipRule="evenodd">
                                <path d={icon ? POCKET_SOLID : POCKET_SLOTTED} clipRule="evenodd" />
                            </clipPath>

                            {/* Generous filter region: the default clips the
                                result at 10% past the source box, which would cut
                                the blur off mid-falloff. */}
                            <filter
                                id={blurId}
                                x="-30%"
                                y="-30%"
                                width="160%"
                                height="160%"
                                colorInterpolationFilters="sRGB"
                            >
                                <feGaussianBlur stdDeviation={FLAP_BLUR} />
                            </filter>

                            {/* Both halves now show the same picture, so without a
                                shadow along the top edge the fold disappears and
                                the folder reads as one flat photo. */}
                            <linearGradient id={foldId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="#000" stopOpacity="0.38" />
                                <stop offset="0.3" stopColor="#000" stopOpacity="0.06" />
                                <stop offset="1" stopColor="#000" stopOpacity="0.18" />
                            </linearGradient>
                        </>
                    )}
                </defs>

                {/* Drawn under the thumbnail too, so a transparent cover still
                    reads as a folder rather than a floating cut-out. */}
                <path d={BACK} className={styles.back} />

                {coverImage && (
                    <g clipPath={`url(#${clipId})`}>
                        <image
                            href={coverImage}
                            x="3.5"
                            y="2"
                            width="18"
                            height="10.6"
                            preserveAspectRatio="xMidYMid slice"
                        />
                        {/* Clipped with the image, so the darkening stops at the
                            folder's edge instead of squaring off over it. */}
                        <rect x="3.5" y="2" width="18" height="10.6" fill={`url(#${vignetteId})`} />
                    </g>
                )}

                {coverImage ? (
                    /* The flap wears the same cover, blown up and thrown out of
                       focus — the sharp thumbnail above reads as the sheet, this
                       reads as its colour bleeding through the folder. Drawing it
                       oversized about the flap's centre is what does the zoom, and
                       it also parks the image's own edges far outside the flap so
                       the blur never fades to transparent anywhere visible. */
                    <g clipPath={`url(#${flapClipId})`}>
                        <image
                            href={coverImage}
                            x={FLAP_CX - FLAP_W * FLAP_ZOOM / 2}
                            y={FLAP_CY - FLAP_H * FLAP_ZOOM / 2}
                            width={FLAP_W * FLAP_ZOOM}
                            height={FLAP_H * FLAP_ZOOM}
                            preserveAspectRatio="xMidYMid slice"
                            filter={`url(#${blurId})`}
                        />
                        <rect x="3" y="11" width="19" height="12" fill={`url(#${foldId})`} />
                    </g>
                ) : (
                    <path
                        d={icon ? POCKET_SOLID : POCKET_SLOTTED}
                        fillRule="evenodd"
                        clipRule="evenodd"
                        className={styles.pocket}
                    />
                )}
            </svg>

            {icon && (
                <span className={styles.icon}>
                    {/* Folder view deliberately ignores the `::colour` suffix
                        from IconPicker. The folder is a single coloured object,
                        so its glyph inherits the flap's soft white instead of
                        bringing a second arbitrary icon colour onto it. */}
                    <CardIcon icon={icon} size={Math.round(size * 0.3)} style={{ color: 'inherit' }} />
                </span>
            )}
        </div>
    );
}
