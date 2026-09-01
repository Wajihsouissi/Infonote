/**
 * AssetMedia
 * --------------------------------------------------------------------------
 * Drop-in replacements for `<img>` and `<video>` that understand an
 * `asset:<id>` reference as well as an ordinary URL.
 *
 * Every render path that used to point straight at `block.content` goes
 * through one of these, because content is now a reference and reading it
 * takes a trip to IndexedDB. They keep the caller's className and style while
 * the read is in flight so the layout never shifts, and say something useful
 * instead of showing a broken-image glyph when the bytes are gone.
 */
import type { CSSProperties, ImgHTMLAttributes, VideoHTMLAttributes } from 'react';
import { useAssetUrl } from './useAssetUrl';
import styles from './AssetMedia.module.css';

interface PlaceholderProps {
    className?: string;
    style?: CSSProperties;
}

const Pending = ({ className, style }: PlaceholderProps) => (
    <span className={[styles.pending, className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />
);

const Missing = ({ className, style }: PlaceholderProps) => (
    <span className={[styles.missing, className].filter(Boolean).join(' ')} style={style} role="img" aria-label="File unavailable">
        This file is not stored on this device.
    </span>
);

type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string };

export const AssetImage = ({ src, className, style, alt = '', ...rest }: AssetImageProps) => {
    const { url, status } = useAssetUrl(src);
    if (status === 'loading') return <Pending className={className} style={style} />;
    if (!url) return <Missing className={className} style={style} />;
    return <img {...rest} src={url} alt={alt} className={className} style={style} />;
};

type AssetVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & { src?: string };

export const AssetVideo = ({ src, className, style, ...rest }: AssetVideoProps) => {
    const { url, status } = useAssetUrl(src);
    if (status === 'loading') return <Pending className={className} style={style} />;
    if (!url) return <Missing className={className} style={style} />;
    return <video {...rest} src={url} className={className} style={style} />;
};
