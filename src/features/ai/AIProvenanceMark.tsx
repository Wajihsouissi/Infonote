import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, Globe, Sparkles } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AIProvenance } from '../../types';
import styles from './AIProvenanceMark.module.css';

/**
 * The "where did this come from" mark on an AI-created card — ai-Plan.md §5.4.
 *
 * The panel's transcript answers that question only while the chat is still
 * open. Three weeks later the chat is gone and the card is just a card, which
 * is precisely when a reader most needs to know whether to trust it. This puts
 * the receipt on the card itself: the request, the model, the effort, and every
 * source, each one clickable.
 *
 * Deliberately small and quiet. It is a footnote on someone's note, not a badge
 * the app wears with pride — a card the user has since edited is still theirs.
 */
export function AIProvenanceMark({ provenance }: { provenance: AIProvenance }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const setSelectedCanvasNodeIds = useStore((s) => s.setSelectedCanvasNodeIds);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (btnRef.current?.contains(target)) return;
            if (target.closest?.('[data-provenance-popover]')) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const when = (() => {
        const date = new Date(provenance.createdAt);
        return Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    })();

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={styles.mark}
                title="Made by AI — see the request and sources"
                aria-label="Made by AI — see the request and sources"
                aria-expanded={open}
                onClick={(event) => {
                    event.stopPropagation();
                    if (!open && btnRef.current) {
                        const r = btnRef.current.getBoundingClientRect();
                        setPos({ top: r.bottom + 6, left: r.left });
                    }
                    setOpen((o) => !o);
                }}
            >
                <Sparkles size={9} />
                AI
            </button>

            {open && createPortal(
                <div data-provenance-popover>
                    <div className={styles.backdrop} onClick={() => setOpen(false)} />
                    <div
                        className={styles.popover}
                        style={{ top: pos.top, left: pos.left }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.head}>
                            <span className={styles.headIcon}><Sparkles size={12} /></span>
                            <div>
                                <div className={styles.headTitle}>Where this came from</div>
                                {when && <div className={styles.headWhen}>{when}</div>}
                            </div>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.label}>You asked</div>
                            <p className={styles.prompt}>“{provenance.prompt}”</p>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.label}>Settings</div>
                            <div className={styles.metas}>
                                <span className={styles.meta}>{provenance.effort}</span>
                                <span className={styles.meta}>{provenance.model ?? 'Auto'}</span>
                            </div>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.label}>Built from</div>
                            {provenance.sources.length === 0 ? (
                                /* Not a gap to apologise for — an empty scope is
                                   a real, stated answer, and the one a reader
                                   most needs: this came from the model alone. */
                                <p className={styles.none}>Nothing on your canvas — written from the model’s own knowledge.</p>
                            ) : (
                                <div className={styles.sources}>
                                    {provenance.sources.map((source) => source.kind === 'node' ? (
                                        <button
                                            key={source.id}
                                            type="button"
                                            className={styles.source}
                                            onClick={() => {
                                                setSelectedCanvasNodeIds(new Set([source.id]));
                                                window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [source.id] } }));
                                                setOpen(false);
                                            }}
                                        >
                                            <Crosshair size={11} />
                                            <span>{source.title}</span>
                                        </button>
                                    ) : (
                                        <a
                                            key={source.url}
                                            className={styles.source}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Globe size={11} />
                                            <span>{source.title || source.host}</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
