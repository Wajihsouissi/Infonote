import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { getNodeBlocks } from '../../types';
import { CardIcon } from '../card/iconMap';
import { nodeTitle } from './canvasContext';
import styles from './AICitationPreview.module.css';

/**
 * Citation chip behaviour in the panel — ai-Plan.md §5.4.
 *
 * Hover previews the card; click goes to it. Two costs for two questions:
 * "what is this?" should not move the viewport and change the selection, which
 * is what going there does.
 *
 * ONE delegated listener rather than a component per chip. The chips are raw
 * HTML inside `dangerouslySetInnerHTML` (see `renderContentWithLinks`), so
 * there is no React node to hang a handler on — and an answer can carry a dozen
 * of them, which would be a dozen popover instances mounted to show at most one.
 *
 * The CLICK is delegated here too, and has to be. `BlockComponents` attaches an
 * onClick that handles these chips, but only on the editable branch: a
 * `readOnly` block renders as bare `dangerouslySetInnerHTML` with no handlers
 * at all. Since the panel renders every answer read-only, that handler never
 * ran here — clicking a citation in an AI answer did nothing until this.
 */

/** Long enough that crossing a chip on the way somewhere else shows nothing. */
const OPEN_DELAY_MS = 280;
const EXCERPT_CHARS = 220;

export function AICitationPreview({ scopeRef }: { scopeRef: React.RefObject<HTMLElement | null> }) {
    const nodes = useStore((s) => s.nodes);
    const [target, setTarget] = useState<{ id: string; rect: DOMRect } | null>(null);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        const root = scopeRef.current;
        if (!root) return;

        const clearTimer = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const onOver = (event: Event) => {
            const chip = (event.target as HTMLElement)?.closest?.('a[data-cite-node]') as HTMLElement | null;
            if (!chip) return;
            const id = chip.getAttribute('data-cite-node');
            if (!id) return;
            clearTimer();
            timerRef.current = window.setTimeout(() => {
                setTarget({ id, rect: chip.getBoundingClientRect() });
            }, OPEN_DELAY_MS);
        };

        const onOut = (event: Event) => {
            const chip = (event.target as HTMLElement)?.closest?.('a[data-cite-node]');
            if (!chip) return;
            clearTimer();
            setTarget(null);
        };

        /* Any scroll invalidates the anchor rectangle, and a preview pinned to
           where the chip used to be is worse than none. Capture, because the
           scroll happens on an inner container, not on window. */
        const onScroll = () => { clearTimer(); setTarget(null); };

        const onClick = (event: Event) => {
            const chip = (event.target as HTMLElement)?.closest?.('a[data-cite-node]') as HTMLElement | null;
            if (!chip) return;
            const id = chip.getAttribute('data-cite-node');
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            clearTimer();
            setTarget(null);
            const store = useStore.getState();
            // A citation that points at a deleted card should do nothing rather
            // than clear the selection and fly the canvas to nowhere.
            if (!store.nodes.some((n) => n.id === id)) return;
            store.setSelectedCanvasNodeIds(new Set([id]));
            window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
        };

        root.addEventListener('mouseover', onOver);
        root.addEventListener('mouseout', onOut);
        root.addEventListener('click', onClick);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            clearTimer();
            root.removeEventListener('mouseover', onOver);
            root.removeEventListener('mouseout', onOut);
            root.removeEventListener('click', onClick);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [scopeRef]);

    if (!target) return null;
    const node = nodes.find((n) => n.id === target.id);
    if (!node) return null;

    const title = nodeTitle(node);
    const body = (getNodeBlocks(node.data) ?? [])
        .map((b) => (typeof b.content === 'string' ? b.content : ''))
        .filter(Boolean)
        .join(' • ')
        .replace(/\s+/g, ' ')
        .trim();
    const excerpt = body.length > EXCERPT_CHARS ? `${body.slice(0, EXCERPT_CHARS)}…` : body;
    const color = 'color' in node.data && typeof node.data.color === 'string' ? node.data.color : undefined;

    /* Above the chip by default, flipped below when there is no room — a
       preview that opens off the top of the panel is the same as no preview. */
    const WIDTH = 268;
    const openBelow = target.rect.top < 190;
    const left = Math.max(10, Math.min(target.rect.left, window.innerWidth - WIDTH - 10));

    return createPortal(
        <div
            className={styles.preview}
            style={{
                width: WIDTH,
                left,
                ...(openBelow
                    ? { top: target.rect.bottom + 8 }
                    : { bottom: window.innerHeight - target.rect.top + 8 }),
            }}
            role="tooltip"
        >
            <div className={styles.snapshot} style={color ? { '--citation-accent': color } as CSSProperties : undefined}>
                <span className={styles.snapshotRail} />
                <div className={styles.head}>
                    <span className={styles.icon}>
                        <CardIcon icon={(node.data as { icon?: string }).icon ?? ''} size={13} />
                    </span>
                    <span className={styles.title}>{title}</span>
                </div>
                {excerpt
                    ? <p className={styles.body}>{excerpt}</p>
                    : <p className={styles.empty}>This card has no text yet.</p>}
            </div>
            <div className={styles.foot}>
                <Crosshair size={10} />
                Click to show it on the canvas
            </div>
        </div>,
        document.body,
    );
}
