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
 * screen said *which* cards, beyond a "3 cards selected" count in the composer.
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
 * a "3 cards selected" count but would leave a tile showing a stale title or
 * icon after the card is renamed. Keeping the subscription down here means a
 * canvas edit re-renders this strip only, not the whole panel and its
 * transcript.
 */
export function SelectedNodeStrip({ selectedIds }: { selectedIds: Set<string> }) {
    const allNodes = useStore((s) => s.nodes);
    const toggleCanvasNodeSelection = useStore((s) => s.toggleCanvasNodeSelection);
    const clearCanvasSelection = useStore((s) => s.clearCanvasSelection);

    const nodes = useMemo(
        () => allNodes.filter((n: AppNode) => selectedIds.has(n.id)),
        [allNodes, selectedIds]
    );

    if (nodes.length === 0) return null;

    return (
        <div className={styles.strip}>
            <div className={styles.tiles}>
                {nodes.map((node) => {
                    const title = nodeTitle(node);
                    return (
                        <div key={node.id} className={styles.tileWrap}>
                            <button
                                type="button"
                                className={styles.tile}
                                /* No per-card accent border here — the tile is
                                   deliberately grayscale (a neutral reference
                                   chip, not a place for the card's own color to
                                   show through), and a colored border would
                                   have fought that on every card that has one. */
                                /* CanvasBoard listens for this and setCenter()s
                                   on the node — the same channel the editor uses
                                   when it spawns a card off-screen. Reused
                                   rather than wiring a second focus path. */
                                onClick={() => window.dispatchEvent(
                                    new CustomEvent('panToNode', { detail: { id: node.id } })
                                )}
                                /* The tile is 34px, so the name lives in the
                                   tooltip rather than under it — a caption that
                                   narrow truncates to nothing useful. */
                                title={`${title} — click to show it on the canvas`}
                            >
                                <ThumbFace node={node} />
                            </button>

                            <button
                                type="button"
                                className={styles.drop}
                                onClick={() => toggleCanvasNodeSelection(node.id)}
                                title={`Stop using “${title}”`}
                            >
                                <X size={9} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {nodes.length > 1 && (
                <button
                    type="button"
                    className={styles.clearAll}
                    onClick={clearCanvasSelection}
                    title="Stop using all of these"
                >
                    Clear
                </button>
            )}
        </div>
    );
}
