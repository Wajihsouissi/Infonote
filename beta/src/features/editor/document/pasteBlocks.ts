import type { Block } from '../types';

/** Keep the pasted branch's relative depths, rooted in its destination. */
export function rebasePastedBlocks(blocks: Block[], targetIndent: number): Block[] {
    if (!blocks.length) return blocks;
    const minimum = blocks.reduce((depth,block)=>Math.min(depth,block.indent||0),Infinity);
    const delta = targetIndent-minimum;
    return delta === 0 ? blocks : blocks.map(block=>({...block,indent:(block.indent||0)+delta}));
}
