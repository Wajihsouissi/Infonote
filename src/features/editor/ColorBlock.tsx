import { useState, useRef, useEffect, memo } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Copy, Check } from 'lucide-react';
import styles from './BlockEditor.module.css';
import type { Block } from './types';
import { ResizableMediaWrapper } from './ResizableMediaWrapper';
import { getNearestColorName } from './colorUtils';

const normalizeHex = (value: string) => {
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (withHash.length === 4) {
        return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
    }
    return withHash.toUpperCase();
};

const hexToRgb = (hex: string) => {
    const normalized = normalizeHex(hex);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const rgbToRgbaString = (rgb: { r: number; g: number; b: number }, alpha = 1) => {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const rgbToHslString = (rgb: { r: number; g: number; b: number }) => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max === r) {
            h = ((g - b) / delta) % 6;
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
};

// HEX Input component
function HexInput({ color, onChange }: { color: string, onChange: (c: string) => void }) {
    const [input, setInput] = useState(color);

    const handleChange = (val: string) => {
        setInput(val);
        const normalized = normalizeHex(val);
        if (/^#[0-9A-F]{6}$/i.test(normalized)) {
            onChange(normalized);
        }
    };

    return (
        <div className={styles.colorInputGroup}>
            <input className={styles.colorInput} value={input} onChange={(e) => handleChange(e.target.value)} />
            <span className={styles.colorInputLabel}>HEX</span>
        </div>
    );
}

// HSL Input component
function HslInput({ color, onChange }: { color: string, onChange: (c: string) => void }) {
    const rgb = hexToRgb(color);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    const handleChange = (part: 'h' | 's' | 'l', val: string) => {
        let v = parseInt(val);
        if (isNaN(v)) v = 0;
        const h_val = part === 'h' ? Math.max(0, Math.min(360, v)) : h;
        const s_val = part === 's' ? Math.max(0, Math.min(100, v)) : Math.round(s * 100);
        const l_val = part === 'l' ? Math.max(0, Math.min(100, v)) : Math.round(l * 100);

        const hslToRgb = (h: number, s: number, l: number) => {
            s /= 100;
            l /= 100;
            const k = (n: number) => (n + h / 30) % 12;
            const a = s * Math.min(l, 1 - l);
            const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return {
                r: Math.round(255 * f(0)),
                g: Math.round(255 * f(8)),
                b: Math.round(255 * f(4))
            };
        };

        const newRgb = hslToRgb(h_val, s_val, l_val);
        onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    };

    return (
        <div className={styles.colorInputRow}>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={h} onChange={(e) => handleChange('h', e.target.value)} />
                <span className={styles.colorInputLabel}>H</span>
            </div>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={Math.round(s * 100)} onChange={(e) => handleChange('s', e.target.value)} />
                <span className={styles.colorInputLabel}>S</span>
            </div>
            <div className={styles.colorInputGroup}>
                <input className={styles.colorInput} value={Math.round(l * 100)} onChange={(e) => handleChange('l', e.target.value)} />
                <span className={styles.colorInputLabel}>L</span>
            </div>
        </div>
    );
}

// Simple RGB Input component
function RgbInput({ color, onChange }: { color: string, onChange: (c: string) => void }) {
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
    const [copiedKey, setCopiedKey] = useState<'hex' | 'rgba' | 'hsl' | null>(null);
    const [inputMode, setInputMode] = useState<'hex' | 'rgb' | 'hsl'>('hex');
    const popoverRef = useRef<HTMLDivElement>(null);
    const color = block.content || '#1E944A';
    const normalizedHex = normalizeHex(color);
    const rgb = hexToRgb(normalizedHex);
    const rgbaValue = rgbToRgbaString(rgb, 1);
    const hslValue = rgbToHslString(rgb);

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

    const handleCopyValue = (value: string, key: 'hex' | 'rgba' | 'hsl') => (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
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
                    <div className={styles.colorSection} style={{ backgroundColor: normalizedHex }}>
                        {!readOnly && (
                            <div className={styles.colorBlockHandle} onClick={() => setIsOpen(!isOpen)} />
                        )}
                    </div>

                    {/* Bottom Info Section */}
                    <div className={styles.infoSection}>
                        <div className={styles.colorInfoTop}>
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
                        <div className={styles.colorCodeGroup}>
                            <button type="button" className={styles.colorCodeButton} onClick={handleCopyValue(normalizedHex, 'hex')}>
                                <span className={styles.colorCodeLabel}>HEX</span>
                                <span className={styles.colorCodeValueRow}>
                                    <span className={styles.colorCodeValue}>{normalizedHex}</span>
                                    {copiedKey === 'hex' ? <Check size={14} className={styles.colorCodeIconActive} /> : <Copy size={14} className={styles.colorCodeIcon} />}
                                </span>
                            </button>
                            <button type="button" className={styles.colorCodeButton} onClick={handleCopyValue(rgbaValue, 'rgba')}>
                                <span className={styles.colorCodeLabel}>RGBA</span>
                                <span className={styles.colorCodeValueRow}>
                                    <span className={styles.colorCodeValue}>{rgbaValue}</span>
                                    {copiedKey === 'rgba' ? <Check size={14} className={styles.colorCodeIconActive} /> : <Copy size={14} className={styles.colorCodeIcon} />}
                                </span>
                            </button>
                            <button type="button" className={styles.colorCodeButton} onClick={handleCopyValue(hslValue, 'hsl')}>
                                <span className={styles.colorCodeLabel}>HSL</span>
                                <span className={styles.colorCodeValueRow}>
                                    <span className={styles.colorCodeValue}>{hslValue}</span>
                                    {copiedKey === 'hsl' ? <Check size={14} className={styles.colorCodeIconActive} /> : <Copy size={14} className={styles.colorCodeIcon} />}
                                </span>
                            </button>
                        </div>
                    </div>

                </div>

                {isOpen && (
                    <div className={styles.colorPopover} ref={popoverRef} onMouseDown={e => e.stopPropagation()}>
                        <HexColorPicker color={color} onChange={handleColorChange} />
                        <div className={styles.colorPopoverInputs}>
                            <select className={styles.colorInputModeSelect} value={inputMode} onChange={(e) => setInputMode(e.target.value as 'hex' | 'rgb' | 'hsl')}>
                                <option value="hex">HEX</option>
                                <option value="rgb">RGB</option>
                                <option value="hsl">HSL</option>
                            </select>
                            {inputMode === 'hex' && <HexInput color={normalizedHex} onChange={handleColorChange} />}
                            {inputMode === 'rgb' && <RgbInput color={normalizedHex} onChange={handleColorChange} />}
                            {inputMode === 'hsl' && <HslInput color={normalizedHex} onChange={handleColorChange} />}
                        </div>
                    </div>
                )}
            </div>
        </ResizableMediaWrapper>
    );
});
