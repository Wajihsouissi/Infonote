import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { FEATURES } from '../../config/featureFlags';
import { StickyNote, Layers, KanbanSquare, Video } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { v4 as uuidv4 } from 'uuid';
import { MENU_ITEMS } from '../editor/menuConstants';
import { isMediaType } from '../editor/mediaTypes';
import { createGalleryMetadata, GALLERY_NODE_WIDTH } from '../editor/galleryTypes';
import styles from './CanvasSlashMenu.module.css';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { MIN_EXPANDED_SIZE } from '../../config/layout';
import { createYouTubeStudyData } from '../youtube';

interface SlashMenuItem {
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    keywords?: string[];
    category: string;
    action: (position: { x: number; y: number }) => void;
}

export function CanvasSlashMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemsListRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const { screenToFlowPosition, getViewport } = useReactFlow();
    const addNode = useStore(s => s.addNode);
    const centerPanelId = useStore(s => s.centerPanelId);
    const fullscreenId = useStore(s => s.fullscreenId);
    const currentParentId = useStore(s => s.currentParentId);

    const menuItems: SlashMenuItem[] = useMemo(() => {
        // Container-level items
        const containers: SlashMenuItem[] = [
            {
                id: 'note',
                label: 'Note',
                description: 'A rich-content note card',
                icon: StickyNote,
                keywords: ['card', 'page', 'note'],
                category: 'Canvas',
                action: (pos) => {
                    addNode('note', pos, { viewMode: 'expanded' }, { width: 432, height: 432 }, currentParentId || undefined);
                }
            },
            {
                id: 'fused',
                label: 'Fused Note',
                description: 'A multi-block fused note',
                icon: Layers,
                keywords: ['fused', 'multi', 'combined'],
                category: 'Canvas',
                action: (pos) => {
                    const block = { id: uuidv4(), type: 'text', content: '' };
                    addNode('fused-note', pos, { content: [block] }, { width: 300, height: 300 }, currentParentId || undefined);
                }
            },
        ];

        if (FEATURES.kanban) {
            containers.push({
                id: 'kanban',
                label: 'Board',
                description: 'Plan cards in lanes by their metadata',
                icon: KanbanSquare,
                keywords: ['kanban', 'board', 'plan', 'status', 'lane', 'column', 'task'],
                category: 'Canvas',
                action: (pos) => {
                    addNode('kanban', pos, undefined, undefined, currentParentId || undefined);
                }
            });
        }

        if (FEATURES.youtubeStudy) {
            containers.push({
                id: 'youtube',
                label: 'YouTube video',
                description: 'Study a video with transcript, notes, and clips',
                icon: Video,
                keywords: ['youtube', 'video', 'transcript', 'study', 'clip'],
                category: 'Canvas',
                action: (pos) => {
                    addNode('youtube', pos, createYouTubeStudyData(), { width: 360, height: 304 }, currentParentId || undefined);
                },
            });
        }

        // Block-level items from MENU_ITEMS
        const blocks: SlashMenuItem[] = MENU_ITEMS.map((item) => ({
            id: `block-${item.type}-${item.label.replace(/\s/g, '')}`,
            label: item.label,
            description: item.description || '',
            icon: item.icon,
            keywords: item.keywords,
            category: 'Blocks',
            action: (pos) => {
                // Mirror the bottom menu (BottomMenu.handleBlockClick): seed columns with empty
                // cells and size the node the same way, so a block looks identical regardless of
                // whether it's added from the bottom menu or the slash menu.
                const metadata = item.type === 'columns'
                    ? {
                        columns: Array.from({ length: item.meta?.count || 2 }).map(() => ({
                            id: uuidv4(),
                            content: [{ id: uuidv4(), type: 'text', content: '' }],
                        })),
                    }
                    : item.type === 'gallery'
                        ? createGalleryMetadata([], item.meta)
                        : item.meta;

                const newBlock = {
                    id: uuidv4(),
                    type: item.type,
                    content: '',
                    metadata
                };

                const columnCount = item.type === 'columns' ? (item.meta?.count || 2) : 0;
                const columnsPerRow = columnCount === 4 ? 2 : columnCount;
                // Mirrors BottomMenu.handleBlockClick — media starts at its own
                // 208 footprint (without this branch an image created from `/`
                // spawned at 300 and visibly snapped to 208 on mount), and a
                // table starts wide enough for its default columns instead of
                // opening with a permanent horizontal scrollbar.
                const BLOCK_WIDTH = item.type === 'columns'
                    ? Math.max(550, columnsPerRow * 220)
                    : item.type === 'gallery' ? GALLERY_NODE_WIDTH
                        : isMediaType(item.type) ? 208
                            : item.type === 'table' ? MIN_EXPANDED_SIZE
                                : 300;
                const BLOCK_HEIGHT = 100;

                addNode('block', pos, { content: [newBlock], isStandaloneBlock: true }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, currentParentId || undefined);
            }
        }));

        return [...containers, ...blocks];
    }, [addNode, currentParentId]);

    const filteredItems = useMemo(() => {
        if (!query) return menuItems;
        const q = query.toLowerCase();
        return menuItems.filter(item =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            (item.keywords && item.keywords.some(k => k.toLowerCase().includes(q)))
        );
    }, [query, menuItems]);

    // Clamp selected index when filter changes
    useEffect(() => {
        if (selectedIndex >= filteredItems.length) {
            setSelectedIndex(Math.max(0, filteredItems.length - 1));
        }
    }, [filteredItems.length, selectedIndex]);

    // Scroll selected item into view
    useEffect(() => {
        if (!itemsListRef.current) return;
        const selected = itemsListRef.current.children[selectedIndex] as HTMLElement | undefined;
        selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex]);

    // Track mouse position for menu placement
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Open menu on "/" keypress (only when canvas is focused, not inside an editor)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't open if a modal is active
            if (centerPanelId || fullscreenId) return;
            // Don't open if already open
            if (isOpen) return;

            // Don't open if typing inside an input, textarea, or contenteditable
            const target = e.target as HTMLElement;
            const isEditable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('[contenteditable]') ||
                target.closest('[class*="BlockEditor"]') ||
                target.closest('[class*="editor"]') ||
                target.closest('[class*="searchInput"]');

            if (isEditable) return;

            if (e.key === '/') {
                e.preventDefault();
                e.stopPropagation();
                setMenuPosition({
                    x: lastMousePos.current.x,
                    y: lastMousePos.current.y
                });
                setIsOpen(true);
                setQuery('');
                setSelectedIndex(0);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, centerPanelId, fullscreenId]);

    // Auto-focus input when menu opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    // Close on click outside — use pointerdown on capture phase so it fires
    // before React Flow's canvas can swallow the event
    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        // Attach on capture phase with a microtask delay to skip the opening click
        const raf = requestAnimationFrame(() => {
            document.addEventListener('pointerdown', handlePointerDown, true);
        });
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('pointerdown', handlePointerDown, true);
        };
    }, [isOpen]);

    const executeItem = useCallback((item: SlashMenuItem) => {
        const rawPos = screenToFlowPosition({ x: menuPosition.x, y: menuPosition.y });
        const { x, y, zoom } = getViewport();
        const vp = { x, y, zoom, screenW: window.innerWidth, screenH: window.innerHeight };
        const size = { width: 432, height: 100 };
        const position = findNonOverlappingPosition(rawPos, size, useStore.getState().nodes, currentParentId, vp);
        item.action(position);
        setIsOpen(false);
    }, [menuPosition, screenToFlowPosition, getViewport, currentParentId]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(i => (i + 1) % filteredItems.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredItems[selectedIndex]) {
                    executeItem(filteredItems[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    }, [filteredItems, selectedIndex, executeItem]);

    if (!isOpen) return null;

    // Position the menu near cursor, clamped to viewport
    const menuWidth = 260;
    const menuHeight = 320;
    const clampedX = Math.min(menuPosition.x, window.innerWidth - menuWidth - 16);
    const clampedY = Math.min(menuPosition.y, window.innerHeight - menuHeight - 16);

    return (
        <div
            ref={menuRef}
            className={styles.slashMenu}
            style={{ left: clampedX, top: clampedY }}
            onKeyDown={handleKeyDown}
        >
            <div className={styles.header}>
                <span className={styles.slashIcon}>/</span>
                <input
                    ref={inputRef}
                    className={styles.searchInput}
                    type="text"
                    placeholder="Type to filter..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(0);
                    }}
                />
            </div>

            <div className={styles.items} ref={itemsListRef}>
                {filteredItems.length === 0 ? (
                    <div className={styles.emptyState}>No matching items</div>
                ) : (
                    (() => {
                        let flatIndex = 0;
                        let lastCategory = '';
                        return filteredItems.map((item) => {
                            const currentIndex = flatIndex++;
                            const Icon = item.icon;
                            const showCategory = item.category !== lastCategory;
                            lastCategory = item.category;
                            return (
                                <div key={item.id}>
                                    {showCategory && (
                                        <div className={styles.categoryLabel}>{item.category}</div>
                                    )}
                                    <button
                                        className={`${styles.menuItem} ${currentIndex === selectedIndex ? styles.selected : ''}`}
                                        onClick={() => executeItem(item)}
                                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                                    >
                                        <div className={styles.itemIcon}>
                                            <Icon size={18} />
                                        </div>
                                        <div className={styles.itemContent}>
                                            <span className={styles.itemLabel}>{item.label}</span>
                                            <span className={styles.itemDesc}>{item.description}</span>
                                        </div>
                                    </button>
                                </div>
                            );
                        });
                    })()
                )}
            </div>
        </div>
    );
}
