let pending: { blockId: string; expires: number } | null = null;

/** Direct typing intent takes precedence over deferred background mounts. */
export function requestBlockFocus(blockId: string): void {
    pending = { blockId, expires: performance.now() + 3000 };
}

export function hasBlockFocusRequest(blockIds: string[]): boolean {
    if (pending && performance.now() > pending.expires) pending = null;
    return pending !== null && blockIds.includes(pending.blockId);
}

export function takeBlockFocusRequest(blockIds: string[]): string | null {
    if (!hasBlockFocusRequest(blockIds) || !pending) return null;
    const id = pending.blockId;
    pending = null;
    return id;
}
