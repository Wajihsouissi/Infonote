import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase/client';
import type { AppNode } from '../types';
import type { Edge } from '@xyflow/react';

export type CursorPosition = { x: number; y: number } | null;

export interface RealtimePresenceState {
    userId: string;
    userName: string;
    color: string;
    cursor: CursorPosition;
    canvasId: string | null;
}

export type NodeDelta = {
    type: 'UPDATE_NODE';
    nodeId: string;
    changes: Partial<AppNode>;
};

export type EdgeDelta = {
    type: 'UPDATE_EDGE';
    edgeId: string;
    changes: Partial<Edge>;
};

export type RealtimeMessage = NodeDelta | EdgeDelta;

class RealtimeSyncService {
    private channel: RealtimeChannel | null = null;
    private workspaceId: string | null = null;
    private canvasId: string | null = null;
    private currentPresence: RealtimePresenceState | null = null;
    
    private onPresenceSync: ((presence: Record<string, RealtimePresenceState[]>) => void) | null = null;
    private onMessage: ((message: RealtimeMessage) => void) | null = null;

    public init(
        workspaceId: string,
        canvasId: string | null,
        user: { id: string; name: string; color: string },
        onPresenceSync: (presence: Record<string, RealtimePresenceState[]>) => void,
        onMessage: (message: RealtimeMessage) => void
    ) {
        if (!isSupabaseConfigured || !supabase) return;

        this.workspaceId = workspaceId;
        this.canvasId = canvasId;
        this.onPresenceSync = onPresenceSync;
        this.onMessage = onMessage;

        this.currentPresence = {
            userId: user.id,
            userName: user.name,
            color: user.color,
            cursor: null,
            canvasId: canvasId,
        };

        const channelName = `workspace:${workspaceId}`;
        this.channel = supabase.channel(channelName, {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        this.channel
            .on('presence', { event: 'sync' }, () => {
                if (this.onPresenceSync && this.channel) {
                    const state = this.channel.presenceState<RealtimePresenceState>();
                    this.onPresenceSync(state);
                }
            })
            .on('broadcast', { event: 'canvas_delta' }, ({ payload }) => {
                // Ensure the message is meant for the current canvas view
                if (payload.canvasId === this.canvasId && this.onMessage) {
                    this.onMessage(payload.message as RealtimeMessage);
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.trackPresence();
                }
            });
    }

    private async trackPresence() {
        if (this.channel && this.currentPresence) {
            await this.channel.track(this.currentPresence);
        }
    }

    public async updateCursor(cursor: CursorPosition) {
        if (!this.channel || !this.currentPresence) return;
        
        // Optimisation: skip if same
        if (
            this.currentPresence.cursor?.x === cursor?.x &&
            this.currentPresence.cursor?.y === cursor?.y
        ) {
            return;
        }

        this.currentPresence.cursor = cursor;
        await this.trackPresence();
    }

    public async updateCanvasId(canvasId: string | null) {
        if (!this.channel || !this.currentPresence) return;
        this.canvasId = canvasId;
        this.currentPresence.canvasId = canvasId;
        await this.trackPresence();
    }

    public broadcast(message: RealtimeMessage) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'canvas_delta',
            payload: {
                canvasId: this.canvasId,
                message,
            },
        });
    }

    public destroy() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        this.onPresenceSync = null;
        this.onMessage = null;
    }
}

export const realtimeSync = new RealtimeSyncService();
