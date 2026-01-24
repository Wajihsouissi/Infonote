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
            const parent = nodeMap.get(parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            parentId = parent.parentId;
        }
        return { x, y };
    }, [draggedNode, nodeMap]);

    const width = draggedNode?.measured?.width ?? (draggedNode?.style?.width as number) ?? 112;
    const height = draggedNode?.measured?.height ?? (draggedNode?.style?.height as number) ?? 112;

    // 2. Define the "flashlight" range
    const RANGE = 650; // Visual aura radius
    const centerX = absPos.x + width / 2;
    const centerY = absPos.y + height / 2;

    // 3. Find grid indices to render (absolute global alignment)
    const startCol = Math.floor((absPos.x - RANGE) / BASE_UNIT);
    const endCol = Math.ceil((absPos.x + width + RANGE) / BASE_UNIT);
    const startRow = Math.floor((absPos.y - RANGE) / BASE_UNIT);
    const endRow = Math.ceil((absPos.y + height + RANGE) / BASE_UNIT);

    // 4. Generate cells with dynamic illumination
    const cells = useMemo(() => {
        if (!draggedNode) return [];

        const res = [];
        // Calculate effective node spans in 56px units
        const nodeCols = Math.round((width + GRID_GAP) / BASE_UNIT);
        const nodeRows = Math.round((height + GRID_GAP) / BASE_UNIT);
        
        // Use standard snap logic to find where the node *would* sit on the 56px grid
        const nodeSnappedX = Math.round(absPos.x / BASE_UNIT) * BASE_UNIT;
        const nodeSnappedY = Math.round(absPos.y / BASE_UNIT) * BASE_UNIT;

        // Determine grid cells that should be highlighted BEFORE the node lands
        const targetStartCol = Math.floor(nodeSnappedX / BASE_UNIT);
        const targetEndCol = targetStartCol + nodeCols;
        const targetStartRow = Math.floor(nodeSnappedY / BASE_UNIT);
        const targetEndRow = targetStartRow + nodeRows;

        // Skip calculations for very distant cells by slightly tightening the loop
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const cellX = c * BASE_UNIT;
                const cellY = r * BASE_UNIT;
                
                const midX = cellX + BASE_UNIT / 2;
                const midY = cellY + BASE_UNIT / 2;
                
                const dx = midX - centerX;
                const dy = midY - centerY;
                const distanceSq = dx * dx + dy * dy;
                const rangeSq = RANGE * RANGE;
                
                if (distanceSq > rangeSq) continue;

                const distance = Math.sqrt(distanceSq);
                const lightIntensity = Math.pow(1 - distance / RANGE, 2);

                const isTarget = 
                    c >= targetStartCol && 
                    c < targetEndCol &&
                    r >= targetStartRow &&
                    r < targetEndRow;

                res.push({
                    x: cellX,
                    y: cellY,
                    isTarget,
                    opacity: lightIntensity
                });
            }
        }
        return res;
    }, [draggedNode, startRow, endRow, startCol, endCol, centerX, centerY, width, height, RANGE]);

    if (!draggedNode) return null;

    return (
        <div className={`${styles.overlayContainer} ${isVisible ? styles.visible : ''}`}>
            <div
                style={{
                    transform: `translate(${viewportX}px, ${viewportY}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                {cells.map((cell) => (
                    <div
                        key={`${cell.x}-${cell.y}`}
                        className={`${styles.gridCell} ${cell.isTarget ? styles.activeCell : ''}`}
                        style={{   
                            willChange: 'opacity, transform',
                            transform: `translate3d(${cell.x}px, ${cell.y}px, 0)`,
                            width: BASE_UNIT - GRID_GAP,
                            height: BASE_UNIT - GRID_GAP,
                            opacity: cell.isTarget 
                                ? 0.5 + (cell.opacity * 0.3)
                                : cell.opacity * 0.25,
                        }}
                    />
                ))}
            </div>
        </div>
    );
});
