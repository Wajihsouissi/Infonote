import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Upload, XCircle, Lightbulb, Link, type LucideIcon } from 'lucide-react';
import styles from './IconPicker.module.css';
import { CardIcon, iconRegistry, iconMap, defaultIconName } from './iconMap';

interface IconPickerProps {
    currentIcon: string;
    onSelect: (icon: string) => void;
    onClose: () => void;
    isAbsolute?: boolean;
}

const colorSwatches = [
    { name: 'Default', value: '' }, // Empty uses category color
    { name: 'Slate', value: '#94a3b8' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Rose', value: '#f43f5e' },
];

export function IconPicker({ currentIcon, onSelect, onClose, isAbsolute }: IconPickerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'icons' | 'custom'>('icons');
    
    const isCustomCurrent = currentIcon && (
        currentIcon.startsWith('data:image/') || 
        currentIcon.startsWith('http://') || 
        currentIcon.startsWith('https://')
    );

    // Extract current selected color from string format `IconName::#Color`
    const initialBaseName = currentIcon && !isCustomCurrent ? currentIcon.split('::')[0] : '';
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

    const filteredIcons = useMemo(() => {
        return iconRegistry.filter(({ name }) =>
            name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm]);

    const groupedIcons = useMemo(() => {
        const groups: Record<string, typeof iconRegistry> = {};
        filteredIcons.forEach(icon => {
            if (!groups[icon.category]) {
                groups[icon.category] = [];
            }
            groups[icon.category].push(icon);
        });
        return groups;
    }, [filteredIcons]);

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
                            className={`${styles.tabBtn} ${activeTab === 'custom' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('custom')}
                        >
                            Custom
                        </button>
                    </div>
                    <button className={styles.closeBtn} onClick={handleSaveAndClose} aria-label="Close icon picker">
                        <XCircle size={18} />
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

                        <div className={styles.categoriesContainer}>
                            {Object.entries(groupedIcons).map(([category, icons]) => (
                                <div key={category} className={styles.categorySection}>
                                    <div className={styles.categoryHeader}>{category}</div>
                                    <div className={styles.iconGrid}>
                                        {icons.map(({ name, iconName, color }) => {
                                            const IconComponent = iconMap[iconName] || iconMap[defaultIconName];
                                            const finalColor = selectedColor || color;
                                            return (
                                                <button
                                                    key={iconName}
                                                    className={`${styles.iconOption} ${selectedIconBaseName === iconName ? styles.selected : ''}`}
                                                    onClick={() => setSelectedIconBaseName(iconName)}
                                                    data-tooltip={name}
                                                    data-tooltip-position="top"
                                                    style={{ color: finalColor }}
                                                >
                                                    <IconComponent size={20} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
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
                                    <XCircle size={14} /> Remove Custom Icon
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
    const found = iconMap[baseName];
    return found ? found : Lightbulb;
}
