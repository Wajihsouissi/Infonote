import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Plus,
    LayoutGrid,
    Search,
    X,
    Square,
    RectangleHorizontal,
    File,
    AppWindow,
    Folder,
    Sparkles,
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import { getNodeBlocks, type NoteData } from '../../types';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS, type MenuItem } from '../editor/menuConstants';
import { createMenuBlock, menuBlockNodeSize } from '../editor/menuBlocks';
import { useViewportPlacement } from '../canvas/hooks/useViewportPlacement';
import { SearchResults } from './SearchResults';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';
import { EdgeEditingToolbar } from './EdgeEditingToolbar';
import { RailMenu, type RailMenuItem } from './RailMenu';
import { FloatingActionButton } from '../../components/ui/Button';

type MenuId = 'blocks' | 'addNoteModes' | null;
type CardMode = NonNullable<NoteData['viewMode']>;

const CARD_MODES: { mode: CardMode; label: string; desc: string; icon: React.ElementType }[] = [
    { mode: 'expanded', label: 'Expanded', desc: 'Full card view', icon: Square },
    { mode: 'medium', label: 'Medium', desc: 'Compact view', icon: RectangleHorizontal },
    { mode: 'icon', label: 'Icon', desc: 'Minimal icon', icon: File },
    { mode: 'folder', label: 'Folder', desc: 'Cover & icon in a folder', icon: Folder },
    { mode: 'titleview', label: 'Title Only', desc: 'Just the title', icon: AppWindow },
];

const cardSize = (mode: CardMode) => (mode === 'icon' || mode === 'folder'
    ? { width: 120, height: 120 }
    : { width: 432, height: 432 });

/** How long a hover on the add button waits before offering the card modes. */
const MODES_HOVER_DELAY_MS = 1000;
/** Tiles per row in the blocks menu, for arrow-key navigation. */
const BLOCKS_MENU_COLUMNS = 6;

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/** Drag payload for a block tile, matching what the canvas drop handler reads. */
function startBlockDrag(e: React.DragEvent, item: MenuItem) {
    const block = createMenuBlock(item);
    e.dataTransfer.setData('application/reactflow-block-type', item.type);
    e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify({ block, sourceNodeId: null }));
    if (block.metadata) e.dataTransfer.setData('application/chnk-it-block-metadata', JSON.stringify(block.metadata));
    e.dataTransfer.effectAllowed = 'copy';
}

/* Selection is isolated from BottomMenu. The menu is a large command surface;
   subscribing it to selection made every click reconcile the whole rail before
   the browser could paint the selected card. */
function NodeSelectionToolbarLayer({ suspended }: { suspended: boolean }) {
    const hasSelection = useStore(s => s.selectedCanvasNodeIds.size > 0);
    const isActive = hasSelection && !suspended;
    return (
        <div
            className={`${styles.flyout} ${styles.selectionIsland} ${styles.contextualToolbar} ${isActive ? styles.contextualToolbarActive : ''}`}
            data-selection-toolbar="true"
            aria-hidden={!isActive}
        >
            <MultiSelectionToolbar isActive={isActive} />
        </div>
    );
}

/**
 * The command dock on the bottom edge of the canvas: search, add a card (hover
 * for its modes), and the blocks menu. While an edge is selected or search is
 * open, the matching flyout takes the dock's place.
 */
export function BottomMenu() {
    const addNode = useStore(s => s.addNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const hasSelectedEdges = useStore(s => Boolean(s.selectedEdgeId) || s.selectedEdgeIds.size > 0);
    // A node side peek hides the menu outright; other panels take width from
    // `.canvasFrame`, and the menu, centred inside it, re-centres on its own.
    const hasNodeSidePeekOpen = useStore(s => Boolean(s.rightSidePanelId) || Boolean(s.leftSidePanelId));
    const { findSpot, reveal } = useViewportPlacement();

    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeMenu, setActiveMenu] = useState<MenuId>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset the keyboard highlight when the open menu changes. Done during
    // render: an effect would paint the stale highlight for a frame first.
    const [prevMenu, setPrevMenu] = useState(activeMenu);
    if (prevMenu !== activeMenu) {
        setPrevMenu(activeMenu);
        setHighlightedIndex(activeMenu ? 0 : null);
    }

    const closeSearch = useCallback(() => {
        setIsSearchMode(false);
        setSearchQuery('');
    }, []);

    // Only one surface is attached to the rail at a time.
    const openSearch = useCallback(() => {
        setActiveMenu(null);
        setIsSearchMode(true);
    }, []);
    const openMenu = useCallback((menu: MenuId) => {
        if (menu) setIsSearchMode(false);
        setActiveMenu(menu);
    }, []);
    const clearHoverTimer = () => {
        if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    };

    const addCard = useCallback((mode: CardMode) => {
        const size = cardSize(mode);
        const position = findSpot(size);
        addNode('note', position, { viewMode: mode }, size, useStore.getState().currentParentId || undefined);
        reveal(position, size);
    }, [addNode, findSpot, reveal]);

    const addBlock = useCallback((item: MenuItem) => {
        const block = createMenuBlock(item);

        // With a card open in the centre or full screen, the block joins that card.
        const { centerPanelId, fullscreenId, nodes, currentParentId } = useStore.getState();
        const openCardId = centerPanelId || fullscreenId;
        const openCard = openCardId ? nodes.find(n => n.id === openCardId) : undefined;
        if (openCard) {
            updateNodeData(openCard.id, { content: [...(getNodeBlocks(openCard.data) ?? []), block] });
            return;
        }

        const size = menuBlockNodeSize(item);
        const position = findSpot(size);
        addNode('block', position, { content: [block], isStandaloneBlock: true }, size, currentParentId || undefined);
        reveal(position, size);
    }, [addNode, findSpot, reveal, updateNodeData]);

    // Global shortcuts read the latest state through a ref, so the listener is
    // registered once instead of on every render.
    const toggleAIPanel = useStore(s => s.toggleAIPanel);
    const isAIPanelOpen = useStore(s => s.isAIPanelOpen);
    const latestRef = useRef({ isSearchMode, addCard, openSearch, closeSearch, toggleAIPanel });
    useEffect(() => {
        latestRef.current = { isSearchMode, addCard, openSearch, closeSearch, toggleAIPanel };
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            const mod = e.ctrlKey || e.metaKey;
            const latest = latestRef.current;
            if (e.key === 'b' && !mod && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => (prev === 'blocks' ? null : 'blocks'));
            } else if (e.key === 'f' && mod) {
                e.preventDefault();
                if (latest.isSearchMode) latest.closeSearch();
                else latest.openSearch();
            } else if (e.key === 'j' && mod) {
                e.preventDefault();
                latest.closeSearch();
                latest.toggleAIPanel();
            } else if (e.key === 'n' && mod) {
                e.preventDefault();
                latest.addCard('expanded');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // The empty canvas's call to action adds a card on this same path.
    useEffect(() => {
        const addFromEmptyState = () => latestRef.current.addCard('expanded');
        window.addEventListener('chnk-it:add-note', addFromEmptyState);
        return () => window.removeEventListener('chnk-it:add-note', addFromEmptyState);
    }, []);

    // A press outside the dock dismisses any open menu and search.
    useEffect(() => {
        if (!activeMenu && !isSearchMode) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            setActiveMenu(null);
            setIsSearchMode(false);
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [activeMenu, isSearchMode]);

    // Arrow keys move through the blocks menu; Enter adds the highlighted block.
    useEffect(() => {
        if (activeMenu !== 'blocks' || highlightedIndex === null) return;
        const last = MENU_ITEMS.length - 1;
        const handleKeyDown = (e: KeyboardEvent) => {
            const move = (next: (index: number) => number) => {
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(0, Math.min(last, next(prev ?? 0))));
            };
            switch (e.key) {
                case 'Escape': e.preventDefault(); setActiveMenu(null); break;
                case 'ArrowRight': move(i => i + 1); break;
                case 'ArrowLeft': move(i => i - 1); break;
                case 'ArrowDown': move(i => i + BLOCKS_MENU_COLUMNS); break;
                case 'ArrowUp': move(i => i - BLOCKS_MENU_COLUMNS); break;
                case 'Enter':
                    e.preventDefault();
                    addBlock(MENU_ITEMS[highlightedIndex]);
                    setActiveMenu(null);
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeMenu, highlightedIndex, addBlock]);

    const cardModeItems = useMemo<RailMenuItem[]>(() => CARD_MODES.map(({ mode, label, desc, icon }) => ({
        key: mode, label, description: desc, icon, onSelect: () => addCard(mode),
    })), [addCard]);

    const blockItems = useMemo<RailMenuItem[]>(() => MENU_ITEMS.map((item) => ({
        key: item.label,
        label: item.label,
        description: item.description,
        icon: item.icon,
        onSelect: () => addBlock(item),
        onDragStart: (e: React.DragEvent) => startBlockDrag(e, item),
    })), [addBlock]);

    if (hasNodeSidePeekOpen) return null;

    // Search and the edge toolbar open in the lane beside the rail: a 60px icon
    // column has nowhere to put a 520px field.
    const flyout = isSearchMode ? 'search' : hasSelectedEdges ? 'edge' : null;

    return (
        // data-app-menu marks the dock as chrome, not canvas: side panels' click-away
        // handlers skip it, so pressing a rail button never closes a panel under it.
        <div className={`${styles.railLayer} ${styles.dockBottom}`} data-app-menu ref={menuRef}>
            {flyout !== 'edge' && (
                <div className={styles.railRow}>
                    <div className={styles.sideRail}>
                        <div
                            className={styles.railContents}
                            style={{ display: 'flex', flexDirection: 'row', width: 'auto', height: '100%', justifyContent: 'center', alignItems: 'center', gap: 12 }}
                        >
                            <button className={styles.iconBtn} onClick={openSearch} title="Search (Ctrl+F)">
                                <Search size={20} />
                            </button>

                            <div
                                className={styles.blocksWrapper}
                                onMouseEnter={() => {
                                    hoverTimeoutRef.current = window.setTimeout(() => openMenu('addNoteModes'), MODES_HOVER_DELAY_MS);
                                }}
                                onMouseLeave={clearHoverTimer}
                            >
                                <FloatingActionButton
                                    label="Add new note card"
                                    onClick={() => {
                                        clearHoverTimer();
                                        addCard('expanded');
                                    }}
                                    title="Add New Note Card (Hover for modes)"
                                >
                                    <Plus size={24} />
                                </FloatingActionButton>
                                <RailMenu
                                    title="Card Modes"
                                    isOpen={activeMenu === 'addNoteModes'}
                                    onClose={() => setActiveMenu(null)}
                                    items={cardModeItems}
                                    columns={2}
                                />
                            </div>

                            <div className={styles.separator} />

                            <div className={styles.blocksWrapper}>
                                <button
                                    className={`${styles.iconBtn} ${activeMenu === 'blocks' ? styles.iconBtnActive : ''}`}
                                    onClick={() => openMenu(activeMenu === 'blocks' ? null : 'blocks')}
                                    title="Browse Blocks"
                                >
                                    <LayoutGrid size={20} />
                                </button>
                                <RailMenu
                                    title="Blocks"
                                    isOpen={activeMenu === 'blocks'}
                                    onClose={() => setActiveMenu(null)}
                                    items={blockItems}
                                    highlightedIndex={highlightedIndex}
                                />
                            </div>

                            {/* The AI button sits in the rail rather than on a
                                surface of its own: two toolbars where the user
                                reads one. The separator and its own accent
                                carry the distinction. */}
                            <div className={styles.separator} />

                            <button
                                className={`${styles.aiIconBtn} ${isAIPanelOpen ? styles.aiIconBtnActive : ''}`}
                                onClick={toggleAIPanel}
                                title="AI (Ctrl+J)"
                                aria-label="Open AI assistant"
                            >
                                <span className={styles.aiGlyph} aria-hidden="true">
                                    <Sparkles size={20} />
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

                {flyout === 'search' ? (
                    <div className={`${styles.flyout} ${styles.searchContainer}`}>
                        <SearchResults query={searchQuery} onClose={closeSearch} />
                        <Search size={20} style={{ color: 'var(--text-faint)', marginLeft: 12 }} />
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search your notes"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <button className={styles.closeSearchBtn} onClick={closeSearch} title="Close Search">
                            <X size={16} />
                        </button>
                    </div>
                ) : flyout === 'edge' ? (
                    <div className={`${styles.flyout} ${styles.selectionIsland}`}>
                        <EdgeEditingToolbar />
                    </div>
                ) : null}

            {/* Keep contextual actions warm while a tiny child owns the selection
                subscription. Search and edge editing use the same lane, so they
                suspend it. */}
            <NodeSelectionToolbarLayer suspended={isSearchMode || hasSelectedEdges} />
        </div>
    );
}
