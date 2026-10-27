import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { stampProvenance, type RunnerContext } from '../ai/runner/context';
import type { IntelligentUIArtifact } from './types';
import { materializeUIBlocks } from './nativeBlocks';

export function placeIntelligentUI(artifact: IntelligentUIArtifact, ctx: RunnerContext): string {
    const state = useStore.getState();
    const size = { width: 640, height: artifact.initialHeight + 200 };
    const position = findNonOverlappingPosition(ctx.origin, size, state.nodes, ctx.currentParentId, ctx.viewport());
    const id = uuidv4();
    const blocks = materializeUIBlocks(artifact);
    state.addNode(blocks.length > 1 ? 'fused-note' : 'block', position, {
        label: artifact.title,
        content: blocks,
        isStandaloneBlock: blocks.length === 1,
    }, { width: size.width, height: 'auto' }, ctx.currentParentId || undefined, id);
    stampProvenance([id], ctx.provenance);
    return id;
}
