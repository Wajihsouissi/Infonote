import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Block } from '../../../editor/types';
import { useCanvasEditorEligibility } from '../../../canvas/hooks/editing/useCanvasEditorEligibility';
import { useScheduledMount } from '../../hooks/useScheduledMount';
import { NoteBodyPreview } from '../content/NoteBodyPreview';
import { hasBlockFocusRequest } from '../../../editor/drag/canvasFocusRequest';

interface Props {
    nodeId: string;
    active: boolean;
    blocks: Block[];
    single?: boolean;
    fusedNoteMedia?: boolean;
    startIndex?: number;
    storedNumbers?: boolean;
    renderEditor: () => ReactNode;
}

/** All canvas node kinds share editor ownership and commit-safe demotion. */
export function CanvasNodeBody({ nodeId, active, blocks, single, fusedNoteMedia, startIndex, storedNumbers, renderEditor }: Props) {
    const eligible = useCanvasEditorEligibility(nodeId, active);
    const live = useScheduledMount(eligible, hasBlockFocusRequest(blocks.map(block => block.id)));
    const host = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);
    useEffect(() => {
        if (!live || !host.current) return;
        const observer = new ResizeObserver(entries => {
            const next = Math.ceil(entries[0].contentRect.height);
            setHeight(previous => previous === next ? previous : next);
        });
        observer.observe(host.current);
        return () => observer.disconnect();
    }, [live]);
    return <div ref={host} style={!live && height ? { minHeight: height } : undefined}>
        {live ? renderEditor() : <NoteBodyPreview content={blocks} scaleMode={single ? 'canvas' : 'card'}
            nodeSurface={single ? 'single' : undefined} globalStartIndex={startIndex} useStoredListNumbers={storedNumbers}
            fusedNoteMedia={fusedNoteMedia} complete reserveHandles={!single} />}
    </div>;
}
