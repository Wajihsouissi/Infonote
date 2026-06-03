import { useCallback } from 'react';
import { useStore } from '../../../store/useStore';

/**
 * Hook that provides all store selectors and actions needed by CanvasBoard.
 * Centralizes store access to prevent unnecessary re-renders.
 */
export function useCanvasStoreSelectors() {
    // State selectors (atomic to prevent unnecessary re-renders)
    const nodes = useStore(useCallback(s => s.nodes, []));
    const edges = useStore(useCallback(s => s.edges, []));
    const currentParentId = useStore(useCallback(s => s.currentParentId, []));
    const interactionState = useStore(useCallback(s => s.interactionState, []));
    const selectedCanvasNodeIds = useStore(useCallback(s => s.selectedCanvasNodeIds, []));
    const lastCreatedCanvasNodeId = useStore(useCallback(s => s.lastCreatedCanvasNodeId, []));
    const rightSidePanelId = useStore(useCallback(s => s.rightSidePanelId, []));
    const leftSidePanelId = useStore(useCallback(s => s.leftSidePanelId, []));
    const theme = useStore(useCallback(s => s.theme, []));

    // Actions (stable references via atomic selectors)
    const onNodesChange = useStore(useCallback(s => s.onNodesChange, []));
    const onEdgesChange = useStore(useCallback(s => s.onEdgesChange, []));
    const onConnect = useStore(useCallback(s => s.onConnect, []));
    const onReconnect = useStore(useCallback(s => s.onReconnect, []));
    const addNode = useStore(useCallback(s => s.addNode, []));
    const setNodes = useStore(useCallback(s => s.setNodes, []));
    const updateNodeData = useStore(useCallback(s => s.updateNodeData, []));
    const setInteractionState = useStore(useCallback(s => s.setInteractionState, []));
    const extractPageFromBlock = useStore(useCallback(s => s.extractPageFromBlock, []));
    const syncParentContent = useStore(useCallback(s => s.syncParentContent, []));
    const toggleCanvasNodeSelection = useStore(useCallback(s => s.toggleCanvasNodeSelection, []));
    const setSelectedCanvasNodeIds = useStore(useCallback(s => s.setSelectedCanvasNodeIds, []));
    const clearCanvasSelection = useStore(useCallback(s => s.clearCanvasSelection, []));
    const setLastCreatedCanvasNodeId = useStore(useCallback(s => s.setLastCreatedCanvasNodeId, []));
    const setRightSidePanelId = useStore(useCallback(s => s.setRightSidePanelId, []));
    const setLeftSidePanelId = useStore(useCallback(s => s.setLeftSidePanelId, []));

    return {
        // State
        nodes,
        edges,
        currentParentId,
        interactionState,
        selectedCanvasNodeIds,
        lastCreatedCanvasNodeId,
        rightSidePanelId,
        leftSidePanelId,
        theme,
        // Actions
        onNodesChange,
        onEdgesChange,
        onConnect,
        onReconnect,
        addNode,
        setNodes,
        updateNodeData,
        setInteractionState,
        extractPageFromBlock,
        syncParentContent,
        toggleCanvasNodeSelection,
        setSelectedCanvasNodeIds,
        clearCanvasSelection,
        setLastCreatedCanvasNodeId,
        setRightSidePanelId,
        setLeftSidePanelId,
    };
}
