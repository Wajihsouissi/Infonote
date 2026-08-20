import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { BlockEditor } from '../editor/BlockEditor';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { SidePeek } from './SidePeek';
import { getNodeBlocks } from '../../types';

interface SidePanelProps {
    nodeId: string | null;
    side: 'left' | 'right';
    onClose: () => void;
}

export function SidePanel({ nodeId, side, onClose }: SidePanelProps) {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const updateNodeData = useStore(s => s.updateNodeData);

    const [cachedNodeId, setCachedNodeId] = useState<string | null>(nodeId);

    // Keep the last valid nodeId around so we can animate out smoothly
    useEffect(() => {
        if (nodeId) {
            setCachedNodeId(nodeId);
        }
    }, [nodeId]);

    const activeNode = nodes.find(n => n.id === (nodeId || cachedNodeId));

    // If we have nothing to render at all, return early
    if (!activeNode) return null;

    const currentId = nodeId || cachedNodeId;

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
                {activeNode.type === 'note' ? (
                    <NoteExpandedContent
                        id={currentId!}
                        nodeId={currentId!}
                        data={activeNode.data}
                        onUpdate={updateNodeData}
                        onClose={onClose}
                        flatCorners={true}
                    />
                ) : (
                    <div style={{ height: '100%', padding: '20px', overflowY: 'auto' }}>
                        <BlockEditor
                            key={currentId!}
                            nodeId={currentId!}
                            initialContent={getNodeBlocks(activeNode.data)}
                            onUpdate={(blocks) => updateNodeData(currentId!, { content: blocks })}
                            autoFocus={true}
                        />
                    </div>
                )}
            </div>
        </SidePeek>
    );
}
