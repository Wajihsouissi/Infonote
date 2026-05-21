import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Copy, Type, Palette, ArrowRight, Heading1, Heading2, Heading3, CheckSquare, Quote, List, ListOrdered, Code, Link, ChevronDown } from 'lucide-react';
import styles from './BlockEditor.module.css';
import type { BlockType } from './types';

interface BlockMenuProps {
    x: number;
    y: number;
    // blockId: string; // Not needed
    currentType: BlockType;
    onClose: () => void;
    onAction: (action: 'turnInto' | 'color' | 'duplicate' | 'delete' | 'split' | 'toggleHeader', value?: any) => void;
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

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Check if click is inside main menu OR any submenu
            // Since submenus are likely portals or children, simple contains check might need refinement 
            // but if they are children of this div, strict contains works.
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [onClose]);

    const handleMainAction = (action: 'duplicate' | 'delete') => {
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
            <div className={styles.slashMenu} style={subMenuStyle}>
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
            className={styles.slashMenu}
            style={{ top: y, left: x, overflow: 'visible' }} // Allow submenu to overflow
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

            <div className={styles.slashMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={(e) => { e.stopPropagation(); handleMainAction('split' as any); }}>
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
                style={activeSubMenu === 'turnInto' ? { background: 'white', color: 'black' } : {}} // Highlight parent
            >
                <span className={styles.slashIcon}><ArrowRight size={16} /></span>
                <span className={styles.slashLabel} style={{ flexGrow: 1 }}>Turn into</span>
                <span className={styles.menuArrow}>›</span>
            </div>

            <div
                className={styles.slashMenuItem}
                onMouseEnter={() => setActiveSubMenu('color')}
                style={activeSubMenu === 'color' ? { background: 'white', color: 'black' } : {}} // Highlight parent
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
