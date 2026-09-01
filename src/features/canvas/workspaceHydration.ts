/**
 * workspaceHydration — session-scoped registry for the cloud canvas load.
 *
 * Two jobs, both about showing the blocking loader honestly:
 *
 *  1. Remember which workspaces have already been hydrated in this browser
 *     session. The blocking overlay belongs to a genuine first open; a
 *     remount, a workspace revisit or a tab regaining focus must refresh
 *     quietly in the background instead of throwing a scrim over a canvas the
 *     user is already looking at.
 *
 *  2. De-duplicate concurrent loads of the same workspace. React's Strict Mode
 *     tears an effect down and immediately re-runs it; without a shared
 *     in-flight entry the second run either fires a redundant request or
 *     skips the load entirely because the first run's request was cancelled.
 *
 * State lives at module scope on purpose: it has to outlive the component that
 * triggers the load, which is exactly what a `useRef` cannot do.
 */
import type { CloudLoadProgress, CloudLoadProgressFn, CloudLoadResult } from '../../services/cloudSync';

interface InFlightLoad {
    promise: Promise<CloudLoadResult>;
    /** Latest progress, replayed to subscribers that arrive mid-request. */
    progress: CloudLoadProgress;
    listeners: Set<CloudLoadProgressFn>;
}

const hydrated = new Set<string>();
const inFlight = new Map<string, InFlightLoad>();

/** True once this workspace has completed a successful load in this session. */
export function hasHydrated(key: string): boolean {
    return hydrated.has(key);
}

/**
 * Run (or join) the load for `key`. A second caller while the first is still
 * in flight gets the same promise and is subscribed to the same progress
 * stream, with the current stage replayed immediately so its bar starts where
 * the request actually is rather than back at zero.
 */
export function loadWorkspaceOnce(
    key: string,
    run: (onProgress: CloudLoadProgressFn) => Promise<CloudLoadResult>,
    onProgress?: CloudLoadProgressFn,
): Promise<CloudLoadResult> {
    const existing = inFlight.get(key);
    if (existing) {
        if (onProgress) {
            existing.listeners.add(onProgress);
            onProgress(existing.progress);
        }
        return existing.promise;
    }

    const entry: InFlightLoad = {
        // Assigned immediately below; `run` cannot observe this field.
        promise: null as unknown as Promise<CloudLoadResult>,
        progress: { stage: 'authorizing', value: 0 },
        listeners: new Set(onProgress ? [onProgress] : []),
    };

    const emit: CloudLoadProgressFn = (progress) => {
        entry.progress = progress;
        entry.listeners.forEach((listener) => listener(progress));
    };

    entry.promise = run(emit)
        .then((result) => {
            // Only a success counts as hydrated — a failed load must be free to
            // show the full-fidelity loader again on the next attempt.
            if (result.ok) hydrated.add(key);
            return result;
        })
        .finally(() => {
            inFlight.delete(key);
            entry.listeners.clear();
        });

    inFlight.set(key, entry);
    return entry.promise;
}

/** Drop a progress subscription when its component goes away. */
export function unsubscribeWorkspaceProgress(key: string, listener: CloudLoadProgressFn): void {
    inFlight.get(key)?.listeners.delete(listener);
}

/** Forget a workspace so its next load is treated as a first open again. */
export function forgetWorkspace(key: string): void {
    hydrated.delete(key);
}
