import type { Block } from '../types';

/** Stored block data is JSON-shaped. Identity makes the normal path cheap. */
function equalValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
        && keys.every(key => Object.hasOwn(right, key) && equalValue(left[key], right[key]));
}

export function sameDocument(a: Block[], b: Block[]): boolean {
    return a === b || (a.length === b.length && a.every((block, i) => equalValue(block, b[i])));
}

/** Independent field changes combine; a same-field conflict keeps local work.
 * Nested metadata is merged by key, without rewriting unrelated block data. */
function mergeValue(base: unknown, local: unknown, incoming: unknown): unknown {
    if (equalValue(local, base)) return incoming;
    if (equalValue(incoming, base) || equalValue(local, incoming)) return local;
    if (base && local && incoming && typeof base === 'object' && typeof local === 'object'
        && typeof incoming === 'object' && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(incoming)) {
        const b = base as Record<string, unknown>, l = local as Record<string, unknown>, r = incoming as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
            const localDeleted = Object.hasOwn(b, key) && !Object.hasOwn(l, key);
            const incomingDeleted = Object.hasOwn(b, key) && !Object.hasOwn(r, key);
            if (localDeleted || incomingDeleted) continue;
            const value = mergeValue(b[key], l[key], r[key]);
            if (value !== undefined) result[key] = value;
        }
        return equalValue(result, local) ? local : equalValue(result, incoming) ? incoming : result;
    }
    return local;
}

/** Insert missing IDs before their next surviving neighbour, in one pass. */
function orderedBlocks(primary: Block[], secondary: Block[], available: Map<string, Block>): Block[] {
    const primaryIds = new Set(primary.filter(block => available.has(block.id)).map(block => block.id));
    const before = new Map<string | null, string[]>();
    let anchor: string | null = null;
    for (let i = secondary.length - 1; i >= 0; i--) {
        const id = secondary[i].id;
        if (primaryIds.has(id)) { anchor = id; continue; }
        if (!available.has(id)) continue;
        const bucket = before.get(anchor) ?? [];
        bucket.push(id);
        before.set(anchor, bucket);
    }
    const result: Block[] = [];
    const appendBefore = (id: string | null) => {
        const bucket = before.get(id);
        if (bucket) for (let i = bucket.length - 1; i >= 0; i--) result.push(available.get(bucket[i])!);
    };
    for (const block of primary) {
        if (!available.has(block.id)) continue;
        appendBefore(block.id);
        result.push(available.get(block.id)!);
    }
    appendBefore(null);
    return result;
}

/** Three-way merge against the last owner snapshot, during pending typing.
 * Known deletions win on either side; only genuinely new local IDs survive an
 * incoming absence. Local reorders win conflicting reorders, while additions
 * retain their next surviving neighbour. This is a single-owner merge, not a
 * multi-user collaboration protocol. */
export function mergePendingDocument(base: Block[], local: Block[], incoming: Block[]): Block[] {
    const original = new Map(base.map(block => [block.id, block]));
    const left = new Map(local.map(block => [block.id, block]));
    const right = new Map(incoming.map(block => [block.id, block]));
    const merged = new Map<string, Block>();
    for (const block of incoming) {
        const prior = original.get(block.id), mine = left.get(block.id);
        if (prior && !mine) continue; // locally deleted, not an old owner echo
        merged.set(block.id, prior && mine ? mergeValue(prior, mine, block) as Block : mine ?? block);
    }
    for (const block of local) {
        if (!original.has(block.id) && !right.has(block.id)) merged.set(block.id, block);
    }
    const localKnownOrder = local.filter(block => original.has(block.id));
    const expectedOrder = base.filter(block => left.has(block.id));
    const reordered = localKnownOrder.some((block, i) => block.id !== expectedOrder[i]?.id);
    const result = reordered ? orderedBlocks(local, incoming, merged) : orderedBlocks(incoming, local, merged);
    return sameDocument(local, result) ? local : result;
}
