/**
 * figmaConverter — translate a Figma REST API "file" payload into our
 * canvas AppNode shape so the result renders as editable cards on the
 * infinite canvas.
 *
 * Input:  result of GET https://api.figma.com/v1/files/:file_key
 *         (i.e. the full layout tree DOCUMENT -> CANVAS -> FRAME/...)
 * Output: { nodes: AppNode[] } ready to be persisted with
 *         appendCanvasNodesToCloud() and rendered by React Flow.
 *
 * Design notes:
 * - Every Figma node id is rewritten to a fresh uuid so multiple imports
 *   of the same file (or different files) never collide on our composite
 *   PRIMARY KEY (user_id, id).
 * - Parent/child hierarchy is preserved via AppNode.parentId.
 * - Coordinates use absoluteBoundingBox when available (the only field
 *   that holds true page-space x/y). React Flow uses the same axis
 *   convention (top-left origin), so we pass it through verbatim.
 * - We are deliberately conservative: anything we don't recognise is
 *   skipped (rather than rendered as a broken block).
 */
import { v4 as uuidv4 } from 'uuid';
import type { AppNode } from '../../types';

// ───── Figma API types (only the fields we read) ─────────────────────────

export interface FigmaColor {
    r: number; // 0..1
    g: number; // 0..1
    b: number; // 0..1
    a?: number; // 0..1
}

export interface FigmaPaint {
    type: string; // 'SOLID' | 'GRADIENT_LINEAR' | 'IMAGE' | ...
    visible?: boolean;
    color?: FigmaColor;
    opacity?: number;
}

export interface FigmaBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FigmaTextStyle {
    fontFamily?: string;
    fontPostScriptName?: string;
    fontWeight?: number;
    fontSize?: number;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    lineHeightPx?: number;
    letterSpacing?: number;
}

export interface FigmaNode {
    id: string;
    name?: string;
    type: string; // 'DOCUMENT' | 'CANVAS' | 'FRAME' | 'GROUP' | 'TEXT' | 'RECTANGLE' | 'VECTOR' | ...
    visible?: boolean;
    children?: FigmaNode[];
    absoluteBoundingBox?: FigmaBoundingBox | null;
    fills?: FigmaPaint[];
    backgroundColor?: FigmaColor;
    characters?: string; // TEXT only
    style?: FigmaTextStyle; // TEXT only
}

export interface FigmaFile {
    name?: string;
    document: FigmaNode;
}

// ───── Conversion ────────────────────────────────────────────────────────

export interface FigmaConvertOptions {
    /**
     * Optional translation applied to every node so an imported tree can
     * land at a chosen location instead of overlapping existing canvas
     * content. Defaults to (0, 0) — coordinates pass through verbatim.
     */
    offset?: { x: number; y: number };
    /**
     * If true, attach the original Figma id under data._figmaSourceId on
     * every produced node. Useful for debugging or future re-import.
     * Default: true.
     */
    keepSourceIds?: boolean;
}

export interface FigmaConvertResult {
    nodes: AppNode[];
    /** Map from original Figma id -> our newly-minted AppNode id. */
    idMap: Record<string, string>;
    /** Number of unsupported Figma node types skipped during conversion. */
    skipped: number;
}

/**
 * Walk the Figma file tree and produce a flat array of AppNode objects.
 *
 * The order of operations is:
 *   1. Recurse top-down so parents are emitted before children (keeps the
 *      visual stacking sane when React Flow renders the result).
 *   2. For each FRAME/GROUP we emit a `block` container; for TEXT a `note`
 *      with the literal characters; for RECTANGLE/VECTOR a coloured `note`
 *      tile that mirrors the original fill.
 *   3. Anything else (SLICE, BOOLEAN_OPERATION, ...) is skipped — counted
 *      in `skipped` so callers can surface a "5 elements not supported"
 *      message in the UI.
 */
export function convertFigmaToCanvasNodes(
    file: FigmaFile,
    options: FigmaConvertOptions = {},
): FigmaConvertResult {
    const offset = options.offset ?? { x: 0, y: 0 };
    const keepSourceIds = options.keepSourceIds !== false;

    if (!file || !file.document) {
        return { nodes: [], idMap: {}, skipped: 0 };
    }

    const out: AppNode[] = [];
    const idMap: Record<string, string> = {};
    let skipped = 0;

    function visit(figmaNode: FigmaNode, parentId: string | null): void {
        if (figmaNode.visible === false) return; // Honour Figma "hidden" flag

        // DOCUMENT and CANVAS are abstract containers in Figma — they do
        // not render. Skip them but recurse into their children.
        if (figmaNode.type === 'DOCUMENT' || figmaNode.type === 'CANVAS') {
            for (const child of figmaNode.children ?? []) {
                visit(child, parentId);
            }
            return;
        }

        const ourId = uuidv4();
        idMap[figmaNode.id] = ourId;

        const built = buildAppNode(figmaNode, ourId, parentId, offset, keepSourceIds);
        if (!built) {
            skipped += 1;
            // Even though we are not rendering this node, descend into its
            // children — useful for GROUPs nested in unsupported types.
            for (const child of figmaNode.children ?? []) {
                visit(child, parentId);
            }
            return;
        }
        out.push(built);

        // FRAME and GROUP are containers — recurse with the new id as parent.
        const isContainer =
            figmaNode.type === 'FRAME' ||
            figmaNode.type === 'GROUP' ||
            figmaNode.type === 'COMPONENT' ||
            figmaNode.type === 'COMPONENT_SET' ||
            figmaNode.type === 'INSTANCE' ||
            figmaNode.type === 'SECTION';

        if (isContainer && Array.isArray(figmaNode.children)) {
            for (const child of figmaNode.children) {
                visit(child, ourId);
            }
        }
    }

    visit(file.document, null);
    return { nodes: out, idMap, skipped };
}

// ───── Node builders ─────────────────────────────────────────────────────

function buildAppNode(
    fig: FigmaNode,
    ourId: string,
    parentId: string | null,
    offset: { x: number; y: number },
    keepSourceIds: boolean,
): AppNode | null {
    const box = fig.absoluteBoundingBox;
    const x = (box?.x ?? 0) + offset.x;
    const y = (box?.y ?? 0) + offset.y;
    const width = box?.width;
    const height = box?.height;

    const baseStyle: Record<string, unknown> = {};
    if (typeof width === 'number') baseStyle.width = Math.max(1, Math.round(width));
    if (typeof height === 'number') baseStyle.height = Math.max(1, Math.round(height));

    const sourceMeta = keepSourceIds
        ? { _figmaSourceId: fig.id, _figmaType: fig.type }
        : {};

    switch (fig.type) {
        case 'FRAME':
        case 'GROUP':
        case 'COMPONENT':
        case 'COMPONENT_SET':
        case 'INSTANCE':
        case 'SECTION': {
            // Container — backdrop colour from the first solid fill or
            // backgroundColor (older API field).
            const bg =
                paintToHex(firstVisibleSolid(fig.fills)) ??
                colorToHex(fig.backgroundColor);
            const data: Record<string, unknown> = {
                content: [], // empty editor body — user can fill it later
                isStandaloneBlock: true,
                ...(bg ? { color: bg } : {}),
                ...(fig.name ? { label: fig.name } : {}),
                ...sourceMeta,
            };
            return {
                id: ourId,
                type: 'block',
                position: { x, y },
                data,
                ...(parentId ? { parentId } : {}),
                ...(Object.keys(baseStyle).length ? { style: baseStyle } : {}),
            } as AppNode;
        }

        case 'TEXT': {
            // Text card — preserves the literal characters, font name and
            // font size so the user sees what they imported.
            const fillHex = paintToHex(firstVisibleSolid(fig.fills));
            const data: Record<string, unknown> = {
                label: (fig.name && fig.name.trim()) || (fig.characters ?? '').slice(0, 64) || 'Text',
                type: 'text',
                content: fig.characters ?? '',
                ...(fillHex ? { color: fillHex } : {}),
                ...(fig.style?.fontFamily ? { _figmaFontFamily: fig.style.fontFamily } : {}),
                ...(typeof fig.style?.fontSize === 'number' ? { _figmaFontSize: fig.style.fontSize } : {}),
                ...(typeof fig.style?.fontWeight === 'number' ? { _figmaFontWeight: fig.style.fontWeight } : {}),
                ...sourceMeta,
            };
            return {
                id: ourId,
                type: 'note',
                position: { x, y },
                data,
                ...(parentId ? { parentId } : {}),
                ...(Object.keys(baseStyle).length ? { style: baseStyle } : {}),
            } as AppNode;
        }

        case 'RECTANGLE':
        case 'ELLIPSE':
        case 'POLYGON':
        case 'STAR':
        case 'LINE':
        case 'VECTOR': {
            // Shape → coloured tile. We use a `note` so the user can click
            // in and add content to the imported swatch.
            const fillHex = paintToHex(firstVisibleSolid(fig.fills));
            const data: Record<string, unknown> = {
                label: fig.name || fig.type.toLowerCase(),
                type: 'image',
                ...(fillHex ? { color: fillHex } : {}),
                ...sourceMeta,
            };
            return {
                id: ourId,
                type: 'note',
                position: { x, y },
                data,
                ...(parentId ? { parentId } : {}),
                ...(Object.keys(baseStyle).length ? { style: baseStyle } : {}),
            } as AppNode;
        }

        default:
            return null; // unsupported — caller increments `skipped`
    }
}

// ───── Colour utilities ──────────────────────────────────────────────────

function firstVisibleSolid(paints: FigmaPaint[] | undefined): FigmaPaint | null {
    if (!Array.isArray(paints)) return null;
    for (const p of paints) {
        if (p.visible === false) continue;
        if (p.type === 'SOLID' && p.color) return p;
    }
    return null;
}

function paintToHex(paint: FigmaPaint | null): string | null {
    if (!paint || !paint.color) return null;
    return colorToHex(paint.color);
}

function colorToHex(c: FigmaColor | undefined): string | null {
    if (!c) return null;
    const r = clampByte(c.r);
    const g = clampByte(c.g);
    const b = clampByte(c.b);
    const hex = '#' + [r, g, b].map(byteToHex).join('');
    return hex;
}

function clampByte(v: number): number {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function byteToHex(v: number): string {
    return v.toString(16).padStart(2, '0');
}
