import { SearchResults } from './SearchResults';
import {
    Plus,
    LayoutGrid,
    KanbanSquare,
    Search,
    X,
    Filter,
    Tag,
    Calendar,
    Flag,
    CheckCircle,
    Table2,
    Clock
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { parseSearchQuery } from './searchUtils';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';

export function BottomMenu() {
    // Atomic Selectors
    const addNode = useStore(s => s.addNode);
    const nodes = useStore(s => s.nodes);
    const centerPanelId = useStore(s => s.centerPanelId);
    const fullscreenId = useStore(s => s.fullscreenId);
    const currentParentId = useStore(s => s.currentParentId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);

    const { screenToFlowPosition } = useReactFlow();
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [activeMenu, setActiveMenu] = useState<'views' | 'blocks' | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset highlighted index when activeMenu changes
    useEffect(() => {
        if (activeMenu) {
            setHighlightedIndex(0);
        } else {
            setHighlightedIndex(null);
        }
    }, [activeMenu]);

    // Click-away listener to dismiss active menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        };

        if (activeMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeMenu]);

    // Handle keyboard navigation inside the open menu
    useEffect(() => {
        if (!activeMenu || highlightedIndex === null) return;

        const columns = activeMenu === 'views' ? 4 : 6;
        const totalItems = activeMenu === 'views' ? 4 : MENU_ITEMS.length;

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
                if (activeMenu === 'views') {
                    const index = highlightedIndex;
                    if (index === 0) {
                        useStore.getState().setKanbanModalOpen(true);
                    } else if (index === 1) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 700;
                        const BOARD_HEIGHT = 500;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                        // @ts-ignore
                        addNode('kanban', position, {
                            label: 'My Table',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'table',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                    } else if (index === 2) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 800;
                        const BOARD_HEIGHT = 600;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                        // @ts-ignore
                        addNode('kanban', position, {
                            label: 'Calendar',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'calendar',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                    } else if (index === 3) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 800;
                        const BOARD_HEIGHT = 400;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                        // @ts-ignore
                        addNode('kanban', position, {
                            label: 'Timeline',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'timeline',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
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

    const activeFilters = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

    // Extract all unique tags from nodes
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        nodes.forEach(node => {
            const nodeTags = (node.data as any).tags;
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
        } else if ((filters as any)[key] === value) {
            delete (filters as any)[key];
        } else {
            (filters as any)[key] = value;
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

    const findNonOverlappingPosition = (
        center: { x: number; y: number },
        size: { width: number; height: number }
    ) => {
        const PADDING = 24;
        const STEP = 60;
        const MAX_RADIUS = 1200;

        const relevantNodes = nodes.filter(n =>
            currentParentId === null
                ? n.parentId === undefined
                : n.parentId === currentParentId
        );

        const doesOverlap = (x: number, y: number) => {
            const left = x - PADDING;
            const top = y - PADDING;
            const right = x + size.width + PADDING;
            const bottom = y + size.height + PADDING;

            return relevantNodes.some(n => {
                const nodeWidth = (n.style?.width as number) || 432;
                const nodeHeight = (n.style?.height as number) || 432;
                const nx = n.position.x;
                const ny = n.position.y;
                const nLeft = nx;
                const nTop = ny;
                const nRight = nx + nodeWidth;
                const nBottom = ny + nodeHeight;

                return !(
                    right < nLeft ||
                    left > nRight ||
                    bottom < nTop ||
                    top > nBottom
                );
            });
        };

        const centerX = center.x;
        const centerY = center.y;

        let bestX = centerX - size.width / 2;
        let bestY = centerY - size.height / 2;

        if (!doesOverlap(bestX, bestY)) {
            return { x: bestX, y: bestY };
        }

        for (let radius = STEP; radius <= MAX_RADIUS; radius += STEP) {
            const steps = Math.max(8, Math.round((2 * Math.PI * radius) / STEP));
            for (let i = 0; i < steps; i++) {
                const angle = (i / steps) * 2 * Math.PI;
                const candidateCenterX = centerX + radius * Math.cos(angle);
                const candidateCenterY = centerY + radius * Math.sin(angle);
                const candidateX = candidateCenterX - size.width / 2;
                const candidateY = candidateCenterY - size.height / 2;

                if (!doesOverlap(candidateX, candidateY)) {
                    return { x: candidateX, y: candidateY };
                }
            }
        }

        // Fallback: canvas around the center is dense; try a few random spots
        const FALLBACK_RADIUS = MAX_RADIUS * 0.75;
        const FALLBACK_ATTEMPTS = 20;

        for (let i = 0; i < FALLBACK_ATTEMPTS; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = Math.random() * FALLBACK_RADIUS;
            const candidateCenterX = centerX + radius * Math.cos(angle);
            const candidateCenterY = centerY + radius * Math.sin(angle);
            const candidateX = candidateCenterX - size.width / 2;
            const candidateY = candidateCenterY - size.height / 2;

            if (!doesOverlap(candidateX, candidateY)) {
                return { x: candidateX, y: candidateY };
            }
        }

        // Last resort: place at a random position around center, even if overlapping
        const angle = Math.random() * 2 * Math.PI;
        const radius = FALLBACK_RADIUS;
        const fallbackCenterX = centerX + radius * Math.cos(angle);
        const fallbackCenterY = centerY + radius * Math.sin(angle);

        return {
            x: fallbackCenterX - size.width / 2,
            y: fallbackCenterY - size.height / 2,
        };
    };

    const handleAddNote = () => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        const NOTE_WIDTH = 432;
        const NOTE_HEIGHT = 432;

        const position = findNonOverlappingPosition(flowPos, {
            width: NOTE_WIDTH,
            height: NOTE_HEIGHT
        });

        addNode('note', position, { viewMode: 'expanded' }, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, currentParentId || undefined);
    };

    const handleDragStart = (e: React.DragEvent, type: string, metadata?: any) => {
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
        e.dataTransfer.setData('application/infonote-block-data', JSON.stringify(blockData));

        if (metadata) {
            e.dataTransfer.setData('application/infonote-block-metadata', JSON.stringify(metadata));
        }
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleBlockClick = (block: typeof MENU_ITEMS[0]) => {
        const newBlock = {
            id: uuidv4(),
            type: block.type,
            content: '',
            metadata: block.meta
        };

        const targetNodeId = centerPanelId || fullscreenId;

        if (targetNodeId) {
            const activeNode = nodes.find(n => n.id === targetNodeId);
            if (activeNode) {
                const currentContent = (activeNode.data as any).content || [];
                const safeContent = Array.isArray(currentContent) ? currentContent : [];
                updateNodeData(targetNodeId, {
                    content: [...safeContent, newBlock]
                });
                return;
            }
        }

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        const BLOCK_WIDTH = 300;
        const BLOCK_HEIGHT = 100;

        const position = findNonOverlappingPosition(flowPos, {
            width: BLOCK_WIDTH,
            height: BLOCK_HEIGHT
        });

        addNode('block', position, {
            content: [newBlock],
            isStandaloneBlock: true
        }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, currentParentId || undefined);
    };

    return (
        <>
            <div ref={menuRef} className={styles.bottomMenu}>
                {selectedCanvasNodeIds.size > 0 ? (
                    <MultiSelectionToolbar />
                ) : isSearchMode ? (
                    <div className={styles.searchContainer}>
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
                            placeholder="Search... "
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
                                            {['note', 'kanban', 'block'].map(t => (
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
                    </div>
                ) : (
                    <>
                        <button
                            className={styles.iconBtn}
                            onClick={() => setIsSearchMode(true)}
                            title="Search"
                        >
                            <Search size={20} />
                        </button>

                        <button className={styles.mainAddBtn} onClick={handleAddNote} title="Add New Note Card">
                            <Plus size={24} />
                        </button>

                        <div className={styles.blocksWrapper}>
                            <button 
                                className={`${styles.iconBtn} ${activeMenu === 'views' ? styles.iconBtnActive : ''}`} 
                                onClick={() => setActiveMenu(activeMenu === 'views' ? null : 'views')}
                                title="Add View" 
                                style={{ marginLeft: 8 }}
                            >
                                <KanbanSquare size={20} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'views' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Views</h3>
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
                                    {/* Kanban Board */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 0 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            useStore.getState().setKanbanModalOpen(true);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <KanbanSquare size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Board</div>
                                            <div className={styles.tooltipDesc}>Kanban board view</div>
                                        </div>
                                    </div>

                                    {/* Table View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 1 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 700;
                                            const BOARD_HEIGHT = 500;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                                            // @ts-ignore
                                            addNode('kanban', position, {
                                                label: 'My Table',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'table',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Table2 size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Table</div>
                                            <div className={styles.tooltipDesc}>Data table view</div>
                                        </div>
                                    </div>

                                    {/* Calendar View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 2 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 800;
                                            const BOARD_HEIGHT = 600;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                                            // @ts-ignore
                                            addNode('kanban', position, {
                                                label: 'Calendar',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'calendar',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Calendar size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Calendar</div>
                                            <div className={styles.tooltipDesc}>Calendar view</div>
                                        </div>
                                    </div>

                                    {/* Timeline View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 3 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 800;
                                            const BOARD_HEIGHT = 400;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT });
                                            // @ts-ignore
                                            addNode('kanban', position, {
                                                label: 'Timeline',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'timeline',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Clock size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Timeline</div>
                                            <div className={styles.tooltipDesc}>Timeline view</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.separator} />

                        <div className={styles.blocksWrapper}>
                            <button 
                                className={`${styles.iconBtn} ${activeMenu === 'blocks' ? styles.iconBtnActive : ''}`}
                                onClick={() => setActiveMenu(activeMenu === 'blocks' ? null : 'blocks')}
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
                    </>
                )}
            </div>
        </>
    );
}
