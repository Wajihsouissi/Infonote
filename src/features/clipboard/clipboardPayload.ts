import { v4 as uuidv4 } from 'uuid';
import type { Block, BlockMetadata } from '../editor/types';
import { normalizeTableRows } from '../editor/pasteUtils';

/**
 * The clipboard format.
 *
 * Copying inside this app used to write a flattened line of text, so anything
 * with structure — headings, lists, checkboxes, images, tables — came back as
 * a paragraph. The fix is to put TWO things on the clipboard at once:
 *
 *   text/plain  a readable rendering, for other programs
 *   text/html   the same content as HTML, carrying the real block JSON in a
 *               `data-` attribute so pasting back into this app is lossless
 *
 * The JSON rides inside text/html because browsers only let a page put
 * arbitrary MIME types on the clipboard during a real copy/cut event, and
 * text/html survives a round trip through nearly every app. Anything that
 * strips the attribute simply falls back to the visible HTML, which is still
 * a faithful rendering — never a wall of raw data.
 */

export const PAYLOAD_ATTR = 'data-chnkit-clipboard';

export interface BlocksPayload {
    v: 1;
    kind: 'blocks';
    blocks: Block[];
}

export interface ClipboardNode {
    type: string;
    /** Position relative to the top-left of the copied selection. */
    dx: number;
    dy: number;
    width?: number;
    height?: number;
    data: Record<string, unknown>;
    /** Index into the payload's own node list, used to rebuild edges. */
    ref: number;
}

export interface ClipboardEdge {
    /** Indices into `nodes`, so a paste can rewire without knowing new ids. */
    source: number;
    target: number;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    data?: Record<string, unknown>;
}

export interface NodesPayload {
    v: 1;
    kind: 'nodes';
    nodes: ClipboardNode[];
    edges: ClipboardEdge[];
}

export type ClipboardPayload = BlocksPayload | NodesPayload;

/* ------------------------------------------------------------------ cloning */

const METADATA_BLOCK_LISTS = ['items', 'blocks', 'content'] as const;

/**
 * Copy blocks with brand-new ids, all the way down.
 *
 * Nested content lives in metadata (gallery items, toggle/container children,
 * per-column blocks). Cloning only the top level leaves those sharing ids with
 * the original, so editing the copy edits the original too.
 */
export function cloneBlocks(blocks: Block[]): Block[] {
    return blocks.map((block) => {
        const metadata = block.metadata ? cloneMetadata(block.metadata) : undefined;
        return { ...block, id: uuidv4(), ...(metadata ? { metadata } : {}) };
    });
}

function cloneMetadata(metadata: BlockMetadata): BlockMetadata {
    const next: BlockMetadata = { ...metadata };

    for (const key of METADATA_BLOCK_LISTS) {
        const list = next[key];
        if (Array.isArray(list) && list.length > 0 && isBlockLike(list[0])) {
            next[key] = cloneBlocks(list as Block[]);
        }
    }

    if (Array.isArray(next.columns)) {
        next.columns = next.columns.map((column) => ({
            ...column,
            id: uuidv4(),
            content: Array.isArray(column?.content) ? cloneBlocks(column.content) : [],
        }));
    }

    return next;
}

function isBlockLike(value: unknown): value is Block {
    return !!value && typeof value === 'object' && 'type' in (value as object) && 'id' in (value as object);
}

/* ------------------------------------------------------------- text render */

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Strip the inline markdown markers so plain text reads cleanly. */
const stripInline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');

/** A short stand-in for media, so plain text never becomes a wall of base64. */
function mediaLabel(block: Block): string {
    const name = typeof block.metadata?.name === 'string' ? block.metadata.name : '';
    const kind = block.type === 'image' ? 'Image' : block.type === 'video' ? 'Video' : 'File';
    if (name) return `[${kind}: ${name}]`;
    const content = block.content || '';
    // A data URL is meaningless to a human; a real URL is worth keeping.
    return content.startsWith('data:') || !content ? `[${kind}]` : `[${kind}: ${content}]`;
}

/**
 * Render blocks the way a person would want them pasted into a text editor.
 * Numbering restarts per run of consecutive numbered items, which is why this
 * walks the list rather than mapping each block independently.
 */
export function blocksToPlainText(blocks: Block[]): string {
    const lines: string[] = [];
    let ordinal = 0;

    for (const block of blocks) {
        if (block.type !== 'numbered') ordinal = 0;
        const indent = '  '.repeat(block.indent || 0);
        const text = stripInline(block.content || '');

        switch (block.type) {
            case 'heading1':
                lines.push(`${indent}# ${text}`);
                break;
            case 'heading2':
                lines.push(`${indent}## ${text}`);
                break;
            case 'heading3':
                lines.push(`${indent}### ${text}`);
                break;
            case 'bullet':
                lines.push(`${indent}- ${text}`);
                break;
            case 'numbered':
                ordinal += 1;
                lines.push(`${indent}${ordinal}. ${text}`);
                break;
            case 'todo':
                lines.push(`${indent}[${block.metadata?.checked ? 'x' : ' '}] ${text}`);
                break;
            case 'toggle':
                lines.push(`${indent}> ${text}`);
                break;
            case 'quote':
                lines.push(`${indent}> ${text}`);
                break;
            case 'callout':
                lines.push(`${indent}> ${text}`);
                break;
            case 'code':
                lines.push(`${indent}\`\`\``, text, `${indent}\`\`\``);
                break;
            case 'divider':
                lines.push(`${indent}---`);
                break;
            case 'link':
                lines.push(`${indent}${block.metadata?.title ? `${block.metadata.title}: ` : ''}${block.content || ''}`);
                break;
            case 'image':
            case 'video':
            case 'file':
            case 'media':
                lines.push(`${indent}${mediaLabel(block)}`);
                break;
            case 'gallery': {
                const items = Array.isArray(block.metadata?.items) ? (block.metadata.items as Block[]) : [];
                lines.push(`${indent}${text || '[Gallery]'}`);
                for (const item of items) lines.push(`${indent}  ${mediaLabel(item)}`);
                break;
            }
            case 'table': {
                const rows = normalizeTableRows(Array.isArray(block.metadata?.rows) ? (block.metadata.rows as string[][]) : []);
                for (const row of rows) lines.push(`${indent}${row.join('\t')}`);
                break;
            }
            case 'columns': {
                const columns = Array.isArray(block.metadata?.columns) ? block.metadata.columns : [];
                for (const column of columns) {
                    if (Array.isArray(column?.content)) lines.push(blocksToPlainText(column.content));
                }
                break;
            }
            default:
                lines.push(`${indent}${text}`);
        }
    }

    return lines.join('\n');
}

/** A faithful HTML rendering, so other rich editors receive real structure. */
export function blocksToHtml(blocks: Block[]): string {
    const parts: string[] = [];
    let openList: 'ul' | 'ol' | null = null;

    const closeList = () => {
        if (openList) {
            parts.push(`</${openList}>`);
            openList = null;
        }
    };
    const openListAs = (tag: 'ul' | 'ol') => {
        if (openList !== tag) {
            closeList();
            parts.push(`<${tag}>`);
            openList = tag;
        }
    };

    for (const block of blocks) {
        const text = escapeHtml(stripInline(block.content || ''));
        switch (block.type) {
            case 'heading1':
                closeList();
                parts.push(`<h1>${text}</h1>`);
                break;
            case 'heading2':
                closeList();
                parts.push(`<h2>${text}</h2>`);
                break;
            case 'heading3':
                closeList();
                parts.push(`<h3>${text}</h3>`);
                break;
            case 'bullet':
                openListAs('ul');
                parts.push(`<li>${text}</li>`);
                break;
            case 'numbered':
                openListAs('ol');
                parts.push(`<li>${text}</li>`);
                break;
            case 'todo':
                openListAs('ul');
                parts.push(`<li>[${block.metadata?.checked ? 'x' : ' '}] ${text}</li>`);
                break;
            case 'quote':
            case 'callout':
            case 'toggle':
                closeList();
                parts.push(`<blockquote>${text}</blockquote>`);
                break;
            case 'code':
                closeList();
                parts.push(`<pre><code>${text}</code></pre>`);
                break;
            case 'divider':
                closeList();
                parts.push('<hr />');
                break;
            case 'image':
                closeList();
                parts.push(`<img src="${escapeHtml(block.content || '')}" alt="${escapeHtml(String(block.metadata?.name || 'image'))}" />`);
                break;
            case 'link':
                closeList();
                parts.push(`<p><a href="${escapeHtml(block.content || '')}">${escapeHtml(String(block.metadata?.title || block.content || ''))}</a></p>`);
                break;
            case 'table': {
                closeList();
                const rows = normalizeTableRows(Array.isArray(block.metadata?.rows) ? (block.metadata.rows as string[][]) : []);
                parts.push(
                    `<table>${rows
                        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '')}</td>`).join('')}</tr>`)
                        .join('')}</table>`,
                );
                break;
            }
            default:
                closeList();
                parts.push(`<p>${text}</p>`);
        }
    }
    closeList();
    return parts.join('');
}

/* -------------------------------------------------------- encode / decode */

/** base64 that survives non-Latin text, which plain btoa does not. */
function encodeJson(value: unknown): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
}

function decodeJson<T>(encoded: string): T | null {
    try {
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
        return null;
    }
}

/** Build the text/plain + text/html pair to hand to a copy or cut event. */
export function encodePayload(payload: ClipboardPayload, plainText: string, innerHtml: string) {
    const carrier = `<span ${PAYLOAD_ATTR}="${encodeJson(payload)}"></span>`;
    return {
        text: plainText,
        // The carrier sits inside the wrapper so the visible rendering is
        // unaffected wherever this lands.
        html: `<div ${PAYLOAD_ATTR}-root="1">${carrier}${innerHtml}</div>`,
    };
}

/** Pull our payload back out of pasted HTML, or null if this came from elsewhere. */
export function decodePayload(html: string | undefined | null): ClipboardPayload | null {
    if (!html || !html.includes(PAYLOAD_ATTR)) return null;
    const match = new RegExp(`${PAYLOAD_ATTR}="([^"]+)"`).exec(html);
    if (!match) return null;
    const payload = decodeJson<ClipboardPayload>(match[1]);
    if (!payload || payload.v !== 1) return null;
    if (payload.kind === 'blocks' && Array.isArray(payload.blocks)) return payload;
    if (payload.kind === 'nodes' && Array.isArray(payload.nodes)) return payload;
    return null;
}

/** Convenience: the blocks a payload carries, cloned and ready to insert. */
export function payloadBlocks(payload: ClipboardPayload): Block[] | null {
    return payload.kind === 'blocks' ? cloneBlocks(payload.blocks) : null;
}
