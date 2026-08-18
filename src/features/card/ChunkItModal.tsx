import React, { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Scissors, X, GitMerge, Waypoints } from '../../components/icons';
import { v4 as uuidv4 } from 'uuid';
import styles from './ChunkItModal.module.css';
import { BlockEditor } from '../editor/BlockEditor';
import { MIN_EXPANDED_SIZE } from '../../config/layout';
import type { AppNode, KanbanNode } from '../../types';
import type { Block } from '../editor/types';
import type { Edge } from '@xyflow/react';

/**
 * Chunking splits a node's blocks across new nodes, so it only means anything
 * for the node types that have blocks. A board's content is its cards, and they
 * are separate nodes already.
 */
type ChunkableNode = Exclude<AppNode, KanbanNode>;

const isChunkableNode = (node: AppNode | null | undefined): node is ChunkableNode => {
    return !!node && node.type !== 'kanban' && 'content' in node.data && Array.isArray(node.data.content);
};

const getNodeColor = (node: ChunkableNode): string | undefined => {
    return node.type === 'note' ? node.data.color : undefined;
};

const withChunkedContent = (node: ChunkableNode, content: Block[]): AppNode => {
    switch (node.type) {
        case 'note':
            return { ...node, data: { ...node.data, content } };
        case 'block':
            return { ...node, data: { ...node.data, content } };
        case 'fused-note':
            return { ...node, data: { ...node.data, content } };
    }
};

export const ChunkItModal: React.FC = () => {
    const chunkItNodeId = useStore(s => s.chunkItNodeId);
    const setChunkItNodeId = useStore(s => s.setChunkItNodeId);
    const nodes = useStore(s => s.nodes);
    const setNodes = useStore(s => s.setNodes);

    const [cutIndices, setCutIndices] = useState<Set<number>>(new Set());

    const targetNode = useMemo(() => {
        if (!chunkItNodeId) return null;
        return nodes.find(n => n.id === chunkItNodeId);
    }, [chunkItNodeId, nodes]);

    const blocks = useMemo<Block[]>(() => {
        if (!isChunkableNode(targetNode)) return [];
        return Array.isArray(targetNode.data.content) ? targetNode.data.content : [];
    }, [targetNode]);

    const handleClose = useCallback(() => {
        setChunkItNodeId(null);
        setCutIndices(new Set());
    }, [setChunkItNodeId]);

    const toggleCut = useCallback((index: number) => {
        setCutIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    }, []);

    // Split blocks based on cut indices
    const getChunks = useCallback(() => {
        if (blocks.length === 0) return [];
        
        const chunks: Block[][] = [];
        let currentChunk: Block[] = [];
        
        blocks.forEach((block, idx) => {
            currentChunk.push(block);
            // If this index is a cut point, finish the current chunk (unless it's the very last block)
            if (cutIndices.has(idx) && idx < blocks.length - 1) {
                chunks.push([...currentChunk]);
                currentChunk = [];
            }
        });
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }, [blocks, cutIndices]);

    const handleExtractMindMap = useCallback(() => {
        if (!isChunkableNode(targetNode)) return;
        const sourceNode = targetNode;
        const chunks = getChunks();
        if (chunks.length <= 1) {
            handleClose();
            return;
        }

        const newNodes: AppNode[] = [];
        const newEdges: Edge[] = [];

        // Distribute chunks in a circle around the original node
        const radius = 400;
        const centerX = sourceNode.position.x;
        const centerY = sourceNode.position.y;
        
        // We will keep the first chunk in the original node, and spawn new nodes for the rest
        const originalChunk = chunks[0];
        const extractedChunks = chunks.slice(1);

        extractedChunks.forEach((chunk, i) => {
            const angle = (i / extractedChunks.length) * Math.PI * 2;
            const offsetX = Math.cos(angle) * radius;
            const offsetY = Math.sin(angle) * radius;
            
            const newNodeId = uuidv4();
            const label = chunk[0]?.content ? chunk[0].content.replace(/<[^>]+>/g, '').trim().substring(0, 30) : 'Chunk';

            const newNode: AppNode = {
                id: newNodeId,
                type: 'note',
                parentId: sourceNode.parentId,
                position: { x: centerX + offsetX, y: centerY + offsetY },
                data: {
                    label: label || 'Chunk',
                    viewMode: 'expanded',
                    content: chunk,
                    description: '',
                    date: new Date().toISOString(),
                    color: getNodeColor(sourceNode),
                    showMetadata: false
                },
                style: {
                    width: MIN_EXPANDED_SIZE,
                    height: MIN_EXPANDED_SIZE,
                },
                selected: false
            };

            const newEdge: Edge = {
                id: uuidv4(),
                source: sourceNode.id,
                target: newNodeId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#ff8a5f', strokeWidth: 2 }
            };

            newNodes.push(newNode);
            newEdges.push(newEdge);
        });

        // Update store atomically
        setNodes(state => {
            const updatedOriginalNode = withChunkedContent(sourceNode, originalChunk);

            return state.map(n => n.id === sourceNode.id ? updatedOriginalNode : n).concat(newNodes);
        });
        useStore.setState(state => ({ edges: state.edges.concat(newEdges) }));

        // Use built-in arrangeNodes for beautiful layout
        setTimeout(() => {
            const nodeIds = [sourceNode.id, ...newNodes.map(n => n.id)];
            useStore.getState().arrangeNodes(nodeIds, 'mindmap-horizontal');
        }, 50);

        handleClose();
    }, [targetNode, getChunks, handleClose]);

    const handleFuseInPlace = useCallback(() => {
        if (!isChunkableNode(targetNode)) return;
        const sourceNode = targetNode;
        const chunks = getChunks();
        if (chunks.length <= 1) {
            handleClose();
            return;
        }

        const newNodes: AppNode[] = [];
        const newPageBlocks: Block[] = [];

        // The first chunk stays inline. The remaining chunks become fused nested notes.
        const originalChunk = chunks[0];
        const extractedChunks = chunks.slice(1);

        extractedChunks.forEach((chunk, i) => {
            const newNodeId = uuidv4();
            const label = chunk[0]?.content ? chunk[0].content.replace(/<[^>]+>/g, '').trim().substring(0, 30) : 'Chunk';

            const newNode: AppNode = {
                id: newNodeId,
                type: 'note',
                parentId: sourceNode.id,
                position: { x: 50 + (i * 20), y: 50 + (i * 20) }, // Slight offset
                data: {
                    label: label || 'Chunk',
                    viewMode: 'expanded',
                    content: chunk,
                    description: '',
                    date: new Date().toISOString(),
                    color: getNodeColor(sourceNode),
                    showMetadata: false
                },
                style: {
                    width: MIN_EXPANDED_SIZE,
                    height: MIN_EXPANDED_SIZE,
                },
                zIndex: 10
            };

            const pageBlock: Block = {
                id: uuidv4(),
                type: 'page',
                content: label || 'Fused Note',
                metadata: { nodeId: newNodeId }
            };

            newNodes.push(newNode);
            newPageBlocks.push(pageBlock);
        });

        setNodes(state => {
            const newContent = [...originalChunk, ...newPageBlocks];
            
            const updatedOriginalNode = withChunkedContent(sourceNode, newContent);

            return state.map(n => n.id === sourceNode.id ? updatedOriginalNode : n).concat(newNodes);
        });

        handleClose();
    }, [targetNode, getChunks, handleClose]);

    if (!chunkItNodeId || !targetNode) return null;

    return (
        <div className={styles.overlay} onClick={handleClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.title}>
                        <div className={styles.iconWrapper}>
                            <Scissors size={14} />
                        </div>
                        Chunk it
                    </div>
                    <div className={styles.headerActions}>
                        <button 
                            className={styles.btnAction} 
                            onClick={handleFuseInPlace}
                            disabled={cutIndices.size === 0}
                            style={{ opacity: cutIndices.size === 0 ? 0.5 : 1, cursor: cutIndices.size === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            <GitMerge size={14} />
                            Fuse In-Place
                        </button>
                        <button 
                            className={styles.btnActionPrimary} 
                            onClick={handleExtractMindMap}
                            disabled={cutIndices.size === 0}
                            style={{ opacity: cutIndices.size === 0 ? 0.5 : 1, cursor: cutIndices.size === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            <Waypoints size={14} />
                            Extract to Mind Map
                        </button>
                        <button className={`${styles.closeBtn} icon-hover`} onClick={handleClose}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.blockContent}>
                        <BlockEditor
                            initialContent={blocks}
                            readOnly={true}
                            minimal={false}
                            hideBlockHandles={true}
                            disableMediaControls={true}
                            renderBetweenBlocks={(idx) => {
                                const isCut = cutIndices.has(idx);
                                return (
                                    <div 
                                        className={`${styles.cutZone} ${isCut ? styles.isCut : ''}`}
                                        onClick={() => toggleCut(idx)}
                                        title={isCut ? "Remove cut" : "Click to cut here"}
                                    >
                                        <div className={styles.cutZoneLine} />
                                        <div className={styles.cutZoneIcon}>
                                            <Scissors size={14} />
                                        </div>
                                        <div className={styles.cutZoneLine} />
                                    </div>
                                );
                            }}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};
