import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    FileText, Heart, Star, Bookmark, Calendar, Clock,
    Target, Zap, Lightbulb, Rocket, Flag, Trophy,
    Coffee, Music, Camera, Book, Briefcase, Code,
    Palette, Sparkles, Sun, Moon, Cloud, Umbrella,
    Gift, Home, Mail, Phone, Settings, User,
    CheckCircle, AlertCircle, Info, XCircle, HelpCircle,
    TrendingUp, Activity, BarChart, PieChart, Database,
    Folder, File, Image, Video, Search, Upload,
    type LucideIcon
} from 'lucide-react';
import styles from './IconPicker.module.css';
import { CardIcon } from './iconMap';

interface IconPickerProps {
    currentIcon: string;
    onSelect: (icon: string) => void;
    onClose: () => void;
    isAbsolute?: boolean;
}

const iconOptions: { icon: LucideIcon; name: string; iconName: string }[] = [
    { icon: FileText, name: 'Document', iconName: 'FileText' },
    { icon: Heart, name: 'Heart', iconName: 'Heart' },
    { icon: Star, name: 'Star', iconName: 'Star' },
    { icon: Bookmark, name: 'Bookmark', iconName: 'Bookmark' },
    { icon: Calendar, name: 'Calendar', iconName: 'Calendar' },
    { icon: Clock, name: 'Clock', iconName: 'Clock' },
    { icon: Target, name: 'Target', iconName: 'Target' },
    { icon: Zap, name: 'Lightning', iconName: 'Zap' },
    { icon: Lightbulb, name: 'Idea', iconName: 'Lightbulb' },
    { icon: Rocket, name: 'Rocket', iconName: 'Rocket' },
    { icon: Flag, name: 'Flag', iconName: 'Flag' },
    { icon: Trophy, name: 'Trophy', iconName: 'Trophy' },
    { icon: Coffee, name: 'Coffee', iconName: 'Coffee' },
    { icon: Music, name: 'Music', iconName: 'Music' },
    { icon: Camera, name: 'Camera', iconName: 'Camera' },
    { icon: Book, name: 'Book', iconName: 'Book' },
    { icon: Briefcase, name: 'Work', iconName: 'Briefcase' },
    { icon: Code, name: 'Code', iconName: 'Code' },
    { icon: Palette, name: 'Art', iconName: 'Palette' },
    { icon: Sparkles, name: 'Sparkles', iconName: 'Sparkles' },
    { icon: Sun, name: 'Sun', iconName: 'Sun' },
    { icon: Moon, name: 'Moon', iconName: 'Moon' },
    { icon: Cloud, name: 'Cloud', iconName: 'Cloud' },
    { icon: Umbrella, name: 'Umbrella', iconName: 'Umbrella' },
    { icon: Gift, name: 'Gift', iconName: 'Gift' },
    { icon: Home, name: 'Home', iconName: 'Home' },
    { icon: Mail, name: 'Mail', iconName: 'Mail' },
    { icon: Phone, name: 'Phone', iconName: 'Phone' },
    { icon: Settings, name: 'Settings', iconName: 'Settings' },
    { icon: User, name: 'User', iconName: 'User' },
    { icon: CheckCircle, name: 'Check', iconName: 'CheckCircle' },
    { icon: AlertCircle, name: 'Alert', iconName: 'AlertCircle' },
    { icon: Info, name: 'Info', iconName: 'Info' },
    { icon: XCircle, name: 'Error', iconName: 'XCircle' },
    { icon: HelpCircle, name: 'Help', iconName: 'HelpCircle' },
    { icon: TrendingUp, name: 'Growth', iconName: 'TrendingUp' },
    { icon: Activity, name: 'Activity', iconName: 'Activity' },
    { icon: BarChart, name: 'Chart', iconName: 'BarChart' },
    { icon: PieChart, name: 'Pie Chart', iconName: 'PieChart' },
    { icon: Database, name: 'Database', iconName: 'Database' },
    { icon: Folder, name: 'Folder', iconName: 'Folder' },
    { icon: File, name: 'File', iconName: 'File' },
    { icon: Image, name: 'Image', iconName: 'Image' },
    { icon: Video, name: 'Video', iconName: 'Video' },
];

export function IconPicker({ currentIcon, onSelect, onClose, isAbsolute }: IconPickerProps) {
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isAbsolute) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAbsolute, onClose]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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

    const isCustomCurrent = currentIcon && (
        currentIcon.startsWith('data:image/') || 
        currentIcon.startsWith('http://') || 
        currentIcon.startsWith('https://')
    );

    const filteredIcons = iconOptions.filter(({ name }) =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pickerContent = (
        <div className={`${styles.overlay} ${isAbsolute ? styles.overlayAbsolute : ''}`} onClick={onClose}>
            <div className={`${styles.modal} ${isAbsolute ? styles.modalAbsolute : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>Choose an Icon</h3>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close icon picker">
                        <XCircle size={18} />
                    </button>
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

                <div className={styles.uploadRow}>
                    <label className={styles.uploadArea}>
                        <Upload size={16} />
                        <span>Upload Custom Image</span>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                    </label>
                    {isCustomCurrent && (
                        <div className={styles.currentCustomPreview}>
                            <span className={styles.previewLabel}>Current:</span>
                            <div className={styles.previewWrapper}>
                                <CardIcon icon={currentIcon} size={24} />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.iconGrid}>
                    {filteredIcons.map(({ icon: Icon, name, iconName }) => (
                        <button
                            key={name}
                            className={`${styles.iconOption} ${currentIcon === iconName ? styles.selected : ''}`}
                            onClick={() => {
                                onSelect(iconName);
                                onClose();
                            }}
                            title={name}
                        >
                            <Icon size={20} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    if (isAbsolute) {
        return pickerContent;
    }

    return createPortal(pickerContent, document.body);
}

export function getIconByName(iconName: string): LucideIcon {
    const found = iconOptions.find(opt => opt.iconName === iconName);
    return found ? found.icon : Lightbulb;
}
