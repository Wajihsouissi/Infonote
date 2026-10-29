import type { Block } from '../types';

/** A canvas root keeps its toggle descendants in the same node. */
export function groupCanvasRoots(blocks: Block[]): Block[][] {
    const groups: Block[][] = [];
    let rootIndent = 0;
    for (const block of blocks) {
        const indent = block.indent ?? 0;
        if (!groups.length || indent <= rootIndent) {
            rootIndent = indent;
            groups.push([{ ...block, indent: 0 }]);
        } else groups.at(-1)!.push({ ...block, indent: indent - rootIndent });
    }
    return groups;
}
