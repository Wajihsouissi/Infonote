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
    icon?: any;
    cover?: any;
}

export interface NotionConvertOptions {
    offset?: { x: number; y: number };
    keepSourceIds?: boolean;
    pageMeta?: NotionPage;
    forcedNodeId?: string;
}

export interface NotionConvertResult {
    nodes: AppNode[];
    skipped: number;
    childPages: ChildNodeMapping[];
}

type CanvasTextBlock = {
    id: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
};

import { MIN_EXPANDED_SIZE, MEDIUM_SIZE, snapToGrid } from '../../config/layout';

const DEFAULT_OFFSET = { x: 80, y: 80 };

const PAGE_CARD_WIDTH = MIN_EXPANDED_SIZE; // 8x8
const PAGE_CARD_MIN_HEIGHT = MIN_EXPANDED_SIZE; // 8x8
const PAGE_GAP_Y = 40;
const LINE_HEIGHT_ESTIMATE = 26;

const KANBAN_COLUMN_WIDTH = MIN_EXPANDED_SIZE; // 8 units
const KANBAN_COLUMN_GAP = 40;
const KANBAN_CARD_WIDTH = MEDIUM_SIZE; // 4x4
const KANBAN_CARD_HEIGHT = MEDIUM_SIZE; // 4x4
const KANBAN_CARD_GAP_Y = 24;
const KANBAN_HEADER_HEIGHT = 60;

export interface ChildNodeMapping {
    notionId: string;
    canvasNodeId: string;
    kind: 'page' | 'database';
}

export function convertNotionPageToCanvasNodes(
    blocks: NotionBlock[],
    options: NotionConvertOptions = {},
): { nodes: AppNode[]; skipped: number; childPages: ChildNodeMapping[] } {
    const offset = options.offset ?? DEFAULT_OFFSET;
    const keepSourceIds = options.keepSourceIds !== false;
    const childPages: ChildNodeMapping[] = [];

    if (!Array.isArray(blocks) || blocks.length === 0) {
        if (!options.pageMeta) {
            return { nodes: [], skipped: 0, childPages: [] };
        }
    }

    let skipped = 0;
    const bodyBlocks: CanvasTextBlock[] = [];

    for (const block of blocks) {
        const converted = notionBlockToCanvasBlocks(block, 0, childPages);
        bodyBlocks.push(...converted.blocks);
        skipped += converted.skipped;
    }

    // Determine metadata from pageMeta if provided
    let label = 'Untitled';
    let icon = undefined;
    let coverImage = undefined;
    let description = '';
    let mappedProperties: Record<string, unknown> = {};
    
    if (options.pageMeta) {
        const titleProp = findTitleKey([options.pageMeta]);
        if (titleProp && options.pageMeta.properties) {
            label = readTitleText(options.pageMeta.properties[titleProp]) || label;
        }
        description = summariseProperties(options.pageMeta.properties || {}, titleProp, null);
        
        for (const [key, prop] of Object.entries(options.pageMeta.properties || {})) {
            if (key === titleProp || !prop) continue;
            
            const lowerKey = key.toLowerCase();
            const valStr = stringifyProperty(prop).toLowerCase();
            
            if (prop.type === 'status' || lowerKey.includes('status')) {
                if (valStr.includes('progress')) mappedProperties.status = 'in-progress';
                else if (valStr.includes('review')) mappedProperties.status = 'review';
                else if (valStr.includes('done') || valStr.includes('complete')) mappedProperties.status = 'done';
                else mappedProperties.status = 'todo';
            }
            else if (lowerKey.includes('priority')) {
                if (valStr.includes('high')) mappedProperties.priority = 'high';
                else if (valStr.includes('urgent')) mappedProperties.priority = 'urgent';
                else if (valStr.includes('low')) mappedProperties.priority = 'low';
                else mappedProperties.priority = 'medium';
            }
            else if (prop.type === 'date' && prop.date?.start) {
                mappedProperties.dueDate = prop.date.start;
            }
            else if (prop.type === 'url' && prop.url) {
                mappedProperties.url = prop.url;
            }
            else if (prop.type === 'number' && lowerKey.includes('progress')) {
                mappedProperties.progress = prop.number;
            }
        }

        if (options.pageMeta.icon) {
            // Notion icon can be emoji or external/file url
            if (options.pageMeta.icon.type === 'emoji') icon = options.pageMeta.icon.emoji;
            else if (options.pageMeta.icon.type === 'external') icon = options.pageMeta.icon.external?.url;
            else if (options.pageMeta.icon.type === 'file') icon = options.pageMeta.icon.file?.url;
        }
        if (options.pageMeta.cover) {
            if (options.pageMeta.cover.type === 'external') coverImage = options.pageMeta.cover.external?.url;
            else if (options.pageMeta.cover.type === 'file') coverImage = options.pageMeta.cover.file?.url;
        }
    }

    const bodyText = bodyBlocks.map((block) => block.content).join('\n');
    
    // Strict 8x8 size. The internal .noteArea will scroll if content exceeds this.
    const cardHeight = PAGE_CARD_MIN_HEIGHT;
    
    const data: Record<string, unknown> = {
        label: label.slice(0, 80),
        type: 'text',
        viewMode: 'expanded',
        content: bodyBlocks.length > 0
            ? bodyBlocks
            : [{ id: uuidv4(), type: 'text', content: '' }],
        rawText: bodyText,
        description,
        ...mappedProperties,
        showMetadata: false, // Default hidden for imported pages
        ...(icon ? { icon } : {}),
        ...(coverImage ? { coverImage } : {}),
    };

    if (keepSourceIds) {
        data._notionSourceId = options.pageMeta?.id || (blocks[0]?.id ?? uuidv4());
        data._notionType = 'page';
    }

    const nodes: AppNode[] = [{
        id: options.forcedNodeId ?? uuidv4(),
        type: 'note',
        position: { x: offset.x, y: offset.y },
        data,
        style: { width: PAGE_CARD_WIDTH, height: cardHeight },
    } as AppNode];

    return { nodes, skipped, childPages };
}

function notionChildrenToCanvasBlocks(
    block: NotionBlock,
    depth: number,
    childPages: ChildNodeMapping[]
): { blocks: CanvasTextBlock[]; skipped: number } {
    const blocks: CanvasTextBlock[] = [];
    let skipped = 0;

    if (Array.isArray(block.children)) {
        for (const child of block.children) {
            const converted = notionBlockToCanvasBlocks(child, depth, childPages);
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
    childPages: ChildNodeMapping[]
): { blocks: CanvasTextBlock[]; skipped: number } {
    const blocks: CanvasTextBlock[] = [];
    let skipped = 0;

    const ownBlock = blockToCanvasTextBlock(block, depth, childPages);
    if (ownBlock) {
        blocks.push(ownBlock);
    }

    if (Array.isArray(block.children)) {
        for (const child of block.children) {
            // Notion's indent behavior: child blocks inside a parent block (like a bullet) are indented
            const converted = notionBlockToCanvasBlocks(child, depth + 1, childPages);
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

function blockToCanvasTextBlock(block: NotionBlock, depth: number, childPages: ChildNodeMapping[]): CanvasTextBlock | null {
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

    switch (type) {
        case 'paragraph':
            return text ? textBlock(text, 'text', { indent: depth }) : null;
        case 'heading_1':
            return text ? textBlock(text, 'heading1', { indent: depth }) : null;
        case 'heading_2':
            return text ? textBlock(text, 'heading2', { indent: depth }) : null;
        case 'heading_3':
            return text ? textBlock(text, 'heading3', { indent: depth }) : null;
        case 'bulleted_list_item':
            return textBlock(text, 'bullet', { indent: depth });
        case 'numbered_list_item':
            return textBlock(text, 'numbered', { indent: depth });
        case 'to_do':
            return textBlock(text, 'todo', { indent: depth, metadata: { checked: inner?.checked } });
        case 'toggle':
            return textBlock(text, 'toggle', { indent: depth, metadata: { isCollapsed: true } });
        case 'quote':
            return textBlock(text, 'quote', { indent: depth });
        case 'code':
            return text
                ? textBlock(text, 'code', { indent: depth, metadata: { language: inner?.language ?? 'plain text' } })
                : null;
        case 'callout':
            return textBlock(text, 'callout', { indent: depth });
        case 'divider':
            return textBlock('', 'divider', { indent: depth });
        case 'child_page':
        case 'child_database': {
            const canvasNodeId = uuidv4();
            childPages.push({ notionId: block.id, canvasNodeId, kind: type === 'child_database' ? 'database' : 'page' });
            return textBlock(inner?.title ?? (type === 'child_database' ? 'Child database' : 'Child page'), 'page', { indent: depth, metadata: { pageId: block.id, nodeId: canvasNodeId } });
        }
        case 'link_to_page':
            return textBlock('Linked page', 'page', { indent: depth, metadata: { pageId: (inner as any)?.page_id } });
        case 'bookmark':
        case 'embed':
        case 'link_preview': {
            const url = inner?.url;
            return url ? textBlock(url, 'link', { indent: depth }) : null;
        }
        case 'image': {
            const caption = joinRichText(inner?.caption);
            const url = inner?.external?.url ?? inner?.file?.url;
            if (!url && !caption) return null;
            return textBlock(url ?? caption, url ? 'image' : 'text', { indent: depth, metadata: caption ? { caption } : undefined });
        }
        default:
            return null;
    }
}

function textBlock(
    content: string,
    type = 'text',
    options?: { indent?: number, metadata?: Record<string, unknown> }
): CanvasTextBlock {
    return {
        id: uuidv4(),
        type,
        content,
        ...(options?.indent ? { indent: options.indent } : {}),
        ...(options?.metadata ? { metadata: options.metadata } : {}),
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
        return { nodes: [], skipped: 0, childPages: [] };
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
    let isFirstNode = true;

    for (const [status, columnPages] of buckets.entries()) {
        const colX = offset.x + columnIndex * (KANBAN_COLUMN_WIDTH + KANBAN_COLUMN_GAP);

        nodes.push({
            id: isFirstNode && options.forcedNodeId ? options.forcedNodeId : uuidv4(),
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
        
        isFirstNode = false;

        columnPages.forEach((page, rowIndex) => {
            const title = titleKey && page.properties ? readTitleText(page.properties[titleKey]) : '';
            const summary = summariseProperties(page.properties || {}, titleKey, statusKey);
            const data: Record<string, unknown> = {
                label: (title && title.trim()) || `Task - ${page.id.slice(0, 6)}`,
                type: 'task',
                viewMode: 'medium',
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
                    x: colX + (KANBAN_COLUMN_WIDTH - KANBAN_CARD_WIDTH) / 2, // center the card in the column
                    y:
                        offset.y +
                        KANBAN_HEADER_HEIGHT +
                        KANBAN_CARD_GAP_Y +
                        rowIndex * (KANBAN_CARD_HEIGHT + KANBAN_CARD_GAP_Y),
                },
                data,
                style: { width: KANBAN_CARD_WIDTH, height: KANBAN_CARD_HEIGHT },
            } as AppNode);
        });

        columnIndex += 1;
    }

    return { nodes, skipped: 0, childPages: [] };
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
        if (key === titleKey || key === statusKey || !prop) continue;
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
