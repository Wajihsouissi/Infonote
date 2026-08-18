import { forwardRef, useId } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Every SVG sitting in `src/assets/icons`, keyed by filename minus extension.
 * The glob is eager so a name either resolves at module load or falls back to
 * lucide — no async gap where an icon is briefly absent.
 */
const sources = import.meta.glob('../../assets/icons/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>;

const registry: Record<string, string> = {};
for (const [filePath, source] of Object.entries(sources)) {
    const file = filePath.slice(filePath.lastIndexOf('/') + 1, -'.svg'.length);
    registry[file] = source;
}

const VIEW_BOX = /viewBox="([^"]+)"/;
const OPEN_TAG = /^[\s\S]*?<svg[^>]*>/;
const CLOSE_TAG = /<\/svg>\s*$/;

/**
 * Turns a flat `currentColor` fill into a soft two-stop gradient of the same
 * hue. `fillId` is unique per rendered instance so two copies of the same
 * icon on screen don't fight over one `<defs>` id.
 *
 * A gradient rim stroke was tried here and dropped: on ring/donut shapes
 * (fill-rule="evenodd" cutouts like keyholes and badge circles) it traced
 * the inner hole edge too, and on dense multi-path icons it read as noise
 * rather than a clean edge.
 */
function paintGradient(rawBody: string, fillId: string): string {
    return rawBody
        .replace(/fill="currentColor"/g, `fill="url(#${fillId})"`)
        .replace(/stroke="currentColor"/g, `stroke="url(#${fillId})"`);
}

const cache = new Map<string, LucideIcon>();

function build(name: string, source: string): LucideIcon {
    const viewBox = source.match(VIEW_BOX)?.[1] ?? '0 0 24 24';
    const rawBody = source.replace(OPEN_TAG, '').replace(CLOSE_TAG, '');
    return makeIcon(name, rawBody, viewBox);
}

/**
 * Wraps the inner markup of an SVG (everything between the `<svg>` tags) into a
 * lucide-compatible component carrying the same gradient treatment as the rest
 * of the app's icons. Exported so icon sets that already ship bare bodies — the
 * Solar set behind the card picker — don't have to restate any of this.
 */
export function makeIcon(name: string, rawBody: string, viewBox = '0 0 24 24'): LucideIcon {
    const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(
        {
            size = 24,
            color = 'currentColor',
            // Duotone glyphs are filled paths, so stroke sizing has nothing to
            // act on. Swallow both rather than leaking `absoluteStrokeWidth`
            // onto the DOM node, which React would warn about.
            strokeWidth: _strokeWidth,
            absoluteStrokeWidth: _absoluteStrokeWidth,
            style,
            ...rest
        },
        ref,
    ) {
        // React's useId() includes colons, which are legal in SVG ids but
        // awkward to eyeball in devtools — strip them for a plain token.
        const fillId = `icon-fill-${useId().replace(/:/g, '')}`;

        // userSpaceOnUse against the fixed 24x24 viewBox, not the default
        // objectBoundingBox: a perfectly vertical or horizontal path (the
        // drag-handle line, for one) has a zero-width or zero-height bounding
        // box, and an objectBoundingBox gradient degenerates to nothing on a
        // degenerate box — the glyph silently stops painting.
        const defs =
            `<defs>` +
            `<linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">` +
            `<stop offset="0%" stop-color="currentColor"/>` +
            // Only a light lift at the far corner. Mixing in more white than
            // this desaturates the hue, which on a duotone glyph compounds with
            // its own 50%-opacity backdrop path and turns coloured icons chalky.
            `<stop offset="100%" stop-color="color-mix(in srgb, currentColor 82%, white 18%)"/>` +
            `</linearGradient>` +
            `</defs>`;

        return (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox={viewBox}
                // The glyph paints with `currentColor`, so colouring the
                // wrapper is what tints it — same contract lucide had. The
                // gradients above derive both stops from that same color.
                style={{ color, ...style }}
                aria-hidden="true"
                focusable="false"
                {...rest}
                dangerouslySetInnerHTML={{ __html: defs + paintGradient(rawBody, fillId) }}
            />
        );
    });

    Icon.displayName = name;
    return markDuotone(Icon as unknown as LucideIcon);
}

/**
 * Flags an icon as already carrying its own two tones, so `DuotoneIcon` knows
 * not to stack a faked backdrop layer behind it.
 */
const DUOTONE = Symbol.for('chnkIt.duotoneIcon');

function markDuotone(icon: LucideIcon): LucideIcon {
    (icon as unknown as Record<symbol, boolean>)[DUOTONE] = true;
    return icon;
}

export function isDuotone(icon: LucideIcon): boolean {
    return (icon as unknown as Record<symbol, boolean>)[DUOTONE] === true;
}

/** Renders nothing, so a deleted SVG leaves a hole rather than a crash. */
function placeholder(name: string): LucideIcon {
    if (import.meta.env.DEV) {
        console.warn(`[icons] no src/assets/icons/${name}.svg and no fallback`);
    }
    const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(_props, _ref) {
        return null;
    });
    Icon.displayName = `Missing(${name})`;
    return Icon as unknown as LucideIcon;
}

/**
 * The icon named `name` from `src/assets/icons`, or `fallback` when no such
 * file exists. Dropping `<name>.svg` into that folder is all it takes to
 * replace an icon everywhere it is used.
 */
export function resolveIcon(name: string, fallback?: LucideIcon): LucideIcon {
    let icon = cache.get(name);
    if (icon) return icon;

    const source = registry[name];
    icon = source ? build(name, source) : (fallback ?? placeholder(name));
    cache.set(name, icon);
    return icon;
}
