import { useSyncExternalStore } from 'react';
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
 *
 * `useSyncExternalStore`, not a hand-rolled useState+listener-Set, is what
 * subscribes components to this — that store was tried first and produced a
 * "Maximum update depth exceeded" crash inside React Flow's StoreUpdater on
 * a cold load: the chunk landing fired a burst of manual bump() calls across
 * every icon tile mounted at once, colliding with an unrelated store update
 * (the icon selection write) in the same commit. useSyncExternalStore is the
 * primitive React ships specifically to subscribe to outside-React state
 * without that class of bug.
 * ------------------------------------------------------------------ */

let rest: Record<string, string> | null = null;
let restPending: Promise<void> | null = null;
let catalog: SolarEntry[] | null = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    void loadRestIcons().catch(() => undefined);
    return () => listeners.delete(onChange);
}

export function loadRestIcons(): Promise<void> {
    if (rest) return Promise.resolve();
    if (!restPending) {
        restPending = Promise.all([import('./solarRest'), import('./solarCatalog')])
            .then(([bodies, cat]) => {
                rest = bodies.default;
                catalog = cat.default;
                notify();
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
    const body = useSyncExternalStore(
        subscribe,
        () => bodyFor(name) ?? null,
        () => bodyFor(name) ?? null,
    );
    return { name, body };
}

/**
 * One shared component for every icon whose body isn't loaded yet. It reads
 * the name off its own props rather than being manufactured per-name, so
 * there is exactly one component type in play regardless of how many
 * distinct icons are pending — nothing for the reconciler to churn through
 * when a batch of them resolve together.
 */
function LazySolarIcon({ name, ...props }: LucideProps & { name: string }) {
    const resolved = useSolarBody(name);
    if (!resolved.body) return null;
    const Resolved = componentFor(resolved.name, resolved.body);
    return <Resolved {...props} />;
}

const lazyIconCache = new Map<string, LucideIcon>();

function lazyIconFor(name: string): LucideIcon {
    let icon = lazyIconCache.get(name);
    if (!icon) {
        icon = ((props: LucideProps) => <LazySolarIcon name={name} {...props} />) as unknown as LucideIcon;
        (icon as unknown as { displayName: string }).displayName = `Solar(${name})`;
        lazyIconCache.set(name, icon);
    }
    return icon;
}

/**
 * A lucide-shaped component for `stored`, for call sites that need a component
 * reference rather than markup. Resolves synchronously for core icons; for the
 * rest it renders nothing until the chunk lands, then fills in.
 */
export function solarIconComponent(stored: string): LucideIcon {
    const name = toSolarName(stored);
    const body = bodyFor(name);
    return body ? componentFor(name, body) : lazyIconFor(name);
}
