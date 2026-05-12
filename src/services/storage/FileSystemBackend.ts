/**
 * Thin adapter that wraps the existing FileSystemStorage singleton so it fits
 * the GraphBackend interface. Behavior of the underlying service is NOT
 * changed - this keeps the local-folder flow byte-identical for current users.
 */
import { fileSystemStorage } from '../FileSystemStorage';
import type { GraphBackend, GraphData } from './types';

export class FileSystemBackend implements GraphBackend {
    readonly kind = 'filesystem' as const;

    get isConnected(): boolean {
        return fileSystemStorage.isConnected;
    }

    get displayName(): string | null {
        return fileSystemStorage.directoryName ?? null;
    }

    async connect(): Promise<boolean> {
        // Prefer reconnecting to a previously granted directory before prompting.
        const reconnected = await fileSystemStorage.reconnect();
        if (reconnected) return true;
        return fileSystemStorage.selectDirectory();
    }

    async disconnect(): Promise<void> {
        fileSystemStorage.disconnect();
    }

    async load(): Promise<GraphData | null> {
        const data = await fileSystemStorage.loadData();
        if (!data) return null;
        return { nodes: data.nodes, edges: data.edges };
    }

    async save(data: GraphData): Promise<void> {
        await fileSystemStorage.saveData(data.nodes, data.edges);
    }
}

export const fileSystemBackend = new FileSystemBackend();
