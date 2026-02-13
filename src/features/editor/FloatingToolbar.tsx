import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Bold, Italic, Underline, Strikethrough, Link, FileText } from 'lucide-react';
import styles from './BlockEditor.module.css';

interface FloatingToolbarProps {
    selectionRect: DOMRect;
    onFormat: (format: string, value?: string) => void;
}

export function FloatingToolbar({ selectionRect, onFormat }: FloatingToolbarProps) {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;

        // Calculate position above selection
        const toolbarHeight = ref.current.offsetHeight;
        const toolbarWidth = ref.current.offsetWidth;

        // Center horizontally
        let left = selectionRect.left + (selectionRect.width / 2) - (toolbarWidth / 2);
        // Ensure not off screen
        left = Math.max(10, Math.min(window.innerWidth - toolbarWidth - 10, left));

        // Position above
        let top = selectionRect.top - toolbarHeight - 10;
        // Flip if too close to top
        if (top < 10) {
            top = selectionRect.bottom + 10;
        }

        setPosition({ top, left });
    }, [selectionRect]);

    const handleFormat = (e: React.MouseEvent, format: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent losing focus
        onFormat(format);
    };

    return createPortal(
        <motion.div
            ref={ref}
            className={styles.floatingToolbar}
            style={{ top: position.top, left: position.left }}
            onMouseDown={e => e.preventDefault()} // Prevent focus loss
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
        >
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'bold')} title="Bold (Ctrl+B)">
                <Bold size={16} />
            </button>
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'italic')} title="Italic (Ctrl+I)">
                <Italic size={16} />
            </button>
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'underline')} title="Underline (Ctrl+U)">
                <Underline size={16} />
            </button>
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'strikeThrough')} title="Strikethrough">
                <Strikethrough size={16} />
            </button>
            <div className={styles.toolbarDivider} />
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'createPage')} title="Turn into Page">
                <FileText size={16} />
            </button>
            <button className={styles.toolbarBtn} onClick={(e) => handleFormat(e, 'createLink')} title="Link">
                <Link size={16} />
            </button>
        </motion.div>,
        document.body
    );
}
