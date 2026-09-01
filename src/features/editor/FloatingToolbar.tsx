import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Bold, Italic, Underline, Strikethrough, Code, Link, FileText, Check, X, Unlink, Palette } from '../../components/icons';
import styles from './BlockEditor.module.css';
import { HIGHLIGHT_HUES, type InlineFormat, type HighlightHue } from './inlineFormat';

interface FloatingToolbarProps {
    selectionRect: DOMRect;
    onFormat: (format: string, value?: string) => void;
    /** Marks currently wrapping the selection, for highlighting buttons. */
    activeFormats?: Set<InlineFormat>;
    /** The highlight hue under the selection, if it already has one. */
    activeHighlight?: HighlightHue | null;
    /** Pre-filled URL if the selection is inside an existing link */
    initialLinkUrl?: string | null;
    /** Controlled: whether the link input is showing (also opened by Ctrl+K). */
    linkOpen?: boolean;
    onLinkOpenChange?: (open: boolean) => void;
    /** Controlled for the same reason as linkOpen — see the note on the parent's
     *  mount condition: the toolbar is unmounted the moment the DOM selection
     *  collapses, so a row that must outlive that has to be the parent's state. */
    colorOpen?: boolean;
    onColorOpenChange?: (open: boolean) => void;
}

type ToolbarButton = {
    format: InlineFormat;
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

export function FloatingToolbar({ selectionRect, onFormat, activeFormats, activeHighlight, initialLinkUrl, linkOpen, onLinkOpenChange, colorOpen, onColorOpenChange }: FloatingToolbarProps) {
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const [url, setUrl] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

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
    }, [selectionRect, linkOpen, colorOpen]);

    // Focus the URL field when the link popover opens.
    useEffect(() => {
        if (linkOpen) {
            setUrl(initialLinkUrl || '');
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [linkOpen, initialLinkUrl]);

    // Close whichever row is open if the user clicks outside the toolbar
    useEffect(() => {
        if (!linkOpen && !colorOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onLinkOpenChange?.(false);
                onColorOpenChange?.(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        return () => document.removeEventListener('mousedown', handleClickOutside, { capture: true });
    }, [linkOpen, colorOpen, onLinkOpenChange, onColorOpenChange]);

    // Keep the editable's selection alive on click. React's onMouseDown
    // preventDefault does NOT reliably stop the native focus-shift for portaled
    // content, so the block would blur (and its onBlur can re-render, killing the
    // saved range) before the format applies. A NATIVE listener attached the
    // instant the node mounts (ref callback — no motion/effect timing gap) fires
    // for trusted events and prevents the blur outright. The link input opts out
    // so it can still receive focus.
    const setToolbarRef = useCallback((node: HTMLDivElement | null) => {
        ref.current = node;
        if (node) {
            node.addEventListener('mousedown', (e: MouseEvent) => {
                if ((e.target as HTMLElement)?.closest('input')) return;
                e.preventDefault();
            });
        }
    }, []);

    const handleFormat = (e: React.MouseEvent, format: string) => {
        e.preventDefault();
        e.stopPropagation();
        onFormat(format);
    };

    const applyLink = () => {
        let finalUrl = url.trim();
        if (finalUrl && !/^https?:\/\//i.test(finalUrl) && !/^(mailto|tel|sms):/i.test(finalUrl)) {
            finalUrl = 'https://' + finalUrl;
        }
        onFormat('createLink', finalUrl);
        onLinkOpenChange?.(false);
    };

    return createPortal(
        <motion.div
            ref={setToolbarRef}
            className={styles.floatingToolbar}
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.preventDefault()} // keep the selection/focus
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
        >
            {linkOpen ? (
                // Link input row — needs real focus, so it opts out of the
                // container's selection-preserving mousedown preventDefault.
                <div className={styles.toolbarLinkRow} onMouseDown={(e) => e.stopPropagation()}>
                    <Link size={14} className={styles.toolbarLinkIcon} />
                    <input
                        ref={inputRef}
                        className={styles.toolbarLinkInput}
                        placeholder="Paste or type a link…"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                            else if (e.key === 'Escape') { e.preventDefault(); onLinkOpenChange?.(false); }
                        }}
                    />
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); applyLink(); }}
                        title="Apply link"
                    >
                        <Check size={16} />
                    </button>
                    {initialLinkUrl && (
                        <button
                            className={styles.toolbarBtn}
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onFormat('createLink', ''); onLinkOpenChange?.(false); }}
                            title="Remove link"
                        >
                            <Unlink size={16} />
                        </button>
                    )}
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onLinkOpenChange?.(false); }}
                        title="Cancel"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : colorOpen ? (
                // Highlight palette — the ten hues of the design system, the same
                // set a lane or a tag picks from, so a colour means one thing
                // everywhere. Clicking the active hue again lifts the highlight.
                <div className={styles.toolbarSwatchRow} role="listbox" aria-label="Highlight colour">
                    {HIGHLIGHT_HUES.map((hue) => {
                        const isActive = activeHighlight === hue;
                        return (
                            <button
                                key={hue}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                aria-label={`Highlight ${hue}`}
                                title={hue}
                                data-swatch={hue}
                                className={styles.toolbarSwatch}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onFormat('highlight', isActive ? undefined : hue);
                                    onColorOpenChange?.(false);
                                }}
                            />
                        );
                    })}
                    <div className={styles.toolbarDivider} />
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onFormat('highlight');
                            onColorOpenChange?.(false);
                        }}
                        title="Remove highlight"
                    >
                        <Unlink size={16} />
                    </button>
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onColorOpenChange?.(false); }}
                        title="Cancel"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <>
                    {BUTTONS.map(({ format, icon: Icon, title }) => {
                        const isActive = activeFormats?.has(format);
                        return (
                            <button
                                key={format}
                                className={`${styles.toolbarBtn} ${isActive ? styles.toolbarBtnActive : ''}`}
                                onMouseDown={(e) => handleFormat(e, format)}
                                title={title}
                                aria-pressed={isActive || false}
                            >
                                <Icon size={16} />
                            </button>
                        );
                    })}
                    <button
                        className={`${styles.toolbarBtn} ${activeHighlight ? styles.toolbarBtnActive : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onColorOpenChange?.(true); }}
                        title="Highlight (Ctrl+Shift+H)"
                        aria-pressed={!!activeHighlight}
                    >
                        <Palette size={16} />
                    </button>
                    <div className={styles.toolbarDivider} />
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onLinkOpenChange?.(true); }}
                        title="Link (Ctrl+K)"
                    >
                        <Link size={16} />
                    </button>
                    <button
                        className={styles.toolbarBtn}
                        onMouseDown={(e) => handleFormat(e, 'createPage')}
                        title="Turn into Page"
                    >
                        <FileText size={16} />
                    </button>
                </>
            )}
        </motion.div>,
        document.body
    );
}
