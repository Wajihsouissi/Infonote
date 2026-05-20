import {
    FileText, Heart, Star, Bookmark, Calendar, Clock,
    Target, Zap, Lightbulb, Rocket, Flag, Trophy,
    Coffee, Music, Camera, Book, Briefcase, Code,
    Palette, Sparkles, Sun, Moon, Cloud, Umbrella,
    Gift, Home, Mail, Phone, Settings, User,
    CheckCircle, AlertCircle, Info, XCircle, HelpCircle,
    TrendingUp, Activity, BarChart, PieChart, Database,
    Folder, File, Image, Video,
    type LucideIcon
} from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
    FileText,
    Heart,
    Star,
    Bookmark,
    Calendar,
    Clock,
    Target,
    Zap,
    Lightbulb,
    Rocket,
    Flag,
    Trophy,
    Coffee,
    Music,
    Camera,
    Book,
    Briefcase,
    Code,
    Palette,
    Sparkles,
    Sun,
    Moon,
    Cloud,
    Umbrella,
    Gift,
    Home,
    Mail,
    Phone,
    Settings,
    User,
    CheckCircle,
    AlertCircle,
    Info,
    XCircle,
    HelpCircle,
    TrendingUp,
    Activity,
    BarChart,
    PieChart,
    Database,
    Folder,
    File,
    Image,
    Video,
};

export const defaultIconName = 'FileText';

import React from 'react';

export interface CardIconProps {
    icon: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

export function CardIcon({ icon, size = 20, className, style }: CardIconProps) {
    const isCustomImage = icon && (icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://'));

    if (isCustomImage) {
        const displaySize = size * 1.5;
        return React.createElement('img', {
            src: icon,
            alt: 'Icon',
            className,
            style: {
                width: `${displaySize}px`,
                height: `${displaySize}px`,
                objectFit: 'cover',
                borderRadius: '12px',
                display: 'inline-block',
                verticalAlign: 'middle',
                ...style
            }
        });
    }

    const IconComponent = iconMap[icon || defaultIconName] || iconMap[defaultIconName];
    return React.createElement(IconComponent, { size, className, style });
}
