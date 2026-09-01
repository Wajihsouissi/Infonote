import { useMemo } from 'react';
import {
    Crosshair,
    FileText,
    Globe,
    Kanban,
    Layers,
    Sparkles,
    Undo2,
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AppNode } from '../../types';
import { getNodeBlocks } from '../../types';
import { nodeTitle } from './canvasContext';
import styles from './AITurnResult.module.css';

/**
 * What a turn put on the canvas — ai-Plan.md §5.8.
 *
 * The old version was a flat strip of title tiles under a "Created on canvas /
 * Ready to explore" header. Every item looked identical, so a fourteen-card
 * board and a one-line note read as the same thing, and the only way to learn
 * what had actually been made was to go and look.
 *
 * This is the design's hierarchy instead: a labelled section, one row per
 * artifact carrying its own shape, size and provenance, with its turn-wide
 * actions available on hover, then the sources the turn was built from.
 *
 * Every number here is measured from the node that actually landed — lanes,
 * cards, blocks, milestones. None of it is reported by the model, so none of it
 * can be wrong about what is on the canvas.
 */

/** Per node type: the word for it, its icon, and the hue it is worn in. */
const SHAPE: Record<string, { label: string; icon: React.FC<{ size?: number }>; hue: string }> = {
    kanban: { label: 'Board', icon: Kanban, hue: 'var(--a-azure)' },
    'fused-note': { label: 'Document', icon: FileText, hue: 'var(--a-jade)' },
    note: { label: 'Card', icon: Layers, hue: 'var(--a-amber)' },
    block: { label: 'Block', icon: Layers, hue: 'var(--a-violet)' },
    image: { label: 'Image', icon: Sparkles, hue: 'var(--a-magenta)' },
};

const FALLBACK = { label: 'Item', icon: Sparkles, hue: 'var(--a-teal)' };

/**
 * The line under an artifact's title: what shape it is and how big.
 *
 * Counted from the store rather than taken from the generator's plan, because
 * the plan is what was asked for and this has to say what exists.
 */
function describe(node: AppNode, siblings: AppNode[]): string {
    const children = siblings.filter((n) => n.parentId === node.id);
    const shape = SHAPE[node.type ?? ''] ?? FALLBACK;

    if (node.type === 'kanban') {
        const data = node.data as { columns?: unknown[] };
        const lanes = Array.isArray(data.columns) ? data.columns.length : 0;
        return [
            shape.label,
            lanes > 0 ? `${lanes} lane${lanes === 1 ? '' : 's'}` : '',
            `${children.length} card${children.length === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · ');
    }

    const blocks = (getNodeBlocks(node.data) ?? []).filter(
        (b) => b.type === 'divider' || (typeof b.content === 'string' && b.content.trim()),
    ).length;

    return [shape.label, blocks > 0 ? `${blocks} block${blocks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

export function AITurnResult({
    nodeIds,
    onLocateAll,
    onUndo,
}: {
    nodeIds: string[];
    onLocateAll: () => void;
    onUndo: () => void;
}) {
    const nodes = useStore((s) => s.nodes);
    const setSelectedCanvasNodeIds = useStore((s) => s.setSelectedCanvasNodeIds);

    const made = useMemo(
        () => nodeIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n): n is AppNode => Boolean(n))
            /* Board cards and timeline steps are placed as children of the
               artifact that owns them. Listing all fourteen beside their board
               is what turned this section into a wall in the first place — the
               board's own row already counts them. */
            .filter((n) => !n.parentId || !nodeIds.includes(n.parentId)),
        [nodeIds, nodes],
    );

    /* Every node from one turn carries the same provenance object, so the first
       one that has it speaks for the turn. */
    const sources = useMemo(() => {
        for (const node of made) {
            const p = (node.data as { aiProvenance?: { sources?: unknown[] } }).aiProvenance;
            if (p?.sources?.length) return p.sources as { kind: string; id?: string; title: string; host?: string; url?: string }[];
        }
        return [];
    }, [made]);

    if (made.length === 0) return null;

    const locate = (id: string) => {
        setSelectedCanvasNodeIds(new Set([id]));
        window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
    };

    return (
        <div className={styles.result}>
            <div className={styles.sectionHead}>Added to the canvas</div>

            <div className={styles.made}>
                {made.map((node) => {
                    const shape = SHAPE[node.type ?? ''] ?? FALLBACK;
                    const Icon = shape.icon;
                    const title = nodeTitle(node);
                    return (
                        <div key={node.id} className={styles.artifact}>
                            <button
                                type="button"
                                className={styles.artifactPrimary}
                                onClick={() => locate(node.id)}
                                title={`Show “${title}” on the canvas`}
                            >
                                <span
                                    className={styles.artifactIcon}
                                    style={{ background: `color-mix(in srgb, ${shape.hue} 16%, transparent)`, color: shape.hue }}
                                >
                                    <Icon size={15} />
                                </span>
                                <span className={styles.artifactBody}>
                                    <span className={styles.artifactTitle}>{title}</span>
                                    <span className={styles.artifactMeta}>{describe(node, nodes)}</span>
                                </span>
                            </button>
                            <div className={styles.artifactActions} role="group" aria-label="Created item actions">
                                <button
                                    type="button"
                                    className={styles.artifactAction}
                                    onClick={onLocateAll}
                                    title={`Locate all ${made.length} item${made.length === 1 ? '' : 's'} from this turn`}
                                    aria-label={`Locate all ${made.length} item${made.length === 1 ? '' : 's'} from this turn`}
                                >
                                    <Crosshair size={13} />
                                </button>
                                <button
                                    type="button"
                                    className={styles.artifactAction}
                                    onClick={onUndo}
                                    title="Undo this turn"
                                    aria-label="Undo this turn"
                                >
                                    <Undo2 size={13} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {sources.length > 0 && (
                <>
                    <div className={styles.sectionHead}>Built from</div>
                    <div className={styles.sources}>
                        {sources.slice(0, 6).map((source, index) => source.kind === 'web' ? (
                            <a
                                key={source.url ?? index}
                                className={styles.source}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Globe size={11} />
                                {source.host || source.title}
                            </a>
                        ) : (
                            <button
                                key={source.id ?? index}
                                type="button"
                                /* The design system forces every <button> to the
                                   16px surface radius with !important; `round`
                                   is its documented escape. Without it a node
                                   source rendered square-ish beside a web
                                   source, which is an <a> and never hit that
                                   rule — two pills in one row, two shapes. */
                                data-button-shape="round"
                                className={styles.source}
                                onClick={() => source.id && locate(source.id)}
                            >
                                <Crosshair size={11} />
                                {source.title}
                            </button>
                        ))}
                        {sources.length > 6 && <span className={styles.sourceMore}>+{sources.length - 6}</span>}
                    </div>
                </>
            )}

        </div>
    );
}
