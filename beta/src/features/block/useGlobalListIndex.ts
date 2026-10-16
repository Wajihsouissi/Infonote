import { useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { AppNode } from '../../types';

/** Blocks within this many px of each other horizontally form one column. */
const COLUMN_TOLERANCE_PX = 50;

const isNumberedBlock = (n: AppNode) => {
    const content = n.type === 'block' ? n.data.content : undefined;
    return Array.isArray(content) && content.length === 1 && content[0].type === 'numbered';
};

/**
 * The number a standalone numbered block shows. Numbered blocks stacked in a
 * column read as one list, so each counts the unbroken run of numbered blocks
 * directly above it. `undefined` for anything that is not a numbered block.
 */
export function useGlobalListIndex(nodeId: string, isSingleNumbered: boolean): number | undefined {
    return useStore(useCallback((state) => {
        if (!isSingleNumbered) return undefined;

        const node = getNodeById(state.nodes, nodeId);
        if (!node || node.type !== 'block' || !node.data.isStandaloneBlock) return undefined;

        const column = state.nodes
            .filter((n) => n.type === 'block'
                && n.data.isStandaloneBlock
                && Math.abs(n.position.x - node.position.x) < COLUMN_TOLERANCE_PX)
            .sort((a, b) => a.position.y - b.position.y);

        const own = column.findIndex((n) => n.id === nodeId);
        if (own === -1) return 1;

        let count = 1;
        for (let i = own - 1; i >= 0 && isNumberedBlock(column[i]); i--) count++;
        return count;
    }, [nodeId, isSingleNumbered]));
}
