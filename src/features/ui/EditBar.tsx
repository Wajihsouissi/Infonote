import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Palette, Trash2, Copy, Link } from 'lucide-react';
import styles from './EditBar.module.css';

interface EditBarProps {
    position: { x: number; y: number };
    onClose: () => void;
    onColorChange: (color: string) => void;
    currentColor?: string;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onCopyLink?: () => void;
}

const PRESET_COLORS = [
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
];

export function EditBar({
    position,
    onClose,
    onColorChange,
    currentColor,
    onDelete,
    onDuplicate,
    onCopyLink
}: EditBarProps) {
    // theme is removed because it's unused
    const [showColorPicker, setShowColorPicker] = useState(false);
    const editBarRef = useRef<HTMLDivElement>(null);


    // Adjust position to prevent overflow
    useEffect(() => {
        if (editBarRef.current) {
            const rect = editBarRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let adjustedX = position.x;
            let adjustedY = position.y;

            // Prevent overflow on right
            if (adjustedX + rect.width > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10;
            }

            // Prevent overflow on bottom
            if (adjustedY + rect.height > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10;
            }

            // Prevent overflow on left
            if (adjustedX < 10) {
                adjustedX = 10;
            }

            // Prevent overflow on top
            if (adjustedY < 10) {
                adjustedY = 10;
            }

            if (adjustedX !== position.x || adjustedY !== position.y) {
                editBarRef.current.style.left = `${adjustedX}px`;
                editBarRef.current.style.top = `${adjustedY}px`;
            }
        }
    }, [position]);

    const handleColorSelect = (color: string) => {
        onColorChange(color);
        setShowColorPicker(false);
        onClose(); // Close after selecting color
    };

    const handleAction = (action: (() => void) | undefined) => {
        if (action) {
            action();
            onClose(); // Close after action
        }
    };

    const content = (
        <>
            {/* Backdrop to close on click outside */}
            <div className={styles.backdrop} onClick={onClose} />

            {/* Edit Bar */}
            <div
                ref={editBarRef}
                className={styles.editBar}
                style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Color Button */}
                <div className={styles.buttonWrapper}>
                    <button
                        className={styles.editButton}
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        title="Change Color"
                        style={{
                            background: currentColor || 'var(--color-bg-card)',
                        }}
                    >
                        <Palette size={18} />
                    </button>

                    {/* Color Picker Dropdown */}
                    {showColorPicker && (
                        <div className={styles.colorPicker}>
                            <div className={styles.colorGrid}>
                                {PRESET_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        className={`${styles.colorSwatch} ${currentColor === color ? styles.colorSwatchActive : ''
                                            }`}
                                        style={{ background: color }}
                                        onClick={() => handleColorSelect(color)}
                                        title={color}
                                    />
                                ))}
                            </div>
                            {/* Clear Color Option */}
                            <button
                                className={styles.clearColorBtn}
                                onClick={() => handleColorSelect('')}
                            >
                                <span className={styles.clearColorSwatch} />
                                <span>Clear Color</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Duplicate Button */}
                {onDuplicate && (
                    <button
                        className={styles.editButton}
                        onClick={() => handleAction(onDuplicate)}
                        title="Duplicate"
                    >
                        <Copy size={18} />
                    </button>
                )}

                {/* Copy Link Button */}
                {onCopyLink && (
                    <button
                        className={styles.editButton}
                        onClick={() => handleAction(onCopyLink)}
                        title="Copy Link"
                    >
                        <Link size={18} />
                    </button>
                )}

                {/* Delete Button */}
                {onDelete && (
                    <button
                        className={`${styles.editButton} ${styles.deleteButton}`}
                        onClick={() => handleAction(onDelete)}
                        title="Delete"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
            </div>
        </>
    );

    // Render using portal to bypass ReactFlow transforms
    return createPortal(content, document.body);
}
