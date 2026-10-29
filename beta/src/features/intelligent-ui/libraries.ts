import type { UILibrary } from './types';

export interface UILibraryAssets { scripts: string[]; css: string }
const sources = new Map<string, Promise<string>>();
function source(name: string): Promise<string> {
    let pending = sources.get(name);
    if (!pending) {
        pending = fetch(`${import.meta.env.BASE_URL}intelligent-ui-libs/${name}`, { credentials: 'omit' })
            .then(response => { if (!response.ok) throw new Error(`Could not load ${name}. Reload the interface to retry.`); return response.text(); })
            .catch(error => { sources.delete(name); throw error; });
        sources.set(name, pending);
    }
    return pending;
}

export async function loadUILibraries(libraries: UILibrary[] = []): Promise<UILibraryAssets> {
    return { scripts: await Promise.all(libraries.map(name => source(`${name}.js`))),
        css: libraries.includes('leaflet') ? await source('leaflet.css') : '' };
}
