import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../../../store/useStore';
import { realtimeSync } from '../../../services/realtimeSync';
import type { RealtimePresenceState, RealtimeMessage } from '../../../services/realtimeSync';
import type { AppNode } from '../../../types';
import { FEATURES } from '../../../config/featureFlags';

export function useRealtimeSync(currentParentId: string | null) {
    const auth = useStore((state) => state.auth);
    const applyRemoteNodeUpdate = useStore((state) => state.applyRemoteNodeUpdate);
    const applyRemoteEdgeUpdate = useStore((state) => state.applyRemoteEdgeUpdate);
    
    const [presenceData, setPresenceData] = useState<Record<string, RealtimePresenceState[]>>({});
    const isInitialized = useRef(false);

    const handleMessage = useCallback((message: RealtimeMessage) => {
        if (message.type === 'UPDATE_NODE') {
            applyRemoteNodeUpdate(message.nodeId, message.changes);
        } else if (message.type === 'UPDATE_EDGE') {
            applyRemoteEdgeUpdate(message.edgeId, message.changes);
        }
    }, [applyRemoteNodeUpdate, applyRemoteEdgeUpdate]);

    useEffect(() => {
        if (!FEATURES.collaboration || !auth.isAuthenticated || !auth.activeWorkspaceId || !auth.userId) {
            realtimeSync.destroy();
            isInitialized.current = false;
            return;
        }

        if (!isInitialized.current) {
            realtimeSync.init(
                auth.activeWorkspaceId,
                currentParentId,
                {
                    id: auth.userId,
                    name: auth.displayName || auth.email || 'Anonymous',
                    color: stringToColor(auth.userId), // Generate consistent color based on ID
                },
                (presence) => {
                    setPresenceData(presence);
                },
                handleMessage
            );
            isInitialized.current = true;
        } else {
            // Update canvasId when drilling down
            realtimeSync.updateCanvasId(currentParentId);
        }

    }, [auth.activeWorkspaceId, auth.userId, auth.isAuthenticated, auth.displayName, auth.email, currentParentId, handleMessage]);

    useEffect(() => {
        return () => {
            realtimeSync.destroy();
            isInitialized.current = false;
        };
    }, []);

    // Helper to broadcast changes
    const broadcastNodeChange = useCallback((nodeId: string, changes: Partial<AppNode>) => {
        if (!isInitialized.current) return;
        realtimeSync.broadcast({
            type: 'UPDATE_NODE',
            nodeId,
            changes
        });
    }, []);

    const updateCursor = useCallback((x: number, y: number) => {
        if (!isInitialized.current) return;
        realtimeSync.updateCursor({ x, y });
    }, []);

    return {
        presenceData,
        broadcastNodeChange,
        updateCursor,
        currentUserId: auth.userId
    };
}

function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#ff8a5f', '#ff8a5f', '#f472b6', '#fb7185'];
    return colors[Math.abs(hash) % colors.length];
}
