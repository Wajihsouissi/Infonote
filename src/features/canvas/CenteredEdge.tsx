import { memo } from 'react';
import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react';

/**
 * CenteredEdge
 * --------------------------------------------------
 * A custom React Flow edge that always anchors its two endpoints at the
 * geometric centre of the connected nodes — regardless of where the user
 * dragged the connection from (e.g. the visible top-right Handle). The
 * path recomputes every frame from React Flow's internal node store, so
 * positions react instantly when nodes are dragged across the infinite plane.
 */
export const CenteredEdge = memo(function CenteredEdge({
    id,
    source,
    target,
    selected,
    markerEnd,
    style,
}: EdgeProps) {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    if (!sourceNode || !targetNode) return null;

    const srcAbs = sourceNode.internals.positionAbsolute ?? sourceNode.position;
    const tgtAbs = targetNode.internals.positionAbsolute ?? targetNode.position;

    const srcW = sourceNode.measured?.width ?? (sourceNode.width ?? 0);
    const srcH = sourceNode.measured?.height ?? (sourceNode.height ?? 0);
    const tgtW = targetNode.measured?.width ?? (targetNode.width ?? 0);
    const tgtH = targetNode.measured?.height ?? (targetNode.height ?? 0);

    const sx = srcAbs.x + srcW / 2;
    const sy = srcAbs.y + srcH / 2;
    const tx = tgtAbs.x + tgtW / 2;
    const ty = tgtAbs.y + tgtH / 2;

    const [path] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });

    return (
        <BaseEdge
            id={id}
            path={path}
            markerEnd={markerEnd}
            style={{
                stroke: selected ? 'var(--color-primary)' : 'var(--glass-border, rgba(148, 163, 184, 0.6))',
                strokeWidth: selected ? 2.5 : 1.75,
                ...(style as React.CSSProperties),
            }}
            interactionWidth={20}
        />
    );
});
