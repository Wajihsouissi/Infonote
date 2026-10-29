import { LazySolarIcon } from './LazySolarIcon';
import { createElement, useEffect, useSyncExternalStore } from 'react';
import type { LucideIcon, LucideProps } from '../../../shared/icons';
import { makeIcon } from '../../../shared/icons/createIcon';
import { LEGACY_ALIAS, LEGACY_COLOR } from './legacyIcons';
import type { SolarEntry } from './solarCatalog';

export type { SolarEntry };
export { LEGACY_COLOR };

/*
 * Card icons: Solar Bold Duotone by 480 Design, licensed CC BY 4.0.
 * https://creativecommons.org/licenses/by/4.0/
 */

/* ------------------------------------------------------------------ *
 * Body registry
 *
 * No icon art ships in the app's own scripts. A card asks for the one icon it
 * shows, as a ~1 kB file (`/icons/solar/<name>.svg`, written by the build from
 * solarBodies.json — see `solarIconFiles` in vite.config.ts), and the browser
 * caches it. A canvas of twenty cards costs a few kB of icons instead of the
 * 270 kB of up-front art this used to be.
 *
 * The icon picker is different: it shows hundreds at once, so it loads the
 * whole solarBodies.json as one lazy chunk (`loadAllIcons`), and from then on
 * every icon is answered from memory.
 *
 * `useSyncExternalStore`, not a hand-rolled useState+listener-Set, is what
 * subscribes components to this — that store was tried first and produced a
 * "Maximum update depth exceeded" crash inside React Flow's StoreUpdater on
 * a cold load: a burst of manual updates across every icon mounted at once
 * collided with an unrelated store update in the same commit.
 * useSyncExternalStore is the primitive React ships for exactly this.
 * ------------------------------------------------------------------ */

const bodies = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
let allPending: Promise<void> | null = null;
let catalog: SolarEntry[] | null = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

const SAFE_NAME = /^[a-z0-9-]+$/;
const SVG_WRAPPER = /^<svg[^>]*>([\s\S]*)<\/svg>\s*$/;

/** Fetch one icon's body, once. Unknown or unsafe names resolve to nothing. */
function requestBody(name: string): void {
    if (bodies.has(name) || pending.has(name) || allPending || !SAFE_NAME.test(name)) return;
    const request = fetch(`/icons/solar/${name}.svg`)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
        .then((svg) => {
            const body = SVG_WRAPPER.exec(svg)?.[1];
            if (!body) return;
            bodies.set(name, body);
            notify();
        })
        .catch(() => {
            // Offline or a name with no icon: forget the attempt so a later
            // render may try again, and draw nothing meanwhile.
        })
        .finally(() => pending.delete(name));
    pending.set(name, request);
}

/** Every icon and the browsable catalogue — for the picker. */
export function loadAllIcons(): Promise<void> {
    if (!allPending) {
        allPending = Promise.all([
            import('./solarBodies.json').then((m) => m.default as Record<string, string>),
            import('./solarCatalog').then((m) => m.SOLAR_CATALOG),
        ])
            .then(([all, entries]) => {
                for (const [name, body] of Object.entries(all)) bodies.set(name, body);
                catalog = entries;
                notify();
            })
            .catch((err) => {
                // Let a later attempt retry rather than wedging on one failure.
                allPending = null;
                throw err;
            });
    }
    return allPending;
}

/** The full browsable listing — only present once `loadAllIcons` has resolved. */
export function getCatalog(): SolarEntry[] | null {
    return catalog;
}

/**
 * Resolves a stored icon name to a Solar id, translating names written before
 * the switch. Returns the id whether or not its body has loaded yet.
 */
export function toSolarName(stored: string): string {
    // Callouts persisted this name before it entered the generated icon set.
    if (stored === 'Lightbulb') return 'lightbulb';
    return LEGACY_ALIAS[stored] ?? stored;
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
 * The body for `stored`, or `null` while it is on its way.
 * Asks for it on first miss and re-renders when it arrives.
 */
export function useSolarBody(stored: string): { name: string; body: string | null } {
    const name = toSolarName(stored);
    const body = useSyncExternalStore(
        subscribe,
        () => bodies.get(name) ?? null,
        () => bodies.get(name) ?? null,
    );
    useEffect(() => {
        if (!body) requestBody(name);
    }, [body, name]);
    return { name, body };
}

/**
 * One shared component for every icon whose body isn't loaded yet. It reads
 * the name off its own props rather than being manufactured per-name, so
 * there is exactly one component type in play regardless of how many
 * distinct icons are pending — nothing for the reconciler to churn through
 * when a batch of them resolve together.
 */

const lazyIconCache = new Map<string, LucideIcon>();

function lazyIconFor(name: string): LucideIcon {
    let icon = lazyIconCache.get(name);
    if (!icon) {
        icon = ((props: LucideProps) => createElement(LazySolarIcon, { name, ...props })) as unknown as LucideIcon;
        (icon as unknown as { displayName: string }).displayName = `Solar(${name})`;
        lazyIconCache.set(name, icon);
    }
    return icon;
}

/**
 * A lucide-shaped component for `stored`, for call sites that need a component
 * reference rather than markup. Resolves synchronously once the body is known;
 * until then it holds the icon's space and fills in when the body arrives.
 */
export function solarIconComponent(stored: string): LucideIcon {
    const name = toSolarName(stored);
    const body = bodies.get(name);
    return body ? componentFor(name, body) : lazyIconFor(name);
}
