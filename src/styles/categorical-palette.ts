/**
 * categorical-palette.ts
 * ──────────────────────
 * Shared color constants for functional/categorical use cases:
 * card color pickers, kanban status dots, priority badges, edge colors,
 * block text/background colors, etc.
 *
 * These are permitted under brand rule §9 — color is information, not
 * decoration. They live outside the Paper & Ink accent system.
 *
 * Design system accent colors (for chrome/UI) live in design-system.css.
 * This file is ONLY for user-meaningful categorical color.
 */

/* ── Card / Note Preset Colors ── */
export const CARD_PRESET_COLORS = [
  { name: 'Default', value: '' },
  { name: 'Slate', value: '#94a3b8' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
] as const;

/* ── Edge / Connection Preset Colors ── */
export const EDGE_PRESET_COLORS = [
  { name: 'Default', value: 'transparent', displayValue: '#94a3b8' },
  { name: 'Red', value: '#ef4444', displayValue: '#ef4444' },
  { name: 'Orange', value: '#f97316', displayValue: '#f97316' },
  { name: 'Yellow', value: '#eab308', displayValue: '#eab308' },
  { name: 'Green', value: '#22c55e', displayValue: '#22c55e' },
  { name: 'Blue', value: '#3b82f6', displayValue: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6', displayValue: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899', displayValue: '#ec4899' },
  { name: 'Gray', value: '#64748b', displayValue: '#64748b' },
] as const;

/* ── Multi-Selection Toolbar Colors ── */
export const SELECTION_COLORS = [
  { name: 'Default', value: 'transparent', displayValue: 'transparent' },
  { name: 'Red', value: '#ef4444', displayValue: '#ef4444' },
  { name: 'Orange', value: '#f97316', displayValue: '#f97316' },
  { name: 'Yellow', value: '#eab308', displayValue: '#eab308' },
  { name: 'Green', value: '#22c55e', displayValue: '#22c55e' },
  { name: 'Blue', value: '#3b82f6', displayValue: '#3b82f6' },
  { name: 'Purple', value: '#a855f7', displayValue: '#a855f7' },
  { name: 'Pink', value: '#ec4899', displayValue: '#ec4899' },
  { name: 'Gray', value: '#6b7280', displayValue: '#6b7280' },
  { name: 'Cyan', value: '#06b6d4', displayValue: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6', displayValue: '#14b8a6' },
  { name: 'Lime', value: '#84cc16', displayValue: '#84cc16' },
] as const;

/* ── Block Text/Background Colors (Notion-style) ── */
export const BLOCK_COLORS = [
  { label: 'Default', value: 'inherit' },
  { label: 'Gray', value: '#787774' },
  { label: 'Brown', value: '#9f6b53' },
  { label: 'Orange', value: '#d9730d' },
  { label: 'Yellow', value: '#cb912f' },
  { label: 'Green', value: '#448361' },
  { label: 'Blue', value: '#337ea9' },
  { label: 'Purple', value: '#9065b0' },
  { label: 'Pink', value: '#c14c8a' },
  { label: 'Red', value: '#d44c47' },
] as const;

/* ── Kanban Status Colors ── */
export const KANBAN_STATUS_COLORS = {
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
} as const;

/* ── Priority Colors ── */
export const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

/* ── Default Kanban Columns ── */
export const DEFAULT_KANBAN_COLUMNS = [
  { id: 'todo', label: 'To Do', statusValue: 'todo', color: KANBAN_STATUS_COLORS.danger },
  { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: KANBAN_STATUS_COLORS.warning },
  { id: 'done', label: 'Done', statusValue: 'done', color: KANBAN_STATUS_COLORS.success },
] as const;
