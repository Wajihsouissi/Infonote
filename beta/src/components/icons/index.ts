// Shim over lucide-react — see ./createIcon.tsx.
//
// Each name resolves to src/assets/icons/<Name>.svg (Solar Bold Duotone). The
// few with no Solar equivalent keep their lucide original as a fallback.
// Only icons the app imports are listed: an unlisted icon costs nothing, and
// src/assets/icons holds exactly the SVGs named here.

import type { LucideIcon } from 'lucide-react';
import {
    Loader2 as LucideLoader2,
    Square as LucideSquare,
    Columns2 as LucideColumns2,
    Quote as LucideQuote,
    RectangleHorizontal as LucideRectangleHorizontal,
    Heading1 as LucideHeading1,
    Heading2 as LucideHeading2,
    Heading3 as LucideHeading3,
    ListOrdered as LucideListOrdered,
    PanelTop as LucidePanelTop,
    ChevronsDownUp as LucideChevronsDownUp,
    Columns3 as LucideColumns3,
    ImagePlay as LucideImagePlay,
    Rows2 as LucideRows2,
    Rows3 as LucideRows3,
    Squircle as LucideSquircle,
    Table as LucideTable,
    ToggleRight as LucideToggleRight,
} from 'lucide-react';
import { resolveIcon } from './createIcon';

export type { LucideIcon, LucideProps } from 'lucide-react';

export const X: LucideIcon = resolveIcon("X");
export const FileText: LucideIcon = resolveIcon("FileText");
export const Layers: LucideIcon = resolveIcon("Layers");
export const Sparkles: LucideIcon = resolveIcon("Sparkles");
export const Globe: LucideIcon = resolveIcon("Globe");
export const Cloud: LucideIcon = resolveIcon("Cloud");
export const AlertCircle: LucideIcon = resolveIcon("AlertCircle");
export const EyeOff: LucideIcon = resolveIcon("EyeOff");
export const Mail: LucideIcon = resolveIcon("Mail");
export const User: LucideIcon = resolveIcon("User");
export const LogOut: LucideIcon = resolveIcon("LogOut");
export const Loader2: LucideIcon = resolveIcon("Loader2", LucideLoader2);
export const Send: LucideIcon = resolveIcon("Send");
export const History: LucideIcon = resolveIcon("History");
export const SquarePen: LucideIcon = resolveIcon("SquarePen");
export const ListTodo: LucideIcon = resolveIcon("ListTodo");
export const CornerDownLeft: LucideIcon = resolveIcon("CornerDownLeft");
export const Check: LucideIcon = resolveIcon("Check");
export const Clock: LucideIcon = resolveIcon("Clock");
export const Search: LucideIcon = resolveIcon("Search");
export const ArrowRight: LucideIcon = resolveIcon("ArrowRight");
export const ChevronRight: LucideIcon = resolveIcon("ChevronRight");
export const Image: LucideIcon = resolveIcon("Image");
export const ArrowLeft: LucideIcon = resolveIcon("ArrowLeft");
export const Calendar: LucideIcon = resolveIcon("Calendar");
export const Copy: LucideIcon = resolveIcon("Copy");
export const Plus: LucideIcon = resolveIcon("Plus");
export const Trash2: LucideIcon = resolveIcon("Trash2");
export const Eye: LucideIcon = resolveIcon("Eye");
export const StickyNote: LucideIcon = resolveIcon("StickyNote");
export const GitBranch: LucideIcon = resolveIcon("GitBranch");
export const LayoutGrid: LucideIcon = resolveIcon("LayoutGrid");
export const Link: LucideIcon = resolveIcon("Link");
export const Lock: LucideIcon = resolveIcon("Lock");
export const Zap: LucideIcon = resolveIcon("Zap");
export const CheckSquare: LucideIcon = resolveIcon("CheckSquare");
export const ExternalLink: LucideIcon = resolveIcon("ExternalLink");
export const RefreshCw: LucideIcon = resolveIcon("RefreshCw");
export const Type: LucideIcon = resolveIcon("Type");
export const ChevronLeft: LucideIcon = resolveIcon("ChevronLeft");
export const Code: LucideIcon = resolveIcon("Code");
export const GripVertical: LucideIcon = resolveIcon("GripVertical");
export const List: LucideIcon = resolveIcon("List");
export const ArrowUpRight: LucideIcon = resolveIcon("ArrowUpRight");
export const ChevronDown: LucideIcon = resolveIcon("ChevronDown");
export const Minus: LucideIcon = resolveIcon("Minus");
export const Moon: LucideIcon = resolveIcon("Moon");
export const Palette: LucideIcon = resolveIcon("Palette");
export const Play: LucideIcon = resolveIcon("Play");
export const Scissors: LucideIcon = resolveIcon("Scissors");
export const Sun: LucideIcon = resolveIcon("Sun");
export const UserPlus: LucideIcon = resolveIcon("UserPlus");
export const Activity: LucideIcon = resolveIcon("Activity");
export const AlignCenter: LucideIcon = resolveIcon("AlignCenter");
export const AlignLeft: LucideIcon = resolveIcon("AlignLeft");
export const AlignRight: LucideIcon = resolveIcon("AlignRight");
export const Box: LucideIcon = resolveIcon("Box");
export const Crosshair: LucideIcon = resolveIcon("Crosshair");
export const Expand: LucideIcon = resolveIcon("Expand");
export const File: LucideIcon = resolveIcon("File");
export const Home: LucideIcon = resolveIcon("Home");
export const Maximize2: LucideIcon = resolveIcon("Maximize2");
export const Network: LucideIcon = resolveIcon("Network");
export const UploadCloud: LucideIcon = resolveIcon("UploadCloud");
export const Workflow: LucideIcon = resolveIcon("Workflow");
export const ZoomIn: LucideIcon = resolveIcon("ZoomIn");
export const ZoomOut: LucideIcon = resolveIcon("ZoomOut");
export const AlertTriangle: LucideIcon = resolveIcon("AlertTriangle");
export const AppWindow: LucideIcon = resolveIcon("AppWindow");
export const ArrowDown: LucideIcon = resolveIcon("ArrowDown");
export const ArrowRightLeft: LucideIcon = resolveIcon("ArrowRightLeft");
export const ArrowUp: LucideIcon = resolveIcon("ArrowUp");
export const Bold: LucideIcon = resolveIcon("Bold");
export const ChevronsUpDown: LucideIcon = resolveIcon("ChevronsUpDown");
export const CircleDot: LucideIcon = resolveIcon("CircleDot");
export const ClipboardPaste: LucideIcon = resolveIcon("ClipboardPaste");
export const CornerDownRight: LucideIcon = resolveIcon("CornerDownRight");
export const Cuboid: LucideIcon = resolveIcon("Cuboid");
export const Download: LucideIcon = resolveIcon("Download");
export const Edit3: LucideIcon = resolveIcon("Edit3");
export const Eraser: LucideIcon = resolveIcon("Eraser");
export const Folder: LucideIcon = resolveIcon("Folder");
export const Grid3x3: LucideIcon = resolveIcon("Grid3x3");
export const GripHorizontal: LucideIcon = resolveIcon("GripHorizontal");
export const ImageOff: LucideIcon = resolveIcon("ImageOff");
export const Info: LucideIcon = resolveIcon("Info");
export const Italic: LucideIcon = resolveIcon("Italic");
export const Keyboard: LucideIcon = resolveIcon("Keyboard");
export const ListCollapse: LucideIcon = resolveIcon("ListCollapse");
export const MessageSquare: LucideIcon = resolveIcon("MessageSquare");
export const Monitor: LucideIcon = resolveIcon("Monitor");
export const MoreHorizontal: LucideIcon = resolveIcon("MoreHorizontal");
export const PanelLeft: LucideIcon = resolveIcon("PanelLeft");
export const PanelLeftClose: LucideIcon = resolveIcon("PanelLeftClose");
export const PanelLeftOpen: LucideIcon = resolveIcon("PanelLeftOpen");
export const PanelRight: LucideIcon = resolveIcon("PanelRight");
export const Paperclip: LucideIcon = resolveIcon("Paperclip");
export const Redo: LucideIcon = resolveIcon("Redo");
export const RotateCcw: LucideIcon = resolveIcon("RotateCcw");
export const Scaling: LucideIcon = resolveIcon("Scaling");
export const Scan: LucideIcon = resolveIcon("Scan");
export const Sliders: LucideIcon = resolveIcon("Sliders");
export const Spline: LucideIcon = resolveIcon("Spline");
export const Star: LucideIcon = resolveIcon("Star");
export const Strikethrough: LucideIcon = resolveIcon("Strikethrough");
export const Trash: LucideIcon = resolveIcon("Trash");
export const Tv: LucideIcon = resolveIcon("Tv");
export const Underline: LucideIcon = resolveIcon("Underline");
export const Undo: LucideIcon = resolveIcon("Undo");
export const Undo2: LucideIcon = resolveIcon("Undo2");
export const Unlink: LucideIcon = resolveIcon("Unlink");
export const Upload: LucideIcon = resolveIcon("Upload");
export const Square: LucideIcon = resolveIcon("Square", LucideSquare);
export const Columns2: LucideIcon = resolveIcon("Columns2", LucideColumns2);
export const Quote: LucideIcon = resolveIcon("Quote", LucideQuote);
export const RectangleHorizontal: LucideIcon = resolveIcon("RectangleHorizontal", LucideRectangleHorizontal);
export const Heading1: LucideIcon = resolveIcon("Heading1", LucideHeading1);
export const Heading2: LucideIcon = resolveIcon("Heading2", LucideHeading2);
export const Heading3: LucideIcon = resolveIcon("Heading3", LucideHeading3);
export const ListOrdered: LucideIcon = resolveIcon("ListOrdered", LucideListOrdered);
export const PanelTop: LucideIcon = resolveIcon("PanelTop", LucidePanelTop);
export const ChevronsDownUp: LucideIcon = resolveIcon("ChevronsDownUp", LucideChevronsDownUp);
export const Columns3: LucideIcon = resolveIcon("Columns3", LucideColumns3);
export const ImagePlay: LucideIcon = resolveIcon("ImagePlay", LucideImagePlay);
export const Rows2: LucideIcon = resolveIcon("Rows2", LucideRows2);
export const Rows3: LucideIcon = resolveIcon("Rows3", LucideRows3);
export const Squircle: LucideIcon = resolveIcon("Squircle", LucideSquircle);
export const Table: LucideIcon = resolveIcon("Table", LucideTable);
export const ToggleRight: LucideIcon = resolveIcon("ToggleRight", LucideToggleRight);
