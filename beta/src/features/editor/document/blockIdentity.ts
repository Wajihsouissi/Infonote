import type { Block, BlockMetadata } from '../types';

const childKeys = ['blocks', 'content', 'items'] as const;
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0;
// Documents are immutable snapshots. Event handlers can publish a next array
// before returning it to React; both paths must receive the same repaired ids.
const normalizedDocuments = new WeakMap<Block[], Block[]>();

/** Identities are unique within a document, including nested editors. Preserve
 * every occurrence and the first existing identity; repair only collisions or
 * missing ids. Unchanged arrays/blocks keep their references. Never mutate the
 * source: it may also be a saved snapshot or another canvas projection. */
export function normalizeBlockIds(source: Block[]): Block[] {
    const cached = normalizedDocuments.get(source);
    if (cached) return cached;
    const reserved = new Set<string>(), reservedColumns = new Set<string>();
    let needsRepair = false;
    const reserve = (id: unknown, ids: Set<string>) => {
        if (!validId(id) || ids.has(id)) needsRepair = true;
        if (validId(id)) ids.add(id);
    };
    const inspect = (blocks: Block[]) => {
        for (const block of blocks) {
            if (!block || typeof block !== 'object') continue;
            reserve(block.id, reserved);
            const metadata = block.metadata;
            if (!metadata) continue;
            for (const key of childKeys) if (Array.isArray(metadata[key])) inspect(metadata[key] as Block[]);
            for (const column of Array.isArray(metadata.columns) ? metadata.columns : []) {
                if (!column || typeof column !== 'object') continue;
                reserve(column.id, reservedColumns);
                if (Array.isArray(column.content)) inspect(column.content);
                const legacy = (column as unknown as { blocks?: Block[] }).blocks;
                if (Array.isArray(legacy)) inspect(legacy);
            }
        }
    };
    inspect(source);
    if (!needsRepair) { normalizedDocuments.set(source, source); return source; }

    const used = new Set<string>(), usedColumns = new Set<string>();
    const identity = (id: unknown, seen: Set<string>, taken: Set<string>) => {
        if (validId(id) && !seen.has(id)) { seen.add(id); return id; }
        let replacement: string;
        do { replacement = crypto.randomUUID(); } while (taken.has(replacement));
        seen.add(replacement); taken.add(replacement);
        return replacement;
    };
    const repair = (blocks: Block[]): Block[] => {
        let changed = false;
        const next = blocks.map(block => {
            if (!block || typeof block !== 'object') return block;
            const id = identity(block.id, used, reserved);
            const metadata = block.metadata;
            let updated = metadata;
            const patch = (key: keyof BlockMetadata, value: unknown) => { updated = { ...updated, [key]: value }; };
            if (metadata) {
                for (const key of childKeys) {
                    const children = metadata[key];
                    if (!Array.isArray(children)) continue;
                    const content = repair(children as Block[]);
                    if (content !== children) patch(key, content);
                }
                if (Array.isArray(metadata.columns)) {
                    const columns = metadata.columns.map(column => {
                        if (!column || typeof column !== 'object') return column;
                        const columnId = identity(column.id, usedColumns, reservedColumns);
                        const content = Array.isArray(column.content) ? repair(column.content) : column.content;
                        const legacy = (column as unknown as { blocks?: Block[] }).blocks;
                        const legacyBlocks = Array.isArray(legacy) ? repair(legacy) : legacy;
                        return columnId === column.id && content === column.content && legacy === legacyBlocks ? column
                            : { ...column, id: columnId, content, ...(legacy !== legacyBlocks ? { blocks: legacyBlocks } : {}) };
                    });
                    if (columns.some((column, index) => column !== metadata.columns![index])) patch('columns', columns);
                }
            }
            if (id === block.id && updated === metadata) return block;
            changed = true;
            return { ...block, id, ...(updated !== metadata ? { metadata: updated } : {}) };
        });
        return changed ? next : blocks;
    };
    const result = repair(source);
    normalizedDocuments.set(source, result);
    normalizedDocuments.set(result, result);
    return result;
}
