import type { Block } from '../types';

/** Lightweight reader actions use the same immutable document boundary. */
export function patchReadingBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
    let changed = false;
    const next = blocks.map(block => {
        if (block.id === id) { changed = true; return { ...block, ...patch }; }
        const metadata = block.metadata;
        if (!metadata) return block;
        let updated = metadata;
        for (const key of ['blocks', 'content'] as const) {
            const children = metadata[key];
            if (!Array.isArray(children)) continue;
            const childBlocks = patchReadingBlock(children as Block[], id, patch);
            if (childBlocks !== children) updated = { ...updated, [key]: childBlocks };
        }
        if (metadata.columns) {
            const columns = metadata.columns.map(column => {
                const legacy = (column as unknown as { blocks?: Block[] }).blocks;
                const source = Array.isArray(column.content) ? column.content : Array.isArray(legacy) ? legacy : [];
                const content = patchReadingBlock(source, id, patch);
                return content === source ? column : { ...column, content };
            });
            if (columns.some((column, i) => column !== metadata.columns![i])) updated = { ...updated, columns };
        }
        if (updated === metadata) return block;
        changed = true;
        return { ...block, metadata: updated };
    });
    return changed ? next : blocks;
}
