import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { SidePeek } from './SidePeek';
import { resolvePeekContent } from './peekContent';

interface SidePanelProps {
    nodeId: string | null;
    side: 'left' | 'right';
    onClose: () => void;
}

/** SidePeek's close transition (SidePeek.module.css), plus a frame of slack. */
const EXIT_MS = 350;

export function SidePanel({ nodeId, side, onClose }: SidePanelProps) {
    const updateNodeData = useStore(s => s.updateNodeData);

    /* The card stays rendered while the panel slides out, then goes. Keeping
       it for good left a live card and editor mounted off-screen all session. */
    const [cachedNodeId, setCachedNodeId] = useState<string | null>(nodeId);
    if (nodeId && nodeId !== cachedNodeId) setCachedNodeId(nodeId);
    useEffect(() => {
        if (nodeId) return;
        const timer = window.setTimeout(() => setCachedNodeId(null), EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [nodeId]);

    const returnFocusRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (nodeId && !wasOpenRef.current) {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        } else if (!nodeId && wasOpenRef.current) {
            const target = returnFocusRef.current;
            window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
            returnFocusRef.current = null;
        }
        wasOpenRef.current = Boolean(nodeId);
    }, [nodeId]);

    const activeNodeId = nodeId || cachedNodeId;
    const activeNode = useStore(s => getNodeById(s.nodes, activeNodeId ?? undefined));

    // If we have nothing to render at all, return early
    if (!activeNode) return null;

    const currentId = activeNodeId;

    return (
        <SidePeek
            isOpen={!!nodeId}
            onClose={onClose}
            side={side}
            width="40vw"
            hideHeader={true}
        >
            <div style={{ 
                height: '100%', 
                width: '100%', 
                overflow: 'hidden',
                backgroundColor: 'var(--modal-bg)'
            }}>
                {resolvePeekContent({
                    node: activeNode,
                    nodeId: currentId!,
                    onUpdate: updateNodeData,
                    onClose,
                    flatCorners: true,
                    editorStyle: { height: '100%', padding: '20px', overflowY: 'auto' },
                })}
            </div>
        </SidePeek>
    );
}
