import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AppNode } from '../../../types';
import { useStore } from '../../../store/useStore';
import { isEditableElement } from '../../../utils/editableTarget';

/** How long "F" stays armed waiting for a click when nothing was there to focus. */
const ARMED_MS = 2500;
/** How long the "focused" confirmation shows. */
const CONFIRM_MS = 1500;
const FOCUS_OPTIONS = { padding: 0.45, maxZoom: 1.3 } as const;

/**
 * The F shortcut: frame the hovered node, else the selection, else the node
 * last clicked. With none of those, F arms instead, and the next node clicked
 * is framed. Other features frame nodes through the same path by dispatching
 * a `focusCanvasNodes` event with `{ ids, duration? }`.
 */
export function useFocusShortcut(isInEditableFieldRef: React.RefObject<boolean>) {
    const { fitView } = useReactFlow<AppNode>();
    const [isFocusArmed, setIsFocusArmed] = useState(false);
    const [justFocused, setJustFocused] = useState(false);
    const isFocusArmedRef = useRef(false);
    const hoveredNodeRef = useRef<AppNode | null>(null);
    const lastInteractedNodeIdRef = useRef<string | null>(null);
    const armTimeoutRef = useRef<number | null>(null);
    const confirmTimeoutRef = useRef<number | null>(null);

    const setArmed = useCallback((armed: boolean) => {
        isFocusArmedRef.current = armed;
        setIsFocusArmed(armed);
    }, []);

    const disarm = useCallback(() => {
        if (armTimeoutRef.current) {
            window.clearTimeout(armTimeoutRef.current);
            armTimeoutRef.current = null;
        }
        if (isFocusArmedRef.current) setArmed(false);
    }, [setArmed]);

    /** Frames `node` if F is armed; returns whether it did. */
    const focusOnArmedClick = useCallback((node: AppNode): boolean => {
        if (!isFocusArmedRef.current) return false;
        fitView({ nodes: [node], duration: 450, ...FOCUS_OPTIONS });
        disarm();
        return true;
    }, [disarm, fitView]);

    // Typing into a field cancels a pending arm.
    useEffect(() => {
        const handleFocusIn = () => {
            if (isEditableElement(document.activeElement)) disarm();
        };
        window.addEventListener('focusin', handleFocusIn);
        return () => window.removeEventListener('focusin', handleFocusIn);
    }, [disarm]);

    useEffect(() => {
        const focusNodes = (nodes: AppNode[], duration = 450) => {
            if (nodes.length === 0) return false;
            useStore.getState().setSelectedCanvasNodeIds(new Set(nodes.map((node) => node.id)));
            fitView({ nodes, duration, ...FOCUS_OPTIONS });
            disarm();
            if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
            setJustFocused(true);
            confirmTimeoutRef.current = window.setTimeout(() => {
                setJustFocused(false);
                confirmTimeoutRef.current = null;
            }, CONFIRM_MS);
            return true;
        };

        const pickNodesToFocus = (): AppNode[] => {
            const { nodes, selectedCanvasNodeIds } = useStore.getState();
            const byId = (id: string | undefined | null) => (id ? nodes.find((n) => n.id === id) : undefined);
            const hovered = byId(hoveredNodeRef.current?.id);
            if (hovered) return [hovered];
            if (selectedCanvasNodeIds.size > 0) return nodes.filter((n) => selectedCanvasNodeIds.has(n.id));
            const lastClicked = byId(lastInteractedNodeIdRef.current);
            return lastClicked ? [lastClicked] : [];
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEditableElement(document.activeElement) || isInEditableFieldRef.current) return;
            if (e.key === 'Escape') {
                disarm();
                return;
            }
            if (e.key !== 'f' && e.key !== 'F') return;
            e.preventDefault();

            if (focusNodes(pickNodesToFocus())) return;
            // Nothing to frame: F toggles arming for the next click.
            if (isFocusArmedRef.current) {
                disarm();
                return;
            }
            setArmed(true);
            armTimeoutRef.current = window.setTimeout(() => {
                armTimeoutRef.current = null;
                setArmed(false);
            }, ARMED_MS);
        };

        const handleFocusCanvasNodes = (e: Event) => {
            const { ids, duration } = (e as CustomEvent<{ ids?: string[]; duration?: number }>).detail ?? {};
            if (!ids?.length) return;
            focusNodes(useStore.getState().nodes.filter((node) => ids.includes(node.id)), duration);
        };

        const rememberInteractedNode = (e: PointerEvent) => {
            const nodeId = (e.target as Element | null)?.closest?.('.react-flow__node')?.getAttribute('data-id');
            if (nodeId) lastInteractedNodeIdRef.current = nodeId;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('focusCanvasNodes', handleFocusCanvasNodes);
        window.addEventListener('blur', disarm);
        document.addEventListener('pointerdown', rememberInteractedNode, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('focusCanvasNodes', handleFocusCanvasNodes);
            window.removeEventListener('blur', disarm);
            document.removeEventListener('pointerdown', rememberInteractedNode, true);
            if (armTimeoutRef.current) window.clearTimeout(armTimeoutRef.current);
            if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
        };
    }, [disarm, fitView, isInEditableFieldRef, setArmed]);

    return { isFocusArmed, justFocused, hoveredNodeRef, focusOnArmedClick, disarm };
}
