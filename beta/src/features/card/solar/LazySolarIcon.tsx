import type { LucideProps } from '../../../shared/icons';
import { useId } from 'react';
import { useSolarBody } from './index';

/** Render a component prepared by the registry, never create a type during render. */
export function LazySolarIcon({ name, size = 24, color = 'currentColor', style,
    strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, ...props }: LucideProps & { name: string }) {
    const resolved = useSolarBody(name);
    const fillId = `icon-fill-${useId().replace(/:/g, '')}`;
    // Hold the icon's space while its file is on the way, so nothing shifts when it lands.
    if (!resolved.body) {
        return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
            style={{ color, ...style }} aria-hidden="true" focusable="false" {...props} />;
    }
    const defs = `<defs><linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="currentColor"/><stop offset="100%" stop-color="color-mix(in srgb, currentColor 82%, white 18%)"/></linearGradient></defs>`;
    const body = resolved.body.replace(/fill="currentColor"/g, `fill="url(#${fillId})"`)
        .replace(/stroke="currentColor"/g, `stroke="url(#${fillId})"`);
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        style={{ color, ...style }} aria-hidden="true" focusable="false" {...props}
        dangerouslySetInnerHTML={{ __html: defs + body }} />;
}
