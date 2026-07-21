import React, { useRef, useState } from 'react';
import { useViewport } from '@xyflow/react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import styles from './BlockEditor.module.css';

interface ResizableMediaWrapperProps {
    children: React.ReactNode;
    width?: number; // stored width in pixels
    height?: number; // stored height in pixels (used when resizeMode === 'height')
    resizeMode?: 'width' | 'height';
    alignment?: 'left' | 'center' | 'right';
    readOnly?: boolean;
    onResize: (newValue: number) => void;
    onAlign?: (alignment: 'left' | 'center' | 'right') => void;
    disableMediaControls?: boolean;
}

export const ResizableMediaWrapper = ({
    children,
    width,
    resizeMode = 'width',
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

        const currentRef = wrapperRef.current;
        if (!currentRef) return;

        activeResize.current = true;
        setIsResizing(true);

        // Height mode (editor images): vertical drag resizes height, width follows aspect.
        if (resizeMode === 'height') {
            const img = currentRef.querySelector('img');
            const startY = e.clientY;
            const startHeight = img?.offsetHeight || currentRef.offsetHeight;
            let currentH = startHeight;

            const onMouseMove = (moveEvent: MouseEvent) => {
                moveEvent.preventDefault();
                const deltaY = (moveEvent.clientY - startY) / safeZoom;
                const newHeight = Math.min(600, Math.max(80, startHeight + deltaY));
                currentH = newHeight;
                if (img) img.style.height = `${newHeight}px`;
            };

            const onMouseUp = (upEvent: MouseEvent) => {
                upEvent.preventDefault();
                activeResize.current = false;
                setIsResizing(false);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                onResize(currentH);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            return;
        }

        const startX = e.clientX;
        const startWidth = currentRef.offsetWidth;
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
                className={`${styles.resizeWrapper} ${disableMediaControls ? styles.atomicMedia : ''}`}
                style={{
                    // Height mode (editor images): hug the image so the outline/handle sit at its edge.
                    // On canvas (disableMediaControls): fill parent (node has fixed px width).
                    // Otherwise (editor width mode): use stored width or default to 100%.
                    width: resizeMode === 'height'
                        ? 'fit-content'
                        : (disableMediaControls ? '100%' : (width ? `${width}px` : '100%')),
                    maxWidth: '100%',
                }}
            >
                {children}

                {!readOnly && !disableMediaControls && (
                    <div
                        className={`${styles.resizeHandle} ${isResizing ? styles.isResizing : ''} nodrag`}
                        onMouseDown={handleMouseDown}
                        style={{
                            transform: `scale(${1 / safeZoom}) rotate(180deg)`,
                            // Height mode resizes vertically, so use a vertical cursor.
                            cursor: resizeMode === 'height' ? 'ns-resize' : 'nwse-resize'
                        }}
                    >
                        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M 8 32 A 24 24 0 0 1 32 8"
                                stroke="currentColor"
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
