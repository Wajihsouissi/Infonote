import { useState, useRef, useEffect, memo } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Copy, Check } from 'lucide-react';
import styles from './BlockEditor.module.css';
import type { Block } from './types';
import { ResizableMediaWrapper } from './ResizableMediaWrapper';
import { getNearestColorName } from './colorUtils';

// Simple RGB Input component
function RgbInput({ color, onChange }: { color: string, onChange: (c: string) => void }) {
    // helpers
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    };

    const rgbToHex = (r: number, g: number, b: number) => {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    };

    const rgb = hexToRgb(color);

    const handleChange = (part: 'r' | 'g' | 'b', val: string) => {
        let v = parseInt(val);
        if (isNaN(v)) v = 0;
        if (v < 0) v = 0;
        if (v > 255) v = 255;
        const newRgb = { ...rgb, [part]: v };
        onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    };

    return (
        <div className={styles.colorInputRow}>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={rgb.r} onChange={(e) => handleChange('r', e.target.value)} />
                <span className={styles.colorInputLabel}>R</span>
            </div>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={rgb.g} onChange={(e) => handleChange('g', e.target.value)} />
                <span className={styles.colorInputLabel}>G</span>
            </div>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={rgb.b} onChange={(e) => handleChange('b', e.target.value)} />
                <span className={styles.colorInputLabel}>B</span>
            </div>
        </div>
    );
}

interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: any) => void;
    disableMediaControls?: boolean;
}

export const ColorBlock = memo(({ block, readOnly, onChange, disableMediaControls }: BlockProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const color = block.content || '#1E944A';

    // Auto-name initialization if name is missing but color exists
    useEffect(() => {
        if (!block.metadata?.name && color) {
            const autoName = getNearestColorName(color);
            // We avoid calling onChange directly in effect to prevent loops/stale closures if not careful,
            // but here it's initializing metadata.
            // Ideally we do this when color CAUSES the change.
            // If we do it here, we might trigger an update loop if onChange changes block identity.
            // So we'll leave it to the user interaction or display time.
            // Actually, let's just display the auto name if metadata name is missing.
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleColorChange = (newColor: string) => {
        const newName = getNearestColorName(newColor);
        onChange(newColor, { ...block.metadata, name: newName });
    };

    const handleResize = (newWidth: number) => {
        onChange(color, { ...block.metadata, width: newWidth });
    };

    const handleAlign = (alignment: 'left' | 'center' | 'right') => {
        onChange(color, { ...block.metadata, alignment });
    };

    const handleCopyHex = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(color);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const displayName = block.metadata?.name || getNearestColorName(color);

    return (
        <ResizableMediaWrapper
            width={block.metadata?.width} // Default handled by wrapper if undefined
            alignment={block.metadata?.alignment}
            readOnly={readOnly}
            onResize={handleResize}
            onAlign={handleAlign}
            disableMediaControls={disableMediaControls}
        >
            <div className={styles.colorBlockWrapper} style={{ width: '100%' }}>
                <div className={styles.colorBlockCard}>

                    {/* Top Color Section */}
                    <div className={styles.colorSection} style={{ backgroundColor: color }}>
                        <div
                            className={styles.colorBlockHexGroup}
                            onClick={handleCopyHex}
                            title="Copy Hex Code"
                        >
                            <span className={styles.colorBlockHex}>{color}</span>
                            {copied ? <Check size={18} color="white" /> : <Copy size={18} color="rgba(255,255,255,0.7)" className={styles.copyIcon} />}
                        </div>

                        {!readOnly && (
                            <div className={styles.colorBlockHandle} onClick={() => setIsOpen(!isOpen)} />
                        )}
                    </div>

                    {/* Bottom Info Section */}
                    <div className={styles.infoSection}>
                        <span
                            className={styles.colorBlockName}
                            contentEditable={!readOnly}
                            suppressContentEditableWarning
                            onBlur={(e) => onChange(color, { ...block.metadata, name: e.currentTarget.innerText })}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'text' }}
                        >
                            {displayName}
                        </span>
                    </div>

                </div>

                {isOpen && (
                    <div className={styles.colorPopover} ref={popoverRef} onMouseDown={e => e.stopPropagation()}>
                        <HexColorPicker color={color} onChange={handleColorChange} />
                        <div className={styles.colorPopoverInputs}>
                            <RgbInput color={color} onChange={handleColorChange} />
                        </div>
                    </div>
                )}
            </div>
        </ResizableMediaWrapper>
    );
});
