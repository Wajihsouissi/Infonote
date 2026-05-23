/**
 * notionConverter — translate a Notion page or database response into our
 * canvas AppNode shape.
 *
 * Two entry points:
 *   - convertNotionPageToCanvasNodes(blocks, options)
 *       Walks a flat list of Notion blocks (heading_*, paragraph,
 *       bulleted_list_item, numbered_list_item, to_do, code, quote, ...)
 *       and groups consecutive content under each heading into a single
 *       text card. Cards are stacked vertically along Y so they never
 *       pile up on top of each other.
 *
 *   - convertNotionDatabaseToCanvasNodes(pages, options)
 *       Buckets database pages by their Status (or Select) property name
 *       and lays them out as a kanban — one column per distinct status,
 *       cards stacked top-down within each column.
 *
 * Both functions return AppNode[] ready to hand off to
 * appendCanvasNodesToCloud() — the same path Figma import uses, so 409
 * conflicts are eliminated and overwrites are merged in place.
 */
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';

// ───── Notion API surface (only the fields we read) ──────────────────────

export interface NotionRichText {
    plain_text?: string;
    text?: { content?: string };
}

export interface NotionBlockBase {
    id: string;
    type: string;
    has_children?: boolean;
}

export interface NotionBlockWithRichText extends NotionBlockBase {
    [key: string]: unknown;
}

export type NotionBlock = NotionBlockWithRichText;

export interface NotionPageProperty {
    id?: string;
    type: string;
    title?: NotionRichText[];
    rich_text?: NotionRichText[];
    select?: { name?: string } | null;
    status?: { name?: string } | null;
    multi_select?: Array<{ name?: string }>;
    number?: number | null;
    checkbox?: boolean;
    date?: { start?: string; end?: string | null } | null;
    url?: string | null;
}

export interface NotionPage {
    id: string;
    object?: 'page';
    properties: Record<string, NotionPageProperty>;
    url?: string;
    created_time?: string;
    last_edited_time?: string;
}

// ───── Shared options ────────────────────────────────────────────────────

export interface NotionConvertOptions {
    /**
     * Translation applied to every produced node. Lets the caller drop
     * the import in an empty area of the canvas instead of (0,0). Default
     * is a small offset so brand-new imports never sit at the origin.
     */
    offset?: { x: number; y: number };
    /**
     * If true (default), tag every produced node with `data._notionSourceId`
     * and `data._notionType` for debugging / re-import.
     */
    keepSourceIds?: boolean;
}

export interface NotionConvertResult {
    nodes: AppNode[];
    /** Number of Notion blocks/pages we couldn't represent. */
    skipped: number;
}

const DEFAULT_OFFSET = { x: 80, y: 80 };

// Layout constants tuned for the existing canvas grid.
const PAGE_CARD_WIDTH = 360;
const PAGE_CARD_HEIGHT = 220;
const PAGE_GAP_Y = 40;

const KANBAN_COLUMN_WIDTH = 320;
const KANBAN_COLUMN_GAP = 40;
const KANBAN_CARD_HEIGHT = 140;
const KANBAN_CARD_GAP_Y = 24;
const KANBAN_HEADER_HEIGHT = 60;

// ───── Page conversion ───────────────────────────────────────────────────

/**
 * Group a flat block list under its headings. Each (heading + following
 * non-heading blocks) becomes a single text card. Blocks that appear
 * before the first heading land in an "Untitled" card so nothing is lost.
 */
export function convertNotionPageToCanvasNodes(
    blocks: NotionBlock[],
    options: NotionConvertOptions = {},
): NotionConvertResult {
    const offset = options.offset ?? DEFAULT_OFFSET;
    const keepSourceIds = options.keepSourceIds !== false;

    if (!Array.isArray(blocks) || blocks.length === 0) {
        return { nodes: [], skipped: 0 };
    }

    interface Group {
        heading: string;
        sourceId: string;
        bodyLines: string[];
    }

    const groups: Group[] = [];
    let current: Group = {
        heading: 'Untitled',
        sourceId: blocks[0]?.id ?? uuidv4(),
        bodyLines: [],
    };
    let skipped = 0;

    const flush = () => {
        if (current.bodyLines.length > 0 || current.heading !== 'Untitled') {
            groups.push(current);
        }
    };

    for (const block of blocks) {
        const type = block.type;
        if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
            // Start a new group.
            flush();
            current = {
                heading: extractRichText(block, type) || 'Section',
                sourceId: block.id,
                bodyLines: [],
            };
            continue;
        }

        const line = blockToLine(block);
        if (line == null) {
            skipped += 1;
            continue;
        }
        current.bodyLines.push(line);
    }
    flush();

    // Emit one note card per group, stacked vertically.
    const nodes: AppNode[] = groups.map((g, idx) => {
        const data: Record<string, unknown> = {
            label: g.heading.slice(0, 80),
            type: 'text',
            content: g.bodyLines.join('\n'),
        };
        if (keepSourceIds) {
            data._notionSourceId = g.sourceId;
            data._notionType = 'page_section';
        }
        return {
            id: uuidv4(),
            type: 'note',
            position: {
                x: offset.x,
                y: offset.y + idx * (PAGE_CARD_HEIGHT + PAGE_GAP_Y),
            },
            data,
            style: { width: PAGE_CARD_WIDTH, height: PAGE_CARD_HEIGHT },
        } as AppNode;
    });

    return { nodes, skipped };
}

/** Extract the heading text from a heading_N block. */
function extractRichText(block: NotionBlock, key: string): string {
    const inner = (block as Record<string, unknown>)[key] as
        | { rich_text?: NotionRichText[] }
        | undefined;
    return joinRichText(inner?.rich_text);
}

/** Convert a non-heading content block into a single line of text. */
function blockToLine(block: NotionBlock): string | null {
    const t = block.type;
    const inner = (block as Record<string, unknown>)[t] as
        | { rich_text?: NotionRichText[]; checked?: boolean; language?: string }
        | undefined;
    const text = joinRichText(inner?.rich_text);

    switch (t) {
        case 'paragraph':
            return text;
        case 'bulleted_list_item':
            return `• ${text}`;
        case 'numbered_list_item':
            return `1. ${text}`;
        case 'to_do':
            return `${inner?.checked ? '[x]' : '[ ]'} ${text}`;
        case 'quote':
            return `> ${text}`;
        case 'code':
            return text ? '```\n' + text + '\n```' : '';
        case 'callout':
            return text ? `💡 ${text}` : '';
        case 'divider':
            return '———';
        default:
            return null;
    }
}

function joinRichText(rich: NotionRichText[] | undefined): string {
    if (!Array.isArray(rich)) return '';
    return rich
        .map((r) => r.plain_text ?? r.text?.content ?? '')
        .join('')
        .trim();
}

// ───── Database (Kanban) conversion ──────────────────────────────────────

/**
 * Bucket pages by status name and emit a kanban-style layout: one column
 * per distinct status, cards stacked vertically inside each column.
 *
 * Status detection order:
 *   1. First property of type 'status' (Notion's dedicated status column).
 *   2. First property of type 'select'.
 *   3. Falls back to a single column called "All".
 *
 * Title detection:
 *   1. The property whose `type` is 'title' (Notion's required Name column).
 *   2. Falls back to the page id.
 */
export function convertNotionDatabaseToCanvasNodes(
    pages: NotionPage[],
    options: NotionConvertOptions = {},
): NotionConvertResult {
    const offset = options.offset ?? DEFAULT_OFFSET;
    const keepSourceIds = options.keepSourceIds !== false;

    if (!Array.isArray(pages) || pages.length === 0) {
        return { nodes: [], skipped: 0 };
    }

    let skipped = 0;

    // Discover the status property key from the first page that has one.
    const statusKey = findStatusKey(pages);
    const titleKey = findTitleKey(pages);

    // Bucket pages by status name; preserve insertion order so columns
    // appear in the order Notion returned them.
    const buckets = new Map<string, NotionPage[]>();
    for (const page of pages) {
        const status = statusKey ? readStatusName(page.properties[statusKey]) : 'All';
        const key = status || 'No status';
        const arr = buckets.get(key) ?? [];
        arr.push(page);
        buckets.set(key, arr);
    }

    const nodes: AppNode[] = [];

    let columnIndex = 0;
    for (const [status, columnPages] of buckets.entries()) {
        const colX = offset.x + columnIndex * (KANBAN_COLUMN_WIDTH + KANBAN_COLUMN_GAP);

        // Column header — a small text note that labels the lane.
        nodes.push({
            id: uuidv4(),
            type: 'note',
            position: { x: colX, y: offset.y },
            data: {
                label: status,
                type: 'text',
                content: `${columnPages.length} task${columnPages.length === 1 ? '' : 's'}`,
                ...(keepSourceIds ? { _notionType: 'database_column' } : {}),
            },
            style: { width: KANBAN_COLUMN_WIDTH, height: KANBAN_HEADER_HEIGHT },
        } as AppNode);

        // Cards in this column.
        columnPages.forEach((page, rowIndex) => {
            const title = titleKey
                ? readTitleText(page.properties[titleKey])
                : '';
            const summary = summariseProperties(page.properties, titleKey, statusKey);
            const data: Record<string, unknown> = {
                label: (title && title.trim()) || `Task · ${page.id.slice(0, 6)}`,
                type: 'task',
                content: summary,
                ...(typeof page.url === 'string' ? { url: page.url } : {}),
                ...(keepSourceIds
                    ? { _notionSourceId: page.id, _notionType: 'database_card' }
                    : {}),
            };
            nodes.push({
                id: uuidv4(),
                type: 'note',
                position: {
                    x: colX,
                    y:
                        offset.y +
                        KANBAN_HEADER_HEIGHT +
                        KANBAN_CARD_GAP_Y +
                        rowIndex * (KANBAN_CARD_HEIGHT + KANBAN_CARD_GAP_Y),
                },
                data,
                style: { width: KANBAN_COLUMN_WIDTH, height: KANBAN_CARD_HEIGHT },
            } as AppNode);
        });

        columnIndex += 1;
    }

    return { nodes, skipped };
}

function findStatusKey(pages: NotionPage[]): string | null {
    for (const page of pages) {
        for (const [key, prop] of Object.entries(page.properties || {})) {
            if (prop?.type === 'status') return key;
        }
    }
    for (const page of pages) {
        for (const [key, prop] of Object.entries(page.properties || {})) {
            if (prop?.type === 'select') return key;
        }
    }
    return null;
}

function findTitleKey(pages: NotionPage[]): string | null {
    for (const page of pages) {
        for (const [key, prop] of Object.entries(page.properties || {})) {
            if (prop?.type === 'title') return key;
        }
    }
    return null;
}

function readStatusName(prop: NotionPageProperty | undefined): string {
    if (!prop) return '';
    if (prop.type === 'status') return prop.status?.name ?? '';
    if (prop.type === 'select') return prop.select?.name ?? '';
    return '';
}

function readTitleText(prop: NotionPageProperty | undefined): string {
    if (!prop) return '';
    if (prop.type === 'title') return joinRichText(prop.title);
    if (prop.type === 'rich_text') return joinRichText(prop.rich_text);
    return '';
}

/**
 * Build a short text summary of the remaining properties so the card body
 * isn't empty. Skips title and status (already represented elsewhere) and
 * skips empty values to keep the preview tight.
 */
function summariseProperties(
    properties: Record<string, NotionPageProperty>,
    titleKey: string | null,
    statusKey: string | null,
): string {
    const lines: string[] = [];
    for (const [key, prop] of Object.entries(properties)) {
        if (key === titleKey || key === statusKey) continue;
        const value = stringifyProperty(prop);
        if (!value) continue;
        lines.push(`${key}: ${value}`);
        if (lines.length >= 4) break; // keep cards readable
    }
    return lines.join('\n');
}

function stringifyProperty(prop: NotionPageProperty | undefined): string {
    if (!prop) return '';
    switch (prop.type) {
        case 'rich_text':
            return joinRichText(prop.rich_text);
        case 'select':
            return prop.select?.name ?? '';
        case 'status':
            return prop.status?.name ?? '';
        case 'multi_select':
            return (prop.multi_select ?? [])
                .map((m) => m?.name)
                .filter(Boolean)
                .join(', ');
        case 'number':
            return prop.number != null ? String(prop.number) : '';
        case 'checkbox':
            return prop.checkbox ? '✓' : '';
        case 'date':
            return prop.date?.start ?? '';
        case 'url':
            return prop.url ?? '';
        default:
            return '';
    }
}
