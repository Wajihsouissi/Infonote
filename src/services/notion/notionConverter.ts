/**
 * Translate Notion page/database responses into real Infonote canvas nodes.
 *
 * Page imports preserve nested Notion block content by recursively walking
 * child blocks fetched by the Notion API proxy. This keeps headings, body
 * paragraphs, list items, toggles, code blocks, quotes, links, and nested
 * column content in reading order instead of importing only section titles.
 */
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';

export interface NotionRichText {
    plain_text?: string;
    text?: { content?: string };
}

export interface NotionBlockBase {
    id: string;
    type: string;
    has_children?: boolean;
    children?: NotionBlock[];
    children_fetch_error?: string;
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

export interface NotionConvertOptions {
    offset?: { x: number; y: number };
    keepSourceIds?: boolean;
}

export interface NotionConvertResult {
    nodes: AppNode[];
    skipped: number;
}

type CanvasTextBlock = {
    id: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
};

const DEFAULT_OFFSET = { x: 80, y: 80 };

const PAGE_CARD_WIDTH = 420;
const PAGE_CARD_MIN_HEIGHT = 220;
const PAGE_GAP_Y = 40;
const LINE_HEIGHT_ESTIMATE = 26;

const KANBAN_COLUMN_WIDTH = 320;
const KANBAN_COLUMN_GAP = 40;
const KANBAN_CARD_HEIGHT = 140;
const KANBAN_CARD_GAP_Y = 24;
const KANBAN_HEADER_HEIGHT = 60;

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
        bodyBlocks: CanvasTextBlock[];
    }

    const groups: Group[] = [];
    let current: Group = {
        heading: 'Untitled',
        sourceId: blocks[0]?.id ?? uuidv4(),
        bodyBlocks: [],
    };
    let skipped = 0;

    const flush = () => {
        if (current.bodyBlocks.length > 0 || current.heading !== 'Untitled') {
            groups.push(current);
        }
    };

    for (const block of blocks) {
        if (isHeading(block.type)) {
            flush();
            current = {
                heading: extractRichText(block, block.type) || 'Section',
                sourceId: block.id,
                bodyBlocks: [],
            };

            const nested = notionChildrenToCanvasBlocks(block, 0);
            current.bodyBlocks.push(...nested.blocks);
            skipped += nested.skipped;
            continue;
        }

        const converted = notionBlockToCanvasBlocks(block, 0);
        current.bodyBlocks.push(...converted.blocks);
        skipped += converted.skipped;
    }
    flush();

    const nodes: AppNode[] = [];
    let y = offset.y;

    for (const group of groups) {
        const bodyText = group.bodyBlocks.map((block) => block.content).join('\n');
        const cardHeight = Math.max(
            PAGE_CARD_MIN_HEIGHT,
            120 + group.bodyBlocks.length * LINE_HEIGHT_ESTIMATE,
        );
        const data: Record<string, unknown> = {
            label: group.heading.slice(0, 80),
            type: 'text',
            content: group.bodyBlocks.length > 0
                ? group.bodyBlocks
                : [{ id: uuidv4(), type: 'text', content: '' }],
            description: bodyText,
        };

        if (keepSourceIds) {
            data._notionSourceId = group.sourceId;
            data._notionType = 'page_section';
        }

        nodes.push({
            id: uuidv4(),
            type: 'note',
            position: { x: offset.x, y },
            data,
            style: { width: PAGE_CARD_WIDTH, height: cardHeight },
        } as AppNode);

        y += cardHeight + PAGE_GAP_Y;
    }

    return { nodes, skipped };
}

function notionChildrenToCanvasBlocks(
    block: NotionBlock,
    depth: number,
): { blocks: CanvasTextBlock[]; skipped: number } {
    const blocks: CanvasTextBlock[] = [];
    let skipped = 0;

    if (Array.isArray(block.children)) {
        for (const child of block.children) {
            const converted = notionBlockToCanvasBlocks(child, depth);
            blocks.push(...converted.blocks);
            skipped += converted.skipped;
        }
    } else if (block.has_children || block.children_fetch_error) {
        skipped += 1;
    }

    return { blocks, skipped };
}

function notionBlockToCanvasBlocks(
    block: NotionBlock,
    depth: number,
): { blocks: CanvasTextBlock[]; skipped: number } {
    const blocks: CanvasTextBlock[] = [];
    let skipped = 0;

    const ownBlock = blockToCanvasTextBlock(block, depth);
    if (ownBlock) {
        blocks.push(ownBlock);
    }

    if (Array.isArray(block.children)) {
        for (const child of block.children) {
            const converted = notionBlockToCanvasBlocks(child, depth + 1);
            blocks.push(...converted.blocks);
            skipped += converted.skipped;
        }
    } else if (block.has_children || block.children_fetch_error) {
        skipped += 1;
    }

    if (!ownBlock && blocks.length === 0 && !isStructuralContainer(block.type)) {
        skipped += 1;
    }

    return { blocks, skipped };
}

function blockToCanvasTextBlock(block: NotionBlock, depth: number): CanvasTextBlock | null {
    const type = block.type;
    const inner = (block as Record<string, unknown>)[type] as
        | {
            rich_text?: NotionRichText[];
            checked?: boolean;
            language?: string;
            caption?: NotionRichText[];
            title?: string;
            url?: string;
            external?: { url?: string };
            file?: { url?: string };
        }
        | undefined;

    const text = joinRichText(inner?.rich_text);
    const indent = depth > 0 ? '  '.repeat(Math.min(depth, 6)) : '';

    switch (type) {
        case 'paragraph':
            return text ? textBlock(`${indent}${text}`) : null;
        case 'heading_1':
            return text ? textBlock(`${indent}${text}`, 'heading1') : null;
        case 'heading_2':
            return text ? textBlock(`${indent}${text}`, 'heading2') : null;
        case 'heading_3':
            return text ? textBlock(`${indent}${text}`, 'heading3') : null;
        case 'bulleted_list_item':
            return text ? textBlock(`${indent}- ${text}`) : null;
        case 'numbered_list_item':
            return text ? textBlock(`${indent}1. ${text}`) : null;
        case 'to_do':
            return textBlock(`${indent}${inner?.checked ? '[x]' : '[ ]'} ${text}`.trimEnd());
        case 'quote':
            return text ? textBlock(`${indent}> ${text}`, 'quote') : null;
        case 'code':
            return text
                ? textBlock(text, 'code', { language: inner?.language ?? 'plain text' })
                : null;
        case 'callout':
        case 'toggle':
            return text ? textBlock(`${indent}${text}`) : null;
        case 'divider':
            return textBlock(`${indent}---`, 'divider');
        case 'child_page':
            return textBlock(`${indent}${inner?.title ?? 'Child page'}`, 'heading3');
        case 'bookmark':
        case 'embed':
        case 'link_preview': {
            const url = inner?.url;
            return url ? textBlock(`${indent}${url}`, 'link') : null;
        }
        case 'image': {
            const caption = joinRichText(inner?.caption);
            const url = inner?.external?.url ?? inner?.file?.url;
            if (!url && !caption) return null;
            return textBlock(url ?? caption, url ? 'image' : 'text', caption ? { caption } : undefined);
        }
        default:
            return null;
    }
}

function textBlock(
    content: string,
    type = 'text',
    metadata?: Record<string, unknown>,
): CanvasTextBlock {
    return {
        id: uuidv4(),
        type,
        content,
        ...(metadata ? { metadata } : {}),
    };
}

function isHeading(type: string): boolean {
    return type === 'heading_1' || type === 'heading_2' || type === 'heading_3';
}

function isStructuralContainer(type: string): boolean {
    return [
        'column_list',
        'column',
        'synced_block',
        'table',
        'table_row',
        'breadcrumb',
        'unsupported',
    ].includes(type);
}

function extractRichText(block: NotionBlock, key: string): string {
    const inner = (block as Record<string, unknown>)[key] as
        | { rich_text?: NotionRichText[] }
        | undefined;
    return joinRichText(inner?.rich_text);
}

function joinRichText(rich: NotionRichText[] | undefined): string {
    if (!Array.isArray(rich)) return '';
    return rich
        .map((r) => r.plain_text ?? r.text?.content ?? '')
        .join('')
        .trim();
}

export function convertNotionDatabaseToCanvasNodes(
    pages: NotionPage[],
    options: NotionConvertOptions = {},
): NotionConvertResult {
    const offset = options.offset ?? DEFAULT_OFFSET;
    const keepSourceIds = options.keepSourceIds !== false;

    if (!Array.isArray(pages) || pages.length === 0) {
        return { nodes: [], skipped: 0 };
    }

    const statusKey = findStatusKey(pages);
    const titleKey = findTitleKey(pages);
    const buckets = new Map<string, NotionPage[]>();

    for (const page of pages) {
        const status = statusKey ? readStatusName(page.properties[statusKey]) : 'All';
        const key = status || 'No status';
        const bucket = buckets.get(key) ?? [];
        bucket.push(page);
        buckets.set(key, bucket);
    }

    const nodes: AppNode[] = [];
    let columnIndex = 0;

    for (const [status, columnPages] of buckets.entries()) {
        const colX = offset.x + columnIndex * (KANBAN_COLUMN_WIDTH + KANBAN_COLUMN_GAP);

        nodes.push({
            id: uuidv4(),
            type: 'note',
            position: { x: colX, y: offset.y },
            data: {
                label: status,
                type: 'text',
                content: [{ id: uuidv4(), type: 'text', content: `${columnPages.length} task${columnPages.length === 1 ? '' : 's'}` }],
                ...(keepSourceIds ? { _notionType: 'database_column' } : {}),
            },
            style: { width: KANBAN_COLUMN_WIDTH, height: KANBAN_HEADER_HEIGHT },
        } as AppNode);

        columnPages.forEach((page, rowIndex) => {
            const title = titleKey ? readTitleText(page.properties[titleKey]) : '';
            const summary = summariseProperties(page.properties, titleKey, statusKey);
            const data: Record<string, unknown> = {
                label: (title && title.trim()) || `Task - ${page.id.slice(0, 6)}`,
                type: 'task',
                content: summary
                    ? summary.split('\n').map((line) => textBlock(line))
                    : [{ id: uuidv4(), type: 'text', content: '' }],
                description: summary,
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

    return { nodes, skipped: 0 };
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
        if (lines.length >= 8) break;
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
            return prop.checkbox ? 'checked' : '';
        case 'date':
            return prop.date?.start ?? '';
        case 'url':
            return prop.url ?? '';
        default:
            return '';
    }
}
