import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Copy, Type, Palette, ArrowRight, Heading1, Heading2, Heading3, CheckSquare, Quote, List, ListOrdered, Code, Link, ChevronDown } from 'lucide-react';
import styles from './BlockEditor.module.css';
import type { BlockType } from './types';

type BlockMenuActionValue = BlockType | { type: 'text' | 'background'; value: string } | number;

interface BlockMenuProps {
    x: number;
    y: number;
    // blockId: string; // Not needed
    currentType: BlockType;
    onClose: () => void;
    onAction: (action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split' | 'toggleHeader', value?: BlockMenuActionValue) => void;
}

const TURN_INTO_ITEMS: { label: string; type: BlockType; icon: React.ReactNode }[] = [
    { label: 'Text', type: 'text', icon: <Type size={16} /> },
    { label: 'Heading 1', type: 'heading1', icon: <Heading1 size={16} /> },
    { label: 'Heading 2', type: 'heading2', icon: <Heading2 size={16} /> },
    { label: 'Heading 3', type: 'heading3', icon: <Heading3 size={16} /> },
    { label: 'Bulleted List', type: 'bullet', icon: <List size={16} /> },
    { label: 'Numbered List', type: 'numbered', icon: <ListOrdered size={16} /> },
    { label: 'To-do', type: 'todo', icon: <CheckSquare size={16} /> },
    { label: 'Quote', type: 'quote', icon: <Quote size={16} /> },
    { label: 'Code', type: 'code', icon: <Code size={16} /> },
    { label: 'Smart Link', type: 'link', icon: <Link size={16} /> },
    { label: 'Color Block', type: 'color', icon: <Palette size={16} /> },
];

const COLORS = [
    { label: 'Default', value: 'inherit' },
    { label: 'Gray', value: '#787774' },
    { label: 'Brown', value: '#9f6b53' },
    { label: 'Orange', value: '#d9730d' },
    { label: 'Yellow', value: '#cb912f' },
    { label: 'Green', value: '#448361' },
    { label: 'Blue', value: '#337ea9' },
    { label: 'Purple', value: '#9065b0' },
    { label: 'Pink', value: '#c14c8a' },
    { label: 'Red', value: '#d44c47' },
];

export function BlockMenu({ x, y, currentType, onClose, onAction }: BlockMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeSubMenu, setActiveSubMenu] = useState<'turnInto' | 'color' | null>(null);
    const [colorTab, setColorTab] = useState<'text' | 'background'>('text');
    const [positionedCoords, setPositionedCoords] = useState<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        if (!menuRef.current) return;

        const menuWidth = menuRef.current.offsetWidth || 270;
        const menuHeight = menuRef.current.offsetHeight || 300;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Dynamic vertical (y) positioning
        let finalY = y;
        if (y > viewportHeight / 2) {
            // Mouse is in the bottom half: open on top of the mouse
            finalY = y - menuHeight - 8;
        } else {
            // Mouse is in the top half: open under the mouse
            finalY = y + 8;
        }

        // Dynamic horizontal (x) positioning
        // Avoid overlapping the block (which is on the right of the handle).
        // Try to open to the left of the handle click.
        let finalX = x - menuWidth - 8;
        if (finalX < 8) {
            // Not enough space on the left: open to the right of the handle click
            finalX = Math.min(x + 16, viewportWidth - menuWidth - 8);
        }

        // Constrain coords to keep the menu fully within the viewport bounds
        finalY = Math.max(8, Math.min(finalY, viewportHeight - menuHeight - 8));
        finalX = Math.max(8, Math.min(finalX, viewportWidth - menuWidth - 8));

        setPositionedCoords({ x: finalX, y: finalY });
    }, [x, y]);

    // Close on click outside or Esc key
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setTimeout(onClose, 0);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        document.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, { capture: true });
            document.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [onClose]);

    const handleMainAction = (action: 'duplicate' | 'delete' | 'split') => {
        onAction(action);
        onClose();
    };

    // Submenu Rendering Helper
    const renderSubMenu = () => {
        if (!activeSubMenu) return null;

        // Position relative to parent menu width (approx 220px)
        const subMenuStyle: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: '100%',
            marginLeft: '4px', // Gap
            width: '200px',
            maxHeight: '300px',
            overflowY: 'auto'
        };

        return (
            <div className={`${styles.slashMenu} block-menu`} role="menu" style={subMenuStyle}>
                {activeSubMenu === 'turnInto' && (
                    <>
                        <div className={styles.menuHeader}>Turn into</div>
                        {TURN_INTO_ITEMS.map(item => (
                            <div
                                key={item.type}
                                className={`${styles.slashMenuItem} ${currentType === item.type ? styles.selected : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAction('turnInto', item.type);
                                    onClose();
                                }}
                            >
                                <span className={styles.slashIcon}>{item.icon}</span>
                                <span className={styles.slashLabel}>{item.label}</span>
                            </div>
                        ))}
                    </>
                )}

                {activeSubMenu === 'color' && (
                    <>
                        <div className={styles.tabContainer}>
                            <button
                                className={`${styles.tabButton} ${colorTab === 'text' ? styles.active : ''}`}
                                onClick={(e) => { e.stopPropagation(); setColorTab('text'); }}
                            >
                                Text
                            </button>
                            <button
                                className={`${styles.tabButton} ${colorTab === 'background' ? styles.active : ''}`}
                                onClick={(e) => { e.stopPropagation(); setColorTab('background'); }}
                            >
                                Background
                            </button>
                        </div>
                        <div className={styles.menuHeader} style={{ marginTop: 0 }}>{colorTab === 'text' ? 'Text Color' : 'Background'}</div>
                        {COLORS.map(item => (
                            <div
                                key={`${colorTab}-${item.value}`}
                                className={styles.slashMenuItem}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (colorTab === 'text') {
                                        onAction('color', { type: 'text', value: item.value });
                                    } else {
                                        const val = item.value === 'inherit' ? 'transparent' : `${item.value}20`;
                                        onAction('color', { type: 'background', value: val });
                                    }
                                    onClose();
                                }}
                            >
                                <span className={styles.slashIcon} style={
                                    colorTab === 'text' ? {
                                        color: item.value === 'inherit' ? 'var(--color-text-main)' : item.value
                                    } : {
                                        background: item.value === 'inherit' ? 'transparent' : item.value,
                                        border: item.value === 'inherit' ? '1px solid #555' : 'none'
                                    }
                                }>
                                    {colorTab === 'text' ? (
                                        <>
                                            <div style={{ width: 12, height: 12, borderRadius: '2px', background: 'currentColor' }} />
                                            <span style={{ marginLeft: 6 }}>A</span>
                                        </>
                                    ) : (
                                        <div style={{ width: '100%', height: '100%' }} />
                                    )}
                                </span>
                                <span className={styles.slashLabel}>{item.label}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        );
    };

    return createPortal(
        <div
            className={`${styles.slashMenu} block-menu`}
            role="menu"
            style={{
                top: positionedCoords ? positionedCoords.y : y,
                left: positionedCoords ? positionedCoords.x : x,
                visibility: positionedCoords ? 'visible' : 'hidden',
                opacity: positionedCoords ? 1 : 0,
                overflow: 'visible',
                transform: positionedCoords ? 'scale(1)' : 'scale(0.95)',
                transition: 'opacity 0.12s cubic-bezier(0.16, 1, 0.3, 1), transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
            }} // Allow submenu to overflow, measure off-screen/invisible initially
            ref={menuRef}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={styles.menuHeader}>Actions</div>

            <div className={styles.slashMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={(e) => { e.stopPropagation(); handleMainAction('duplicate'); }}>
                <span className={styles.slashIcon}><Copy size={16} /></span>
                <span className={styles.slashLabel}>Duplicate</span>
            </div>

            <div className={`${styles.slashMenuItem} ${styles.dangerItem}`} onMouseEnter={() => setActiveSubMenu(null)} onClick={(e) => { e.stopPropagation(); handleMainAction('delete'); }}>
                <span className={styles.slashIcon}><Trash2 size={16} /></span>
                <span className={styles.slashLabel}>Delete</span>
            </div>

            <div className={styles.divider} />

            <div className={styles.slashMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={(e) => { e.stopPropagation(); handleMainAction('split'); }}>
                <span className={styles.slashIcon}><ArrowRight size={16} /></span>
                <span className={styles.slashLabel}>Split Note Here</span>
            </div>

            {(currentType === 'heading1' || currentType === 'heading2' || currentType === 'heading3') && (
                <div className={styles.slashMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={(e) => { e.stopPropagation(); onAction('toggleHeader'); onClose(); }}>
                    <span className={styles.slashIcon}><ChevronDown size={16} /></span>
                    <span className={styles.slashLabel}>Toggle Header</span>
                </div>
            )}

            <div className={styles.divider} />

            <div
                className={styles.slashMenuItem}
                onMouseEnter={() => setActiveSubMenu('turnInto')}
                style={activeSubMenu === 'turnInto' ? { background: 'var(--menu-item-active)' } : {}} // Highlight parent
            >
                <span className={styles.slashIcon}><ArrowRight size={16} /></span>
                <span className={styles.slashLabel} style={{ flexGrow: 1 }}>Turn into</span>
                <span className={styles.menuArrow}>›</span>
            </div>

            <div
                className={styles.slashMenuItem}
                onMouseEnter={() => setActiveSubMenu('color')}
                style={activeSubMenu === 'color' ? { background: 'var(--menu-item-active)' } : {}} // Highlight parent
            >
                <span className={styles.slashIcon}><Palette size={16} /></span>
                <span className={styles.slashLabel} style={{ flexGrow: 1 }}>Color</span>
                <span className={styles.menuArrow}>›</span>
            </div>

            {/* Render Submenu Side-by-Side */}
            {renderSubMenu()}
        </div>,
        document.body
    );
}
