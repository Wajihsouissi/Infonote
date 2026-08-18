import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Maximize2, Download, ExternalLink, ChevronLeft, ChevronRight } from '../../components/icons';
import styles from './MediaLightbox.module.css';

interface MediaLightboxProps {
    src: string;
    type: 'image' | 'video';
    name?: string;
    onClose: () => void;
    /** Supplied when the media belongs to a set (a gallery), which turns on the
     *  arrows, the ← / → keys and the counter. Omitted for a lone block. */
    onPrev?: () => void;
    onNext?: () => void;
    position?: { index: number; total: number };
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

/**
 * Full-screen viewer for an uploaded image or video. Media in a block is small by
 * design — an image is 180px tall in the editor and a canvas node is barely wider —
 * so this is where you actually look at it.
 *
 * Images open fit-to-screen and can be zoomed past 100% (the pane scrolls); video
 * gets the browser's own controls at full size. Escape or a click on the backdrop
 * closes, matching every other overlay in the app.
 */
export const MediaLightbox = ({ src, type, name, onClose, onPrev, onNext, position }: MediaLightboxProps) => {
    const [zoom, setZoom] = useState(1);
    const [isFit, setIsFit] = useState(true);
    const hasSet = !!(onPrev || onNext);

    const zoomBy = useCallback((delta: number) => {
        setIsFit(false);
        setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
    }, []);

    const fitToScreen = useCallback(() => {
        setZoom(1);
        setIsFit(true);
    }, []);

    /* Note for callers stepping through a set: mount this keyed by the item, so
       each picture opens fit to screen rather than inheriting the previous
       one's 300% zoom and landing mid-crop. */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // The canvas and the editor both listen globally for these; this is modal,
            // so it takes the key and nothing behind it reacts.
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
            if (e.key === 'ArrowLeft' && onPrev) { e.stopPropagation(); e.preventDefault(); onPrev(); return; }
            if (e.key === 'ArrowRight' && onNext) { e.stopPropagation(); e.preventDefault(); onNext(); return; }
            if (type !== 'image') return;
            if (e.key === '+' || e.key === '=') { e.stopPropagation(); zoomBy(ZOOM_STEP); }
            else if (e.key === '-') { e.stopPropagation(); zoomBy(-ZOOM_STEP); }
            else if (e.key === '0') { e.stopPropagation(); fitToScreen(); }
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [onClose, zoomBy, fitToScreen, type, onPrev, onNext]);

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    const download = () => {
        const a = document.createElement('a');
        a.href = src;
        a.download = name || `media.${type === 'image' ? 'png' : 'mp4'}`;
        a.click();
    };

    return createPortal(
        <div className={styles.overlay} onClick={onClose} onPointerDown={stop} onWheel={stop}>
            <div className={styles.header} onClick={stop} onPointerDown={stop}>
                <span className={styles.title} title={name}>{name || (type === 'image' ? 'Image' : 'Video')}</span>
                <div className={styles.controls}>
                    {position && position.total > 1 && (
                        <>
                            <span className={styles.scaleText}>{position.index + 1} / {position.total}</span>
                            <div className={styles.divider} />
                        </>
                    )}
                    {type === 'image' && (
                        <>
                            <button className={styles.controlBtn} onClick={() => zoomBy(-ZOOM_STEP)} disabled={!isFit && zoom <= ZOOM_MIN} title="Zoom out ( - )">
                                <ZoomOut size={18} />
                            </button>
                            <span className={styles.scaleText}>{isFit ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
                            <button className={styles.controlBtn} onClick={() => zoomBy(ZOOM_STEP)} disabled={!isFit && zoom >= ZOOM_MAX} title="Zoom in ( + )">
                                <ZoomIn size={18} />
                            </button>
                            <button className={styles.controlBtn} onClick={fitToScreen} title="Fit to screen ( 0 )">
                                <Maximize2 size={18} />
                            </button>
                            <div className={styles.divider} />
                        </>
                    )}
                    <button className={styles.controlBtn} onClick={download} title="Download">
                        <Download size={18} />
                    </button>
                    <button className={styles.controlBtn} onClick={() => window.open(src, '_blank', 'noopener,noreferrer')} title="Open in new tab">
                        <ExternalLink size={18} />
                    </button>
                    <div className={styles.divider} />
                    <button className={styles.closeBtn} onClick={onClose} title="Close ( Esc )">
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div className={styles.stage} onClick={onClose}>
                {hasSet && position && position.total > 1 && (
                    <>
                        <button
                            className={`${styles.navBtn} ${styles.navPrev}`}
                            onClick={(e) => { stop(e); onPrev?.(); }}
                            title="Previous ( ← )"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={26} />
                        </button>
                        <button
                            className={`${styles.navBtn} ${styles.navNext}`}
                            onClick={(e) => { stop(e); onNext?.(); }}
                            title="Next ( → )"
                            aria-label="Next"
                        >
                            <ChevronRight size={26} />
                        </button>
                    </>
                )}
                {type === 'image' ? (
                    <img
                        src={src}
                        alt={name || 'Media'}
                        className={`${styles.media} ${isFit ? styles.fit : ''}`}
                        style={isFit ? undefined : { width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: 'none' }}
                        onClick={stop}
                        onDoubleClick={() => (isFit ? zoomBy(ZOOM_STEP) : fitToScreen())}
                        draggable={false}
                    />
                ) : (
                    <video
                        src={src}
                        controls
                        autoPlay
                        className={`${styles.media} ${styles.fit}`}
                        onClick={stop}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};
