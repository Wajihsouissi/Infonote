import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Bold, Italic, Underline, Strikethrough, Code, Link, FileText } from 'lucide-react';
import styles from './BlockEditor.module.css';
import type { InlineFormat } from './inlineFormat';

interface FloatingToolbarProps {
    selectionRect: DOMRect;
    onFormat: (format: string, value?: string) => void;
    /** Markers currently wrapping the selection, for highlighting buttons. */
    activeFormats?: Set<InlineFormat>;
}

type ToolbarButton = {
    format: InlineFormat | 'createLink' | 'createPage';
    icon: typeof Bold;
    title: string;
};

const BUTTONS: ToolbarButton[] = [
    { format: 'bold', icon: Bold, title: 'Bold (Ctrl+B)' },
    { format: 'italic', icon: Italic, title: 'Italic (Ctrl+I)' },
    { format: 'underline', icon: Underline, title: 'Underline (Ctrl+U)' },
    { format: 'strikeThrough', icon: Strikethrough, title: 'Strikethrough (Ctrl+Shift+S)' },
    { format: 'code', icon: Code, title: 'Code (Ctrl+E)' },
];

export function FloatingToolbar({ selectionRect, onFormat, activeFormats }: FloatingToolbarProps) {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;

        const toolbarHeight = ref.current.offsetHeight;
        const toolbarWidth = ref.current.offsetWidth;

        // Center horizontally, clamped on-screen.
        let left = selectionRect.left + selectionRect.width / 2 - toolbarWidth / 2;
        left = Math.max(10, Math.min(window.innerWidth - toolbarWidth - 10, left));

        // Position above the selection, flipping below if too close to the top.
        let top = selectionRect.top - toolbarHeight - 10;
        if (top < 10) top = selectionRect.bottom + 10;

        setPosition({ top, left });
    }, [selectionRect]);

    const handleFormat = (e: React.MouseEvent, format: string) => {
        e.preventDefault();
        e.stopPropagation();
        onFormat(format);
    };

    // Prevent the button's own mousedown from collapsing the selection /
    // moving focus off the editable before the click handler runs.
    const keepSelection = (e: React.MouseEvent) => e.preventDefault();

    return createPortal(
        <motion.div
            ref={ref}
            className={styles.floatingToolbar}
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.preventDefault()} // keep the selection/focus
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
        >
            {BUTTONS.map(({ format, icon: Icon, title }) => {
                const isActive = activeFormats?.has(format as InlineFormat);
                return (
                    <button
                        key={format}
                        className={`${styles.toolbarBtn} ${isActive ? styles.toolbarBtnActive : ''}`}
                        onMouseDown={keepSelection}
                        onClick={(e) => handleFormat(e, format)}
                        title={title}
                        aria-pressed={isActive || false}
                    >
                        <Icon size={16} />
                    </button>
                );
            })}
            <div className={styles.toolbarDivider} />
            <button
                className={styles.toolbarBtn}
                onMouseDown={keepSelection}
                onClick={(e) => handleFormat(e, 'createLink')}
                title="Link (Ctrl+K)"
            >
                <Link size={16} />
            </button>
            <button
                className={styles.toolbarBtn}
                onMouseDown={keepSelection}
                onClick={(e) => handleFormat(e, 'createPage')}
                title="Turn into Page"
            >
                <FileText size={16} />
            </button>
        </motion.div>,
        document.body
    );
}
