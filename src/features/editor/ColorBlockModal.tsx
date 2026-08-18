import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import { Copy, Check, X } from '../../components/icons';
import editorStyles from './BlockEditor.module.css';
import modalStyles from './ColorBlockModal.module.css';
import type { BlockMetadata } from './types';
import { getNearestColorName, normalizeHex, hexToRgb, rgbToHex, rgbToRgbaString, rgbToHslString } from './colorUtils';

function HexInput({ color, onChange }: { color: string; onChange: (c: string) => void }) {
    const [input, setInput] = useState(color);

    useEffect(() => {
        setInput(color);
    }, [color]);

    const handleChange = (val: string) => {
        setInput(val);
        const normalized = normalizeHex(val);
        if (/^#[0-9A-F]{6}$/i.test(normalized)) {
            onChange(normalized);
        }
    };

    return (
        <div className={editorStyles.colorInputGroup}>
            <input className={editorStyles.colorInput} value={input} onChange={(e) => handleChange(e.target.value)} />
            <span className={editorStyles.colorInputLabel}>HEX</span>
        </div>
    );
}

function HslInput({ color, onChange }: { color: string; onChange: (c: string) => void }) {
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
        <div className={editorStyles.colorInputRow}>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={h} onChange={(e) => handleChange('h', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>H</span>
            </div>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={Math.round(s * 100)} onChange={(e) => handleChange('s', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>S</span>
            </div>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={Math.round(l * 100)} onChange={(e) => handleChange('l', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>L</span>
            </div>
        </div>
    );
}

function RgbInput({ color, onChange }: { color: string; onChange: (c: string) => void }) {
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
        <div className={editorStyles.colorInputRow}>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={rgb.r} onChange={(e) => handleChange('r', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>R</span>
            </div>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={rgb.g} onChange={(e) => handleChange('g', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>G</span>
            </div>
            <div className={editorStyles.colorInputGroup}>
                <input className={editorStyles.colorInput} value={rgb.b} onChange={(e) => handleChange('b', e.target.value)} />
                <span className={editorStyles.colorInputLabel}>B</span>
            </div>
        </div>
    );
}

interface ColorBlockModalProps {
    color: string;
    originalColor?: string;
    metadata?: BlockMetadata;
    displayName?: string;
    onChange: (content: string, metadata?: BlockMetadata) => void;
    onClose: () => void;
}

export function ColorBlockModal({ color, originalColor, metadata, displayName: initialName, onChange, onClose }: ColorBlockModalProps) {
    const [currentColor, setCurrentColor] = useState(color);
    // Lock the original color at the time the modal first opened
    const lockedOriginal = useRef(originalColor || color);
    const [copiedKey, setCopiedKey] = useState<'hex' | 'rgba' | 'hsl' | null>(null);
    const [inputMode, setInputMode] = useState<'hex' | 'rgb' | 'hsl'>('hex');
    const [name, setName] = useState(metadata?.name || initialName || getNearestColorName(color));
    const overlayRef = useRef<HTMLDivElement>(null);
    const currentColorRef = useRef(color);

    const [recentColors] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('chnk-it-recent-colors');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const normalizedHex = normalizeHex(currentColor);
    const rgb = hexToRgb(normalizedHex);
    const rgbaValue = rgbToRgbaString(rgb, 1);
    const hslValue = rgbToHslString(rgb);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        // Use capture: true so we intercept Escape before CanvasBoard stops propagation
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            
            // Save final color to recents on unmount
            const finalColor = normalizeHex(currentColorRef.current);
            try {
                const saved = localStorage.getItem('chnk-it-recent-colors');
                let recents = saved ? JSON.parse(saved) : [];
                // Remove if exists, then unshift to front
                recents = recents.filter((c: string) => c !== finalColor);
                recents.unshift(finalColor);
                if (recents.length > 10) recents = recents.slice(0, 10);
                localStorage.setItem('chnk-it-recent-colors', JSON.stringify(recents));
            } catch (e) {
                console.warn('Failed to save recent colors', e);
            }
        };
    }, [onClose]);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    const handleColorPickerChange = (newColor: string) => {
        setCurrentColor(newColor);
        currentColorRef.current = newColor;
        const newName = getNearestColorName(newColor);
        setName(newName);
        onChange(newColor, { ...metadata, name: newName });
    };

    const handleNameBlur = () => {
        onChange(currentColor, { ...metadata, name });
    };

    const handleCopyValue = (value: string, key: 'hex' | 'rgba' | 'hsl') => (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    return createPortal(
        <div className={modalStyles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
            <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={modalStyles.modalHeader}>
                    <input
                        className={modalStyles.modalTitle}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={handleNameBlur}
                        placeholder="Color name"
                    />
                    <button className={`${modalStyles.closeBtn} icon-hover`} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={modalStyles.pickerSection}>
                    {/* Before / After swatches */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #888)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Original</div>
                            <div
                                title={lockedOriginal.current}
                                style={{
                                    width: '100%',
                                    height: 36,
                                    borderRadius: 8,
                                    backgroundColor: lockedOriginal.current,
                                    border: '1.5px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                                }}
                            />
                        </div>
                        <div style={{ color: 'var(--color-text-muted, #888)', fontSize: '1rem', marginTop: 16 }}>→</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #888)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</div>
                            <div
                                title={currentColor}
                                style={{
                                    width: '100%',
                                    height: 36,
                                    borderRadius: 8,
                                    backgroundColor: currentColor,
                                    border: '1.5px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                                    transition: 'background-color 0.15s ease',
                                }}
                            />
                        </div>
                    </div>
                    <HexColorPicker color={currentColor} onChange={handleColorPickerChange} />
                    
                    {/* Recent Colors */}
                    {recentColors.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted, #888)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Colors</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {recentColors.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => handleColorPickerChange(c)}
                                        title={c}
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: '50%',
                                            backgroundColor: c,
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            cursor: 'pointer',
                                            padding: 0,
                                            transition: 'transform 0.1s',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className={modalStyles.bodySection}>
                    <select className={editorStyles.colorInputModeSelect} value={inputMode} onChange={(e) => setInputMode(e.target.value as 'hex' | 'rgb' | 'hsl')}>
                        <option value="hex">HEX</option>
                        <option value="rgb">RGB</option>
                        <option value="hsl">HSL</option>
                    </select>
                    <div style={{ marginTop: 12 }}>
                        {inputMode === 'hex' && <HexInput color={normalizedHex} onChange={handleColorPickerChange} />}
                        {inputMode === 'rgb' && <RgbInput color={normalizedHex} onChange={handleColorPickerChange} />}
                        {inputMode === 'hsl' && <HslInput color={normalizedHex} onChange={handleColorPickerChange} />}
                    </div>
                </div>

                <div className={modalStyles.footerSection}>
                    <div className={editorStyles.colorCodeGroup}>
                        <button type="button" className={editorStyles.colorCodeButton} onClick={handleCopyValue(normalizedHex, 'hex')}>
                            <span className={editorStyles.colorCodeLabel}>HEX</span>
                            <span className={editorStyles.colorCodeValueRow}>
                                <span className={editorStyles.colorCodeValue}>{normalizedHex}</span>
                                {copiedKey === 'hex' ? <Check size={14} className={editorStyles.colorCodeIconActive} /> : <Copy size={14} className={editorStyles.colorCodeIcon} />}
                            </span>
                        </button>
                        <button type="button" className={editorStyles.colorCodeButton} onClick={handleCopyValue(rgbaValue, 'rgba')}>
                            <span className={editorStyles.colorCodeLabel}>RGBA</span>
                            <span className={editorStyles.colorCodeValueRow}>
                                <span className={editorStyles.colorCodeValue}>{rgbaValue}</span>
                                {copiedKey === 'rgba' ? <Check size={14} className={editorStyles.colorCodeIconActive} /> : <Copy size={14} className={editorStyles.colorCodeIcon} />}
                            </span>
                        </button>
                        <button type="button" className={editorStyles.colorCodeButton} onClick={handleCopyValue(hslValue, 'hsl')}>
                            <span className={editorStyles.colorCodeLabel}>HSL</span>
                            <span className={editorStyles.colorCodeValueRow}>
                                <span className={editorStyles.colorCodeValue}>{hslValue}</span>
                                {copiedKey === 'hsl' ? <Check size={14} className={editorStyles.colorCodeIconActive} /> : <Copy size={14} className={editorStyles.colorCodeIcon} />}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
