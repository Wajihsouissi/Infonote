import type { LucideIcon } from 'lucide-react';

interface DuotoneIconProps {
    icon: LucideIcon;
    size?: number;
    color?: string;
    strokeWidth?: number;
    /** Opacity of the filled backdrop layer — lucide has no native duotone
     * weight, so this fakes it by stacking a faint filled copy of the same
     * glyph behind the normal stroke icon. */
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
    return (
        <span
            className={className}
            style={{
                position: 'relative',
                display: 'inline-flex',
                width: size,
                height: size,
                flex: 'none',
                color,
            }}
        >
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
