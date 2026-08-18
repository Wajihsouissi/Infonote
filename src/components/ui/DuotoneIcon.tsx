import type { LucideIcon } from '../icons';
import { isDuotone } from '../icons/createIcon';

interface DuotoneIconProps {
    icon: LucideIcon;
    size?: number;
    color?: string;
    strokeWidth?: number;
    /** Opacity of the faked backdrop layer. Ignored for icons that are already
     * duotone — those carry their own second tone. */
    fillOpacity?: number;
    className?: string;
}

export function DuotoneIcon({
    icon: Icon,
    size = 20,
    color = 'currentColor',
    strokeWidth = 2,
    fillOpacity = 0.35,
    className,
}: DuotoneIconProps) {
    const wrapper = {
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        flex: 'none',
        color,
    } as const;

    // A real duotone glyph already has both tones baked in; stacking a second
    // copy behind it only doubles the paint and fattens the edges.
    if (isDuotone(Icon)) {
        return (
            <span className={className} style={wrapper}>
                <Icon size={size} />
            </span>
        );
    }

    return (
        <span className={className} style={wrapper}>
            <Icon
                size={size}
                fill="currentColor"
                stroke="none"
                style={{ position: 'absolute', inset: 0, opacity: fillOpacity }}
            />
            <Icon
                size={size}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                style={{ position: 'absolute', inset: 0 }}
            />
        </span>
    );
}
