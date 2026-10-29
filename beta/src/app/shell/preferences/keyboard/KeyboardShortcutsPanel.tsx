import { useEffect, useRef } from 'react';
import { X } from '../../../../shared/icons';
import styles from './KeyboardShortcutsPanel.module.css';

interface KeyboardShortcutsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

interface ShortcutEntry {
    label: string;
    keys: string[];
}

interface ShortcutCategory {
    title: string;
    items: ShortcutEntry[];
}

const SHORTCUTS: ShortcutCategory[] = [
    {
        title: 'Navigation',
        items: [
            { label: 'Pan canvas', keys: ['↑', '↓', '←', '→'] },
            { label: 'Zoom in', keys: ['+'] },
            { label: 'Zoom out', keys: ['-'] },
            { label: 'Fit view', keys: ['5'] },
            { label: 'Focus selected node', keys: ['F'] },
            { label: 'Create a new text node', keys: ['Enter'] },
        ],
    },
    {
        title: 'Editing',
        items: [
            { label: 'Delete selected node(s)', keys: ['Del', 'Bksp'] },
            { label: 'Open slash command menu', keys: ['/'] },
        ],
    },
    {
        title: 'History',
        items: [
            { label: 'Undo', keys: ['Ctrl', 'Z'] },
            { label: 'Redo', keys: ['Ctrl', 'Shift', 'Z'] },
            { label: 'Redo (alt)', keys: ['Ctrl', 'Y'] },
        ],
    },
    {
        title: 'Block Editor',
        items: [
            { label: 'Create new block below', keys: ['Enter'] },
            { label: 'Delete empty block', keys: ['Bksp'] },
            { label: 'Navigate between blocks', keys: ['↑', '↓'] },
            { label: 'Move block up', keys: ['Ctrl', 'Shift', '↑'] },
            { label: 'Move block down', keys: ['Ctrl', 'Shift', '↓'] },
            { label: 'Duplicate block', keys: ['Ctrl', 'D'] },
            { label: 'Copy selected blocks', keys: ['Ctrl', 'C'] },
            { label: 'Cut selected blocks', keys: ['Ctrl', 'X'] },
            { label: 'Paste blocks', keys: ['Ctrl', 'V'] },
            { label: 'Open block menu', keys: ['Ctrl', '/'] },
            { label: 'Add block below', keys: ['Ctrl', 'Enter'] },
            { label: 'Indent block', keys: ['Tab'] },
            { label: 'Unindent block', keys: ['Shift', 'Tab'] },
        ],
    },
    {
        title: 'Canvas Selection',
        items: [
            { label: 'Add/remove from selection', keys: ['Shift', 'Click'] },
            { label: 'Select all on this canvas', keys: ['Ctrl', 'A'] },
            { label: 'Box select', keys: ['Ctrl', 'Drag'] },
            { label: 'Duplicate selected', keys: ['Ctrl', 'D'] },
            { label: 'Copy selected cards', keys: ['Ctrl', 'C'] },
            { label: 'Cut selected cards', keys: ['Ctrl', 'X'] },
            { label: 'Paste cards', keys: ['Ctrl', 'V'] },
            { label: 'Toggle linking mode', keys: ['L'] },
        ],
    },
    {
        title: 'Panels',
        items: [
            { label: 'Close panel / blur field', keys: ['Esc'] },
            { label: 'Open keyboard shortcuts', keys: ['K'] },
            { label: 'Toggle outline panel', keys: ['T'] },
            { label: 'Toggle search', keys: ['Ctrl', 'F'] },
            { label: 'Open blocks menu', keys: ['B'] },
            { label: 'Open views menu', keys: ['V'] },
            { label: 'Add new note card', keys: ['Ctrl', 'N'] },
        ],
    },
];

function Kbd({ keys }: { keys: string[] }) {
    return (
        <span className={styles.shortcutKeys}>
            {keys.map((key, i) => (
                <span key={i}>
                    <span className={`${styles.kbd} ${key === 'Ctrl' || key === 'Shift' ? styles.kbdMod : ''}`}>
                        {key}
                    </span>
                    {i < keys.length - 1 && <span style={{ color: 'var(--color-text-muted)', opacity: 0.4, fontSize: '0.65rem' }}>+</span>}
                </span>
            ))}
        </span>
    );
}

export function KeyboardShortcutsPanel({ isOpen, onClose, buttonRef }: KeyboardShortcutsPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const focusBeforeOpen = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            focusBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            closeRef.current?.focus();
        } else if (focusBeforeOpen.current) {
            if (document.activeElement === document.body || document.activeElement === closeRef.current) {
                focusBeforeOpen.current.focus();
            }
            focusBeforeOpen.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isOpen) return;
            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);
            // The app menu docks to the side while this panel is open; closing
            // on its clicks would move the rail out from under the press.
            const clickedInMenu = (e.target as HTMLElement | null)?.closest?.('[data-app-menu]');
            if (!clickedInsidePanel && !clickedOnButton && !clickedInMenu) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                // Own this Escape before the canvas selection handler sees it.
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, onClose]);

    return (
        <div
            id="keyboard-shortcuts-panel"
            ref={panelRef}
            className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed}`}
            role="region"
            aria-label="Keyboard shortcuts"
            aria-hidden={!isOpen}
            inert={!isOpen || undefined}
        >
            <div className={styles.header}>
                <button ref={closeRef} className={`${styles.closeBtn} icon-hover`} onClick={onClose} title="Close Shortcuts" aria-label="Close shortcuts">
                    <X size={18} />
                </button>
            </div>

            <div className={styles.scrollContent}>
                {SHORTCUTS.map((category) => (
                    <div key={category.title} className={styles.category}>
                        <div className={styles.categoryTitle}>{category.title}</div>
                        {category.items.map((item) => (
                            <div key={item.label} className={styles.shortcutRow}>
                                <span className={styles.shortcutLabel}>{item.label}</span>
                                <Kbd keys={item.keys} />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
