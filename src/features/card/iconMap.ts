import React from 'react';
import { LEGACY_COLOR, solarIconComponent } from './solar';

export { loadRestIcons, getCatalog, solarIconComponent, toSolarName, DEFAULT_SOLAR_ICON } from './solar';
export type { SolarEntry } from './solar';

/**
 * Card icons are persisted by name, so this default has to stay stable — it is
 * what a card without an explicit icon renders, and what an unrecognised name
 * falls back to. It stays a legacy lucide name on purpose: `toSolarName`
 * translates it, and saved cards already contain it.
 */
export const defaultIconName = 'FileText';

export interface CardIconProps {
    icon: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

const isCustomImage = (icon: string) =>
    icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://');

/**
 * Renders whatever a card stored in its `icon` field: a hosted or inlined
 * image, an emoji, or a named Solar glyph — optionally carrying a `::colour`
 * suffix chosen in the picker.
 */
export function CardIcon({ icon, size = 20, className, style }: CardIconProps) {
    const raw = icon || defaultIconName;

    if (isCustomImage(raw)) {
        return React.createElement('img', {
            src: raw,
            alt: 'Icon',
            className,
            style: {
                width: `${size}px`,
                height: `${size}px`,
                objectFit: 'cover',
                borderRadius: '12px',
                display: 'inline-block',
                verticalAlign: 'middle',
                ...style,
            },
        });
    }

    if (raw.startsWith('emoji::')) {
        return React.createElement(
            'span',
            {
                className,
                style: {
                    fontSize: `${size * 0.9}px`,
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: `${size}px`,
                    height: `${size}px`,
                    ...style,
                },
            },
            raw.replace('emoji::', ''),
        );
    }

    return React.createElement(SolarCardIcon, { icon: raw, size, className, style });
}

function SolarCardIcon({ icon, size = 20, className, style }: CardIconProps) {
    const [storedName, customColor] = icon.includes('::')
        ? (icon.split('::') as [string, string])
        : [icon, ''];

    // Resolves synchronously for the core set; anything else renders blank for
    // one beat while the lazy chunk lands, then fills itself in.
    const Icon = solarIconComponent(storedName);
    const colour = customColor || LEGACY_COLOR[storedName] || 'inherit';

    return React.createElement(Icon, {
        size,
        className,
        style: { color: colour, ...style },
    });
}
