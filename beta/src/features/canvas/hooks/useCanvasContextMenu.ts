import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { isEditableElement } from '../../../utils/editableTarget';

type MenuPosition = { x: number; y: number };

/**
 * Right-click on the canvas pane or a card opens the canvas menu (listened for
 * natively, because React Flow uses right-drag to pan). Right-clicking a card
 * selects it first, unless it is already part of the selection, so the menu's
 * Copy/Cut act on it. Text fields keep the browser's own menu.
 */
export function useCanvasContextMenu() {
    const [menu, setMenu] = useState<MenuPosition | null>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as Element | null;
            const nodeEl = target?.closest?.('.react-flow__node');
            if (!target?.closest?.('.react-flow__pane') && !nodeEl) return;
            if (isEditableElement(target)) return;

            const nodeId = nodeEl?.getAttribute('data-id');
            if (nodeId) {
                const { selectedCanvasNodeIds, setSelectedCanvasNodeIds } = useStore.getState();
                // Also syncs each node's `selected` flag, which React Flow renders from.
                if (!selectedCanvasNodeIds.has(nodeId)) setSelectedCanvasNodeIds(new Set([nodeId]));
            }

            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY });
        };
        document.addEventListener('contextmenu', handleContextMenu, { capture: true });
        return () => document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    }, []);

    return [menu, setMenu] as const;
}
