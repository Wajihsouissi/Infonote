import type { Block, BlockDropPosition, BlockMetadata } from '../types';

/** A toggle travels with its descendants, including its collapsed body. */
export function blocksForDrag(blocks: Block[], selected: ReadonlySet<string>): Block[] {
    const ids = new Set(selected);
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!ids.has(block.id) || block.type !== 'toggle') continue;
        for (let j = i + 1; j < blocks.length && (blocks[j].indent ?? 0) > (block.indent ?? 0); j++) ids.add(blocks[j].id);
    }
    return blocks.filter(block => ids.has(block.id));
}

/** One stable insertion for a single block or an ordered selection. */
export function reorderBlocks(blocks: Block[], moving: Block[], targetId: string, position: BlockDropPosition): Block[] {
    const ids = new Set(moving.map(block => block.id));
    if (!moving.length || ids.has(targetId)) return blocks;
    const targetIndex = blocks.findIndex(block => block.id === targetId);
    if (targetIndex < 0) return blocks; // A stale target must never consume a source.
    const target = blocks[targetIndex];
    let index = targetIndex + (position === 'bottom' ? 1 : 0);
    const entersToggle = target.type === 'toggle' && !target.metadata?.isCollapsed && position === 'bottom';
    if (target.type === 'toggle' && target.metadata?.isCollapsed && position === 'bottom') {
        while (index < blocks.length && (blocks[index].indent ?? 0) > (target.indent ?? 0)) index++;
    }
    const depth = (target.indent ?? 0) + (entersToggle ? 1 : 0);
    const baseDepth = moving[0].indent ?? 0;
    const inserted = moving.map(block => {
        const indent = Math.max(0, depth + (block.indent ?? 0) - baseDepth);
        return indent === (block.indent ?? 0) ? block : { ...block, indent };
    });
    const insertion = blocks.slice(0, index).filter(block => !ids.has(block.id)).length;
    const retained = blocks.filter(block => !ids.has(block.id));
    const next = retained.slice(0,insertion).concat(inserted,retained.slice(insertion));
    return next.length === blocks.length && next.every((block, i) => block === blocks[i]) ? blocks : next;
}

export function moveBlocksByOne(blocks: Block[], id: string, selected: ReadonlySet<string>, direction: -1 | 1): Block[] {
    const moving = blocksForDrag(blocks,selected.has(id) ? selected : new Set([id]));
    const ids = new Set(moving.map(block=>block.id));
    const indexes = blocks.flatMap((block,index)=>ids.has(block.id)?[index]:[]);
    if (!indexes.length) return blocks;
    const target = blocks[(direction < 0 ? indexes[0] : indexes[indexes.length-1])+direction];
    return target ? reorderBlocks(blocks,moving,target.id,direction < 0 ? 'top' : 'bottom') : blocks;
}

/** Client coordinates already include the canvas zoom. */
export function blockDropPosition(y: number, box: { top: number; height: number }, canMerge = false): BlockDropPosition {
    const relative = y - box.top;
    if (canMerge && relative >= box.height * 0.2 && relative <= box.height * 0.8) return 'center';
    return relative < box.height / 2 ? 'top' : 'bottom';
}

function mapChildren(block: Block, visit: (blocks: Block[]) => Block[]): Block {
    const metadata = block.metadata;
    if (!metadata) return block;
    let next = metadata;
    const patch = (key: keyof BlockMetadata, value: unknown) => { next = { ...next, [key]: value }; };
    for (const key of ['blocks','content','items'] as const) {
        const children = metadata[key];
        if (!Array.isArray(children)) continue;
        const updated = visit(children as Block[]);
        if (updated !== children) patch(key, updated);
    }
    if (metadata.columns) {
        const columns = metadata.columns.map(column => {
            const content = visit(column.content);
            return content === column.content ? column : { ...column, content };
        });
        if (columns.some((column,i)=>column!==metadata.columns![i])) patch('columns',columns);
    }
    return next === metadata ? block : { ...block, metadata: next };
}

export function removeBlockIdsDeep(blocks: Block[], ids: ReadonlySet<string>): Block[] {
    const next = blocks.filter(block => !ids.has(block.id)).map(block => mapChildren(block, children => removeBlockIdsDeep(children, ids)));
    return next.length === blocks.length && next.every((block,i)=>block===blocks[i]) ? blocks : next;
}

/** Moving between nested editors in one note is one root-document write.
 * Publishing an inserted duplicate before removing its nested source lets ID
 * repair rename the source and loses the move when the child publishes back. */
export function transferWithinDocument(root: Block[], moving: Block[], targetId: string, position: BlockDropPosition): Block[] {
    const contains = (blocks: Block[]): boolean => blocks.some(block => {
        if (block.id === targetId) return true;
        let found = false;
        mapChildren(block, children => { found ||= contains(children); return children; });
        return found;
    });
    if (!moving.length || contains(moving) || !contains(root)) return root;
    const ids = new Set(moving.map(block=>block.id));
    const without = removeBlockIdsDeep(root, ids);
    const insert = (blocks: Block[]): Block[] => {
        if (blocks.some(block=>block.id===targetId)) return reorderBlocks(blocks,moving,targetId,position);
        const next = blocks.map(block=>mapChildren(block,insert));
        return next.every((block,i)=>block===blocks[i]) ? blocks : next;
    };
    return insert(without);
}
