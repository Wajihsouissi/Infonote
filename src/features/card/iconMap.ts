import {
    // General
    FileText, Folder, File, Search, Home, Settings, User, Users, Book, BookOpen, 
    Clock, Calendar, Save, Trash, Trash2, Edit, Copy, Clipboard, ClipboardList, 
    Share, Share2, Download, Upload, Menu, Filter, Eye, EyeOff, Lock, Unlock, 
    Key, Shield, Link, ExternalLink, Paperclip, Hash, History, Bookmark, MoreHorizontal, MoreVertical,
    
    // Communication
    Mail, Phone, MessageCircle, MessageSquare, Inbox, Send, AtSign, Rss, Bell, BellOff,
    Wifi, Radio, Tv, Smartphone, Tablet, Monitor, Laptop, Speaker, Volume2, VolumeX,
    Mic, MicOff, Video, Camera, Headphones,
    
    // Status & Navigation
    Check, CheckCircle, CheckSquare, AlertCircle, AlertTriangle, Info, X, XCircle, XSquare, HelpCircle,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Plus, PlusCircle, Minus, MinusCircle, Maximize, Minimize, ZoomIn, ZoomOut,
    
    // Media & Design
    Image, Film, Music, Palette, PenTool, Brush, Droplet, Type, Bold, Italic, Underline,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, Scissors, Crop, Layout, LayoutDashboard,
    LayoutGrid, LayoutList, Layers, Grid, Frame, Move,
    
    // Development & Data
    Code, Terminal, Database, Cpu, HardDrive, Server, Cloud, Sun, Moon, Star,
    Battery, BatteryCharging, Zap, ZapOff, Activity, BarChart, BarChart2, PieChart,
    TrendingUp, TrendingDown, RefreshCw, RotateCcw, Play, Pause, Square, Circle, Triangle, Hexagon,
    
    // Commerce & Lifestyle
    ShoppingCart, ShoppingBag, CreditCard, DollarSign, Euro, Banknote, Coins, Wallet, Tag, Ticket,
    Award, Trophy, Medal, Crown, Gift, Heart, Smile, Frown, Coffee, Map, MapPin, Navigation, Compass,
    Flag, Target, Briefcase, Glasses, UserPlus, UserMinus, UserCheck,
    
    type LucideIcon
} from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
    // General
    FileText, Folder, File, Search, Home, Settings, User, Users, Book, BookOpen, 
    Clock, Calendar, Save, Trash, Trash2, Edit, Copy, Clipboard, ClipboardList, 
    Share, Share2, Download, Upload, Menu, Filter, Eye, EyeOff, Lock, Unlock, 
    Key, Shield, Link, ExternalLink, Paperclip, Hash, History, Bookmark, MoreHorizontal, MoreVertical,
    
    // Communication
    Mail, Phone, MessageCircle, MessageSquare, Inbox, Send, AtSign, Rss, Bell, BellOff,
    Wifi, Radio, Tv, Smartphone, Tablet, Monitor, Laptop, Speaker, Volume2, VolumeX,
    Mic, MicOff, Video, Camera, Headphones,
    
    // Status & Navigation
    Check, CheckCircle, CheckSquare, AlertCircle, AlertTriangle, Info, X, XCircle, XSquare, HelpCircle,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Plus, PlusCircle, Minus, MinusCircle, Maximize, Minimize, ZoomIn, ZoomOut,
    
    // Media & Design
    Image, Film, Music, Palette, PenTool, Brush, Droplet, Type, Bold, Italic, Underline,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, Scissors, Crop, Layout, LayoutDashboard,
    LayoutGrid, LayoutList, Layers, Grid, Frame, Move,
    
    // Development & Data
    Code, Terminal, Database, Cpu, HardDrive, Server, Cloud, Sun, Moon, Star,
    Battery, BatteryCharging, Zap, ZapOff, Activity, BarChart, BarChart2, PieChart,
    TrendingUp, TrendingDown, RefreshCw, RotateCcw, Play, Pause, Square, Circle, Triangle, Hexagon,
    
    // Commerce & Lifestyle
    ShoppingCart, ShoppingBag, CreditCard, DollarSign, Euro, Banknote, Coins, Wallet, Tag, Ticket,
    Award, Trophy, Medal, Crown, Gift, Heart, Smile, Frown, Coffee, Map, MapPin, Navigation, Compass,
    Flag, Target, Briefcase, Glasses, UserPlus, UserMinus, UserCheck,
};

export interface IconData {
    name: string;
    iconName: string;
    category: string;
    color: string;
}

export const iconRegistry: IconData[] = [
    // General
    { name: 'Document', iconName: 'FileText', category: 'General', color: '#94a3b8' },
    { name: 'Folder', iconName: 'Folder', category: 'General', color: '#94a3b8' },
    { name: 'File', iconName: 'File', category: 'General', color: '#94a3b8' },
    { name: 'Search', iconName: 'Search', category: 'General', color: '#94a3b8' },
    { name: 'Home', iconName: 'Home', category: 'General', color: '#94a3b8' },
    { name: 'Settings', iconName: 'Settings', category: 'General', color: '#94a3b8' },
    { name: 'User', iconName: 'User', category: 'General', color: '#94a3b8' },
    { name: 'Users', iconName: 'Users', category: 'General', color: '#94a3b8' },
    { name: 'Book', iconName: 'Book', category: 'General', color: '#94a3b8' },
    { name: 'Book Open', iconName: 'BookOpen', category: 'General', color: '#94a3b8' },
    { name: 'Clock', iconName: 'Clock', category: 'General', color: '#94a3b8' },
    { name: 'Calendar', iconName: 'Calendar', category: 'General', color: '#94a3b8' },
    { name: 'Save', iconName: 'Save', category: 'General', color: '#94a3b8' },
    { name: 'Trash', iconName: 'Trash', category: 'General', color: '#94a3b8' },
    { name: 'Trash2', iconName: 'Trash2', category: 'General', color: '#94a3b8' },
    { name: 'Edit', iconName: 'Edit', category: 'General', color: '#94a3b8' },
    { name: 'Copy', iconName: 'Copy', category: 'General', color: '#94a3b8' },
    { name: 'Clipboard', iconName: 'Clipboard', category: 'General', color: '#94a3b8' },
    { name: 'List', iconName: 'ClipboardList', category: 'General', color: '#94a3b8' },
    { name: 'Share', iconName: 'Share', category: 'General', color: '#94a3b8' },
    { name: 'Share2', iconName: 'Share2', category: 'General', color: '#94a3b8' },
    { name: 'Download', iconName: 'Download', category: 'General', color: '#94a3b8' },
    { name: 'Upload', iconName: 'Upload', category: 'General', color: '#94a3b8' },
    { name: 'Menu', iconName: 'Menu', category: 'General', color: '#94a3b8' },
    { name: 'Filter', iconName: 'Filter', category: 'General', color: '#94a3b8' },
    { name: 'Eye', iconName: 'Eye', category: 'General', color: '#94a3b8' },
    { name: 'Eye Off', iconName: 'EyeOff', category: 'General', color: '#94a3b8' },
    { name: 'Lock', iconName: 'Lock', category: 'General', color: '#94a3b8' },
    { name: 'Unlock', iconName: 'Unlock', category: 'General', color: '#94a3b8' },
    { name: 'Key', iconName: 'Key', category: 'General', color: '#94a3b8' },
    { name: 'Shield', iconName: 'Shield', category: 'General', color: '#94a3b8' },
    { name: 'Link', iconName: 'Link', category: 'General', color: '#94a3b8' },
    { name: 'External Link', iconName: 'ExternalLink', category: 'General', color: '#94a3b8' },
    { name: 'Attachment', iconName: 'Paperclip', category: 'General', color: '#94a3b8' },
    { name: 'Hash', iconName: 'Hash', category: 'General', color: '#94a3b8' },
    { name: 'History', iconName: 'History', category: 'General', color: '#94a3b8' },
    { name: 'Bookmark', iconName: 'Bookmark', category: 'General', color: '#94a3b8' },
    { name: 'More (H)', iconName: 'MoreHorizontal', category: 'General', color: '#94a3b8' },
    { name: 'More (V)', iconName: 'MoreVertical', category: 'General', color: '#94a3b8' },

    // Communication
    { name: 'Mail', iconName: 'Mail', category: 'Communication', color: '#60a5fa' },
    { name: 'Phone', iconName: 'Phone', category: 'Communication', color: '#60a5fa' },
    { name: 'Message', iconName: 'MessageCircle', category: 'Communication', color: '#60a5fa' },
    { name: 'Chat', iconName: 'MessageSquare', category: 'Communication', color: '#60a5fa' },
    { name: 'Inbox', iconName: 'Inbox', category: 'Communication', color: '#60a5fa' },
    { name: 'Send', iconName: 'Send', category: 'Communication', color: '#60a5fa' },
    { name: 'At Sign', iconName: 'AtSign', category: 'Communication', color: '#60a5fa' },
    { name: 'RSS', iconName: 'Rss', category: 'Communication', color: '#60a5fa' },
    { name: 'Bell', iconName: 'Bell', category: 'Communication', color: '#60a5fa' },
    { name: 'Bell Off', iconName: 'BellOff', category: 'Communication', color: '#60a5fa' },
    { name: 'WiFi', iconName: 'Wifi', category: 'Communication', color: '#60a5fa' },
    { name: 'Radio', iconName: 'Radio', category: 'Communication', color: '#60a5fa' },
    { name: 'TV', iconName: 'Tv', category: 'Communication', color: '#60a5fa' },
    { name: 'Mobile', iconName: 'Smartphone', category: 'Communication', color: '#60a5fa' },
    { name: 'Tablet', iconName: 'Tablet', category: 'Communication', color: '#60a5fa' },
    { name: 'Monitor', iconName: 'Monitor', category: 'Communication', color: '#60a5fa' },
    { name: 'Laptop', iconName: 'Laptop', category: 'Communication', color: '#60a5fa' },
    { name: 'Speaker', iconName: 'Speaker', category: 'Communication', color: '#60a5fa' },
    { name: 'Volume Up', iconName: 'Volume2', category: 'Communication', color: '#60a5fa' },
    { name: 'Mute', iconName: 'VolumeX', category: 'Communication', color: '#60a5fa' },
    { name: 'Mic', iconName: 'Mic', category: 'Communication', color: '#60a5fa' },
    { name: 'Mic Off', iconName: 'MicOff', category: 'Communication', color: '#60a5fa' },
    { name: 'Video', iconName: 'Video', category: 'Communication', color: '#60a5fa' },
    { name: 'Camera', iconName: 'Camera', category: 'Communication', color: '#60a5fa' },
    { name: 'Headphones', iconName: 'Headphones', category: 'Communication', color: '#60a5fa' },

    // Status & Navigation
    { name: 'Check', iconName: 'Check', category: 'Status', color: '#34d399' },
    { name: 'Check Circle', iconName: 'CheckCircle', category: 'Status', color: '#34d399' },
    { name: 'Check Square', iconName: 'CheckSquare', category: 'Status', color: '#34d399' },
    { name: 'Alert', iconName: 'AlertCircle', category: 'Status', color: '#fbbf24' },
    { name: 'Warning', iconName: 'AlertTriangle', category: 'Status', color: '#fbbf24' },
    { name: 'Info', iconName: 'Info', category: 'Status', color: '#60a5fa' },
    { name: 'X', iconName: 'X', category: 'Status', color: '#f87171' },
    { name: 'Error', iconName: 'XCircle', category: 'Status', color: '#f87171' },
    { name: 'X Square', iconName: 'XSquare', category: 'Status', color: '#f87171' },
    { name: 'Help', iconName: 'HelpCircle', category: 'Status', color: '#ff8a5f' },
    { name: 'Up', iconName: 'ArrowUp', category: 'Status', color: '#94a3b8' },
    { name: 'Down', iconName: 'ArrowDown', category: 'Status', color: '#94a3b8' },
    { name: 'Left', iconName: 'ArrowLeft', category: 'Status', color: '#94a3b8' },
    { name: 'Right', iconName: 'ArrowRight', category: 'Status', color: '#94a3b8' },
    { name: 'Chevron Up', iconName: 'ChevronUp', category: 'Status', color: '#94a3b8' },
    { name: 'Chevron Down', iconName: 'ChevronDown', category: 'Status', color: '#94a3b8' },
    { name: 'Chevron Left', iconName: 'ChevronLeft', category: 'Status', color: '#94a3b8' },
    { name: 'Chevron Right', iconName: 'ChevronRight', category: 'Status', color: '#94a3b8' },
    { name: 'Plus', iconName: 'Plus', category: 'Status', color: '#94a3b8' },
    { name: 'Plus Circle', iconName: 'PlusCircle', category: 'Status', color: '#94a3b8' },
    { name: 'Minus', iconName: 'Minus', category: 'Status', color: '#94a3b8' },
    { name: 'Minus Circle', iconName: 'MinusCircle', category: 'Status', color: '#94a3b8' },
    { name: 'Maximize', iconName: 'Maximize', category: 'Status', color: '#94a3b8' },
    { name: 'Minimize', iconName: 'Minimize', category: 'Status', color: '#94a3b8' },
    { name: 'Zoom In', iconName: 'ZoomIn', category: 'Status', color: '#94a3b8' },
    { name: 'Zoom Out', iconName: 'ZoomOut', category: 'Status', color: '#94a3b8' },

    // Design
    { name: 'Image', iconName: 'Image', category: 'Design', color: '#ec4899' },
    { name: 'Film', iconName: 'Film', category: 'Design', color: '#ec4899' },
    { name: 'Music', iconName: 'Music', category: 'Design', color: '#ec4899' },
    { name: 'Palette', iconName: 'Palette', category: 'Design', color: '#ec4899' },
    { name: 'Pen Tool', iconName: 'PenTool', category: 'Design', color: '#ec4899' },
    { name: 'Brush', iconName: 'Brush', category: 'Design', color: '#ec4899' },
    { name: 'Droplet', iconName: 'Droplet', category: 'Design', color: '#ec4899' },
    { name: 'Text', iconName: 'Type', category: 'Design', color: '#ec4899' },
    { name: 'Bold', iconName: 'Bold', category: 'Design', color: '#ec4899' },
    { name: 'Italic', iconName: 'Italic', category: 'Design', color: '#ec4899' },
    { name: 'Underline', iconName: 'Underline', category: 'Design', color: '#ec4899' },
    { name: 'Align Left', iconName: 'AlignLeft', category: 'Design', color: '#ec4899' },
    { name: 'Align Center', iconName: 'AlignCenter', category: 'Design', color: '#ec4899' },
    { name: 'Align Right', iconName: 'AlignRight', category: 'Design', color: '#ec4899' },
    { name: 'Align Justify', iconName: 'AlignJustify', category: 'Design', color: '#ec4899' },
    { name: 'Scissors', iconName: 'Scissors', category: 'Design', color: '#ec4899' },
    { name: 'Crop', iconName: 'Crop', category: 'Design', color: '#ec4899' },
    { name: 'Layout', iconName: 'Layout', category: 'Design', color: '#ec4899' },
    { name: 'Dashboard', iconName: 'LayoutDashboard', category: 'Design', color: '#ec4899' },
    { name: 'Layout Grid', iconName: 'LayoutGrid', category: 'Design', color: '#ec4899' },
    { name: 'Layout List', iconName: 'LayoutList', category: 'Design', color: '#ec4899' },
    { name: 'Layers', iconName: 'Layers', category: 'Design', color: '#ec4899' },
    { name: 'Grid', iconName: 'Grid', category: 'Design', color: '#ec4899' },
    { name: 'Frame', iconName: 'Frame', category: 'Design', color: '#ec4899' },
    { name: 'Move', iconName: 'Move', category: 'Design', color: '#ec4899' },

    // Development
    { name: 'Code', iconName: 'Code', category: 'Development', color: '#10b981' },
    { name: 'Terminal', iconName: 'Terminal', category: 'Development', color: '#10b981' },
    { name: 'Database', iconName: 'Database', category: 'Development', color: '#10b981' },
    { name: 'CPU', iconName: 'Cpu', category: 'Development', color: '#10b981' },
    { name: 'Hard Drive', iconName: 'HardDrive', category: 'Development', color: '#10b981' },
    { name: 'Server', iconName: 'Server', category: 'Development', color: '#10b981' },
    { name: 'Cloud', iconName: 'Cloud', category: 'Development', color: '#10b981' },
    { name: 'Sun', iconName: 'Sun', category: 'Development', color: '#10b981' },
    { name: 'Moon', iconName: 'Moon', category: 'Development', color: '#10b981' },
    { name: 'Star', iconName: 'Star', category: 'Development', color: '#10b981' },
    { name: 'Battery', iconName: 'Battery', category: 'Development', color: '#10b981' },
    { name: 'Battery Charging', iconName: 'BatteryCharging', category: 'Development', color: '#10b981' },
    { name: 'Lightning', iconName: 'Zap', category: 'Development', color: '#10b981' },
    { name: 'Zap Off', iconName: 'ZapOff', category: 'Development', color: '#10b981' },
    { name: 'Activity', iconName: 'Activity', category: 'Development', color: '#10b981' },
    { name: 'Bar Chart', iconName: 'BarChart', category: 'Development', color: '#10b981' },
    { name: 'Bar Chart 2', iconName: 'BarChart2', category: 'Development', color: '#10b981' },
    { name: 'Pie Chart', iconName: 'PieChart', category: 'Development', color: '#10b981' },
    { name: 'Growth', iconName: 'TrendingUp', category: 'Development', color: '#10b981' },
    { name: 'Decline', iconName: 'TrendingDown', category: 'Development', color: '#10b981' },
    { name: 'Refresh', iconName: 'RefreshCw', category: 'Development', color: '#10b981' },
    { name: 'Rotate', iconName: 'RotateCcw', category: 'Development', color: '#10b981' },
    { name: 'Play', iconName: 'Play', category: 'Development', color: '#10b981' },
    { name: 'Pause', iconName: 'Pause', category: 'Development', color: '#10b981' },
    { name: 'Square', iconName: 'Square', category: 'Development', color: '#10b981' },
    { name: 'Circle', iconName: 'Circle', category: 'Development', color: '#10b981' },
    { name: 'Triangle', iconName: 'Triangle', category: 'Development', color: '#10b981' },
    { name: 'Hexagon', iconName: 'Hexagon', category: 'Development', color: '#10b981' },

    // Commerce
    { name: 'Cart', iconName: 'ShoppingCart', category: 'Commerce', color: '#eab308' },
    { name: 'Bag', iconName: 'ShoppingBag', category: 'Commerce', color: '#eab308' },
    { name: 'Card', iconName: 'CreditCard', category: 'Commerce', color: '#eab308' },
    { name: 'Dollar', iconName: 'DollarSign', category: 'Commerce', color: '#eab308' },
    { name: 'Euro', iconName: 'Euro', category: 'Commerce', color: '#eab308' },
    { name: 'Banknote', iconName: 'Banknote', category: 'Commerce', color: '#eab308' },
    { name: 'Coins', iconName: 'Coins', category: 'Commerce', color: '#eab308' },
    { name: 'Wallet', iconName: 'Wallet', category: 'Commerce', color: '#eab308' },
    { name: 'Tag', iconName: 'Tag', category: 'Commerce', color: '#eab308' },
    { name: 'Ticket', iconName: 'Ticket', category: 'Commerce', color: '#eab308' },
    { name: 'Award', iconName: 'Award', category: 'Commerce', color: '#eab308' },
    { name: 'Trophy', iconName: 'Trophy', category: 'Commerce', color: '#eab308' },
    { name: 'Medal', iconName: 'Medal', category: 'Commerce', color: '#eab308' },
    { name: 'Crown', iconName: 'Crown', category: 'Commerce', color: '#eab308' },
    { name: 'Gift', iconName: 'Gift', category: 'Commerce', color: '#eab308' },
    { name: 'Heart', iconName: 'Heart', category: 'Commerce', color: '#f43f5e' },
    { name: 'Smile', iconName: 'Smile', category: 'Commerce', color: '#f43f5e' },
    { name: 'Frown', iconName: 'Frown', category: 'Commerce', color: '#f43f5e' },
    { name: 'Coffee', iconName: 'Coffee', category: 'Commerce', color: '#d97706' },
    { name: 'Map', iconName: 'Map', category: 'Commerce', color: '#f59e0b' },
    { name: 'Map Pin', iconName: 'MapPin', category: 'Commerce', color: '#f59e0b' },
    { name: 'Navigation', iconName: 'Navigation', category: 'Commerce', color: '#f59e0b' },
    { name: 'Compass', iconName: 'Compass', category: 'Commerce', color: '#f59e0b' },
    { name: 'Flag', iconName: 'Flag', category: 'Commerce', color: '#ef4444' },
    { name: 'Target', iconName: 'Target', category: 'Commerce', color: '#ef4444' },
    { name: 'Briefcase', iconName: 'Briefcase', category: 'Commerce', color: '#f95d2e' },
    { name: 'Glasses', iconName: 'Glasses', category: 'Commerce', color: '#f95d2e' },
    { name: 'User Plus', iconName: 'UserPlus', category: 'Commerce', color: '#f95d2e' },
    { name: 'User Minus', iconName: 'UserMinus', category: 'Commerce', color: '#f95d2e' },
    { name: 'User Check', iconName: 'UserCheck', category: 'Commerce', color: '#f95d2e' },
];

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
        const displaySize = size;
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

    if (icon && icon.startsWith('emoji::')) {
        const emojiStr = icon.replace('emoji::', '');
        return React.createElement('span', {
            className,
            style: {
                fontSize: `${size * 0.9}px`,
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: `${size}px`,
                height: `${size}px`,
                ...style
            }
        }, emojiStr);
    }

    let iconName = icon || defaultIconName;
    let customColor: string | null = null;
    
    if (icon && icon.includes('::')) {
        [iconName, customColor] = icon.split('::');
    }

    const IconComponent = iconMap[iconName] || iconMap[defaultIconName];
    
    // Find registered color if not overridden by style and no custom color selected
    const registeredIcon = iconRegistry.find(item => item.iconName === iconName);
    const iconColor = customColor ? customColor : (registeredIcon ? registeredIcon.color : 'inherit');
    
    const combinedStyle = { color: iconColor, ...style };

    return React.createElement(IconComponent, { size, className, style: combinedStyle });
}
