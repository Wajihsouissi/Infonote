import { useMemo } from 'react';
import { X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AppNode } from '../../types';
import { CardIcon } from '../card/iconMap';
import { nodeTitle } from './canvasContext';
import styles from './SelectedNodeStrip.module.css';

/**
 * The cards the next turn will be about, shown as small square thumbnails at
 * the top of the panel.
 *
 * Selection already fed the model — `buildCanvasContext` emits a
 * "[SELECTED CARDS — the user is pointing at these]" section — but nothing on
 * screen said *which* cards.
 * On a busy canvas that is unverifiable: you cannot tell whether the thing you
 * clicked is the thing the AI is looking at. Each tile names one card, and
 * clicking it flies the canvas there so you can check.
 */

/** Cover image, else the card's own Lucide icon, else its first letter. */
function ThumbFace({ node }: { node: AppNode }) {
    const data = node.data as { coverImage?: string; icon?: string };
    const title = nodeTitle(node);

    if (data.coverImage) {
        return <img src={data.coverImage} alt="" className={styles.cover} draggable={false} />;
    }
    if (data.icon) {
        return <CardIcon icon={data.icon} size={16} />;
    }
    return <span className={styles.initial}>{title.trim().charAt(0).toUpperCase() || '·'}</span>;
}

/**
 * Subscribes to `nodes` itself rather than taking them as a prop. The panel
 * derives its own selection from a one-off `getState()` read, which is fine for
 * a simple selection indicator but would leave a tile showing a stale title or
 * icon after the card is renamed. Keeping the subscription down here means a
 * canvas edit re-renders this strip only, not the whole panel and its
 * transcript.
 */
export function SelectedNodeStrip({
    selectedIds,
    variant = 'composer',
}: {
    selectedIds: ReadonlySet<string> | readonly string[];
    variant?: 'composer' | 'bubble';
}) {
    const allNodes = useStore((s) => s.nodes);
    const setSelectedCanvasNodeIds = useStore((s) => s.setSelectedCanvasNodeIds);
    const selectedIdSet = useMemo(
        () => selectedIds instanceof Set ? selectedIds : new Set(selectedIds),
        [selectedIds],
    );

    const nodes = useMemo(
        () => allNodes.filter((n: AppNode) => selectedIdSet.has(n.id)),
        [allNodes, selectedIdSet]
    );

    if (nodes.length === 0) return null;

    const visibleNodes = nodes.slice(0, 3);
    const hiddenCount = Math.max(0, nodes.length - visibleNodes.length);

    return (
        <div
            className={`${styles.strip} ${variant === 'bubble' ? styles.bubbleStrip : ''}`}
            aria-label={`${nodes.length} selected card${nodes.length === 1 ? '' : 's'} used as AI context`}
            data-depth={visibleNodes.length}
            data-has-overflow={hiddenCount > 0 || undefined}
        >
            <div
                className={styles.stack}
                data-depth={visibleNodes.length}
                data-has-overflow={hiddenCount > 0 || undefined}
            >
                {hiddenCount > 0 && (
                    <span className={styles.ghostCard} aria-hidden="true">
                        <span>+{hiddenCount}</span>
                    </span>
                )}
                {visibleNodes.map((node, index) => {
                    const title = nodeTitle(node);
                    return (
                        <div
                            key={node.id}
                            className={styles.stackCard}
                            style={{
                                '--stack-index': index,
                                '--stack-rotate': `${index * (variant === 'bubble' ? 4 : -4)}deg`,
                                '--stack-anchor-lift': `${index * -8}px`,
                            } as React.CSSProperties}
                        >
                            <button
                                type="button"
                                className={styles.cardButton}
                                /* CanvasBoard listens for this and setCenter()s
                                   on the node — the same channel the editor uses
                                   when it spawns a card off-screen. Reused
                                   rather than wiring a second focus path. */
                                onClick={() => window.dispatchEvent(
                                    new CustomEvent('panToNode', { detail: { id: node.id } })
                                )}
                                title={`${title} — click to show it on the canvas`}
                            >
                                <span className={styles.cardThumb}><ThumbFace node={node} /></span>
                                <span className={styles.cardCopy}>
                                    <strong>{title}</strong>
                                    <small>{index === 0 ? 'Included in this AI request' : 'Selected context'}</small>
                                </span>
                            </button>

                            {variant === 'composer' && (
                                <button
                                    type="button"
                                    className={styles.drop}
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        const nextSelection = new Set(useStore.getState().selectedCanvasNodeIds);
                                        nextSelection.delete(node.id);
                                        setSelectedCanvasNodeIds(nextSelection);
                                    }}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        const nextSelection = new Set(useStore.getState().selectedCanvasNodeIds);
                                        nextSelection.delete(node.id);
                                        setSelectedCanvasNodeIds(nextSelection);
                                    }}
                                    title={`Stop using “${title}”`}
                                >
                                    <X size={9} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
