import type { LinkMetadata } from './types';

export const METADATA_CACHE_KEY = 'chnk_metadata_cache';
export const MAX_METADATA_ENTRIES = 128;
/** UTF-16 JSON characters: at most approximately 512 KiB in localStorage. */
export const MAX_METADATA_CACHE_CHARS = 256 * 1024;

interface CachePorts {
    read(): string | null;
    write(value: string): void;
    setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
}
const browserPorts: CachePorts = {
    read: () => localStorage.getItem(METADATA_CACHE_KEY),
    write: value => localStorage.setItem(METADATA_CACHE_KEY, value),
    setTimer: (callback, delay) => setTimeout(callback, delay),
};
interface Entry { value: LinkMetadata; json: string; cost: number; durable: boolean }

function metadata(value: unknown): value is LinkMetadata {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return ['url', 'title', 'description', 'favicon', 'image', 'provider'].every(key => typeof record[key] === 'string')
        && typeof record.isEmbeddable === 'boolean'
        && (record.embedUrl === undefined || typeof record.embedUrl === 'string')
        && (record.error === undefined || typeof record.error === 'boolean');
}

/** Regenerable link metadata only. Never holds workspace, auth or chat data.
 * Hydration is lazy and bounded; cache writes are batched rather than parsing
 * and serializing the entire previous localStorage value on every response. */
export class MetadataCache {
    private entries = new Map<string, Entry>();
    private chars = 2;
    private loaded = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private persistenceDisabled = false;
    private ports: CachePorts;

    constructor(ports: CachePorts = browserPorts) { this.ports = ports; }

    private hydrate(): void {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const text = this.ports.read();
            // An oversized legacy cache is optional metadata, not user work.
            // Do not parse it at startup or delete it as a side effect of a read.
            if (!text || text.length > MAX_METADATA_CACHE_CHARS) return;
            const parsed: unknown = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
            for (const [key, value] of Object.entries(parsed)) {
                if (metadata(value) && value.url === key && !value.error) this.remember(key, value, true);
            }
        } catch { /* Optional cache: invalid or blocked storage is a cache miss. */ }
    }

    private remember(key: string, value: LinkMetadata, durable: boolean): void {
        const old = this.entries.get(key);
        if (old) { this.entries.delete(key); this.chars -= old.cost; }
        const json = JSON.stringify(value), cost = JSON.stringify(key).length + json.length + 2;
        if (cost + 2 > MAX_METADATA_CACHE_CHARS) return;
        while (this.entries.size >= MAX_METADATA_ENTRIES || this.chars + cost > MAX_METADATA_CACHE_CHARS) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.chars -= this.entries.get(oldest)!.cost; this.entries.delete(oldest);
        }
        this.entries.set(key, { value, json, cost, durable }); this.chars += cost;
    }

    get(key: string): LinkMetadata | undefined {
        this.hydrate();
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        this.entries.delete(key); this.entries.set(key, entry);
        return entry.value;
    }

    set(key: string, value: LinkMetadata, durable = !value.error): void {
        this.hydrate(); this.remember(key, value, durable);
        if (!durable || this.persistenceDisabled || this.timer !== null) return;
        this.timer = this.ports.setTimer(() => { this.timer = null; this.flush(); }, 250);
    }

    private flush(): void {
        const pairs = [...this.entries].filter(([, entry]) => entry.durable)
            .map(([key, entry]) => `${JSON.stringify(key)}:${entry.json}`);
        try { this.ports.write(`{${pairs.join(',')}}`); }
        catch {
            // Repeated quota/security errors must not turn a link burst into a
            // serialization/logging loop. In-memory caching remains available.
            this.persistenceDisabled = true;
        }
    }
}
