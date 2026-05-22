import { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';
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
            { label: 'Open block menu', keys: ['Ctrl', '/'] },
            { label: 'Add block below', keys: ['Ctrl', 'Enter'] },
            { label: 'Indent block', keys: ['Tab'] },
            { label: 'Unindent block', keys: ['Shift', 'Tab'] },
        ],
    },
    {
        title: 'Canvas Selection',
        items: [
            { label: 'Add to selection', keys: ['Shift', 'Click'] },
            { label: 'Box select', keys: ['Click', 'Drag'] },
            { label: 'Duplicate selected', keys: ['D'] },
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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isOpen) return;
            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);
            if (!clickedInsidePanel && !clickedOnButton) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <div
            ref={panelRef}
            className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed}`}
        >
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Keyboard size={16} style={{ color: 'var(--color-primary)' }} />
                    <span className={styles.headerTitle}>Shortcuts</span>
                </div>
                <button className={styles.closeBtn} onClick={onClose} title="Close Shortcuts">
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
