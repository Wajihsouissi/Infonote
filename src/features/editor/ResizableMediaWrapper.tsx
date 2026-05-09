import React, { useRef, useState } from 'react';
import { useViewport } from '@xyflow/react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import styles from './BlockEditor.module.css';

interface ResizableMediaWrapperProps {
    children: React.ReactNode;
    width?: number; // stored width in pixels
    alignment?: 'left' | 'center' | 'right';
    readOnly?: boolean;
    onResize: (newWidth: number) => void;
    onAlign?: (alignment: 'left' | 'center' | 'right') => void;
    disableMediaControls?: boolean;
}

export const ResizableMediaWrapper = ({
    children,
    width,
    alignment = 'left',
    readOnly,
    onResize,
    onAlign,
    disableMediaControls
}: ResizableMediaWrapperProps) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const activeResize = useRef(false);

    // Get viewport zoom to keep handle size constant visually
    const { zoom } = useViewport();
    const safeZoom = zoom || 1;

    // Initial logic similar to NoteCard but simplified for block flow
    const handleMouseDown = (e: React.MouseEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const currentRef = wrapperRef.current;
        if (!currentRef) return;

        const startWidth = currentRef.offsetWidth;
        activeResize.current = true;
        setIsResizing(true);

        let currentW = startWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();

            const deltaX = (moveEvent.clientX - startX) / safeZoom;
            // Calculate new width
            const newWidth = Math.max(50, startWidth + deltaX);
            currentW = newWidth;

            if (wrapperRef.current) {
                wrapperRef.current.style.width = `${newWidth}px`;
            }
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            upEvent.preventDefault();
            upEvent.stopPropagation();

            activeResize.current = false;
            setIsResizing(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            onResize(currentW);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div className={styles.alignmentContainer} data-alignment={alignment}>
            {/* Alignment Menu */}
            {!readOnly && onAlign && !disableMediaControls && (
                <div
                    className={`${styles.alignmentMenu} nodrag`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className={`${styles.alignmentBtn} ${alignment === 'left' ? styles.active : ''}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAlign('left'); }}
                        title="Align Left"
                    >
                        <AlignLeft size={16} />
                    </button>
                    <button
                        className={`${styles.alignmentBtn} ${alignment === 'center' ? styles.active : ''}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAlign('center'); }}
                        title="Align Center"
                    >
                        <AlignCenter size={16} />
                    </button>
                    <button
                        className={`${styles.alignmentBtn} ${alignment === 'right' ? styles.active : ''}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAlign('right'); }}
                        title="Align Right"
                    >
                        <AlignRight size={16} />
                    </button>
                </div>
            )}

            <div
                ref={wrapperRef}
                className={styles.resizeWrapper}
                style={{
                    // On canvas (disableMediaControls), always fill parent (node has fixed px width)
                    // In editor mode, use stored width or default to 100%
                    width: disableMediaControls ? '100%' : (width ? `${width}px` : '100%'),
                }}
            >
                {children}

                {!readOnly && (
                    <div
                        className={`${styles.resizeHandle} ${isResizing ? styles.isResizing : ''} nodrag`}
                        onMouseDown={handleMouseDown}
                        style={{
                            transform: `scale(${1 / safeZoom}) rotate(180deg)`
                        }}
                    >
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="media-arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#A78BFA" />
                                    <stop offset="100%" stopColor="#60A5FA" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M 8 32 A 24 24 0 0 1 32 8"
                                stroke="url(#media-arc-gradient)"
                                strokeWidth="6"
                                strokeLinecap="round"
                                className={styles.handlePath}
                            />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
};
