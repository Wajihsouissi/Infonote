import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Edge } from '@xyflow/react';
import { GripVertical, Loader2, Network, Scissors, Sparkles } from '../../components/icons';
import { MIN_FUSED_SIZE } from '../../config/layout';
import { checkNodeCreationLimits } from '../../store/nodeLimits';
import { useStore } from '../../store/useStore';
import { useContentNodes } from '../../store/useContentNodes';
import { generateText } from '../../services/aiService';
import type { AppNode, KanbanNode } from '../../types';
import { BlockEditor } from '../editor/BlockEditor';
import type { Block } from '../editor/types';
import { SidePeek } from '../ui/SidePeek';
import {
    CHUNK_IT_MIME,
    chunkLabel,
    cloneChunkBlocks,
    getAutomaticCutIndices,
    getChunkSections,
    normalizeChunkBlocks,
} from './chunkItUtils';
import styles from './ChunkItPanel.module.css';

type ChunkableNode = Exclude<AppNode, KanbanNode> & { data: { content: Block[] } };

const isChunkableNode = (node: AppNode | undefined): node is ChunkableNode =>
    Boolean(node && node.type !== 'kanban' && 'content' in node.data && Array.isArray(node.data.content));

const nodeColor = (node: ChunkableNode) => 'color' in node.data ? node.data.color : undefined;

/** The editor keeps a placeholder text block in many fresh cards. Chunk It is
 * an extraction view, so those blank text-like rows are noise; rich/structural
 * blocks remain visible even when their `content` field is intentionally empty. */
const isEmptyPreviewBlock = (block: Block) => {
    const textLike = new Set(['text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'toggle', 'callout', 'quote', 'code', 'ai']);
    if (!textLike.has(block.type)) return false;
    const text = block.content
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim();
    return text.length === 0;
};

export function ChunkItPanel() {
    const chunkItNodeId = useStore((state) => state.chunkItNodeId);
    const setChunkItNodeId = useStore((state) => state.setChunkItNodeId);
    const nodes = useContentNodes();
    const currentParentId = useStore((state) => state.currentParentId);
    const auth = useStore((state) => state.auth);

    const [cutOverrides, setCutOverrides] = useState<Map<number, boolean>>(() => new Map());
    const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(() => new Set());
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
    const [createdCount, setCreatedCount] = useState(0);
    const [aiSplitting, setAiSplitting] = useState(false);
    const [aiSplitNote, setAiSplitNote] = useState<string | null>(null);

    const sourceNode = useMemo(() => nodes.find((node) => node.id === chunkItNodeId), [chunkItNodeId, nodes]);
    const blocks = useMemo<Block[]>(
        () => isChunkableNode(sourceNode)
            ? normalizeChunkBlocks(sourceNode.data.content).filter((block) => block.type !== 'divider' && !isEmptyPreviewBlock(block))
            : [],
        [sourceNode],
    );
    const automaticCuts = useMemo(() => getAutomaticCutIndices(blocks), [blocks]);
    const cutIndices = useMemo(() => {
        const next = new Set<number>();
        for (let index = 0; index < blocks.length - 1; index += 1) {
            if (cutOverrides.get(index) ?? automaticCuts.has(index)) next.add(index);
        }
        return next;
    }, [automaticCuts, blocks.length, cutOverrides]);
    const sections = useMemo(() => getChunkSections(blocks, cutIndices), [blocks, cutIndices]);

    useEffect(() => {
        setCutOverrides(new Map());
        setSelectedSectionIds(new Set());
        setSelectedBlockIds(new Set());
        setCreatedCount(0);
        setAiSplitting(false);
        setAiSplitNote(null);
    }, [chunkItNodeId]);

    const close = useCallback(() => setChunkItNodeId(null), [setChunkItNodeId]);

    const toggleCut = useCallback((index: number) => {
        setCutOverrides((current) => {
            const next = new Map(current);
            const isCut = current.get(index) ?? automaticCuts.has(index);
            next.set(index, !isCut);
            return next;
        });
    }, [automaticCuts]);

    const toggleSection = useCallback((id: string) => {
        setSelectedSectionIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleBlock = useCallback((id: string) => {
        setSelectedBlockIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const putPayload = useCallback((event: React.DragEvent, kind: 'block' | 'section', payloadBlocks: Block[]) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CHUNK_IT_MIME, JSON.stringify({ kind, blocks: cloneChunkBlocks(payloadBlocks) }));
        event.dataTransfer.setData('text/plain', payloadBlocks.map((block) => block.content).join('\n'));
    }, []);

    const beginSectionDrag = useCallback((event: React.DragEvent, sectionId: string) => {
        const chosen = selectedSectionIds.has(sectionId)
            ? sections.filter((section) => selectedSectionIds.has(section.id))
            : sections.filter((section) => section.id === sectionId);
        putPayload(event, 'section', chosen.flatMap((section) => section.blocks));
    }, [putPayload, sections, selectedSectionIds]);

    const beginBlockDrag = useCallback((event: React.DragEvent, block: Block) => {
        const chosen = selectedBlockIds.has(block.id)
            ? blocks.filter((candidate) => selectedBlockIds.has(candidate.id))
            : [block];
        putPayload(event, chosen.length === 1 ? 'block' : 'section', chosen);
    }, [blocks, putPayload, selectedBlockIds]);

    const createMindMap = useCallback(() => {
        if (!isChunkableNode(sourceNode) || sections.length === 0) return;

        const targetParentId = currentParentId ?? null;
        const violation = checkNodeCreationLimits({
            nodes,
            targetParentId,
            newNodeType: 'fused-note',
            isAuthenticated: auth.isAuthenticated,
            addedCount: sections.length,
        });
        if (violation) {
            useStore.getState().setLimitNotice(violation);
            return;
        }

        const spacing = 300;
        const startY = sourceNode.position.y - ((sections.length - 1) * spacing) / 2;
        const newNodes: AppNode[] = sections.map((section, index) => ({
            id: uuidv4(),
            type: 'fused-note',
            parentId: targetParentId || undefined,
            position: {
                x: sourceNode.position.x + MIN_FUSED_SIZE + 240,
                y: startY + index * spacing,
            },
            data: {
                label: chunkLabel(section.blocks),
                content: cloneChunkBlocks(section.blocks),
                isStandaloneBlock: true,
                color: nodeColor(sourceNode),
            },
            style: {
                width: MIN_FUSED_SIZE,
                height: Math.min(720, Math.max(208, 144 + section.blocks.length * 52)),
            },
            selected: false,
        }));
        const newEdges: Edge[] = newNodes.map((node) => ({
            id: uuidv4(),
            source: sourceNode.id,
            target: node.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#ff8a5f', strokeWidth: 2 },
            data: { parentId: targetParentId },
        }));

        useStore.getState().setNodes((current) => [...current, ...newNodes]);
        useStore.setState((state) => ({ edges: [...state.edges, ...newEdges] }));
        setCreatedCount(newNodes.length);
        window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [sourceNode.id, ...newNodes.map((node) => node.id)] } }));
    }, [auth.isAuthenticated, currentParentId, nodes, sections, sourceNode]);

    const improveSplitsWithAI = useCallback(async () => {
        if (blocks.length < 3 || aiSplitting) return;
        setAiSplitting(true);
        setAiSplitNote(null);
        try {
            const outline = blocks.map((block, index) => {
                const text = block.content
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 300);
                return `[${index}] ${block.type}: ${text}`;
            }).join('\n');
            const response = await generateText(
                `Choose the best boundaries for these existing content blocks. A cut index means “start a new section after this block”.\n\n${outline}`,
                {
                    system: 'You improve the organization of a nested canvas without changing any content. Return ONLY JSON like {"cuts":[1,4]}. Choose semantic topic boundaries, preserve tightly related lists with their heading, and use no more than 8 sections. Never rewrite, omit, or add content.',
                    model: useStore.getState().aiModel,
                    maxTokensOverride: 300,
                    phase: 'plan',
                },
            );
            const match = /\{[\s\S]*\}/.exec(response.replace(/```(?:json)?/gi, ''));
            const parsed = match ? JSON.parse(match[0]) as { cuts?: unknown } : null;
            const cuts = Array.isArray(parsed?.cuts)
                ? [...new Set(parsed.cuts.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < blocks.length - 1))]
                : [];
            const next = new Map<number, boolean>();
            for (let index = 0; index < blocks.length - 1; index += 1) next.set(index, cuts.includes(index));
            setCutOverrides(next);
            setAiSplitNote(cuts.length > 0 ? 'AI suggested semantic boundaries. You can still refine any cut.' : 'AI kept this as one cohesive section.');
        } catch (error) {
            setAiSplitNote(error instanceof Error ? error.message : 'Could not improve the splits right now.');
        } finally {
            setAiSplitting(false);
        }
    }, [aiSplitting, blocks]);

    if (!isChunkableNode(sourceNode)) return null;

    return (
        <SidePeek
            isOpen={Boolean(chunkItNodeId)}
            onClose={close}
            side="left"
            width="min(460px, 42vw)"
            title="Chunk it"
            icon={<Scissors size={15} />}
        >
            <div className={styles.panel} data-app-menu>
                <div className={styles.intro}>
                    <div>
                        <span className={styles.eyebrow}>Source card</span>
                        <h2>{'label' in sourceNode.data && sourceNode.data.label ? sourceNode.data.label : 'Untitled content'}</h2>
                        <p>Headings are sectioned automatically. AI can suggest better boundaries without changing the source.</p>
                    </div>
                    <div className={styles.introActions}>
                        <button
                            type="button"
                            className={styles.aiSplitButton}
                            onClick={() => void improveSplitsWithAI()}
                            disabled={blocks.length < 3 || aiSplitting}
                            title="Use AI to improve split boundaries without changing content"
                        >
                            {aiSplitting ? <Loader2 size={13} className={styles.spin} /> : <Sparkles size={13} />}
                            Improve splits
                        </button>
                        <span className={styles.count}>{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span>
                    </div>
                </div>

                <div className={styles.workspace} aria-label="Chunk it content">
                    {sections.map((section, sectionIndex) => {
                        const isSectionSelected = selectedSectionIds.has(section.id);
                        return (
                            <section key={section.id} className={`${styles.section} ${isSectionSelected ? styles.sectionSelected : ''}`}>
                                <div className={styles.sectionMeta}>
                                    <button
                                        type="button"
                                        className={styles.sectionHandle}
                                        draggable
                                        onClick={() => toggleSection(section.id)}
                                        onDragStart={(event) => beginSectionDrag(event, section.id)}
                                        aria-pressed={isSectionSelected}
                                        title={isSectionSelected ? 'Selected section — drag to canvas' : 'Select section, then drag to canvas'}
                                    >
                                        <GripVertical size={14} />
                                    </button>
                                    <span>Section {String(sectionIndex + 1).padStart(2, '0')}</span>
                                    <span>{section.blocks.length} {section.blocks.length === 1 ? 'block' : 'blocks'}</span>
                                </div>
                                {section.blocks.map((block, offset) => {
                                    const index = section.start + offset;
                                    const isBlockSelected = selectedBlockIds.has(block.id);
                                    return (
                                        <Fragment key={block.id}>
                                            <div className={`${styles.blockRow} ${isBlockSelected ? styles.blockSelected : ''}`}>
                                                <button
                                                    type="button"
                                                    className={styles.blockHandle}
                                                    draggable
                                                    onClick={() => toggleBlock(block.id)}
                                                    onDragStart={(event) => beginBlockDrag(event, block)}
                                                    aria-pressed={isBlockSelected}
                                                    title={isBlockSelected ? 'Selected block — drag to canvas' : 'Select block, then drag to canvas'}
                                                >
                                                    <GripVertical size={12} />
                                                </button>
                                                <div className={styles.blockPreview}>
                                                    <BlockEditor key={block.id} initialContent={[block]} readOnly minimal hideBlockHandles disableMediaControls />
                                                </div>
                                            </div>
                                            {index < blocks.length - 1 && (
                                                <button
                                                    type="button"
                                                    className={`${styles.cutLine} ${cutIndices.has(index) ? styles.cutLineActive : ''}`}
                                                    onClick={() => toggleCut(index)}
                                                    aria-pressed={cutIndices.has(index)}
                                                    title={cutIndices.has(index) ? 'Remove section cut' : 'Add section cut'}
                                                >
                                                    <span />
                                                    <Scissors size={12} />
                                                    <span />
                                                </button>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </section>
                        );
                    })}
                </div>

                <div className={styles.footer}>
                    <div className={styles.footerCopy}>
                        {createdCount > 0
                            ? `${createdCount} fused nodes created on this canvas.`
                            : aiSplitNote ?? 'Drag a block or section, or create the full map.'}
                    </div>
                    <button type="button" className={styles.createButton} onClick={createMindMap} disabled={sections.length === 0}>
                        <Network size={15} />
                        Create mind map
                    </button>
                </div>
            </div>
        </SidePeek>
    );
}
