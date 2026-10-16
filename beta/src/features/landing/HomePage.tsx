import { useMemo, useState } from 'react';
import { ArrowRight, Clock, FileText, Search, Sparkles, User } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { CardIcon } from '../card/iconMap';
import { useStore } from '../../store/useStore';
import { getNodeBlocks, getNodeLabel, type AppNode } from '../../types';
import styles from './HomePage.module.css';

/**
 * The dashboard: a way back into work you already have.
 *
 * It reads the canvas in this browser and nothing else — there is no server to
 * ask. That is why it shows "recent" by the timestamps the cards carry rather
 * than a viewing history: a history would need a store of its own, and the
 * honest answer to "what was I last doing" is "what did I last change".
 */

const MAX_RECENT = 12;

function excerpt(node: AppNode): string {
    const text = (getNodeBlocks(node.data) ?? [])
        .map((block) => (typeof block.content === 'string' ? block.content : ''))
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function changedAt(node: AppNode): number {
    const data = node.data as { updatedAt?: string; createdAt?: string };
    return Date.parse(data.updatedAt ?? data.createdAt ?? '') || 0;
}

function relativeTime(at: number): string {
    if (!at) return '';
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    if (minutes < 10_080) return `${Math.floor(minutes / 1440)}d ago`;
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HomePage() {
    const nodes = useStore((s) => s.nodes);
    const displayName = useStore((s) => s.auth.displayName);
    const setView = useStore((s) => s.setView);
    const setSelectedCanvasNodeIds = useStore((s) => s.setSelectedCanvasNodeIds);
    const [query, setQuery] = useState('');

    const cards = useMemo(
        () => nodes.filter((node) => node.type === 'note' || node.type === 'fused-note'),
        [nodes],
    );

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const matching = needle
            ? cards.filter((node) => `${getNodeLabel(node.data) ?? ''} ${excerpt(node)}`.toLowerCase().includes(needle))
            : cards;
        return [...matching].sort((a, b) => changedAt(b) - changedAt(a)).slice(0, MAX_RECENT);
    }, [cards, query]);

    const openCard = (node: AppNode) => {
        setSelectedCanvasNodeIds(new Set([node.id]));
        setView('canvas');
        // The canvas listens for this and brings the card into view once it
        // has mounted; a frame's delay is what lets it.
        window.requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [node.id] } }));
        });
    };

    const firstName = displayName?.trim().split(/\s+/)[0];

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.brand}>
                    <Sparkles size={18} />
                    <span>Chnk it</span>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="ghost" size="sm" onClick={() => setView('profile')} leadingIcon={<User size={14} />}>
                        Profile
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setView('canvas')} leadingIcon={<ArrowRight size={14} />}>
                        Open canvas
                    </Button>
                </div>
            </header>

            <main className={styles.main}>
                <h1 className={styles.title}>
                    {firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
                </h1>
                <p className={styles.subtitle}>
                    {cards.length === 0
                        ? 'Your canvas is empty. Open it and write the first thing down.'
                        : `${cards.length} card${cards.length === 1 ? '' : 's'} on this device.`}
                </p>

                <label className={styles.search}>
                    <Search size={15} />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search your cards…"
                        aria-label="Search your cards"
                    />
                </label>

                {shown.length === 0 ? (
                    <p className={styles.empty}>
                        {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing here yet.'}
                    </p>
                ) : (
                    <>
                        <h2 className={styles.sectionTitle}>
                            {query.trim() ? 'Matches' : 'Recently changed'}
                        </h2>
                        <ul className={styles.cards}>
                            {shown.map((node) => {
                                const title = getNodeLabel(node.data) || 'Untitled';
                                const icon = (node.data as { icon?: string }).icon;
                                return (
                                    <li key={node.id}>
                                        <button type="button" className={styles.card} onClick={() => openCard(node)}>
                                            <span className={styles.cardIcon}>
                                                {node.type === 'fused-note'
                                                    ? <FileText size={16} />
                                                    : <CardIcon icon={icon ?? ''} size={16} />}
                                            </span>
                                            <span className={styles.cardBody}>
                                                <span className={styles.cardTitle}>{title}</span>
                                                <span className={styles.cardExcerpt}>{excerpt(node) || 'No writing yet'}</span>
                                            </span>
                                            <span className={styles.cardTime}>
                                                <Clock size={11} />
                                                {relativeTime(changedAt(node))}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </main>
        </div>
    );
}
