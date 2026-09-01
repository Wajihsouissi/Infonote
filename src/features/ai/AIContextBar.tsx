import { useMemo } from 'react';
import { Layers, Sparkles, X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { describeScope, type AIScopeSource } from './aiScope';
import type { ScopeChip } from './aiScope';
import styles from './AIContextBar.module.css';

/* Explicit rather than a computed `styles['chip' + tone]` lookup: CSS-module
   class names are only checked when they are written out, so a renamed rule
   should break the build here instead of silently rendering unstyled. */
const TONE_CLASS: Record<ScopeChip['tone'], string> = {
    canvas: styles.chipCanvas,
    card: styles.chipCard,
    selection: styles.chipSelection,
    web: styles.chipWeb,
};

/**
 * Explicit canvas context belongs with the draft it qualifies. This renderer
 * intentionally has no empty state, label, add button, or web duplicate: `@`
 * attaches canvas material and the composer toolbar owns the web toggle.
 */
export function AIContextBar({
    scope,
    onRemove,
}: {
    /** User-attached canvas sources. */
    scope: AIScopeSource[];
    onRemove: (key: string) => void;
}) {
    const nodes = useStore((s) => s.nodes);
    const selectedIds = useStore((s) => s.selectedCanvasNodeIds);

    const chips = useMemo(
        () => describeScope(scope, nodes, selectedIds),
        [scope, nodes, selectedIds],
    );

    if (chips.length === 0) return null;

    return (
        <div className={styles.chips} aria-label="AI context">
            {chips.map((chip) => (
                <span key={chip.key} className={`${styles.chip} ${TONE_CLASS[chip.tone]}`}>
                    {chip.tone === 'canvas' ? <Layers size={11} /> : <Sparkles size={11} />}
                    {chip.label}
                    <button
                        type="button"
                        className={styles.remove}
                        onClick={() => onRemove(chip.key)}
                        aria-label={`Remove ${chip.label} from what the AI can see`}
                    >
                        <X size={10} />
                    </button>
                </span>
            ))}
        </div>
    );
}
