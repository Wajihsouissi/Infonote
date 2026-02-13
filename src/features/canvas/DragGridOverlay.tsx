import { memo, useMemo, useState, useEffect } from 'react';
import { useViewport } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { BASE_UNIT, GRID_GAP } from '../../config/layout';
import styles from './DragGridOverlay.module.css';

/**
 * Ethereal Light-Source Grid
 * Fixed global alignment, revealed by dragged node's "light".
 */
export const DragGridOverlay = memo(() => {
    const interactionState = useStore(s => s.interactionState);
    const nodes = useStore(s => s.nodes);
    const currentParentId = useStore(s => s.currentParentId);
    const { x: viewportX, y: viewportY, zoom } = useViewport();

    const draggedNodeId = interactionState.draggedNodeId;
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (draggedNodeId) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    }, [draggedNodeId]);

    // Efficiency: Only find the node if we have an ID
    const draggedNode = useMemo(() => {
        if (!draggedNodeId) return null;
        return nodes.find(n => n.id === draggedNodeId);
    }, [draggedNodeId, nodes]);

    // Optimize position lookup by creating a node map
    const nodeMap = useMemo(() => {
        const map = new Map();
        nodes.forEach(n => map.set(n.id, n));
        return map;
    }, [nodes]);

    const absPos = useMemo(() => {
        if (!draggedNode) return { x: 0, y: 0 };

        if ((draggedNode as any).positionAbsolute) return (draggedNode as any).positionAbsolute;

        let x = draggedNode.position.x;
        let y = draggedNode.position.y;
        let parentId = draggedNode.parentId;

        while (parentId) {
            // Stop traversing if we hit the current view's parent (local origin)
            if (parentId === currentParentId) break;

            const parent = nodeMap.get(parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            parentId = parent.parentId;
        }
        return { x, y };
    }, [draggedNode, nodeMap, currentParentId]);

    const width = draggedNode?.measured?.width ?? (draggedNode?.style?.width as number) ?? 112;
    const height = draggedNode?.measured?.height ?? (draggedNode?.style?.height as number) ?? 112;

    // 4. Optimized Render: use CSS Masking instead of hundreds of DOM nodes
    const centerX = absPos.x + width / 2;
    const centerY = absPos.y + height / 2;
    const flashlightSize = 800;

    // Use a large offset divisible by BASE_UNIT (56) to ensure grid alignment
    // 56 * 900 = 50400
    const GRID_OFFSET = 50400;

    const maskX = centerX + GRID_OFFSET - (flashlightSize / 2);
    const maskY = centerY + GRID_OFFSET - (flashlightSize / 2);

    // 5. Calculate Snap Highlight Position (The "Follow" effect)
    const snapX = Math.round(absPos.x / BASE_UNIT) * BASE_UNIT;
    const snapY = Math.round(absPos.y / BASE_UNIT) * BASE_UNIT;

    // Snap width/height to grid units to draw the box correctly
    const snapW = Math.round((width + GRID_GAP) / BASE_UNIT) * BASE_UNIT - GRID_GAP;
    const snapH = Math.round((height + GRID_GAP) / BASE_UNIT) * BASE_UNIT - GRID_GAP;

    if (!draggedNode) return null;

    return (
        <div className={`${styles.overlayContainer} ${isVisible ? styles.visible : ''}`}>
            <div
                className={styles.gridLayer}
                style={{
                    // Move the Grid Layer with the viewport
                    transform: `translate(${viewportX}px, ${viewportY}px) scale(${zoom})`,
                    transformOrigin: `${GRID_OFFSET}px ${GRID_OFFSET}px`,

                    top: -GRID_OFFSET,
                    left: -GRID_OFFSET,
                    width: GRID_OFFSET * 2,
                    height: GRID_OFFSET * 2,

                    // Dynamic Mask Position (The "Flashlight")
                    maskImage: `radial-gradient(circle ${flashlightSize / 2}px at 50%, black 0%, transparent 100%)`,
                    WebkitMaskImage: `radial-gradient(circle ${flashlightSize / 2}px at 50%, black 0%, transparent 100%)`,

                    maskPosition: `${maskX}px ${maskY}px`,
                    WebkitMaskPosition: `${maskX}px ${maskY}px`,

                    maskSize: `${flashlightSize}px ${flashlightSize}px`,
                    WebkitMaskSize: `${flashlightSize}px ${flashlightSize}px`,
                }}
            />

            {/* Snap Indicator - The "Current Grid" highligther */}
            <div
                className={styles.snapIndicator}
                style={{
                    transform: `translate(${viewportX + snapX * zoom}px, ${viewportY + snapY * zoom}px)`,
                    width: snapW * zoom,
                    height: snapH * zoom,
                }}
            />
        </div>
    );
});
