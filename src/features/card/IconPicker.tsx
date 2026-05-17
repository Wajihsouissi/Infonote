import { useState } from 'react';
import {
    FileText, Heart, Star, Bookmark, Calendar, Clock,
    Target, Zap, Lightbulb, Rocket, Flag, Trophy,
    Coffee, Music, Camera, Book, Briefcase, Code,
    Palette, Sparkles, Sun, Moon, Cloud, Umbrella,
    Gift, Home, Mail, Phone, Settings, User,
    CheckCircle, AlertCircle, Info, XCircle, HelpCircle,
    TrendingUp, Activity, BarChart, PieChart, Database,
    Folder, File, Image, Video, Search,
    type LucideIcon
} from 'lucide-react';
import styles from './IconPicker.module.css';

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

    const filteredIcons = iconOptions.filter(({ name }) =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={`${styles.overlay} ${isAbsolute ? styles.overlayAbsolute : ''}`} onClick={onClose}>
            <div className={`${styles.modal} ${isAbsolute ? styles.modalAbsolute : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>Choose an Icon</h3>
                    <button className={styles.closeBtn} onClick={onClose}>
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
}

export function getIconByName(iconName: string): LucideIcon {
    const found = iconOptions.find(opt => opt.iconName === iconName);
    return found ? found.icon : Lightbulb;
}
