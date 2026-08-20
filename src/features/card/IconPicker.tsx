import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Search, Upload, X, Link, type LucideIcon } from '../../components/icons';
import styles from './IconPicker.module.css';

// Deferred: the emoji dataset is large; only load it when the Emojis tab opens.
const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));
import {
    CardIcon,
    defaultIconName,
    getCatalog,
    loadRestIcons,
    solarIconComponent,
    toSolarName,
    type SolarEntry,
} from './iconMap';

interface IconPickerProps {
    currentIcon: string;
    onSelect: (icon: string) => void;
    onClose: () => void;
    isAbsolute?: boolean;
}

/** Tile height plus grid gap — only used to reserve space for an unmounted section. */
const ROW_HEIGHT = 60;
const ASSUMED_COLUMNS = 11;

/** Category header plus the gap beneath it, for the same reserved-height sums. */
const HEADER_HEIGHT = 32;

interface IconCategoryProps {
    category: string;
    icons: SolarEntry[];
    /** Decided by the parent from scroll position — see IconCategory's note. */
    mounted: boolean;
    selectedName: string;
    selectedColor: string;
    onPick: (name: string) => void;
}

/**
 * One category of the grid. Mounting all ~1200 buttons at once costs tens of
 * thousands of DOM nodes — each glyph is an `<svg>` carrying its own gradient
 * `<defs>` — which stalls the picker for seconds on open. So a section stays a
 * plain reserved-height box until the scroll position reaches it.
 *
 * Whether it has reached it is decided by the parent from scroll arithmetic,
 * not by an IntersectionObserver here. The observer version looked tidier but
 * had a hard failure mode: when it never reports an intersection — a
 * background tab, a pane that isn't compositing — no section ever mounts and
 * the picker sits empty forever. Scroll offsets are always readable.
 */
function IconCategory({ category, icons, mounted, selectedName, selectedColor, onPick }: IconCategoryProps) {
    const reservedHeight = Math.ceil(icons.length / ASSUMED_COLUMNS) * ROW_HEIGHT;

    return (
        <div className={styles.categorySection}>
            <div className={styles.categoryHeader}>{category}</div>
            {mounted ? (
                <div className={styles.iconGrid}>
                    {icons.map(({ name, label }) => {
                        const IconComponent = solarIconComponent(name);
                        return (
                            <button
                                key={name}
                                className={`${styles.iconOption} ${selectedName === name ? styles.selected : ''}`}
                                onClick={() => onPick(name)}
                                data-tooltip={label}
                                data-tooltip-position="top"
                                style={{ color: selectedColor || undefined }}
                            >
                                <IconComponent size={20} />
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div style={{ height: reservedHeight }} aria-hidden="true" />
            )}
        </div>
    );
}

const colorSwatches = [
    { name: 'Default', value: '' }, // Empty uses category color
    { name: 'Red', value: 'var(--t-red)' },
    { name: 'Pink', value: 'var(--t-pink)' },
    { name: 'Purple', value: 'var(--t-purple)' },
    { name: 'Blue', value: 'var(--t-blue)' },
    { name: 'Green', value: 'var(--t-green)' },
    { name: 'Yellow', value: 'var(--t-yellow)' },
];

export function IconPicker({ currentIcon, onSelect, onClose, isAbsolute }: IconPickerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'icons' | 'emojis' | 'custom'>('icons');
    
    const isCustomCurrent = currentIcon && (
        currentIcon.startsWith('data:image/') || 
        currentIcon.startsWith('http://') || 
        currentIcon.startsWith('https://')
    );

    // Extract current selected color from string format `IconName::#Color`.
    // Normalise through toSolarName so a card still holding a pre-Solar lucide
    // name ("Settings") highlights its Solar counterpart in the grid.
    const initialBaseName = currentIcon && !isCustomCurrent
        ? toSolarName(currentIcon.split('::')[0])
        : '';
    const initialColor = (currentIcon && !isCustomCurrent && currentIcon.includes('::')) ? currentIcon.split('::')[1] : '';
    
    const [selectedIconBaseName, setSelectedIconBaseName] = useState<string>(initialBaseName);
    const [selectedColor, setSelectedColor] = useState<string>(initialColor);

    const handleSaveAndClose = () => {
        if (selectedIconBaseName) {
            const resultString = selectedColor ? `${selectedIconBaseName}::${selectedColor}` : selectedIconBaseName;
            if (resultString !== currentIcon) {
                onSelect(resultString);
            }
        }
        onClose();
    };

    useEffect(() => {
        if (isAbsolute) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleSaveAndClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAbsolute, handleSaveAndClose]);

    const [dragOver, setDragOver] = useState(false);
    const [imageUrlInput, setImageUrlInput] = useState('');

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) return;
            
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 128;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    onSelect(resizedBase64);
                    onClose();
                } else {
                    onSelect(event.target!.result as string);
                    onClose();
                }
            };
            img.src = event.target.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    // The 1200-icon catalogue rides along with the lazy body chunk, so pull it
    // in as soon as the Icons tab is showing rather than on first keystroke.
    const [catalog, setCatalog] = useState<SolarEntry[] | null>(() => getCatalog());

    useEffect(() => {
        if (activeTab !== 'icons' || catalog) return;
        let alive = true;
        void loadRestIcons()
            .then(() => alive && setCatalog(getCatalog()))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [activeTab, catalog]);

    const filteredIcons = useMemo(() => {
        if (!catalog) return [];
        const term = searchTerm.trim().toLowerCase();
        if (!term) return catalog;
        // Match the display label and the raw Solar id, so both "arrow down"
        // and "alt-arrow-down" find the same icon.
        return catalog.filter(
            ({ label, name }) =>
                label.toLowerCase().includes(term) || name.includes(term.replace(/\s+/g, '-')),
        );
    }, [catalog, searchTerm]);

    const groupedIcons = useMemo(() => {
        const groups: Record<string, SolarEntry[]> = {};
        filteredIcons.forEach(icon => {
            (groups[icon.category] ??= []).push(icon);
        });
        return groups;
    }, [filteredIcons]);

    /**
     * How far down the list has been revealed, in px. Sections whose estimated
     * top sits above this are mounted; the rest stay reserved-height spacers.
     * It only ever grows, so scrolling back up never unmounts what you just
     * looked at (and never re-renders a thousand glyphs to do it).
     */
    const scrollRef = useRef<HTMLDivElement>(null);
    const [revealedPx, setRevealedPx] = useState(900);

    const revealTo = useCallback((bottom: number) => {
        setRevealedPx((prev) => (bottom > prev ? bottom : prev));
    }, []);

    const handleGridScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        // A screen beyond the current position, so a section is always filled
        // in before it can scroll into view.
        revealTo(el.scrollTop + el.clientHeight + 600);
    }, [revealTo]);

    // A new search resets the list to the top, so reveal from the top again.
    useEffect(() => {
        setRevealedPx(900);
    }, [searchTerm]);

    // Measure once the list exists: the reveal window depends on how tall the
    // scroller actually is, which isn't known until it has been laid out.
    useEffect(() => {
        if (activeTab !== 'icons') return;
        const el = scrollRef.current;
        if (!el) return;
        revealTo(el.scrollTop + el.clientHeight + 600);
    }, [activeTab, catalog, revealTo]);

    /** Estimated top offset of each section, in render order. */
    const sectionTops = useMemo(() => {
        const tops: number[] = [];
        let running = 0;
        for (const icons of Object.values(groupedIcons)) {
            tops.push(running);
            running += HEADER_HEIGHT + Math.ceil(icons.length / ASSUMED_COLUMNS) * ROW_HEIGHT;
        }
        return tops;
    }, [groupedIcons]);

    const pickerContent = (
        <div className={`${styles.overlay} ${isAbsolute ? styles.overlayAbsolute : ''}`} onClick={handleSaveAndClose}>
            <div className={`${styles.modal} ${isAbsolute ? styles.modalAbsolute : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.tabs}>
                        <button 
                            className={`${styles.tabBtn} ${activeTab === 'icons' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('icons')}
                        >
                            Icons
                        </button>
                        <button 
                            className={`${styles.tabBtn} ${activeTab === 'emojis' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('emojis')}
                        >
                            Emojis
                        </button>
                        <button 
                            className={`${styles.tabBtn} ${activeTab === 'custom' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('custom')}
                        >
                            Custom
                        </button>
                    </div>
                    <button className={`${styles.closeBtn} icon-hover`} onClick={handleSaveAndClose} aria-label="Close icon picker">
                        <X size={18} />
                    </button>
                </div>

                {activeTab === 'icons' && (
                    <>
                        <div className={styles.colorSwatches}>
                            {colorSwatches.map(swatch => (
                                <button
                                    key={swatch.name}
                                    className={`${styles.swatch} ${selectedColor === swatch.value ? styles.swatchSelected : ''} ${swatch.value === '' ? styles.swatchDefault : ''}`}
                                    style={{ backgroundColor: swatch.value || 'var(--color-bg-light)' }}
                                    onClick={() => setSelectedColor(swatch.value)}
                                    data-tooltip={swatch.name}
                                    data-tooltip-position="top"
                                    aria-label={`Select color ${swatch.name}`}
                                />
                            ))}
                        </div>
                        
                        <div className={styles.searchBox}>
                            <Search size={14} />
                            <input
                                type="text"
                                placeholder="Search icons..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div
                            className={styles.categoriesContainer}
                            ref={scrollRef}
                            onScroll={handleGridScroll}
                        >
                            {!catalog && (
                                <div className={styles.iconsLoading}>Loading icons…</div>
                            )}
                            {catalog && filteredIcons.length === 0 && (
                                <div className={styles.iconsLoading}>No icon matches “{searchTerm}”.</div>
                            )}
                            {Object.entries(groupedIcons).map(([category, icons], i) => (
                                <IconCategory
                                    key={category}
                                    category={category}
                                    icons={icons}
                                    mounted={sectionTops[i] <= revealedPx}
                                    selectedName={selectedIconBaseName}
                                    selectedColor={selectedColor}
                                    onPick={setSelectedIconBaseName}
                                />
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'emojis' && (
                    <div style={{ width: '100%', height: '400px', display: 'flex', justifyContent: 'center' }}>
                        <Suspense fallback={<div style={{ padding: 24, color: 'var(--color-text-muted)' }}>Loading emojis…</div>}>
                            <EmojiPickerPanel
                                onPick={(emoji) => {
                                    onSelect(`emoji::${emoji}`);
                                    onClose();
                                }}
                            />
                        </Suspense>
                    </div>
                )}

                {activeTab === 'custom' && (
                    <div className={styles.customTabContent}>
                        <div 
                            className={`${styles.uploadAreaBig} ${dragOver ? styles.dragOver : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <Upload size={32} className={styles.uploadIconBig} />
                            <span className={styles.uploadTextMain}>Drag and drop an image here</span>
                            <span className={styles.uploadTextSub}>or click to browse your files</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                style={{ display: 'none' }}
                                id="customImageUpload"
                            />
                            <label htmlFor="customImageUpload" className={styles.uploadButtonLabel}>Select File</label>
                        </div>
                        
                        <div className={styles.urlInputRow}>
                            <Link size={14} />
                            <input 
                                type="text" 
                                placeholder="Or paste an image URL..." 
                                value={imageUrlInput}
                                onChange={(e) => setImageUrlInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && imageUrlInput) {
                                        onSelect(imageUrlInput);
                                        onClose();
                                    }
                                }}
                            />
                            <button 
                                className={styles.urlApplyBtn}
                                onClick={() => {
                                    if (imageUrlInput) {
                                        onSelect(imageUrlInput);
                                        onClose();
                                    }
                                }}
                                disabled={!imageUrlInput}
                            >
                                Apply
                            </button>
                        </div>

                        {isCustomCurrent && (
                            <div className={styles.currentCustomPreviewBig}>
                                <span className={styles.previewLabelBig}>Current Custom Icon</span>
                                <div className={styles.previewWrapperLargeCentered}>
                                    <CardIcon icon={currentIcon} size={64} />
                                </div>
                                <button 
                                    className={styles.removeCustomBtn}
                                    onClick={() => {
                                        onSelect(defaultIconName);
                                        onClose();
                                    }}
                                >
                                    <X size={14} /> Remove Custom Icon
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (isAbsolute) {
        return pickerContent;
    }

    return createPortal(pickerContent, document.body);
}

export function getIconByName(iconName: string): LucideIcon {
    const baseName = iconName ? iconName.split('::')[0] : '';
    return solarIconComponent(baseName || defaultIconName);
}
