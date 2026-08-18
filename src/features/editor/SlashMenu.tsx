import { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Search } from '../../components/icons';
import styles from './BlockEditor.module.css';
import type { BlockType, BlockMetadata } from './types';
import { MENU_ITEMS } from './menuConstants';
import { toPastelColor, darkenColor } from '../../utils/colorUtils';

interface SlashMenuProps {
    anchorRect: DOMRect | { top: number; left: number; bottom: number }; // Virtual or real rect
    filter: string;
    onSelect: (type: BlockType, metadata?: BlockMetadata) => void;
    onClose: () => void;
    nodeColor?: string;
    theme?: 'light' | 'dark';
}

export function SlashMenu({ anchorRect, filter, onSelect, onClose, nodeColor, theme }: SlashMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState(filter || '');
    const itemsListRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; height?: number }>({
        top: anchorRect.bottom + 5,
        left: anchorRect.left
    });

    // Robust check for custom colors vs default transparent/none colors
    const displayColor = useMemo(() => {
        if (!nodeColor) return undefined;
        const normalized = nodeColor.trim().toLowerCase();
        if (
            normalized === '' ||
            normalized === 'transparent' ||
            normalized === 'inherit' ||
            normalized === 'none' ||
            normalized === 'default'
        ) {
            return undefined;
        }
        return toPastelColor(nodeColor, theme === 'light');
    }, [nodeColor, theme]);

    const dynamicStyles = useMemo(() => {
        if (!displayColor) return {};

        const darkText = darkenColor(displayColor, 80);
        const mutedText = darkenColor(displayColor, 65);
        const borderColor = darkenColor(displayColor, 40);

        return {
            '--slash-bg': displayColor,
            '--color-text-main': darkText,
            '--color-text-muted': mutedText,
            '--color-border': `${borderColor}40`,
            '--glass-border': `${borderColor}40`,
            '--selected-bg': `${darkText}12`,
            '--slash-item-hover-bg': `${darkText}08`,
            '--selected-accent': darkText,
            '--icon-color': darkText,
            '--slash-scrollbar': `${darkText}20`,
            '--slash-input-bg': theme === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
            '--slash-input-bg-focus': theme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)',
            '--slash-focus-shadow': `0 0 0 2px ${darkText}20`,
            '--slash-icon-bg': theme === 'light' ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)',
            '--slash-icon-border': theme === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
            '--slash-icon-hover-bg': theme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)',
            '--slash-icon-hover-border': theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
            '--selected-icon-bg': `${darkText}20`,
            '--selected-icon-border': `${darkText}35`,
            color: darkText,
        } as React.CSSProperties;
    }, [displayColor, theme]);

    // Sync filter prop if it changes
    useEffect(() => {
        if (filter) {
            setSearchQuery(filter);
        }
    }, [filter]);

    // Focus input and move cursor to the end
    useEffect(() => {
        const focusInput = () => {
            if (searchInputRef.current) {
                searchInputRef.current.focus();
                const length = searchInputRef.current.value.length;
                searchInputRef.current.setSelectionRange(length, length);
            }
        };

        const rafId = requestAnimationFrame(focusInput);
        const timerId = setTimeout(focusInput, 50);

        return () => {
            cancelAnimationFrame(rafId);
            clearTimeout(timerId);
        };
    }, []);

    const filteredItems = useMemo(() => {
        const lowerFilter = searchQuery.toLowerCase();
        return MENU_ITEMS.filter(item =>
            item.label.toLowerCase().includes(lowerFilter) ||
            item.keywords?.some(k => k.includes(lowerFilter))
        );
    }, [searchQuery]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredItems]);

    // Scroll selected item into view
    useEffect(() => {
        if (!itemsListRef.current) return;
        const selected = itemsListRef.current.children[selectedIndex] as HTMLElement | undefined;
        selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex]);

    // Smart Positioning
    useEffect(() => {
        if (!menuRef.current) return;

        const menuHeight = menuRef.current.offsetHeight;
        const windowHeight = window.innerHeight;
        const spaceBelow = windowHeight - anchorRect.bottom;

        // If not enough space below (less than menu height + padding) AND more space above
        if (spaceBelow < menuHeight && anchorRect.top > menuHeight) {
            setPosition({
                top: anchorRect.top - menuHeight - 5,
                left: anchorRect.left,
                height: menuHeight
            });
        } else {
            // Reset to default (below) if data changes and it fits or fits better
            setPosition({
                top: anchorRect.bottom + 5,
                left: anchorRect.left,
                height: menuHeight
            });
        }
    }, [filteredItems.length, anchorRect]); // Recalculate when items change (height changes) or anchor moves

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' && searchQuery === '') {
                e.preventDefault();
                onClose();
                return;
            }

            if (filteredItems.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = filteredItems[selectedIndex];
                onSelect(item.type, item.meta);
                onClose();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, filteredItems, searchQuery, onSelect, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setTimeout(onClose, 0);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [onClose]);

    return createPortal(
        <motion.div
            className={styles.slashMenu}
            style={{ top: position.top, left: position.left, ...dynamicStyles }}
            ref={menuRef}
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
            <div className={styles.slashMenuSearchWrapper}>
                <Search size={13} className={styles.slashSearchIcon} />
                <input
                    ref={searchInputRef}
                    className={styles.slashMenuInput}
                    placeholder="Search blocks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className={styles.menuHeader}>Basic Blocks</div>
            <div className={styles.slashMenuItemsList} ref={itemsListRef}>
                {filteredItems.length === 0 ? (
                    <div className={styles.slashMenuEmpty}>No matching blocks</div>
                ) : (
                    filteredItems.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.label}
                                className={`${styles.slashMenuItem} ${index === selectedIndex ? styles.selected : ''}`}
                                onClick={() => {
                                    onSelect(item.type, item.meta);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <span className={styles.slashIcon}><Icon size={16} /></span>
                                <span className={styles.slashLabel}>{item.label}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </motion.div>,
        document.body
    );
}
