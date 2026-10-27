import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../../store/useStore';
import { findNonOverlappingPosition } from '../../../../utils/findNonOverlappingPosition';

type Size = { width: number; height: number };
type Point = { x: number; y: number };

/**
 * Where to put something new: the free spot nearest the middle of the screen,
 * on the canvas being viewed.
 *
 * Overlap avoidance can push a node outside the visible area on a crowded
 * canvas, and an off-screen card never mounts its editor, so `reveal` pans to
 * a placement that landed out of view. At overview scale, it also brings new
 * content to a readable zoom so its selected editor can become interactive.
 */
export function useViewportPlacement() {
    const { screenToFlowPosition, getViewport, setCenter } = useReactFlow();

    const findSpot = useCallback((size: Size): Point => {
        const { nodes, currentParentId } = useStore.getState();
        const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        const { x, y, zoom } = getViewport();
        return findNonOverlappingPosition(center, size, nodes, currentParentId, {
            x, y, zoom, screenW: window.innerWidth, screenH: window.innerHeight,
        });
    }, [getViewport, screenToFlowPosition]);

    const reveal = useCallback((position: Point, size: Size) => {
        const { x: vpX, y: vpY, zoom } = getViewport();
        const left = -vpX / zoom;
        const top = -vpY / zoom;
        const outOfView = position.x < left || position.y < top
            || position.x + size.width > left + window.innerWidth / zoom
            || position.y + size.height > top + window.innerHeight / zoom;
        if (outOfView || zoom < 0.2) {
            setCenter(position.x + size.width / 2, position.y + size.height / 2, {
                zoom: zoom < 0.2 ? 0.8 : zoom, duration: 300,
            });
        }
    }, [getViewport, setCenter]);

    return { findSpot, reveal };
}
