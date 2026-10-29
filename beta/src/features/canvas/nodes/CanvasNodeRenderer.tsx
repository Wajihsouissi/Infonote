import { memo, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppNodeData, NoteNode, FusedNoteNode as FusedNode } from '../../../types';
import { useStore } from '../../../store/useStore';
import { NoteCard } from '../../card/ui/node/NoteCard';
import { CardResizeHandle } from '../../card/ui/node/CardResizeHandle';
import { BlockNode } from '../../block/ui/node/BlockNode';
import { FusedNoteNode } from '../../card/ui/node/FusedNoteNode';
import { useCanvasOverview } from '../hooks/navigation/useCanvasOverview';
import { LinkTargetOverlay } from '../ui/overlays/LinkTargetOverlay';
import { samePropsIgnoringPosition } from './nodeMemo';
import { CanvasNodeInteraction } from './CanvasNodeInteraction';
import styles from './CanvasNodeRenderer.module.css';

function useOverviewProjection(id: string, selected: boolean, expanded = false) {
    const overview = useCanvasOverview(!expanded);
    const soleSelection = useStore(s => !expanded && s.selectedCanvasNodeIds.size === 1 && s.selectedCanvasNodeIds.has(id));
    // A new card's title draft must survive selection even at a distant zoom.
    return overview && !expanded && !(selected && soleSelection);
}

function OverviewNode({ id, data, width, height, selected, fused = false }: {
    id: string; data: AppNodeData; width?: number; height?: number; selected: boolean; fused?: boolean;
}) {
    const dropType = useStore(s => s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget.type : null);
    const blocks = Array.isArray(data.content) ? data.content : undefined;
    const label = (data.label || (typeof data.content === 'string' ? data.content : blocks?.find(b => b.content)?.content) || blocks?.[0]?.type || 'Note').slice(0, 120);
    return (
        <div className={`${styles.overview} custom-drag-handle`} data-canvas-overview=""
            data-selected={selected || undefined} data-drop={dropType || undefined}
            style={{ width: width ?? 432, height: height ?? 120 }}
            onDoubleClick={event => {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
            }}>
            <span className={styles.label}>{label}</span>
            <Handle type="target" id={fused ? 'in' : undefined} position={Position.Left} className={styles.target} />
            <Handle type="source" id="out" position={fused ? Position.Top : Position.Right} className={styles.source} />
            <LinkTargetOverlay nodeId={id} />
        </div>
    );
}

// Keep the expensive component outside the overview branch: its sizing effects,
// menus, observers and previews should not mount for hundreds of distant nodes.
export const CanvasNoteNode = memo((props: NodeProps<NoteNode>) => {
    const overview = useOverviewProjection(props.id, props.selected, props.data.viewMode === 'expanded');
    const cardRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    return <CanvasNodeInteraction id={props.id} selected={props.selected} nodeType="note" data={props.data}
        controls={!overview && <CardResizeHandle id={props.id} cardRef={cardRef} contentRef={contentRef} />}>
        {overview ? <OverviewNode {...props} /> : <NoteCard {...props} cardRef={cardRef} contentRef={contentRef} />}
    </CanvasNodeInteraction>;
}, samePropsIgnoringPosition);

export const CanvasBlockNode = memo((props: NodeProps<NoteNode>) => {
    const overview = useOverviewProjection(props.id, props.selected);
    return <CanvasNodeInteraction id={props.id} selected={props.selected} nodeType="block" data={props.data}>
        {overview ? <OverviewNode {...props} /> : <BlockNode {...props} />}
    </CanvasNodeInteraction>;
}, samePropsIgnoringPosition);

export const CanvasFusedNode = memo((props: NodeProps<FusedNode>) => {
    const overview = useOverviewProjection(props.id, props.selected);
    return <CanvasNodeInteraction id={props.id} selected={props.selected} nodeType="fused-note" data={props.data}>
        {overview ? <OverviewNode {...props} fused /> : <FusedNoteNode {...props} />}
    </CanvasNodeInteraction>;
}, samePropsIgnoringPosition);
