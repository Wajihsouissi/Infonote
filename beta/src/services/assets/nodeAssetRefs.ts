import type { AppNode } from '../../types';
import { collectAssetIds, parseAssetRef } from './assetRef';

/** Asset references in persistence order: block tree, then cover and icon.
 * Storage adapters retain their own caching and missing-file policies. */
export function collectNodeAssetIds(node: AppNode, into: Set<string> = new Set()): Set<string> {
    const data = node.data as { content?: unknown; coverImage?: unknown; icon?: unknown };
    collectAssetIds(data.content, into);
    for (const value of [data.coverImage, data.icon]) {
        const id = parseAssetRef(value);
        if (id) into.add(id);
    }
    return into;
}
