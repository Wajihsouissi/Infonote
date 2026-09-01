import { useCallback, useMemo, useState } from 'react';
import { Copy, GripVertical, MessageSquare, RefreshCw, Square, Trash2 } from '../../components/icons';
import { BlockEditor } from '../editor/BlockEditor';
import type { Block } from '../editor/types';
import { renderContentWithLinks } from '../editor/pasteUtils';
import {
    CHUNK_IT_MIME,
    cloneChunkBlocks,
    getAutomaticCutIndices,
    getChunkSections,
} from '../card/chunkItUtils';
import { getAIResultBlocks, serializeAIBlocks, stabilizeAIBlockIds, type AIResultPart } from './aiResultUtils';
import styles from './AIPanel.module.css';

/** The line or section currently being rewritten, and its text so far. */
export type AIRegeneratingPart = {
    start: number;
    count: number;
    text: string;
};

type AIMarkdownProps = {
    responseId: string;
    text: string;
    actionsDisabled?: boolean;
    regenerating?: AIRegeneratingPart | null;
    onExplore?: (part: AIResultPart) => void;
    onRegenerate?: (part: AIResultPart) => void;
    onStopRegenerate?: () => void;
    onDelete?: (part: AIResultPart) => void;
};

/**
 * Tables in a response are a reading surface, not an editing surface. Rendering
 * them through the canvas editor made its resize grips, cell minimums and
 * narrow-column rules leak into the AI panel. A small semantic table here keeps
 * the answer readable while the original block is still what gets dragged or
 * copied to the canvas.
 */
function ResponseTable({ block }: { block: Block }) {
    const rows = Array.isArray(block.metadata?.rows)
        ? block.metadata.rows.filter((row): row is string[] => Array.isArray(row))
        : [];
    if (rows.length === 0) return null;

    const columnCount = Math.max(...rows.map((row) => row.length));
    const cellsFor = (row: string[]) => Array.from(
        { length: columnCount },
        (_, index) => row[index] ?? '',
    );
    const header = cellsFor(rows[0]);

    return (
        <div className={styles.responseTableScroll} role="region" aria-label="AI response table" tabIndex={0}>
            <table className={styles.responseTable}>
                <thead>
                    <tr>
                        {header.map((cell, index) => (
                            <th key={index} scope="col" dangerouslySetInnerHTML={{ __html: renderContentWithLinks(cell) }} />
                        ))}
                    </tr>
                </thead>
                {rows.length > 1 && (
                    <tbody>
                        {rows.slice(1).map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {cellsFor(row).map((cell, columnIndex) => (
                                    <td key={columnIndex} dangerouslySetInnerHTML={{ __html: renderContentWithLinks(cell) }} />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                )}
            </table>
        </div>
    );
}

function ResultActionBar({
    part,
    className,
    disabled,
    regenerating,
    onExplore,
    onRegenerate,
    onStopRegenerate,
    onDelete,
}: {
    part: AIResultPart;
    className: string;
    disabled: boolean;
    regenerating: boolean;
    onExplore?: (part: AIResultPart) => void;
    onRegenerate?: (part: AIResultPart) => void;
    onStopRegenerate?: () => void;
    onDelete?: (part: AIResultPart) => void;
}) {
    const noun = part.kind === 'section' ? 'section' : 'line';
    const copyPart = () => {
        void navigator.clipboard?.writeText(part.text);
    };
    return (
        <div className={className} role="toolbar" aria-label={`${noun} actions`}>
            {/* A part rewrite is stopped from the part itself. The composer's
                run bar belongs to a whole turn, and this action never becomes
                one — see AIPanel.regenerateResultPart. */}
            {regenerating ? (
                <button type="button" className={styles.responseContextAction} onClick={() => onStopRegenerate?.()} title={`Stop regenerating this ${noun}`}>
                    <Square size={11} /><span>Stop</span>
                </button>
            ) : (
                <button type="button" className={styles.responseContextAction} onClick={() => onRegenerate?.(part)} disabled={disabled} title={`Regenerate ${noun}`}>
                    <RefreshCw size={11} /><span>Redo</span>
                </button>
            )}
            <button type="button" className={styles.responseContextAction} onClick={() => onExplore?.(part)} disabled={disabled} title={`Explore ${noun}`}>
                <MessageSquare size={11} /><span>Explore</span>
            </button>
            <button type="button" className={styles.responseContextAction} onClick={copyPart} disabled={disabled} title={`Copy ${noun}`}>
                <Copy size={11} /><span>Copy</span>
            </button>
            <button type="button" className={`${styles.responseContextAction} ${styles.responseContextActionDanger}`} onClick={() => onDelete?.(part)} disabled={disabled} title={`Delete ${noun}`}>
                <Trash2 size={11} /><span>Delete</span>
            </button>
        </div>
    );
}

/**
 * AI responses use the same native block vocabulary as canvas notes. Rich
 * output stays rich, while every block or grouped section can be copied onto
 * the canvas through the established Chunk It drag protocol.
 */
export function AIMarkdown({
    responseId,
    text,
    actionsDisabled = false,
    regenerating = null,
    onExplore,
    onRegenerate,
    onStopRegenerate,
    onDelete,
}: AIMarkdownProps) {
    const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(() => new Set());
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());

    /* A rewrite in flight streams into the answer where it will land, so the
       replacement is read in place instead of appearing all at once when the
       request finishes. The stored answer is untouched until it succeeds —
       this is a preview of the pending splice, not the splice itself. */
    const { blocks, liveStart, liveCount } = useMemo(() => {
        const base = getAIResultBlocks(text);
        if (!regenerating) {
            return { blocks: stabilizeAIBlockIds(base, responseId), liveStart: -1, liveCount: 0 };
        }
        const { start, count } = regenerating;
        const streamed = regenerating.text.trim();
        const parsed = streamed ? getAIResultBlocks(streamed) : [];
        // Until the first token lands (or if it parses to nothing) the fragment
        // stays on screen under the sweep rather than blinking out.
        const live = parsed.length > 0 ? parsed : base.slice(start, start + count);
        const merged = [...base.slice(0, start), ...live, ...base.slice(start + count)];
        return {
            blocks: stabilizeAIBlockIds(merged, responseId),
            liveStart: start,
            liveCount: live.length,
        };
    }, [regenerating, responseId, text]);

    const isPartRegenerating = useCallback(
        (part: AIResultPart) => liveStart >= 0
            && part.start <= liveStart
            && part.start + part.count >= liveStart + liveCount,
        [liveCount, liveStart],
    );

    const sections = useMemo(
        () => getChunkSections(blocks, getAutomaticCutIndices(blocks)).map((section) => ({
            ...section,
            // The final section grows as stream tokens append. Its start block
            // stays meaningful, whereas the parser's numeric end index does
            // not, so use that stable block identity for multi-selection.
            id: `section-${section.blocks[0]?.id ?? section.id}`,
        })),
        [blocks],
    );

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

    const beginDrag = useCallback((event: React.DragEvent, kind: 'block' | 'section', payloadBlocks: Block[]) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CHUNK_IT_MIME, JSON.stringify({
            kind,
            blocks: cloneChunkBlocks(payloadBlocks),
        }));
        event.dataTransfer.setData('text/plain', payloadBlocks.map((block) => block.content).join('\n'));
    }, []);

    const beginSectionDrag = useCallback((event: React.DragEvent, sectionId: string) => {
        const selected = selectedSectionIds.has(sectionId)
            ? sections.filter((section) => selectedSectionIds.has(section.id))
            : sections.filter((section) => section.id === sectionId);
        beginDrag(event, 'section', selected.flatMap((section) => section.blocks));
    }, [beginDrag, sections, selectedSectionIds]);

    const beginBlockDrag = useCallback((event: React.DragEvent, block: Block) => {
        const selected = selectedBlockIds.has(block.id)
            ? blocks.filter((candidate) => selectedBlockIds.has(candidate.id))
            : [block];
        beginDrag(event, selected.length === 1 ? 'block' : 'section', selected);
    }, [beginDrag, blocks, selectedBlockIds]);

    const partFor = useCallback((start: number, count: number, kind: AIResultPart['kind']): AIResultPart => {
        const partBlocks = blocks.slice(start, start + count);
        return { start, count, kind, text: serializeAIBlocks(partBlocks) };
    }, [blocks]);

    if (blocks.length === 0) return null;

    return (
        <div className={styles.responseWorkspace} aria-label="AI response blocks">
            {sections.map((section, sectionIndex) => {
                const isSectionSelected = selectedSectionIds.has(section.id);
                const sectionStart = blocks.indexOf(section.blocks[0]);
                const sectionPart = partFor(sectionStart, section.blocks.length, 'section');
                // The sweep marks what is actually being rewritten: the whole
                // frame only when every row inside it is part of the rewrite,
                // otherwise the affected rows carry it on their own.
                const sectionRegenerating = liveStart >= 0
                    && sectionStart >= liveStart
                    && sectionStart + section.blocks.length <= liveStart + liveCount;
                return (
                <section
                    key={section.id}
                    className={`${styles.responseSection} ${isSectionSelected ? styles.responseSectionSelected : ''} ${sectionRegenerating ? styles.responseSectionRegenerating : ''}`}
                >
                    <button
                        type="button"
                        className={styles.responseSectionHandle}
                        draggable
                        onClick={() => toggleSection(section.id)}
                        onDragStart={(event) => beginSectionDrag(event, section.id)}
                        aria-pressed={isSectionSelected}
                        title={isSectionSelected ? 'Selected section — drag to canvas' : 'Select section, then drag to canvas'}
                        aria-label={`Select section ${sectionIndex + 1} for canvas drag`}
                    >
                        <GripVertical size={14} />
                    </button>
                    <ResultActionBar
                        part={sectionPart}
                        className={styles.responseSectionActions}
                        disabled={actionsDisabled}
                        regenerating={isPartRegenerating(sectionPart)}
                        onExplore={onExplore}
                        onRegenerate={onRegenerate}
                        onStopRegenerate={onStopRegenerate}
                        onDelete={onDelete}
                    />

                    {section.blocks.map((block) => {
                        const isBlockSelected = selectedBlockIds.has(block.id);
                        const blockIndex = blocks.indexOf(block);
                        const blockPart = partFor(blockIndex, 1, 'line');
                        const blockRegenerating = liveStart >= 0
                            && blockIndex >= liveStart
                            && blockIndex < liveStart + liveCount;
                        return (
                        <div key={block.id} className={`${styles.responseBlockRow} ${isBlockSelected ? styles.responseBlockSelected : ''} ${blockRegenerating && !sectionRegenerating ? styles.responseBlockRegenerating : ''}`}>
                            <button
                                type="button"
                                className={styles.responseBlockHandle}
                                draggable
                                onClick={() => toggleBlock(block.id)}
                                onDragStart={(event) => beginBlockDrag(event, block)}
                                aria-pressed={isBlockSelected}
                                title={isBlockSelected ? 'Selected line — drag to canvas' : 'Select line, then drag to canvas'}
                                aria-label="Select line for canvas drag"
                            >
                                <GripVertical size={12} />
                            </button>
                            <ResultActionBar
                                part={blockPart}
                                className={styles.responseBlockActions}
                                disabled={actionsDisabled}
                                regenerating={blockRegenerating}
                                onExplore={onExplore}
                                onRegenerate={onRegenerate}
                                onStopRegenerate={onStopRegenerate}
                                onDelete={onDelete}
                            />
                            <div className={styles.responseBlockPreview}>
                                {block.type === 'table' ? (
                                    <ResponseTable block={block} />
                                ) : (
                                    <BlockEditor
                                        key={block.id}
                                        initialContent={[block]}
                                        /* Every line renders in its OWN editor here,
                                           so the live list index restarts at 1 for
                                           each one and a numbered list came out as
                                           "1. 1. 1.". The parser already stored the
                                           real ordinal on the block; this is the
                                           flag that tells the renderer to use it. */
                                        useStoredListNumbers
                                        readOnly
                                        minimal
                                        hideBlockHandles
                                        disableMediaControls
                                    />
                                )}
                            </div>
                        </div>
                        );
                    })}
                </section>
                );
            })}
        </div>
    );
}
