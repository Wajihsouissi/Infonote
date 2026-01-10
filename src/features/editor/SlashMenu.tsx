import { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styles from './BlockEditor.module.css';
import type { BlockType } from './types';
import { MENU_ITEMS } from './menuConstants';

interface SlashMenuProps {
    anchorRect: DOMRect | { top: number; left: number; bottom: number }; // Virtual or real rect
    filter: string;
    onSelect: (type: BlockType, metadata?: any) => void;
    onClose: () => void;
}

export function SlashMenu({ anchorRect, filter, onSelect, onClose }: SlashMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; height?: number }>({
        top: anchorRect.bottom + 5,
        left: anchorRect.left
    });

    const filteredItems = useMemo(() => {
        const lowerFilter = filter.toLowerCase();
        return MENU_ITEMS.filter(item =>
            item.label.toLowerCase().includes(lowerFilter) ||
            item.keywords?.some(k => k.includes(lowerFilter))
        );
    }, [filter]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredItems]);

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
    }, [selectedIndex, filteredItems, onSelect, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [onClose]);

    if (filteredItems.length === 0) return null;

    return createPortal(
        <div
            className={styles.slashMenu}
            style={{ top: position.top, left: position.left }}
            ref={menuRef}
        >
            <div className={styles.menuHeader}>Basic Blocks</div>
            {filteredItems.map((item, index) => {
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
            })}
        </div>,
        document.body
    );
}
