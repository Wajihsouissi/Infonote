import { useEffect, useState } from 'react';
import type { LucideIcon, LucideProps } from '../../../components/icons';
import { makeIcon } from '../../../components/icons/createIcon';
import { SOLAR_CORE } from './solarCore';
import { LEGACY_ALIAS, LEGACY_COLOR } from './legacyIcons';
import type { SolarEntry } from './solarCatalog';

export type { SolarEntry };
export { LEGACY_COLOR };

/** Solar's own id for the fallback icon, and what an unknown name resolves to. */
export const DEFAULT_SOLAR_ICON = 'file-text';

/* ------------------------------------------------------------------ *
 * Body registry
 *
 * Core bodies ship with the main bundle so cards saved before the Solar
 * switch paint immediately. The other ~1000 arrive in a chunk fetched the
 * first time something actually needs one.
 * ------------------------------------------------------------------ */

let rest: Record<string, string> | null = null;
let restPending: Promise<void> | null = null;

/** Notified when the lazy chunk lands, so mounted icons can re-render. */
const listeners = new Set<() => void>();

export function loadRestIcons(): Promise<void> {
    if (rest) return Promise.resolve();
    if (!restPending) {
        restPending = Promise.all([import('./solarRest'), import('./solarCatalog')])
            .then(([bodies, cat]) => {
                rest = bodies.default;
                catalog = cat.default;
                listeners.forEach((fn) => fn());
            })
            .catch((err) => {
                // Let a later attempt retry rather than wedging on one failure.
                restPending = null;
                throw err;
            });
    }
    return restPending;
}

/** The full browsable listing — only present once the lazy chunk has loaded. */
let catalog: SolarEntry[] | null = null;
export function getCatalog(): SolarEntry[] | null {
    return catalog;
}

/**
 * Resolves a stored icon name to a Solar id, translating names written before
 * the switch. Returns the id whether or not its body has loaded yet.
 */
export function toSolarName(stored: string): string {
    if (stored in SOLAR_CORE) return stored;
    if (stored in LEGACY_ALIAS) return LEGACY_ALIAS[stored];
    return stored;
}

function bodyFor(solarName: string): string | undefined {
    return SOLAR_CORE[solarName] ?? rest?.[solarName];
}

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

const componentCache = new Map<string, LucideIcon>();

function componentFor(solarName: string, body: string): LucideIcon {
    let icon = componentCache.get(solarName);
    if (!icon) {
        icon = makeIcon(solarName, body);
        componentCache.set(solarName, icon);
    }
    return icon;
}

/**
 * The body for `stored`, or `null` while the lazy chunk is still in flight.
 * Kicks off that fetch on first miss and re-renders when it resolves.
 */
export function useSolarBody(stored: string): { name: string; body: string | null } {
    const name = toSolarName(stored);
    const body = bodyFor(name);
    const [, bump] = useState(0);

    useEffect(() => {
        if (body !== undefined) return;
        let alive = true;
        const rerender = () => alive && bump((n) => n + 1);
        listeners.add(rerender);
        void loadRestIcons().catch(() => undefined);
        return () => {
            alive = false;
            listeners.delete(rerender);
        };
    }, [body, name]);

    return { name, body: body ?? null };
}

/**
 * A lucide-shaped component for `stored`, for call sites that need a component
 * reference rather than markup. Resolves synchronously for core icons; for the
 * rest it renders nothing until the chunk lands, then fills in.
 */
export function solarIconComponent(stored: string): LucideIcon {
    const name = toSolarName(stored);
    const body = bodyFor(name);
    if (body) return componentFor(name, body);

    const cacheKey = `pending:${name}`;
    const pending = componentCache.get(cacheKey);
    if (pending) return pending;

    const Pending: LucideIcon = ((props: LucideProps) => {
        const resolved = useSolarBody(stored);
        if (!resolved.body) return null;
        const Resolved = componentFor(resolved.name, resolved.body);
        return <Resolved {...props} />;
    }) as unknown as LucideIcon;
    (Pending as unknown as { displayName: string }).displayName = `Solar(${name})`;

    componentCache.set(cacheKey, Pending);
    return Pending;
}
