import type { StateCreator } from 'zustand';
import type { Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, EdgeSlice } from '../types';

/**
 * Connections between nodes.
 */
export const createEdgeSlice: StateCreator<AppState, [], [], EdgeSlice> = (set, get) => ({
    linkSelectedNodes: (mainNodeId, targetNodeIds) => {
        const { edges, currentParentId } = get();
        const parentIdForEdge = currentParentId ?? null;
        
        const newEdges: Edge[] = [];
        targetNodeIds.forEach(targetId => {
            if (targetId === mainNodeId) return;
            
            // Check if an edge already exists from mainNodeId to targetId
            const edgeExists = edges.some(e => 
                (e.source === mainNodeId && e.target === targetId) ||
                (e.source === targetId && e.target === mainNodeId)
            );
            
            if (!edgeExists) {
                newEdges.push({
                    id: uuidv4(),
                    source: mainNodeId,
                    target: targetId,
                    type: 'centered',
                    data: { parentId: parentIdForEdge },
                } as Edge);
            }
        });
        
        if (newEdges.length > 0) set({ edges: [...edges, ...newEdges] });
    },

    updateEdge: (id, updates) => {
        set((state) => ({
            edges: state.edges.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
    },

    deleteEdge: (id) => {
        set((state) => ({
            edges: state.edges.filter((e) => e.id !== id),
        }));
    },

    duplicateEdge: (id) => {
        const edge = get().edges.find((e) => e.id === id);
        if (edge) {
            const newEdge = {
                ...edge,
                id: `edge-${uuidv4()}`,
            };
            set((state) => ({
                edges: [...state.edges, newEdge],
            }));
        }
    },

    bringEdgeToFront: (id) => {
        const edges = get().edges;
        const edge = edges.find((e) => e.id === id);
        if (edge) {
            set({
                edges: [...edges.filter((e) => e.id !== id), edge],
            });
        }
    },
});
