import { memo, useEffect, useState, type ReactNode } from 'react';
import type { Block } from '../editor/types';
import { NoteBodyPreview } from './NoteBodyPreview';
import { SkeletonLoader } from './SkeletonLoader';
import styles from './NoteBody.module.css';

/** Keep in step with --lod-fade in NoteBody.module.css. */
const FADE_MS = 180;

interface NoteBodyProps {
    blocks: Block[];
    /** True once the live editor should be the visible layer. */
    showLiveEditor: boolean;
    /**
     * This card is queued to become editable. The wireframe animates while it
     * waits — the skeleton is the loading state, so nothing has to cover the
     * board to say "working on it".
     */
    isEditorPending?: boolean;
    /** The live editor. Only invoked while it is mounted. */
    renderEditor: () => ReactNode;
}

/**
 * Owns the swap between a card's two levels of detail.
 *
 * Without this the card flipped between static preview and live editor in a
 * single frame, which reads as a flicker while zooming — the two layers use
 * different type metrics, so every line appears to jump. Here both layers are
 * mounted for the length of one short fade and the outgoing one is lifted out
 * of flow, so the swap is a dissolve rather than a jump. The extra layer only
 * exists during the transition, so it costs nothing at rest.
 */
export const NoteBody = memo(function NoteBody({
    blocks,
    showLiveEditor,
    isEditorPending,
    renderEditor,
}: NoteBodyProps) {
    // Which layers are in the tree (a superset of what is visible, mid-fade).
    const [editorMounted, setEditorMounted] = useState(showLiveEditor);
    const [previewMounted, setPreviewMounted] = useState(!showLiveEditor);
    // Which layer is currently faded up. Applied a frame late so the browser
    // has an initial opacity to transition *from*.
    const [liveOnTop, setLiveOnTop] = useState(showLiveEditor);

    useEffect(() => {
        let raf = 0;
        let timer = 0;

        /* The synchronous setState below is the point of this effect, not an
           oversight: the incoming layer has to be in the tree before the next
           frame can animate its opacity, and the outgoing one has to stay until
           the fade ends. Deriving it during render instead would mean both
           layers were always mounted, which is exactly the cost this whole
           mechanism exists to avoid. */
        if (showLiveEditor) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditorMounted(true);
            // Hold the preview over the freshly mounted editor while it fades.
            raf = requestAnimationFrame(() => setLiveOnTop(true));
            timer = window.setTimeout(() => setPreviewMounted(false), FADE_MS);
        } else {
            setPreviewMounted(true);
            raf = requestAnimationFrame(() => setLiveOnTop(false));
            // Drop the editor only after the preview has covered it, so the
            // teardown is never visible.
            timer = window.setTimeout(() => setEditorMounted(false), FADE_MS);
        }

        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(timer);
        };
    }, [showLiveEditor]);

    const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

    return (
        <div className={styles.body}>
            {editorMounted && (
                <div
                    className={cx(
                        styles.layer,
                        liveOnTop && styles.visible,
                        // Outgoing layer: overlay so the preview drives height.
                        !showLiveEditor && styles.overlay,
                    )}
                >
                    {renderEditor()}
                </div>
            )}

            {previewMounted && (
                <div
                    className={cx(
                        styles.layer,
                        !liveOnTop && styles.visible,
                        showLiveEditor && styles.overlay,
                    )}
                >
                    {blocks.length > 0
                        ? <NoteBodyPreview content={blocks} loading={isEditorPending} />
                        : <SkeletonLoader />}
                </div>
            )}
        </div>
    );
});
