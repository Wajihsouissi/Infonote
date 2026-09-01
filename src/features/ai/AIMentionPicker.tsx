import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe, Layers, Search } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AppNode } from '../../types';
import { nodeTitle } from './canvasContext';
import { hasScopeSource, type AIScopeSource } from './aiScope';
import { CardIcon } from '../card/iconMap';
import styles from './AIMentionPicker.module.css';

/**
 * The `@` picker — ai-Plan.md §5.3, rule 3.
 *
 * Opens on `@` in the composer or from the context bar's Add button, and offers
 * three things: whole surfaces (`@Canvas`, `@Selection`, the web), containers a
 * card lives in, and a title search over the workspace.
 *
 * This is the ONLY way a canvas level reaches a prompt now. That is the point:
 * attaching context is a gesture the user makes and can see, not something a
 * regex over their question decides for them.
 */

type Entry =
    | { id: string; kind: 'source'; source: AIScopeSource; label: string; detail: string; icon: 'canvas' | 'selection' | 'web' }
    | { id: string; kind: 'node'; node: AppNode; label: string; detail: string };

const MAX_RESULTS = 8;

export function AIMentionPicker({
    query,
    onPick,
    onClose,
}: {
    /** Text typed after the `@`, or '' when opened from the Add button. */
    query: string;
    onPick: (source: AIScopeSource) => void;
    onClose: () => void;
}) {
    const nodes = useStore((s) => s.nodes);
    const selectedIds = useStore((s) => s.selectedCanvasNodeIds);
    const currentParentId = useStore((s) => s.currentParentId);
    const scope = useStore((s) => s.aiScope);
    const webSearch = useStore((s) => s.aiWebSearch);
    const setAIWebSearch = useStore((s) => s.setAIWebSearch);

    /* The active row is stored WITH the query it belongs to, so a new query
       resets the cursor during render rather than in an effect that would fire
       a second render pass — and a list that shrinks under the cursor clamps
       instead of leaving Enter pointing at nothing. */
    const [activeState, setActiveState] = useState<{ query: string; index: number }>({ query, index: 0 });
    const listRef = useRef<HTMLDivElement>(null);

    const entries = useMemo((): Entry[] => {
        const needle = query.trim().toLowerCase();
        const levelCount = nodes.filter((n) => (n.parentId ?? null) === currentParentId).length;

        const surfaces: Entry[] = [
            {
                id: 'canvas',
                kind: 'source',
                source: { kind: 'canvas', parentId: currentParentId },
                label: '@Canvas',
                detail: `${levelCount} card${levelCount === 1 ? '' : 's'} here · ranked, not dumped`,
                icon: 'canvas',
            },
            {
                id: 'web',
                kind: 'source',
                source: { kind: 'web' },
                label: '@Web',
                detail: webSearch ? 'already on for this chat' : 'answer with live sources and cite them',
                icon: 'web',
            },
        ];
        if (selectedIds.size > 0) {
            surfaces.splice(1, 0, {
                id: 'selection',
                kind: 'source',
                source: { kind: 'selection' },
                label: '@Selection',
                detail: `${selectedIds.size} card${selectedIds.size === 1 ? '' : 's'} selected right now`,
                icon: 'selection',
            });
        }

        const matchingSurfaces = needle
            ? surfaces.filter((s) => s.label.toLowerCase().includes(needle))
            : surfaces;

        // Containers first among cards — attaching a board is a much more
        // common intent than attaching one card inside it.
        const cards = nodes
            .filter((node) => !needle || nodeTitle(node).toLowerCase().includes(needle))
            .sort((a, b) => {
                const aContainer = a.type === 'kanban' || a.type === 'fused-note' ? 0 : 1;
                const bContainer = b.type === 'kanban' || b.type === 'fused-note' ? 0 : 1;
                if (aContainer !== bContainer) return aContainer - bContainer;
                return nodeTitle(a).localeCompare(nodeTitle(b));
            })
            .slice(0, MAX_RESULTS)
            .map((node): Entry => {
                const children = nodes.filter((n) => n.parentId === node.id).length;
                return {
                    id: node.id,
                    kind: 'node',
                    node,
                    label: nodeTitle(node),
                    detail: children > 0 ? `${node.type} · ${children} inside` : node.type,
                };
            });

        return [...matchingSurfaces, ...cards];
    }, [nodes, query, currentParentId, selectedIds, webSearch]);

    const active = activeState.query === query
        ? Math.min(activeState.index, Math.max(0, entries.length - 1))
        : 0;
    const setActive = (next: number | ((current: number) => number)) =>
        setActiveState({ query, index: typeof next === 'function' ? next(active) : next });

    const commit = (entry: Entry) => {
        if (entry.kind === 'source') {
            if (entry.source.kind === 'web') {
                setAIWebSearch(true);
                onClose();
                return;
            }
            onPick(entry.source);
            return;
        }
        // A container attaches with everything inside it; a leaf card attaches
        // on its own. Picking a board and getting only its title would be the
        // wrong reading of the gesture.
        const children = nodes.some((n) => n.parentId === entry.node.id);
        onPick(children ? { kind: 'subtree', rootId: entry.node.id } : { kind: 'node', id: entry.node.id });
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(entries.length - 1, i + 1)); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const entry = entries[active];
                if (!entry) return;
                event.preventDefault();
                // Stops the composer's own Enter handler from also sending the
                // half-typed message the mention belongs to.
                event.stopPropagation();
                commit(entry);
            }
        };
        // Capture: the composer's keydown runs on the textarea itself, so a
        // bubbling listener here would fire second and lose the race for Enter.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    useEffect(() => {
        listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    if (entries.length === 0) {
        return (
            <div className={styles.picker}>
                <div className={styles.empty}>
                    <Search size={13} />
                    <span>No card matches “{query}”.</span>
                </div>
            </div>
        );
    }

    let heading: string | null = null;

    return (
        <div className={styles.picker} ref={listRef} role="listbox" aria-label="Attach context">
            {entries.map((entry, index) => {
                const isSurface = entry.kind === 'source';
                const nextHeading = isSurface ? 'Whole surfaces' : query.trim() ? `Cards matching “${query.trim()}”` : 'Cards';
                const showHeading = nextHeading !== heading;
                heading = nextHeading;

                const alreadyOn = entry.kind === 'source'
                    ? entry.source.kind === 'web'
                        ? webSearch
                        : hasScopeSource(scope, entry.source)
                    : scope.some((s) => s.kind === 'node' ? s.id === entry.node.id : s.kind === 'subtree' && s.rootId === entry.node.id);

                return (
                    <div key={entry.id}>
                        {showHeading && <div className={styles.heading}>{nextHeading}</div>}
                        <button
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            data-active={index === active}
                            className={`${styles.row} ${index === active ? styles.rowActive : ''}`}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => commit(entry)}
                        >
                            <span className={styles.icon}>
                                {entry.kind === 'source'
                                    ? entry.icon === 'web' ? <Globe size={13} /> : <Layers size={13} />
                                    : <CardIcon icon={(entry.node.data as { icon?: string }).icon ?? ''} size={13} />}
                            </span>
                            <span className={styles.body}>
                                <span className={styles.title}>{entry.label}</span>
                                <span className={styles.detail}>{entry.detail}</span>
                            </span>
                            {alreadyOn
                                ? <span className={styles.on}><Check size={11} /></span>
                                : index === active && <span className={styles.key}>↵</span>}
                        </button>
                    </div>
                );
            })}

            <div className={styles.footnote}>
                Only what you attach here is sent. Nothing else on your canvas is read.
            </div>
        </div>
    );
}
