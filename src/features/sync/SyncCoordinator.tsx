import { useEffect, useLayoutEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../../types';
import { useStore } from '../../store/useStore';
import { historyEquality, nodesEquivalent, edgesEquivalent } from '../../store/historyConfig';
import {
    loadLocalWorkspace,
    resolveLocalWorkspaceKey,
    saveLocalWorkspace,
    type LocalWorkspaceRecord,
} from '../../services/storage/LocalWorkspaceStore';
import {
    readStorageMode,
    subscribeStorageMode,
    type StorageMode,
} from '../../services/storage/storagePreference';
import {
    createCloudVersion,
    dailyVersionKey,
    fetchCloudRevision,
    loadCanvasFromCloud,
    saveCanvasToCloud,
    type CloudSyncResult,
} from '../../services/cloudSync';
import { isSupabaseConfigured, supabase } from '../../services/supabase/client';
import {
    registerWorkspaceSyncHandler,
    type WorkspaceSyncRequest,
} from '../../services/syncController';
import {
    configureAssetRemoteFetch,
    uploadReferencedAssets,
} from '../../services/assets/assetSync';
import { getAutoReconnectPromise } from '../../services/StorageManager';

const LOCAL_SAVE_DELAY_MS = 350;
const CLOUD_SAVE_DELAY_MS = 1200;
const CLOUD_SESSION_PREFIX = 'infonote.cloud-session.v1:';

/**
 * React can remount the app shell, and the browser can refresh the document,
 * without ending the current tab session. Keep the last acknowledged revision
 * outside the component and mirror it to sessionStorage so neither case can
 * turn into a second full graph download. IndexedDB remains the durable source
 * across app sessions; this cache only closes the same-session gap.
 */
const sessionCloudState = new Map<string, { hydrated: true; revision: string | null }>();
let liveWorkspaceKey: string | null = null;

function readSessionCloudState(key: string): { hydrated: true; revision: string | null } | undefined {
    const cached = sessionCloudState.get(key);
    if (cached) return cached;
    try {
        const raw = sessionStorage.getItem(`${CLOUD_SESSION_PREFIX}${key}`);
        if (!raw) return undefined;
        const value = JSON.parse(raw) as { hydrated?: unknown; revision?: unknown };
        if (value.hydrated !== true || (value.revision !== null && typeof value.revision !== 'string')) {
            return undefined;
        }
        const normalized = { hydrated: true as const, revision: value.revision as string | null };
        sessionCloudState.set(key, normalized);
        return normalized;
    } catch {
        return undefined;
    }
}

function writeSessionCloudState(key: string, revision: string | null): void {
    const next = { hydrated: true as const, revision };
    sessionCloudState.set(key, next);
    try {
        sessionStorage.setItem(`${CLOUD_SESSION_PREFIX}${key}`, JSON.stringify(next));
    } catch {
        // IndexedDB still carries the durable marker when session storage is
        // unavailable (for example in a hardened private browsing context).
    }
}

const hasPending = (record: Pick<LocalWorkspaceRecord,
    'dirtyNodeIds' | 'dirtyEdgeIds' | 'deletedNodeIds' | 'deletedEdgeIds'>): boolean =>
    record.dirtyNodeIds.length > 0 || record.dirtyEdgeIds.length > 0 ||
    record.deletedNodeIds.length > 0 || record.deletedEdgeIds.length > 0;

const appendLocalCopyLabel = (node: AppNode): AppNode => {
    const data = { ...(node.data as Record<string, unknown>) };
    for (const key of ['label', 'title', 'name'] as const) {
        if (typeof data[key] === 'string' && data[key].trim()) {
            data[key] = `${data[key]} (local copy)`;
            return { ...node, data } as AppNode;
        }
    }
    return { ...node, data } as AppNode;
};

const equal = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
};

/**
 * First connection is deliberately non-destructive. If both the device and
 * cloud contain different entities with the same id, keep the cloud entity at
 * its stable id and add the device entity as an explicit local copy.
 */
function mergeFirstConnection(
    remoteNodes: AppNode[],
    remoteEdges: Edge[],
    localNodes: AppNode[],
    localEdges: Edge[],
): { nodes: AppNode[]; edges: Edge[]; dirtyNodeIds: string[]; dirtyEdgeIds: string[] } {
    const remoteNodeById = new Map(remoteNodes.map((node) => [node.id, node]));
    const remoteEdgeById = new Map(remoteEdges.map((edge) => [edge.id, edge]));
    const remappedNodeIds = new Map<string, string>();

    for (const node of localNodes) {
        const remote = remoteNodeById.get(node.id);
        if (remote && !equal(remote, node)) remappedNodeIds.set(node.id, uuidv4());
    }

    // If a colliding parent becomes a local copy, preserve its whole local
    // branch. A child whose remote twin was byte-for-byte equal still needs a
    // copied id, otherwise it remains attached only to the cloud parent.
    let foundDescendant = true;
    while (foundDescendant) {
        foundDescendant = false;
        for (const node of localNodes) {
            if (
                node.parentId && remappedNodeIds.has(node.parentId) &&
                remoteNodeById.has(node.id) && !remappedNodeIds.has(node.id)
            ) {
                remappedNodeIds.set(node.id, uuidv4());
                foundDescendant = true;
            }
        }
    }

    const additions: AppNode[] = [];
    for (const node of localNodes) {
        const remote = remoteNodeById.get(node.id);
        const id = remappedNodeIds.get(node.id) ?? node.id;
        const parentId = node.parentId ? (remappedNodeIds.get(node.parentId) ?? node.parentId) : undefined;
        const next = { ...node, id, parentId } as AppNode;
        if (id === node.id && remote && equal(remote, next)) continue;
        additions.push(id === node.id ? next : appendLocalCopyLabel(next));
    }

    const edgeAdditions: Edge[] = [];
    for (const edge of localEdges) {
        const remapped: Edge = {
            ...edge,
            id: edge.id,
            source: remappedNodeIds.get(edge.source) ?? edge.source,
            target: remappedNodeIds.get(edge.target) ?? edge.target,
        };
        const remote = remoteEdgeById.get(edge.id);
        if (remote && equal(remote, remapped)) continue;
        if (remote) remapped.id = uuidv4();
        edgeAdditions.push(remapped);
    }

    return {
        nodes: [...remoteNodes, ...additions],
        edges: [...remoteEdges, ...edgeAdditions],
        dirtyNodeIds: additions.map((node) => node.id),
        dirtyEdgeIds: edgeAdditions.map((edge) => edge.id),
    };
}

/** Apply only the device's pending operations on top of a newer cloud copy. */
function mergeRemoteWithPending(
    remoteNodes: AppNode[],
    remoteEdges: Edge[],
    localNodes: AppNode[],
    localEdges: Edge[],
    tracking: Pick<LocalWorkspaceRecord,
        'dirtyNodeIds' | 'dirtyEdgeIds' | 'deletedNodeIds' | 'deletedEdgeIds'>,
): { nodes: AppNode[]; edges: Edge[] } {
    const nodes = new Map(remoteNodes.map((node) => [node.id, node]));
    const edges = new Map(remoteEdges.map((edge) => [edge.id, edge]));
    const localNodeById = new Map(localNodes.map((node) => [node.id, node]));
    const localEdgeById = new Map(localEdges.map((edge) => [edge.id, edge]));

    tracking.deletedNodeIds.forEach((id) => nodes.delete(id));
    tracking.deletedEdgeIds.forEach((id) => edges.delete(id));
    tracking.dirtyNodeIds.forEach((id) => {
        const node = localNodeById.get(id);
        if (node) nodes.set(id, node);
    });
    tracking.dirtyEdgeIds.forEach((id) => {
        const edge = localEdgeById.get(id);
        if (edge) edges.set(id, edge);
    });

    return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}

const timeLabel = (time = Date.now()): string => new Date(time).toLocaleTimeString();

/**
 * Describe files the cloud could not take, for a canvas that synced anyway.
 * Returns null when everything was mirrored, so it can be handed straight to
 * `setCloudError` as the post-save state.
 */
function describeUnmirroredAssets(result: {
    skippedTooLarge: string[];
    errors: string[];
}): string | null {
    const parts: string[] = [];
    if (result.skippedTooLarge.length > 0) {
        parts.push(
            `${result.skippedTooLarge.length} file(s) are above the 25 MB cloud limit and stay on this device: ${result.skippedTooLarge.slice(0, 3).join(', ')}`,
        );
    }
    if (result.errors.length > 0) {
        // The underlying errors are already sentences; strip their full stop so
        // the assembled notice does not end in "..".
        const reason = result.errors[0].replace(/\.\s*$/, '');
        parts.push(`${result.errors.length} file(s) could not be uploaded: ${reason}`);
    }
    if (parts.length === 0) return null;
    return `Canvas synced. ${parts.join('. ')}.`;
}

/**
 * One coordinator for the whole app. It is mounted above all routes, so opening
 * or closing CanvasBoard never starts a load. The first cloud hydration is
 * remembered in IndexedDB; subsequent launches fetch one revision counter and
 * download the graph only when that counter changed.
 */
export function SyncCoordinator(): null {
    const userId = useStore((state) => state.auth.userId);
    const workspaceId = useStore((state) => state.auth.activeWorkspaceId);
    const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
    const isAuthLoading = useStore((state) => state.auth.isAuthLoading);
    const [mode, setMode] = useState<StorageMode | null>(() => readStorageMode(userId));

    useEffect(() => {
        setMode(readStorageMode(userId));
    }, [userId]);

    useEffect(() => subscribeStorageMode(setMode), []);

    // Asset components resolve their references from passive effects. Install
    // the workspace-scoped downloader in the preceding layout phase so a
    // first render on a new device cannot cache a false "missing" result.
    useLayoutEffect(() => {
        configureAssetRemoteFetch(
            mode === 'sync' && isAuthenticated && workspaceId ? workspaceId : null,
        );
        return () => configureAssetRemoteFetch(null);
    }, [isAuthenticated, mode, workspaceId]);

    useEffect(() => {
        if (isAuthLoading || (isAuthenticated && (!userId || !workspaceId))) return;

        const key = resolveLocalWorkspaceKey(workspaceId);
        const cloudSessionKey = userId && workspaceId ? `${userId}:${workspaceId}` : null;
        let cancelled = false;
        let graphSubscription: (() => void) | null = null;
        let dragSubscription: (() => void) | null = null;
        let localTimer: number | null = null;
        let localMaxTimer: number | null = null;
        let localGeneration = 0;
        let cloudTimer: number | null = null;
        let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
        let unregisterSyncHandler: (() => void) | null = null;
        let writeChain: Promise<void> = Promise.resolve();
        let syncChain: Promise<CloudSyncResult> = Promise.resolve({ ok: true, counts: { nodes: 0, edges: 0 } });
        let queuedAutomaticSync: Promise<CloudSyncResult> | null = null;
        let consecutiveSyncFailures = 0;
        let record: LocalWorkspaceRecord = {
            key,
            nodes: [],
            edges: [],
            dirtyNodeIds: [],
            dirtyEdgeIds: [],
            deletedNodeIds: [],
            deletedEdgeIds: [],
            cloudRevision: null,
            cloudHydrated: false,
            updatedAt: Date.now(),
            lastSyncedAt: null,
            lastDailyVersionKey: null,
        };
        let latestSafeRecord: LocalWorkspaceRecord | null = null;
        /* Files the cloud could not take, from the last sync that actually
           wrote. A later no-op sync must restate it rather than clearing it:
           the canvas being up to date does not mean the attachment arrived. */
        let lastAssetNotice: string | null = null;

        const snapshotRecord = (): LocalWorkspaceRecord => {
            const state = useStore.getState();
            return {
                ...record,
                key,
                nodes: state.nodes,
                edges: state.edges,
                dirtyNodeIds: Array.from(state.storage.dirtyNodeIds),
                dirtyEdgeIds: Array.from(state.storage.dirtyEdgeIds),
                deletedNodeIds: Array.from(state.storage.deletedNodeIds),
                deletedEdgeIds: Array.from(state.storage.deletedEdgeIds),
                updatedAt: Date.now(),
            };
        };

        const ownsLiveGraph = (): boolean =>
            useStore.getState().auth.activeWorkspaceId === workspaceId;

        const persistLocal = async (): Promise<CloudSyncResult> => {
            if (cancelled || !ownsLiveGraph()) return { ok: false, error: 'The active workspace changed.' };
            if (localTimer) window.clearTimeout(localTimer);
            if (localMaxTimer) window.clearTimeout(localMaxTimer);
            localTimer = localMaxTimer = null;
            const generation = localGeneration;
            const next = snapshotRecord();
            record = next;
            latestSafeRecord = next;
            // A rejected transaction must not poison every later write.
            writeChain = writeChain.catch(() => undefined).then(() => saveLocalWorkspace(next));
            try {
                await writeChain;
                if (cancelled) return { ok: false, error: 'The active workspace changed.' };
                /* The IndexedDB write IS this device's durable copy, so it
                   settles local durability unconditionally. This used to defer
                   to the folder mirror whenever one was attached, leaving the
                   flag latched between the two saves — and permanently if the
                   folder ever failed, even though the work was already safe
                   here. A folder problem is reported as `localError`, which is
                   the honest channel for it. */
                const state = useStore.getState();
                state.setLocalLastSaved(timeLabel());
                if (generation === localGeneration) state.setLocalDirty(false);
                state.setLocalError(null);
                return { ok: true, counts: { nodes: next.nodes.length, edges: next.edges.length } };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!cancelled) {
                    useStore.getState().setLocalError(message);
                    useStore.getState().setLocalDirty(true);
                }
                return { ok: false, error: message };
            }
        };

        const scheduleLocalSave = () => {
            localGeneration++;
            if (localTimer) window.clearTimeout(localTimer);
            useStore.getState().setLocalDirty(true);
            localTimer = window.setTimeout(() => { void persistLocal(); }, LOCAL_SAVE_DELAY_MS);
            // Continuous typing must still reach disk, even without a pause.
            localMaxTimer ??= window.setTimeout(() => { void persistLocal(); }, 1500);
        };

        const rememberCloudState = (revision: string | null) => {
            if (cloudSessionKey) writeSessionCloudState(cloudSessionKey, revision);
        };

        const performCloudSync = async (request: WorkspaceSyncRequest = {}): Promise<CloudSyncResult> => {
            if (!isSupabaseConfigured || !isAuthenticated || !userId || !workspaceId) {
                return { ok: false, error: 'Sign in to sync this device with the cloud.' };
            }
            if (!navigator.onLine) {
                useStore.getState().setCloudError('Offline — your changes are saved on this device and will sync when you reconnect.');
                return { ok: false, error: 'Offline — changes are safely queued on this device.' };
            }

            const stateAtStart = useStore.getState();
            stateAtStart.setCloudError(null);

            const revisionResult = await fetchCloudRevision(userId, workspaceId);
            if (cancelled) return { ok: false, error: 'Sync stopped because the active workspace changed.' };
            if (!revisionResult.ok) {
                stateAtStart.setCloudError(revisionResult.error);
                return { ok: false, error: revisionResult.error };
            }
            const schemaMessage = !revisionResult.schemaAvailable
                ? 'Cloud sync needs database migration 0017. Local data is safe and queued; automatic cloud retries are paused.'
                : null;
            if (schemaMessage && record.cloudHydrated) {
                // The modern write path depends on the workspace-scoped keys
                // installed with the revision function. Retrying a large local
                // outbox against the legacy schema on every refresh is both
                // noisy and guaranteed not to establish a usable sync base.
                // Keep everything queued locally until the deployment is ready.
                stateAtStart.setCloudError(schemaMessage);
                await persistLocal();
                return { ok: false, error: schemaMessage };
            }

            const remoteRevision = revisionResult.revision;
            let working = snapshotRecord();
            const remembered = cloudSessionKey ? readSessionCloudState(cloudSessionKey) : undefined;
            const knownRevision = remembered ? remembered.revision : record.cloudRevision;
            const needsFirstHydration = !record.cloudHydrated && !remembered?.hydrated;
            const remoteChanged = revisionResult.schemaAvailable && remoteRevision !== knownRevision;

            if (needsFirstHydration || remoteChanged) {
                stateAtStart.setCloudLoad('background', { stage: 'authorizing', value: 0 });
                const remote = await loadCanvasFromCloud(
                    userId,
                    workspaceId,
                    (progress) => { if (!cancelled) useStore.getState().setCloudLoad('background', progress); },
                );
                if (cancelled) return { ok: false, error: 'Sync stopped because the active workspace changed.' };
                if (!remote.ok) {
                    stateAtStart.setCloudLoad('idle');
                    stateAtStart.setCloudError(remote.error);
                    return remote;
                }

                // Record the remote base before publishing the graph. The
                // graph subscription runs synchronously, so every snapshot it
                // captures from this point forward must already carry the
                // acknowledged revision.
                record = {
                    ...record,
                    cloudHydrated: true,
                    cloudRevision: remoteRevision,
                    lastSyncedAt: Date.now(),
                };

                const live = useStore.getState();
                // The download may take seconds. Merge the edits made during
                // that interval as well as those present before it started.
                working = snapshotRecord();
                if (needsFirstHydration && live.nodes.length > 0 && remote.nodes.length > 0) {
                    const merged = mergeFirstConnection(remote.nodes, remote.edges, live.nodes, live.edges);
                    live.loadGraph(merged.nodes, merged.edges);
                    live.replaceSyncTracking({
                        dirtyNodeIds: merged.dirtyNodeIds,
                        dirtyEdgeIds: merged.dirtyEdgeIds,
                        deletedNodeIds: [],
                        deletedEdgeIds: [],
                    });
                } else if (needsFirstHydration && live.nodes.length > 0 && remote.nodes.length === 0) {
                    live.markNodesDirty(live.nodes.map((node) => node.id));
                    live.markEdgesDirty(live.edges.map((edge) => edge.id));
                    live.setCloudDirty(true);
                } else if (hasPending(working)) {
                    const merged = mergeRemoteWithPending(
                        remote.nodes,
                        remote.edges,
                        live.nodes,
                        live.edges,
                        working,
                    );
                    live.loadGraph(merged.nodes, merged.edges);
                    live.replaceSyncTracking(working);
                } else {
                    live.loadGraph(remote.nodes, remote.edges);
                    live.replaceSyncTracking({
                        dirtyNodeIds: [], dirtyEdgeIds: [], deletedNodeIds: [], deletedEdgeIds: [],
                    });
                }

                live.setCloudLastLoaded(timeLabel());
                live.setCloudLoad('idle');
                working = snapshotRecord();

                // Make the hydration marker durable immediately. Uploading a
                // local merge can take much longer (especially with assets),
                // and refreshing during that upload must not download the
                // entire cloud graph again.
                await persistLocal();
                rememberCloudState(remoteRevision);
            }

            if (schemaMessage) {
                // A brand-new device is allowed one compatibility read so its
                // existing cloud canvas is not hidden. Writes remain paused:
                // without a revision counter the client cannot acknowledge a
                // stable base or safely decide whether a later pull is needed.
                useStore.getState().setCloudError(schemaMessage);
                return { ok: false, error: schemaMessage };
            }

            const current = useStore.getState();
            const dirtyNodeIds = new Set(current.storage.dirtyNodeIds);
            const dirtyEdgeIds = new Set(current.storage.dirtyEdgeIds);
            const deletedNodeIds = new Set(current.storage.deletedNodeIds);
            const deletedEdgeIds = new Set(current.storage.deletedEdgeIds);
            const shouldWrite = request.forceFull ||
                dirtyNodeIds.size > 0 || dirtyEdgeIds.size > 0 ||
                deletedNodeIds.size > 0 || deletedEdgeIds.size > 0;

            if (!shouldWrite) {
                record = { ...record, cloudHydrated: true, cloudRevision: remoteRevision, lastSyncedAt: Date.now() };
                current.setCloudError(lastAssetNotice);
                current.setCloudDirty(false);
                await persistLocal();
                rememberCloudState(remoteRevision);
                if (request.createManualVersion) {
                    const version = await createCloudVersion(userId, workspaceId, current.nodes, current.edges, 'manual');
                    if (!version.ok) {
                        current.setCloudError(version.error);
                        return version;
                    }
                }
                return { ok: true, counts: { nodes: 0, edges: 0 } };
            }

            const nodesSnapshot = current.nodes;
            const edgesSnapshot = current.edges;
            const assetResult = await uploadReferencedAssets(userId, workspaceId, nodesSnapshot);
            if (cancelled) return { ok: false, error: 'Sync stopped because the active workspace changed.' };
            // A file that cannot be mirrored is reported, never fatal. Blocking
            // the write meant one unreachable attachment held every card in the
            // workspace out of the cloud indefinitely, with no way for the user
            // to clear it — the graph is the document, and it syncs regardless.
            const assetNotice = describeUnmirroredAssets(assetResult);
            lastAssetNotice = assetNotice;
            const result = await saveCanvasToCloud(userId, workspaceId, nodesSnapshot, edgesSnapshot, {
                dirtyNodeIds,
                dirtyEdgeIds,
                deletedNodeIds,
                deletedEdgeIds,
                forceUpsertAll: request.forceFull || !record.cloudHydrated,
            });
            if (cancelled) return { ok: false, error: 'Sync stopped because the active workspace changed.' };
            if (!result.ok) {
                current.setCloudError(result.error);
                await persistLocal();
                return result;
            }

            // Acknowledgements belong to the uploaded values, not just their
            // IDs. The same card may have been edited again during the await.
            const liveAfterUpload = useStore.getState();
            const liveNodes = new Map(liveAfterUpload.nodes.map((node) => [node.id, node]));
            const liveEdges = new Map(liveAfterUpload.edges.map((edge) => [edge.id, edge]));
            const acknowledgedNodes = new Set(nodesSnapshot.filter((node) => {
                const live = liveNodes.get(node.id);
                return dirtyNodeIds.has(node.id) && live && nodesEquivalent(node, live);
            }).map((node) => node.id));
            const acknowledgedEdges = new Set(edgesSnapshot.filter((edge) => {
                const live = liveEdges.get(edge.id);
                return dirtyEdgeIds.has(edge.id) && live && edgesEquivalent(edge, live);
            }).map((edge) => edge.id));
            current.clearSyncTracking(
                acknowledgedNodes, acknowledgedEdges,
                new Set([...deletedNodeIds].filter((id) => !liveNodes.has(id))),
                new Set([...deletedEdgeIds].filter((id) => !liveEdges.has(id))),
            );
            current.setCloudLastSaved(timeLabel());
            current.setCloudError(assetNotice);

            const acknowledgedRevision = await fetchCloudRevision(userId, workspaceId);
            if (cancelled) return result;
            const nextRevision = acknowledgedRevision.ok && acknowledgedRevision.schemaAvailable
                ? acknowledgedRevision.revision
                : remoteRevision;
            /* The database keeps one daily safety copy per workspace and
               discards the rest — but only after receiving a full copy of the
               graph. Uploading one on every save therefore spent the entire
               workspace to have it thrown away (measured at ~86x the bytes of
               the edit that triggered it). Remember the day this device has
               already covered and skip the upload outright. */
            const dailyKey = dailyVersionKey();
            const needsDailyVersion = !request.createManualVersion && record.lastDailyVersionKey !== dailyKey;

            record = {
                ...record,
                cloudHydrated: true,
                cloudRevision: nextRevision,
                lastSyncedAt: Date.now(),
            };
            await persistLocal();
            rememberCloudState(nextRevision);

            if (request.createManualVersion) {
                const version = await createCloudVersion(userId, workspaceId, nodesSnapshot, edgesSnapshot, 'manual');
                if (!version.ok) {
                    current.setCloudError(`Canvas synced, but its restore point failed: ${version.error}`);
                    return version;
                }
            } else if (needsDailyVersion) {
                const version = await createCloudVersion(userId, workspaceId, nodesSnapshot, edgesSnapshot, 'daily');
                if (!cancelled && version.ok) {
                    record = { ...record, lastDailyVersionKey: dailyKey };
                    await persistLocal();
                } else if (!cancelled && !version.ok) {
                    current.setCloudError(`Canvas synced, but its daily backup failed: ${version.error}`);
                }
            }

            return result;
        };

        const enqueueSync = (request: WorkspaceSyncRequest = {}): Promise<CloudSyncResult> => {
            const automatic = !request.forceFull && !request.createManualVersion;
            if (automatic && queuedAutomaticSync) return queuedAutomaticSync;
            const run = syncChain.then(async (): Promise<CloudSyncResult> => {
                if (queuedAutomaticSync === run) queuedAutomaticSync = null;
                if (cancelled) return { ok: false, error: 'Sync stopped because the active workspace changed.' };
                useStore.getState().setCloudSyncing(true);
                try {
                    await persistLocal();
                    const result = await performCloudSync(request);
                    if (result.ok) consecutiveSyncFailures = 0;
                    else if (!cancelled && navigator.onLine && consecutiveSyncFailures < 3 &&
                        !/migration|sign in|authenticated|unauthorized|permission/i.test(result.error)) {
                        scheduleCloudSync(2000 * 2 ** consecutiveSyncFailures++);
                    }
                    return result;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (!cancelled) useStore.getState().setCloudError(message);
                    return { ok: false, error: message };
                } finally {
                    if (!cancelled) useStore.getState().setCloudSyncing(false);
                }
            });
            syncChain = run.catch(() => ({ ok: false, error: 'Background sync failed.' }));
            if (automatic) queuedAutomaticSync = run;
            return run;
        };

        const scheduleCloudSync = (delay = CLOUD_SAVE_DELAY_MS) => {
            if (mode !== 'sync' || !isAuthenticated || !userId || !workspaceId) return;
            if (cloudTimer) window.clearTimeout(cloudTimer);
            cloudTimer = window.setTimeout(() => { void enqueueSync(); }, delay);
        };

        const start = async () => {
            try {
                // The optional folder backend may contain a pre-IndexedDB
                // workspace from an older app version. Let that one startup
                // read settle first; an existing IndexedDB record still wins,
                // while a missing record safely adopts the folder graph.
                await getAutoReconnectPromise();
                if (cancelled) return;
                const stored = await loadLocalWorkspace(key);
                if (cancelled) return;
                if (stored) {
                    record = stored;
                    const remembered = cloudSessionKey ? readSessionCloudState(cloudSessionKey) : undefined;
                    if (remembered?.hydrated) {
                        record = {
                            ...record,
                            cloudHydrated: true,
                            cloudRevision: remembered.revision,
                        };
                    }
                    const state = useStore.getState();
                    state.loadGraph(stored.nodes, stored.edges);
                    state.replaceSyncTracking(stored);
                    if (!state.storage.isConnected) {
                        state.setLocalLastSaved(timeLabel(stored.updatedAt));
                        state.setLocalDirty(false);
                    }
                    if (stored.lastSyncedAt) state.setCloudLastLoaded(timeLabel(stored.lastSyncedAt));
                } else {
                    // A new workspace must not inherit the previous account's
                    // canvas. Only the anonymous first-sign-in flow may adopt
                    // the live local document.
                    if (workspaceId && liveWorkspaceKey !== 'anonymous' && liveWorkspaceKey !== key) {
                        const state = useStore.getState();
                        state.loadGraph([], []);
                        state.replaceSyncTracking({ dirtyNodeIds: [], dirtyEdgeIds: [], deletedNodeIds: [], deletedEdgeIds: [] });
                    }
                    record = snapshotRecord();
                    await persistLocal();
                }
                liveWorkspaceKey = key;
                latestSafeRecord = snapshotRecord();

                if (cancelled) return;
                graphSubscription = useStore.subscribe(
                    (state) => ({
                        nodes: state.nodes,
                        edges: state.edges,
                        dirtyNodeIds: state.storage.dirtyNodeIds,
                        dirtyEdgeIds: state.storage.dirtyEdgeIds,
                        deletedNodeIds: state.storage.deletedNodeIds,
                        deletedEdgeIds: state.storage.deletedEdgeIds,
                    }),
                    (current, previous) => {
                        if (!ownsLiveGraph()) return;

                        latestSafeRecord = snapshotRecord();
                        // Durability is unconditional: whatever moved, the
                        // device's copy is now behind the store.
                        scheduleLocalSave();

                        /* Talking to the cloud is not. Completing a sync calls
                           clearSyncTracking, which allocates fresh (smaller)
                           id sets — a store change indistinguishable, to this
                           subscription, from a new edit. Every save therefore
                           scheduled a second, empty sync cycle 1.2s later, and
                           paid for its revision fetch and auth preflight
                           again. Work only ever ARRIVES from a graph change or
                           an explicit re-tracking, so only growth is a reason
                           to sync; shrinkage is this subscription watching a
                           sync it already ran. */
                        const graphChanged =
                            current.nodes !== previous.nodes || current.edges !== previous.edges;
                        const trackingGrew =
                            current.dirtyNodeIds.size > previous.dirtyNodeIds.size ||
                            current.dirtyEdgeIds.size > previous.dirtyEdgeIds.size ||
                            current.deletedNodeIds.size > previous.deletedNodeIds.size ||
                            current.deletedEdgeIds.size > previous.deletedEdgeIds.size;
                        if (graphChanged || trackingGrew) scheduleCloudSync();
                    },
                    {
                        equalityFn: (previous, current) => {
                            /* The drag guard has to live HERE, not in the
                               listener: zustand runs this comparison first, and
                               `historyEquality` walks the entire graph. Guarding
                               only the listener still paid that walk on every
                               frame of every drag. Declaring the states equal
                               skips the walk and the listener together. */
                            if (useStore.getState().interactionState.draggedNodeId) return true;

                            return previous.dirtyNodeIds === current.dirtyNodeIds &&
                                previous.dirtyEdgeIds === current.dirtyEdgeIds &&
                                previous.deletedNodeIds === current.deletedNodeIds &&
                                previous.deletedEdgeIds === current.deletedEdgeIds &&
                                historyEquality(
                                    { nodes: previous.nodes, edges: previous.edges },
                                    { nodes: current.nodes, edges: current.edges },
                                );
                        },
                    },
                );

                /* The other half of the drag guard. Skipping frames is only
                   safe if the settled result is definitely captured, and
                   relying on some later unrelated store write to carry it
                   would make a moved card's durability a matter of luck.
                   Watch the gesture itself instead: when it ends, save. */
                dragSubscription = useStore.subscribe(
                    (state) => state.interactionState.draggedNodeId,
                    (draggedNodeId, previousDraggedNodeId) => {
                        if (draggedNodeId !== null || previousDraggedNodeId === null) return;
                        if (!ownsLiveGraph()) return;
                        latestSafeRecord = snapshotRecord();
                        scheduleLocalSave();
                        scheduleCloudSync();
                    },
                );

                unregisterSyncHandler = registerWorkspaceSyncHandler(async (request) => {
                    if (request.localOnly) {
                        return persistLocal();
                    }
                    return enqueueSync(request);
                });

                if (mode === 'sync' && isAuthenticated && userId && workspaceId && isSupabaseConfigured) {
                    realtimeChannel = supabase
                        .channel(`workspace-revision-${workspaceId}`)
                        .on('postgres_changes', {
                            event: '*',
                            schema: 'public',
                            table: 'workspace_sync_state',
                            filter: `workspace_id=eq.${workspaceId}`,
                        }, (payload) => {
                            /* Our own writes bump this counter, so most events
                               on this channel are this device's save arriving
                               back at it. The revision the save settled on is
                               already acknowledged in `record`, so anything at
                               or below it is an echo — a precise test, unlike
                               the time window the CanvasBoard handler this
                               replaced used, which also swallowed genuine
                               collaborator edits landing within five seconds.
                               An un-hydrated device knows no revision yet and
                               syncs on anything, which is correct. */
                            const incoming = Number(
                                (payload.new as { revision?: number | string } | null)?.revision,
                            );
                            const acknowledged = Number(record.cloudRevision);
                            if (
                                Number.isFinite(incoming) && Number.isFinite(acknowledged)
                                && incoming <= acknowledged
                            ) return;
                            scheduleCloudSync(450);
                        })
                        .subscribe();
                    // Realtime cannot replay changes missed while the tab was
                    // closed. Check one small revision on every launch, and
                    // drain the durable outbox even after an interrupted save.
                    scheduleCloudSync(0);
                }
            } catch (error) {
                if (!cancelled) {
                    useStore.getState().setLocalError(error instanceof Error ? error.message : String(error));
                }
            }
        };

        const handleOnline = () => scheduleCloudSync(0);
        const flushLocal = () => {
            if (latestSafeRecord && useStore.getState().storage.isLocalDirty) void persistLocal();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') flushLocal();
            else scheduleCloudSync(0);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('pagehide', flushLocal);
        window.addEventListener('beforeunload', flushLocal);
        document.addEventListener('visibilitychange', handleVisibility);
        void start();

        return () => {
            cancelled = true;
            useStore.getState().setCloudSyncing(false);
            useStore.getState().setCloudLoad('idle');
            graphSubscription?.();
            dragSubscription?.();
            unregisterSyncHandler?.();
            if (localTimer) window.clearTimeout(localTimer);
            if (localMaxTimer) window.clearTimeout(localMaxTimer);
            if (cloudTimer) window.clearTimeout(cloudTimer);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('pagehide', flushLocal);
            window.removeEventListener('beforeunload', flushLocal);
            document.removeEventListener('visibilitychange', handleVisibility);
            if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
            // Capture the final graph even if React tears the coordinator down
            // before its debounce fires (StrictMode, account switch, refresh).
            // React StrictMode tears down the first effect before its async
            // hydration has completed. With no known-safe record yet, writing
            // the store here would replace durable user data with seed nodes.
            if (!latestSafeRecord) return;
            const finalRecord = ownsLiveGraph() ? snapshotRecord() : latestSafeRecord;
            void writeChain
                .catch(() => undefined)
                .then(() => saveLocalWorkspace(finalRecord))
                .catch(() => undefined);
        };
    }, [isAuthLoading, isAuthenticated, mode, userId, workspaceId]);

    return null;
}
