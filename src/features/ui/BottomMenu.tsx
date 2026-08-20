import { SearchResults } from './SearchResults';
import { FEATURES } from '../../config/featureFlags';
import {
    Plus,
    LayoutGrid,

    Search,
    X,
    Filter,
    Tag,
    Calendar,
    Flag,
    CheckCircle,
    Sparkles,
    LayoutTemplate,
    Square,
    RectangleHorizontal,
    File,
    AppWindow,
    Folder
} from '../../components/icons';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { getNodeBlocks } from '../../types';
import type { AppState } from '../../store/types';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { isMediaType } from '../editor/mediaTypes';
import { createGalleryMetadata, GALLERY_NODE_WIDTH } from '../editor/galleryTypes';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { MIN_EXPANDED_SIZE } from '../../config/layout';
import { parseSearchQuery } from './searchUtils';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';
import { EdgeEditingToolbar } from './EdgeEditingToolbar';
import { TEMPLATES } from '../templates/templateDefinitions';
import { TemplatePreviewModal } from '../templates/TemplatePreviewModal';

export function BottomMenu() {
    // Atomic Selectors
    const addNode = useStore(s => s.addNode);
    const nodes = useStore(s => s.nodes);
    const centerPanelId = useStore(s => s.centerPanelId);
    const fullscreenId = useStore(s => s.fullscreenId);
    const currentParentId = useStore(s => s.currentParentId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const selectedEdgeId = useStore(s => s.selectedEdgeId);
    const selectedEdgeIds = useStore(s => s.selectedEdgeIds);
    const hasSelectedEdges = selectedEdgeId || (selectedEdgeIds && selectedEdgeIds.size > 0);
    // Which edges the side panels are eating — the menu docks against a free one.
    const rightSidePanelId = useStore(s => s.rightSidePanelId);
    const leftSidePanelId = useStore(s => s.leftSidePanelId);
    const isMetadataOpen = useStore(s => s.isMetadataOpen);
    const isTOCOpen = useStore(s => s.isTOCOpen);
    const isShortcutsPanelOpen = useStore(s => s.isShortcutsPanelOpen);
    const isAIPanelOpen = useStore(s => s.isAIPanelOpen);
    const openAIPanel = useStore(s => s.openAIPanel);
    const toggleAIPanel = useStore(s => s.toggleAIPanel);
    const setAIImageMode = useStore(s => s.setAIImageMode);

    const { screenToFlowPosition, getViewport, setCenter } = useReactFlow();
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [activeMenu, setActiveMenu] = useState<'views' | 'blocks' | 'templates' | 'addNoteModes' | null>(null);
    const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const handleAddNoteRef = useRef<() => void>(() => {});

    // Hide templates that depend on a beta-deferred surface (e.g. Kanban) so a
    // disabled feature can't leak back in through a template drop.
    const templates = useMemo(
        () => TEMPLATES,
        []
    );

    // Compute the hovered template's preview once. getPreviewData() mints fresh
    // node ids on every call, so calling it separately for nodes and edges made
    // the edges reference ids that no longer existed — they never rendered.
    const hoveredPreview = useMemo(
        () => templates.find(t => t.id === hoveredTemplateId)?.getPreviewData() ?? null,
        [hoveredTemplateId, templates]
    );
    const hoveredTemplate = useMemo(
        () => templates.find(t => t.id === hoveredTemplateId) ?? null,
        [hoveredTemplateId, templates]
    );

    // Reset the highlighted item when the open menu changes. Adjusted during
    // render rather than in an effect: an effect would paint the old highlight
    // for a frame first, and re-entering render is the cheaper of the two.
    const [prevMenu, setPrevMenu] = useState(activeMenu);
    if (prevMenu !== activeMenu) {
        setPrevMenu(activeMenu);
        setHighlightedIndex(activeMenu ? 0 : null);
    }

    // Click-away listener to dismiss active menus and modes when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
                if (isSearchMode) {
                    setIsSearchMode(false);
                    setShowFilters(false);
                }
            }
        };

        if (activeMenu || isSearchMode) {
            document.addEventListener('mousedown', handleClickOutside, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [activeMenu, isSearchMode]);

    // A flyout and a rail popover would otherwise stack on top of each other:
    // the rail stays mounted while search is open, so opening one surface has to
    // dismiss the other explicitly — hence this pair.
    const openSearch = useCallback(() => {
        setActiveMenu(null);
        setIsSearchMode(true);
    }, []);

    // Opening a rail popover closes whatever is in the flyout lane, so only one
    // surface is ever attached to the rail.
    const openMenu = useCallback((menu: 'views' | 'blocks' | 'templates' | 'addNoteModes' | null) => {
        if (menu) {
            setIsSearchMode(false);
            setShowFilters(false);
        }
        setActiveMenu(menu);
    }, []);

    // Global keyboard shortcuts for BottomMenu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            if (e.key === 'b' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => prev === 'blocks' ? null : 'blocks');

            } else if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => prev === 'templates' ? null : 'templates');
            } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isSearchMode) {
                    setIsSearchMode(false);
                    setSearchQuery('');
                } else {
                    openSearch();
                }
            } else if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setIsSearchMode(false);
                setAIImageMode(false);
                toggleAIPanel();
            } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setIsSearchMode(false);
                setAIImageMode(true);
                openAIPanel('create');
            } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAddNoteRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchMode]);

    const activeFilters = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

    // Extract all unique tags from nodes
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        nodes.forEach(node => {
            const nodeTags = 'tags' in node.data ? node.data.tags : undefined;
            if (Array.isArray(nodeTags)) {
                nodeTags.forEach(tag => tags.add(tag));
            }
        });
        return Array.from(tags);
    }, [nodes]);

    const toggleFilter = (key: string, value: string) => {
        const filters = { ...activeFilters };
        if (key === 'tag') {
            if (filters.tags.includes(value)) {
                filters.tags = filters.tags.filter(t => t !== value);
            } else {
                filters.tags.push(value);
            }
        } else {
            const filterRecord = filters as unknown as Record<string, string | undefined>;
            if (filterRecord[key] === value) {
                delete filterRecord[key];
            } else {
                filterRecord[key] = value;
            }
        }

        // Reconstruct query string
        let newQuery = filters.text;
        filters.tags.forEach(t => newQuery += ` #${t}`);
        if (filters.status) newQuery += ` status:${filters.status}`;
        if (filters.priority) newQuery += ` priority:${filters.priority}`;
        if (filters.type) newQuery += ` is:${filters.type}`;
        if (filters.date) newQuery += ` date:${filters.date}`;
        if (filters.startDate) newQuery += ` after:${filters.startDate}`;
        if (filters.endDate) newQuery += ` before:${filters.endDate}`;

        const cleanedQuery = newQuery.trim();
        setSearchQuery(cleanedQuery);
        if (cleanedQuery && !isSearchMode) setIsSearchMode(true);
    };

    const vp = () => {
        const { x, y, zoom } = getViewport();
        return { x, y, zoom, screenW: window.innerWidth, screenH: window.innerHeight };
    };

    /* The overlap-avoidance placement in findNonOverlappingPosition can push a
       new card outside the visible viewport once the screen is crowded. A
       card's block editor only mounts once it's near-viewport (see
       useLazyRender/NoteExpandedContent), so an off-screen card would sit as
       a permanently blank loading skeleton until the user happened to pan
       onto it. Pan to a new card whenever placement landed it out of view,
       so it's always immediately visible and editable. */
    const panIntoViewIfNeeded = (position: { x: number; y: number }, size: { width: number; height: number }) => {
        const { x: vpX, y: vpY, zoom } = getViewport();
        const flowLeft = -vpX / zoom;
        const flowTop = -vpY / zoom;
        const flowRight = flowLeft + window.innerWidth / zoom;
        const flowBottom = flowTop + window.innerHeight / zoom;
        const outOfView = position.x < flowLeft || position.y < flowTop
            || position.x + size.width > flowRight || position.y + size.height > flowBottom;
        if (outOfView) {
            setCenter(position.x + size.width / 2, position.y + size.height / 2, { zoom, duration: 300 });
        }
    };

    const handleAddNote = () => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        const NOTE_WIDTH = 432;
        const NOTE_HEIGHT = 432;

        const position = findNonOverlappingPosition(flowPos, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, nodes, currentParentId, vp());

        addNode('note', position, { viewMode: 'expanded' }, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, currentParentId || undefined);
        panIntoViewIfNeeded(position, { width: NOTE_WIDTH, height: NOTE_HEIGHT });
    };
    // Kept in a ref so the global Ctrl+N listener always calls the latest
    // closure without re-subscribing on every render.
    useEffect(() => {
        handleAddNoteRef.current = handleAddNote;
    });

    const handleDragStart = (e: React.DragEvent, type: string, metadata?: Record<string, unknown>) => {
        e.dataTransfer.setData('application/reactflow-block-type', type);

        const blockData = {
            block: {
                id: uuidv4(),
                type: type,
                content: '',
                metadata: metadata
            },
            sourceNodeId: null
        };
        e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify(blockData));

        if (metadata) {
            e.dataTransfer.setData('application/chnk-it-block-metadata', JSON.stringify(metadata));
        }
        e.dataTransfer.effectAllowed = 'copy';
    };

    // Declared as functions, not consts: the keyboard-navigation effect above
    // calls both, and a const would be in its temporal dead zone there.
    function handleTemplateClick(templateId: string) {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
        
        // Use a large size approximation for template to find non-overlapping space
        const position = findNonOverlappingPosition(flowPos, { width: 1200, height: 1000 }, nodes, currentParentId, vp());

        const { nodes: newNodes, edges: newEdges } = template.generateNodes(position, currentParentId || null);
        
        useStore.getState().setNodes(prev => [...prev, ...newNodes]);
        if (newEdges.length > 0) {
            useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...newEdges] }));
        }
    }

    function handleBlockClick(block: typeof MENU_ITEMS[0]) {
        // Columns need their metadata seeded with empty column content, otherwise the
        // node renders as an empty box (matches editor slash-command behaviour).
        const metadata = block.type === 'columns'
            ? {
                columns: Array.from({ length: block.meta?.count || 2 }).map(() => ({
                    id: uuidv4(),
                    content: [{ id: uuidv4(), type: 'text', content: '' }],
                })),
            }
            : block.type === 'gallery'
                ? createGalleryMetadata([], block.meta)
                : block.meta;

        const newBlock = {
            id: uuidv4(),
            type: block.type,
            content: '',
            metadata
        };

        const targetNodeId = centerPanelId || fullscreenId;

        if (targetNodeId) {
            const activeNode = nodes.find(n => n.id === targetNodeId);
            if (activeNode) {
                const safeContent = getNodeBlocks(activeNode.data) ?? [];
                updateNodeData(targetNodeId, {
                    content: [...safeContent, newBlock]
                });
                return;
            }
        }

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        // Each column needs ~200px to be comfortably editable; scale node width with the
        // number of columns per row (4 columns render as a 2x2 grid, so only 2 per row).
        const columnCount = block.type === 'columns' ? (block.meta?.count || 2) : 0;
        const columnsPerRow = columnCount === 4 ? 2 : columnCount;
        // A table opens at the expanded-card width so its default columns fit —
        // at 300 it shipped with a permanent horizontal scrollbar even empty.
        const BLOCK_WIDTH = block.type === 'columns' ? Math.max(550, columnsPerRow * 220) : block.type === 'gallery' ? GALLERY_NODE_WIDTH : isMediaType(block.type) ? 208 : block.type === 'table' ? MIN_EXPANDED_SIZE : 300;
        const BLOCK_HEIGHT = 100;

        const position = findNonOverlappingPosition(flowPos, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, nodes, currentParentId, vp());

        addNode('block', position, {
            content: [newBlock],
            isStandaloneBlock: true
        }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, currentParentId || undefined);
    }

    // Handle keyboard navigation inside the open menu
    useEffect(() => {
        if (!activeMenu || highlightedIndex === null) return;

        const columns = activeMenu === 'views' ? 4 : activeMenu === 'templates' ? 4 : 6;
        const totalItems = activeMenu === 'views' ? 4 : activeMenu === 'templates' ? templates.length : MENU_ITEMS.length;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setActiveMenu(null);
                e.preventDefault();
                return;
            }

            if (e.key === 'ArrowRight') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.min(totalItems - 1, prev + 1)));
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.max(0, prev - 1)));
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.min(totalItems - 1, prev + columns)));
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.max(0, prev - columns)));
                e.preventDefault();
            } else if (e.key === 'Enter') {
                if (activeMenu === 'templates') {
                    const template = templates[highlightedIndex];
                    if (template) {
                        handleTemplateClick(template.id);
                    }
                } else {
                    const block = MENU_ITEMS[highlightedIndex];
                    if (block) {
                        handleBlockClick(block);
                    }
                }
                setActiveMenu(null);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeMenu, highlightedIndex, screenToFlowPosition, addNode, currentParentId, nodes]);

    const transitionVariants: Variants = {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 32 } },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15, ease: "easeOut" } }
    };

    // The wide states — search and the two selection toolbars — open in the lane
    // beside the rail rather than inside it: a 60px icon column has nowhere to
    // put a 520px field. (AI is a side panel of its own, not a flyout.)
    const flyoutState = isSearchMode ? 'search'
        : selectedCanvasNodeIds.size > 0 ? 'multi'
        : hasSelectedEdges ? 'edge'
        : null;
    /* Selection is a mode of the bottom dock, not a second toolbar beside it.
       Removing the idle rail lets the action surface take its exact place and
       Motion can read the change as one continuous command island. */
    const isSelectionIsland = flyoutState === 'multi' || flyoutState === 'edge';

    // Docking. The menu sits on the bottom edge by default; a side panel costs
    // the canvas its width rather than its height, so while one is open the menu
    // moves to the canvas's left edge and stands up as a vertical rail. A wide
    // state overrides that: the 520px field it opens has nowhere to go in the
    // lane beside a rail, so the whole menu drops back to the bottom.
    const isSidePanelOpen = Boolean(rightSidePanelId) || Boolean(leftSidePanelId)
        || isMetadataOpen || isTOCOpen || isShortcutsPanelOpen || isAIPanelOpen;
    const isRail = isSidePanelOpen && flyoutState === null;
    const dockClass = isRail ? styles.dockLeft : styles.dockBottom;

    return (
        <>
            {/* data-app-menu marks the menu as chrome, not canvas: the side
                panels' click-away handlers skip it, so pressing a rail button
                doesn't close the panel out from under the press. */}
            <div className={`${styles.railLayer} ${dockClass}`} data-app-menu ref={menuRef}>
            {!isSelectionIsland && (
            <motion.div
                layout
                layoutId="bottom-command-island"
                className={`${styles.sideRail} ${isRail ? '' : styles.railHorizontal}`}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                whileHover={isRail ? { x: 4 } : { y: -4 }}
            >
                {/* gap has to live on the column, not on .sideRail: AnimatePresence
                    inserts a wrapper between the rail and its buttons, so the
                    rail's own `gap` never reached them. */}
                <motion.div
                    key="default"
                    variants={transitionVariants}
                    initial="initial"
                    animate="animate"
                    style={{ display: 'flex', flexDirection: isRail ? 'column' : 'row', width: isRail ? '100%' : 'auto', height: isRail ? 'auto' : '100%', justifyContent: 'center', alignItems: 'center', gap: 12 }}
                >
                        <button
                            className={`${styles.aiIconBtn} ${isAIPanelOpen ? styles.aiIconBtnActive : ''}`}
                            onClick={toggleAIPanel}
                            title="AI (Ctrl+J)"
                        >
                            <Sparkles size={20} />
                        </button>
                        <button
                            className={styles.iconBtn}
                            onClick={openSearch}
                            title="Search (Ctrl+F)"
                        >
                            <Search size={20} />
                        </button>
                        <div
                            className={styles.blocksWrapper}
                            onMouseEnter={() => {
                                hoverTimeoutRef.current = window.setTimeout(() => {
                                    openMenu('addNoteModes');
                                }, 1000);
                            }}
                            onMouseLeave={() => {
                                if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                }
                            }}
                        >
                            <button
                                className="special-primary-btn"
                                onClick={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    handleAddNote();
                                }}
                                title="Add New Note Card (Hover for modes)"
                            >
                                <Plus size={24} color="#fff" />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'addNoteModes' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Card Modes</h3>
                                    <button
                                        className={styles.menuCloseBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }}
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    {[
                                        { id: 'expanded', label: 'Expanded', desc: 'Full card view', icon: Square },
                                        { id: 'medium', label: 'Medium', desc: 'Compact view', icon: RectangleHorizontal },
                                        { id: 'icon', label: 'Icon', desc: 'Minimal icon', icon: File },
                                        { id: 'folder', label: 'Folder', desc: 'Cover & icon in a folder', icon: Folder },
                                        { id: 'titleview', label: 'Title Only', desc: 'Just the title', icon: AppWindow }
                                    ].map((mode) => (
                                        <div
                                            key={mode.id}
                                            className={styles.draggableItem}
                                            onClick={() => {
                                                const centerX = window.innerWidth / 2;
                                                const centerY = window.innerHeight / 2;
                                                const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                                const isSmall = mode.id === 'icon' || mode.id === 'folder';
                                                const NOTE_WIDTH = isSmall ? 120 : 432;
                                                const NOTE_HEIGHT = isSmall ? 120 : 432;
                                                const position = findNonOverlappingPosition(flowPos, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, nodes, currentParentId, vp());
                                                addNode('note', position, { viewMode: mode.id, showMetadata: false }, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, currentParentId || undefined);
                                                panIntoViewIfNeeded(position, { width: NOTE_WIDTH, height: NOTE_HEIGHT });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            <div className={styles.itemIconWrapper}>
                                                <mode.icon size={20} />
                                            </div>
                                            <div className={styles.customTooltip}>
                                                <div className={styles.tooltipLabel}>{mode.label}</div>
                                                <div className={styles.tooltipDesc}>{mode.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className={styles.blocksWrapper}>
                            <button
                                className={`${styles.iconBtn} ${activeMenu === 'templates' ? styles.iconBtnActive : ''}`}
                                onClick={() => openMenu(activeMenu === 'templates' ? null : 'templates')}
                                title="Templates"
                                style={isRail ? { marginTop: 8 } : { marginLeft: 8 }}
                            >
                                <LayoutTemplate size={20} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'templates' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Templates</h3>
                                    <button
                                        className={styles.menuCloseBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }}
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                    {templates.map((template, index) => {
                                        const TemplateIcon = template.icon;
                                        return (
                                        <div
                                            key={template.id}
                                            className={`${styles.draggableItem} ${highlightedIndex === index ? styles.draggableItemHighlighted : ''}`}
                                            onClick={() => {
                                                handleTemplateClick(template.id);
                                                setActiveMenu(null);
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
                                                hoverTimeoutRef.current = window.setTimeout(() => setHoveredTemplateId(template.id), 400);
                                            }}
                                            onMouseLeave={() => {
                                                if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
                                                setHoveredTemplateId(null);
                                            }}
                                        >
                                            <div className={styles.itemIconWrapper}>
                                                <TemplateIcon size={20} />
                                            </div>
                                            <div className={styles.customTooltip}>
                                                <div className={styles.tooltipLabel}>{template.name}</div>
                                                <div className={styles.tooltipDesc}>{template.description}</div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
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

                            <div className={`${styles.hoverMenu} ${activeMenu === 'blocks' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Blocks</h3>
                                    <button
                                        className={styles.menuCloseBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }}
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid}>
                                    {MENU_ITEMS.map((block, index) => {
                                        const Icon = block.icon;
                                        return (
                                            <div
                                                key={block.label}
                                                className={`${styles.draggableItem} ${highlightedIndex === index ? styles.draggableItemHighlighted : ''}`}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, block.type, block.meta)}
                                                onClick={() => {
                                                    handleBlockClick(block);
                                                    setActiveMenu(null);
                                                }}
                                            >
                                                <div className={styles.itemIconWrapper}>
                                                    <Icon size={20} />
                                                </div>
                                                <div className={styles.customTooltip}>
                                                    <div className={styles.tooltipLabel}>{block.label}</div>
                                                    <div className={styles.tooltipDesc}>{block.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                </motion.div>
            </motion.div>
            )}

            <AnimatePresence mode="popLayout" initial={false}>
                {flyoutState === 'search' ? (
                    <motion.div key="search" variants={transitionVariants} initial="initial" animate="animate" exit="exit" className={`${styles.flyout} ${styles.searchContainer}`}>
                        <SearchResults
                            query={searchQuery}
                            onClose={() => {
                                setIsSearchMode(false);
                                setSearchQuery('');
                            }}
                        />
                        <Search size={20} className="text-muted-foreground" style={{ opacity: 0.5, marginLeft: 12 }} />
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search your notes"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        <button
                            className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
                            onClick={() => setShowFilters(!showFilters)}
                            title="Filters"
                        >
                            <Filter size={16} />
                        </button>

                        <button
                            className={styles.closeSearchBtn}
                            onClick={() => {
                                setIsSearchMode(false);
                                setSearchQuery('');
                                setShowFilters(false);
                            }}
                            title="Close Search"
                        >
                            <X size={16} />
                        </button>

                        {showFilters && (
                            <div className={styles.filterPanel}>
                                <div className={styles.filterGroup}>
                                    <label><Tag size={12} /> Tags</label>
                                    <div className={styles.filterChips}>
                                        {allTags.map(tag => (
                                            <span
                                                key={tag}
                                                className={`${styles.filterChip} ${activeFilters.tags.includes(tag.toLowerCase()) ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('tag', tag.toLowerCase())}
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                        {allTags.length === 0 && <span className={styles.emptyText}>No tags found</span>}
                                    </div>
                                </div>

                                <div className={styles.filterRow}>
                                    <div className={styles.filterGroup}>
                                        <label><CheckCircle size={12} /> Status</label>
                                        <div className={styles.filterChips}>
                                            {['todo', 'in-progress', 'done', 'backlog'].map(s => (
                                                <span
                                                    key={s}
                                                    className={`${styles.filterChip} ${activeFilters.status === s ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('status', s)}
                                                >
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.filterGroup}>
                                        <label><Flag size={12} /> Priority</label>
                                        <div className={styles.filterChips}>
                                            {['low', 'medium', 'high', 'urgent'].map(p => (
                                                <span
                                                    key={p}
                                                    className={`${styles.filterChip} ${activeFilters.priority === p ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('priority', p)}
                                                >
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.filterRow}>
                                    <div className={styles.filterGroup}>
                                        <label><Calendar size={12} /> Type</label>
                                        <div className={styles.filterChips}>
                                            {['note', 'block'].map(t => (
                                                <span
                                                    key={t}
                                                    className={`${styles.filterChip} ${activeFilters.type === t ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('is', t)}
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.filterGroup}>
                                        <label><Calendar size={12} /> Time</label>
                                        <div className={styles.filterChips}>
                                            <span
                                                className={`${styles.filterChip} ${activeFilters.startDate === new Date().toISOString().split('T')[0] ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('after', new Date().toISOString().split('T')[0])}
                                            >
                                                Today
                                            </span>
                                            <span
                                                className={`${styles.filterChip} ${activeFilters.date?.includes(new Date().toISOString().split('T')[0].substring(0, 7)) ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('date', new Date().toISOString().split('T')[0].substring(0, 7))}
                                            >
                                                This Month
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : flyoutState === 'multi' ? (
                    <motion.div layout layoutId="bottom-command-island" key="multi" variants={transitionVariants} initial="initial" animate="animate" exit="exit" className={`${styles.flyout} ${styles.selectionIsland}`}>
                        <MultiSelectionToolbar
                            onOpenAI={() => openAIPanel('create')}
                            onOpenSearch={openSearch}
                        />
                    </motion.div>
                ) : flyoutState === 'edge' ? (
                    <motion.div layout layoutId="bottom-command-island" key="edge" variants={transitionVariants} initial="initial" animate="animate" exit="exit" className={`${styles.flyout} ${styles.selectionIsland}`}>
                        <EdgeEditingToolbar />
                    </motion.div>
                ) : null}
            </AnimatePresence>
            </div>
            
            {/* Modal is rendered outside the menu container */}
            <TemplatePreviewModal
                nodes={hoveredPreview?.nodes || []}
                edges={hoveredPreview?.edges || []}
                name={hoveredTemplate?.name}
                description={hoveredTemplate?.description}
                isVisible={hoveredTemplateId !== null}
            />
        </>
    );
}
