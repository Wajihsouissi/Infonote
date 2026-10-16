import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { StickyNote, Layers } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { v4 as uuidv4 } from 'uuid';
import { MENU_ITEMS } from '../editor/menuConstants';
import { createMenuBlock, menuBlockNodeSize } from '../editor/menuBlocks';
import styles from './CanvasSlashMenu.module.css';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { isEditableElement } from '../../utils/editableTarget';

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

        // Block-level items from MENU_ITEMS
        const blocks: SlashMenuItem[] = MENU_ITEMS.map((item) => ({
            id: `block-${item.type}-${item.label.replace(/\s/g, '')}`,
            label: item.label,
            description: item.description || '',
            icon: item.icon,
            keywords: item.keywords,
            category: 'Blocks',
            action: (pos) => {
                addNode('block', pos, { content: [createMenuBlock(item)], isStandaloneBlock: true }, menuBlockNodeSize(item), currentParentId || undefined);
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

    // The highlighted row, kept inside the (possibly just narrowed) list.
    const activeIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));

    // Scroll the highlighted row into view.
    useEffect(() => {
        const row = itemsListRef.current?.children[activeIndex] as HTMLElement | undefined;
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeIndex]);

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
            // Not over an open card, not twice, and never while typing.
            if (e.key !== '/' || centerPanelId || fullscreenId || isOpen) return;
            if (isEditableElement(e.target)) return;

            e.preventDefault();
            e.stopPropagation();
            setMenuPosition({ x: lastMousePos.current.x, y: lastMousePos.current.y });
            setIsOpen(true);
            setQuery('');
            setSelectedIndex(0);
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
                setSelectedIndex((activeIndex + 1) % filteredItems.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((activeIndex - 1 + filteredItems.length) % filteredItems.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredItems[activeIndex]) executeItem(filteredItems[activeIndex]);
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    }, [filteredItems, activeIndex, executeItem]);

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
                                        className={`${styles.menuItem} ${currentIndex === activeIndex ? styles.selected : ''}`}
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
