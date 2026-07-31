/**
 * mountScheduler
 * ---------------------------------------------------------------------------
 * Spreads expensive card-body mounts across frames instead of doing them all in
 * the tick where the cards became visible.
 *
 * Opening a dense canvas reveals dozens of cards at once. Mounting every block
 * editor in that one tick is a single multi-second task during which the tab
 * cannot paint, scroll or respond — the work is not wasted, it is just all
 * charged to one frame. Draining a small budget per frame turns that freeze
 * into a progressive fill: the same total work, but the canvas stays
 * interactive and cards appear as they are ready.
 */

type Job = () => void;

/** Snapshot of the current burst, for the canvas-level progress overlay. */
export interface MountQueueState {
    /** Jobs still waiting. */
    pending: number;
    /** Jobs enqueued since the queue was last empty. */
    total: number;
}

const queue: Job[] = [];
const cancelled = new WeakSet<object>();
let running = false;
/** Reset whenever the queue drains, so `total` describes one burst of work. */
let burstTotal = 0;

const listeners = new Set<(state: MountQueueState) => void>();
let snapshot: MountQueueState = { pending: 0, total: 0 };

const publish = () => {
    const next = { pending: queue.length, total: burstTotal };
    if (next.pending === snapshot.pending && next.total === snapshot.total) return;
    snapshot = next;
    listeners.forEach((l) => l(snapshot));
};

/** How long the queue must stay empty before the current burst is considered over. */
const BURST_IDLE_MS = 300;
let burstResetTimer: number | undefined;

const scheduleBurstReset = () => {
    if (burstResetTimer !== undefined) clearTimeout(burstResetTimer);
    burstResetTimer = setTimeout(() => {
        burstResetTimer = undefined;
        if (queue.length > 0) return;
        burstTotal = 0;
        publish();
    }, BURST_IDLE_MS) as unknown as number;
};

/** Current queue state. Stable identity between changes, safe for useSyncExternalStore. */
export const getMountQueueState = (): MountQueueState => snapshot;

export function subscribeMountQueue(listener: (state: MountQueueState) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Cards released at a time.
 *
 * Deliberately a count, not a time budget: a job only *schedules* a React state
 * update, so it returns in microseconds and the real mount cost lands later in
 * the commit. A time budget therefore drains the whole queue in one frame and
 * React batches every mount back into a single render — exactly the freeze this
 * is meant to avoid.
 */
const CARDS_PER_RELEASE = 1;

/**
 * A released card has not reported back yet.
 *
 * Frames alone are not a safe pacing signal. Releasing a job only *schedules* a
 * React update; React is free to defer the commit, so on a big canvas — where
 * each render is heavy — several more frames fire and release several more
 * cards before the first one has committed. React then batches the lot into one
 * render, and the pacing silently collapses back into a single multi-second
 * task. Measured on identical layouts: 60 nodes stayed chunked at a 957ms worst
 * task, 1000 nodes collapsed into one 26.8s task.
 *
 * So the next card waits for the previous one to actually commit, not merely
 * for the next frame.
 */
let awaitingCommit = false;

/** Release anyway if a card never reports (unmounted mid-flight, cancelled). */
const COMMIT_TIMEOUT_MS = 400;
let commitTimeout: number | undefined;

const clearCommitWait = () => {
    awaitingCommit = false;
    if (commitTimeout !== undefined) {
        clearTimeout(commitTimeout);
        commitTimeout = undefined;
    }
};

/**
 * Called by a consumer once its mount has committed, freeing the next release.
 * Safe to call spuriously.
 */
export function notifyMountCommitted(): void {
    if (!awaitingCommit) return;
    clearCommitWait();
    if (queue.length > 0 && !running) {
        running = true;
        requestAnimationFrame(drain);
    }
}

const drain = () => {
    if (awaitingCommit) {
        // Still waiting on the previous card; check again next frame.
        requestAnimationFrame(drain);
        return;
    }

    for (let i = 0; i < CARDS_PER_RELEASE && queue.length > 0; i++) {
        queue.shift()?.();
        awaitingCommit = true;
        commitTimeout = setTimeout(() => {
            commitTimeout = undefined;
            awaitingCommit = false;
        }, COMMIT_TIMEOUT_MS) as unknown as number;
    }

    if (queue.length > 0) {
        publish();
        requestAnimationFrame(drain);
    } else {
        running = false;
        /* Do not reset the burst the moment the queue empties. Cards arrive in a
           trickle — React commits a few, the queue drains, more arrive — so an
           immediate reset made `total` restart from zero every few frames and a
           wave of two hundred cards never looked like more than a couple. The
           burst ends only after the work has genuinely stopped. */
        scheduleBurstReset();
        publish();
    }
};

/**
 * Run `job` on a future frame, subject to the shared budget.
 * Returns a cancel function for elements that scroll away before their turn.
 */
export function scheduleMount(job: Job): () => void {
    const token = {};
    const wrapped: Job = () => {
        if (cancelled.has(token)) return;
        job();
    };
    queue.push(wrapped);
    burstTotal++;
    if (burstResetTimer !== undefined) {
        clearTimeout(burstResetTimer);
        burstResetTimer = undefined;
    }
    if (!running) {
        running = true;
        requestAnimationFrame(drain);
    }
    publish();
    return () => { cancelled.add(token); };
}
