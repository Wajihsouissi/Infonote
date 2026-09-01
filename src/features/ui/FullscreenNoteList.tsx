import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { FolderArt } from '../card/FolderArt';
import { CardIcon } from '../card/iconMap';
import { ChevronDown, ChevronRight, Columns2, Flag, PanelLeftClose, PanelLeftOpen, Plus, Search } from '../../components/icons';
import type { AppNode, BlockNode, NoteNode } from '../../types';
import { FileArt, describeFile, isFileNode, nodeFileBlock } from '../file';
import { formatBytes } from '../editor/mediaTypes';
import type { FullscreenPane } from './FullscreenModal';
import styles from './FullscreenNoteList.module.css';

/**
 * The note stream down the left of fullscreen.
 *
 * Fullscreen used to be a dead end: one card, and the only way to the next one
 * was back out to the canvas. The rail lists the cards of the canvas fullscreen
 * was entered from so reading can move card to card without ever leaving it —
 * the reason it starts from that canvas rather than the whole graph is that
 * "the canvas you came from" is the set the user already has in mind.
 *
 * A card that holds nested cards carries them as a collapsed branch. Nesting is
 * real structure here — a `page` block in a note's body is a child node whose
 * `parentId` points back at the note — so the tree is read straight off
 * `parentId` rather than being a second index that could drift out of sync.
 *
 * Each row wears the folder view of its card: the same artwork the canvas draws
 * for a folder-mode card, so a card is recognised in the rail by the picture it
 * already has, not by a generic list bullet. Collapsed, the rail keeps the same
 * list as a strip of card icons — narrow enough to stay out of the way, but
 * still navigable, which a rail collapsing to nothing would not be.
 */

/**
 * What the rail lists: the canvas's cards, and its files.
 *
 * A file is a `block` node holding one `file` block, so it has none of the
 * fields a note keeps — no `createdAt`, no icon, no description. Rather than
 * teach every reader below about two shapes, the accessors under this comment
 * answer the same handful of questions for both, and the rest of the rail is
 * written against them.
 */
type RailNode = NoteNode | BlockNode;

const isRailNode = (node: AppNode): node is RailNode =>
    node.type === 'note' || isFileNode(node);

const isNoteRow = (node: RailNode): node is NoteNode => node.type === 'note';

const railLabel = (node: RailNode): string => {
    if (isNoteRow(node)) return node.data.label || 'Untitled';
    return nodeFileBlock(node)?.metadata?.name || 'File';
};

/** A note's own subtitle; for a file, what it is and how big. */
const railDescription = (node: RailNode): string | undefined => {
    if (isNoteRow(node)) return node.data.description;
    const block = nodeFileBlock(node);
    if (!block) return undefined;
    const kind = describeFile(block.metadata?.type, block.metadata?.name);
    const size = block.metadata?.size;
    return typeof size === 'number' ? `${kind.label} · ${formatBytes(size)}` : kind.label;
};

const railColor = (node: RailNode): string | undefined => node.data.color;

const railIsPinned = (node: RailNode): boolean => Boolean(node.data.isPinned);

/** Glyph for the collapsed strip, where there is no room for the artwork. */
const railIcon = (node: RailNode): string => {
    if (isNoteRow(node)) return node.data.icon ?? 'FileText';
    const block = nodeFileBlock(node);
    return describeFile(block?.metadata?.type, block?.metadata?.name).icon;
};

/** ISO timestamps, from wherever each kind of node keeps them. */
const railCreatedAt = (node: RailNode): string | undefined =>
    isNoteRow(node) ? node.data.createdAt : nodeFileBlock(node)?.metadata?.addedAt;

const railUpdatedAt = (node: RailNode): string | undefined =>
    isNoteRow(node) ? node.data.updatedAt : nodeFileBlock(node)?.metadata?.addedAt;

/** Gap left under the lowest sibling when a new card is dropped on the canvas. */
const NEW_CARD_GAP = 48;
const DEFAULT_CARD_HEIGHT = 432;

/**
 * Indent stops growing past this depth. Nesting itself stays unlimited — the
 * rail is 288px wide, so past three levels the indent would be taking width
 * from the labels to say something the branch lines already say.
 */
const INDENT_CAP = 3;

/** Belt-and-braces stop: a corrupt `parentId` cycle must not hang the render. */
const MAX_TREE_DEPTH = 20;

type TreeRow = {
    node: RailNode;
    depth: number;
    hasChildren: boolean;
};

type DateGroupId = 'today' | 'yesterday' | 'this-week' | 'older';
type SortMode = 'created' | 'updated' | 'title' | 'manual';

const DATE_GROUPS: ReadonlyArray<{ id: DateGroupId; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this-week', label: 'This Week' },
    { id: 'older', label: 'Older' },
];

const creationTime = (node: RailNode) => {
    const value = Date.parse(railCreatedAt(node) ?? '');
    return Number.isFinite(value) ? value : 0;
};

const updatedTime = (node: RailNode) => {
    const value = Date.parse(railUpdatedAt(node) ?? '');
    return Number.isFinite(value) ? value : 0;
};

/** Body copy belongs to the same local search as a node's visible metadata.
 *  A file has no body to search — its name and kind are all there is. */
const searchableText = (node: RailNode) => {
    if (!isNoteRow(node)) {
        return `${railLabel(node)} ${railDescription(node) ?? ''}`.toLocaleLowerCase();
    }
    const { label = '', description = '', content } = node.data;
    const body = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    return `${label} ${description} ${body}`.toLocaleLowerCase();
};

function creationGroup(node: RailNode, now = new Date()): DateGroupId {
    const createdAt = creationTime(node);
    if (!createdAt) return 'older';

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    if (createdAt >= today.getTime()) return 'today';
    if (createdAt >= yesterday.getTime()) return 'yesterday';
    if (createdAt >= weekStart.getTime()) return 'this-week';
    return 'older';
}

export function FullscreenNoteList({
    leftId,
    rightId,
    focusedPane,
    onSelect,
    onOpenSplit
}: {
    leftId: string;
    /** The second pane's card, or null when a single note is open. */
    rightId: string | null;
    focusedPane: FullscreenPane;
    /** Open a card in whichever pane the reader last touched. */
    onSelect: (id: string) => void;
    /** Open a card beside the current one, splitting the view. */
    onOpenSplit: (id: string) => void;
}) {
    /* The whole array, filtered in a memo rather than inside the selector:
       a selector that builds a new array re-runs on every store write and
       fails zustand's identity check, re-rendering the rail constantly. */
    const nodes = useStore(s => s.nodes);
    const activeNode = useStore(s => getNodeById(s.nodes, leftId));
    const addNode = useStore(s => s.addNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const isSplit = rightId !== null;
    const [query, setQuery] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('created');
    const searchRef = useRef<HTMLInputElement | null>(null);

    /* Two notes side by side leave little room to read in, so a split folds the
       rail down to its icons and a single note opens it again. That is the
       default, not a lock: the override below holds whatever the reader last
       chose, and is tagged with the split state it was chosen under so that
       entering or leaving a split falls back to the default rather than
       carrying a decision made about a different layout. */
    const [override, setOverride] = useState<{ split: boolean; collapsed: boolean } | null>(null);
    const collapsed = override && override.split === isSplit ? override.collapsed : isSplit;
    const setCollapsed = (value: boolean) => setOverride({ split: isSplit, collapsed: value });

    /**
     * The canvas the tree is rooted at, fixed for as long as fullscreen is open.
     *
     * Deliberately not derived from the open card: opening a nested child would
     * then re-root the rail to that child's own level, and the branch the reader
     * had just expanded to find it would vanish underneath them. Pinning the
     * root means opening a child only moves the highlight. The rail unmounts
     * with the modal, so the next fullscreen re-pins from wherever it opens.
     */
    const rootRef = useRef<{ value: string | null } | null>(null);
    if (rootRef.current === null) {
        rootRef.current = { value: activeNode?.parentId ?? null };
    }
    const rootParentId = rootRef.current.value;

    /* One pass over the nodes, bucketed by parent — the tree is walked several
       times below (rows, totals) and re-scanning the array for each level would
       make the rail O(nodes × levels). */
    const childrenByParent = useMemo(() => {
        const map = new Map<string | null, RailNode[]>();
        for (const node of nodes) {
            if (!isRailNode(node)) continue;
            const key = node.parentId ?? null;
            const bucket = map.get(key);
            if (bucket) bucket.push(node);
            else map.set(key, [node]);
        }
        /* Every order falls back to canvas position, keeping legacy cards
           stable even when they predate timestamps. */
        for (const bucket of map.values()) {
            bucket.sort((a, b) => {
                if (sortMode === 'title') {
                    const byTitle = railLabel(a).localeCompare(railLabel(b), undefined, { sensitivity: 'base' });
                    if (byTitle) return byTitle;
                } else if (sortMode === 'created') {
                    const byCreated = creationTime(b) - creationTime(a);
                    if (byCreated) return byCreated;
                } else if (sortMode === 'updated') {
                    const byUpdated = updatedTime(b) - updatedTime(a);
                    if (byUpdated) return byUpdated;
                }
                return (a.position.y - b.position.y) || (a.position.x - b.position.x);
            });
        }
        return map;
    }, [nodes, sortMode]);

    const topLevel = useMemo(
        () => childrenByParent.get(rootParentId) ?? [],
        [childrenByParent, rootParentId]
    );

    /** Every branch between the root and a card that is currently on screen. */
    const revealed = useMemo(() => {
        const set = new Set<string>();
        for (const openId of [leftId, rightId]) {
            if (!openId) continue;
            let cursor = getNodeById(nodes, openId)?.parentId ?? null;
            let guard = 0;
            while (cursor && cursor !== rootParentId && guard++ < MAX_TREE_DEPTH) {
                set.add(cursor);
                cursor = getNodeById(nodes, cursor)?.parentId ?? null;
            }
        }
        return set;
    }, [nodes, leftId, rightId, rootParentId]);

    /* Expansion is an override *on top of* `revealed` rather than the whole
       truth, so the path down to whatever is open unfolds itself and the reader
       still keeps the last word on any branch they touch. */
    const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});

    const isExpanded = useCallback(
        (id: string) => expandOverrides[id] ?? revealed.has(id),
        [expandOverrides, revealed]
    );

    const toggleExpanded = useCallback((id: string) => {
        setExpandOverrides(prev => ({ ...prev, [id]: !(prev[id] ?? revealed.has(id)) }));
    }, [revealed]);

    /* Opening a card has to show it, so any collapse the reader had set on the
       way down to it is dropped — `revealed` then takes over for that path. */
    const revealPath = useCallback((id: string) => {
        setExpandOverrides(prev => {
            let next = prev;
            let cursor = getNodeById(nodes, id)?.parentId ?? null;
            let guard = 0;
            while (cursor && cursor !== rootParentId && guard++ < MAX_TREE_DEPTH) {
                if (next[cursor] === false) {
                    if (next === prev) next = { ...prev };
                    delete next[cursor];
                }
                cursor = getNodeById(nodes, cursor)?.parentId ?? null;
            }
            return next;
        });
    }, [nodes, rootParentId]);

    const handleSelect = useCallback((id: string) => {
        revealPath(id);
        onSelect(id);
    }, [revealPath, onSelect]);

    const handleOpenSplit = useCallback((id: string) => {
        revealPath(id);
        onOpenSplit(id);
    }, [revealPath, onOpenSplit]);

    const togglePinned = useCallback((node: RailNode) => {
        updateNodeData(node.id, { isPinned: !railIsPinned(node) });
    }, [updateNodeData]);

    /**
     * Top-level cards are grouped by creation date; their visible descendants
     * stay with that parent, preserving the tree rather than scattering child
     * notes into a different time bucket from the branch they belong to.
     */
    const dateSections = useMemo(() => {
        const groups = new Map<DateGroupId, TreeRow[]>();
        for (const group of DATE_GROUPS) groups.set(group.id, []);

        const normalizedQuery = query.trim().toLocaleLowerCase();
        const branchMatches = (node: RailNode, depth: number): boolean => {
            if (depth > MAX_TREE_DEPTH) return false;
            if (searchableText(node).includes(normalizedQuery)) return true;
            return (childrenByParent.get(node.id) ?? []).some(child => branchMatches(child, depth + 1));
        };

        const appendBranch = (node: RailNode, depth: number, out: TreeRow[]) => {
            if (depth > MAX_TREE_DEPTH) return;
            const children = childrenByParent.get(node.id) ?? [];
            if (normalizedQuery && !branchMatches(node, depth)) return;
            const hasChildren = children.length > 0;
            out.push({ node, depth, hasChildren });
            /* Search reveals matching paths without changing the reader's own
               expansion choices, which come back intact when it is cleared. */
            if (hasChildren && (normalizedQuery || isExpanded(node.id))) {
                for (const child of children) appendBranch(child, depth + 1, out);
            }
        };

        const now = new Date();
        for (const node of childrenByParent.get(rootParentId) ?? []) {
            appendBranch(node, 0, groups.get(creationGroup(node, now))!);
        }

        const datedSections = DATE_GROUPS
            .map((group) => ({ ...group, rows: groups.get(group.id)! }))
            .filter((group) => group.rows.length > 0);

        return sortMode === 'created'
            ? datedSections
            : datedSections.length > 0 ? [{ id: 'all', label: 'Notes', rows: datedSections.flatMap(section => section.rows) }] : [];
    }, [childrenByParent, rootParentId, isExpanded, query, sortMode]);

    /** The collapsed icon rail keeps this exact filtered and sorted order. */
    const rows = useMemo(() => dateSections.flatMap((section) => section.rows), [dateSections]);
    const pinnedRows = useMemo(() => rows.filter(({ node }) => railIsPinned(node)), [rows]);
    const unpinnedSections = useMemo(() => dateSections.map(section => ({
        ...section,
        rows: section.rows.filter(({ node }) => !railIsPinned(node)),
    })).filter(section => section.rows.length > 0), [dateSections]);

    /* The header counts the whole tree, not the visible rows — a number that
       shrank every time a branch was folded would be reporting the furniture
       rather than the notes. */
    const totalNotes = useMemo(() => {
        let count = 0;
        const walk = (parentId: string | null, depth: number) => {
            if (depth > MAX_TREE_DEPTH) return;
            for (const node of childrenByParent.get(parentId) ?? []) {
                count++;
                walk(node.id, depth + 1);
            }
        };
        walk(rootParentId, 0);
        return count;
    }, [childrenByParent, rootParentId]);

    /**
     * A card made here is a canvas card like any other — the rail only decides
     * where it lands. It joins the rail's own canvas (never the branch being
     * read, which could be collapsed and hide it), under the lowest card there
     * rather than at the origin, so going back to the canvas finds it at the
     * foot of the column instead of stacked on whatever already sits at 0,0.
     */
    const handleCreate = useCallback(() => {
        const anchors: AppNode[] = topLevel.length > 0 ? topLevel : (activeNode ? [activeNode] : []);

        const position = anchors.length > 0
            ? {
                x: Math.min(...anchors.map(n => n.position.x)),
                y: Math.max(...anchors.map(n =>
                    n.position.y + (typeof n.style?.height === 'number' ? n.style.height : DEFAULT_CARD_HEIGHT)
                )) + NEW_CARD_GAP
            }
            : { x: 0, y: 0 };

        const newId = uuidv4();
        addNode('note', position, { label: 'New Note' }, undefined, rootParentId ?? undefined, newId);

        /* addNode declines silently when a beta creation limit is hit — it puts
           up its own notice — so the card is only opened once it really exists. */
        if (useStore.getState().nodes.some(n => n.id === newId)) {
            onSelect(newId);
        }
    }, [topLevel, activeNode, rootParentId, addNode, onSelect]);

    /** Which pane a row is showing in, or null when it is not open at all. */
    const paneOf = (id: string): FullscreenPane | null =>
        id === leftId ? 'left' : (id === rightId ? 'right' : null);

    const focusedRef = useRef<HTMLButtonElement | null>(null);

    const renderRow = (node: RailNode, depth: number, hasChildren: boolean) => {
        const label = railLabel(node);
        const description = railDescription(node);
        const color = railColor(node);
        const pinned = railIsPinned(node);
        const file = nodeFileBlock(node);
        const pane = paneOf(node.id);
        const isFocused = pane === focusedPane;
        const expanded = hasChildren && isExpanded(node.id);

        return (
            <div
                key={node.id}
                className={`${styles.row} ${depth > 0 ? styles.rowNested : ''}`}
                style={{ '--depth': Math.min(depth, INDENT_CAP) } as React.CSSProperties}
            >
                {hasChildren && (
                    <button
                        className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
                        onClick={() => toggleExpanded(node.id)}
                        title={expanded ? 'Collapse' : 'Expand'}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label || 'Untitled'}`}
                        aria-expanded={expanded}
                    >
                        <ChevronRight size={13} />
                    </button>
                )}

                <button
                    ref={isFocused ? focusedRef : undefined}
                    className={`${styles.item} ${pane ? styles.itemOpen : ''} ${pane === 'left' ? styles.paneLeft : pane === 'right' ? styles.paneRight : ''} ${isFocused ? styles.itemActive : ''}`}
                    onClick={() => handleSelect(node.id)}
                    aria-current={isFocused ? 'true' : undefined}
                    style={color ? ({ '--node-accent': color } as React.CSSProperties) : undefined}
                    data-accented={color ? '' : undefined}
                >
                    {/* Each row wears its object's own artwork: a card shows the
                        folder the canvas draws for it, a file shows its sheet.
                        Recognising a row by the picture it already has is the
                        whole point of the rail, and a file is no exception. */}
                    <span className={styles.art}>
                        {file
                            ? <FileArt name={file.metadata?.name} mime={file.metadata?.type} poster={file.metadata?.poster} size={46} />
                            : isNoteRow(node)
                                ? <FolderArt coverImage={node.data.coverImage} icon={node.data.icon} size={46} />
                                : null}
                    </span>
                    <span className={styles.text}>
                        <span className={styles.label}>{label}</span>
                        {description && <span className={styles.description}>{description}</span>}
                    </span>
                    {isSplit && pane && <span className={styles.side}>{pane === 'left' ? 'L' : 'R'}</span>}
                </button>

                {!pane && (
                    <button className={`${styles.splitButton} icon-hover`} onClick={() => handleOpenSplit(node.id)} title="Open beside" aria-label={`Open ${label || 'Untitled'} beside`}>
                        <Columns2 size={14} />
                    </button>
                )}

                <button
                    className={`${styles.pinButton} ${pinned ? styles.pinButtonActive : ''}`}
                    onClick={() => togglePinned(node)}
                    title={pinned ? 'Unpin' : 'Pin'}
                    aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
                >
                    <Flag size={13} />
                </button>
            </div>
        );
    };

    // Keep the open card visible when fullscreen is entered on an off-screen row.
    useEffect(() => {
        focusedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [leftId, rightId, focusedPane, collapsed]);

    useEffect(() => {
        const isTypingTarget = (target: EventTarget | null) => target instanceof HTMLElement && (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        );
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setCollapsed(false);
                requestAnimationFrame(() => searchRef.current?.focus());
                return;
            }
            if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            const currentId = focusedPane === 'left' ? leftId : rightId;
            const currentIndex = rows.findIndex(({ node }) => node.id === currentId);
            const nextIndex = event.key === 'ArrowUp'
                ? Math.max(0, currentIndex - 1)
                : Math.min(rows.length - 1, currentIndex + 1);
            const next = rows[nextIndex];
            if (!next || next.node.id === currentId) return;
            event.preventDefault();
            handleSelect(next.node.id);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [leftId, rightId, focusedPane, rows, handleSelect]);

    if (collapsed) {
        return (
            <div className={styles.rail}>
                <button
                    className={`${styles.toggle} icon-hover`}
                    onClick={() => setCollapsed(false)}
                    title="Show notes"
                    aria-label="Show notes"
                >
                    <PanelLeftOpen size={16} />
                </button>

                <button
                    className={`${styles.toggle} icon-hover`}
                    onClick={handleCreate}
                    title="New note"
                    aria-label="New note"
                >
                    <Plus size={16} />
                </button>

                <div className={styles.railDivider} />

                {/* The same rows as the open rail, minus the indent — 52px has no
                    room to draw depth, and the strip's job here is reach, not
                    structure. Branches on the way to an open card are unfolded
                    by `revealed`, so a nested card being read still appears. */}
                <div className={styles.railList}>
                    {rows.map(({ node }) => {
                        const pane = paneOf(node.id);
                        const isFocused = pane === focusedPane;
                        const label = railLabel(node);
                        const color = railColor(node);

                        return (
                            <button
                                key={node.id}
                                ref={isFocused ? focusedRef : undefined}
                                className={`${styles.railItem} ${pane ? styles.railItemOpen : ''} ${pane === 'left' ? styles.paneLeft : pane === 'right' ? styles.paneRight : ''} ${isFocused ? styles.railItemActive : ''}`}
                                onClick={() => handleSelect(node.id)}
                                title={isSplit && pane ? `${label} — open ${pane}` : label}
                                aria-label={label}
                                aria-current={isFocused ? 'true' : undefined}
                                style={color ? ({ '--node-accent': color } as React.CSSProperties) : undefined}
                                data-accented={color ? '' : undefined}
                            >
                                <CardIcon icon={railIcon(node)} size={18} />
                                {isSplit && pane && (
                                    <span className={styles.railSide}>{pane === 'left' ? 'L' : 'R'}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <aside className={styles.panel} aria-label="Notes on this canvas">
            <div className={styles.header}>
                <span className={styles.headerTitle}>
                    Notes
                    <span className={styles.count}>{totalNotes}</span>
                </span>
                <div className={styles.headerActions}>
                    <button
                        className={`${styles.toggle} icon-hover`}
                        onClick={handleCreate}
                        title="New note"
                        aria-label="New note"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        className={`${styles.toggle} icon-hover`}
                        onClick={() => setCollapsed(true)}
                        title="Hide notes"
                        aria-label="Hide notes"
                    >
                        <PanelLeftClose size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.tools}>
                <label className={styles.search}>
                    <Search size={14} aria-hidden="true" />
                    <input
                        ref={searchRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search notes"
                        aria-label="Search notes"
                    />
                    <kbd>⌘/Ctrl K</kbd>
                </label>
                <label className={styles.sort}>
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort notes">
                        <option value="created">Created</option>
                        <option value="updated">Updated</option>
                        <option value="title">Title</option>
                        <option value="manual">Canvas order</option>
                    </select>
                    <ChevronDown size={13} aria-hidden="true" />
                </label>
            </div>

            <div className={styles.list}>
                {rows.length === 0 && (
                    <p className={styles.empty}>{query ? 'No notes match this search.' : 'No other notes on this canvas.'}</p>
                )}

                {pinnedRows.length > 0 && (
                    <section className={`${styles.dateGroup} ${styles.pinnedGroup}`} aria-labelledby="pinned-notes">
                        <h2 className={styles.dateHeading} id="pinned-notes">Pinned</h2>
                        {pinnedRows.map(({ node, depth, hasChildren }) => renderRow(node, depth, hasChildren))}
                    </section>
                )}

                {unpinnedSections.map((section) => (
                    <section className={styles.dateGroup} key={section.id} aria-labelledby={`note-date-${section.id}`}>
                        <h2 className={styles.dateHeading} id={`note-date-${section.id}`}>{section.label}</h2>
                        {section.rows.map(({ node, depth, hasChildren }) => renderRow(node, depth, hasChildren))}
                    </section>
                ))}
            </div>
        </aside>
    );
}
