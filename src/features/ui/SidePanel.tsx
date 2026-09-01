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

export function SidePanel({ nodeId, side, onClose }: SidePanelProps) {
    // Atomic Selectors
    const updateNodeData = useStore(s => s.updateNodeData);

    const [cachedNodeId, setCachedNodeId] = useState<string | null>(nodeId);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);

    // Keep the last valid nodeId around so we can animate out smoothly
    useEffect(() => {
        if (nodeId) {
            // The last node intentionally stays rendered for SidePeek's exit
            // animation; this state is an animation snapshot of the prop.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCachedNodeId(nodeId);
        }
    }, [nodeId]);

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
            fullscreenOnNarrow={activeNode.type === 'youtube'}
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
