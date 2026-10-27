/**
 * Static canvas projection of the editor.
 *
 * It uses the editor's own visual tokens and CSS module classes, but never
 * mounts BlockEditor, contenteditables, drag handlers, or sync-producing block
 * components. Intelligent UI retains its sandboxed visual in an inert host so
 * deselection does not replace the content with a placeholder.
 */
import { createContext, createElement, memo, useContext, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, Copy, ExternalLink, FileText, ImageOff, Play, Tv } from '../../../../shared/icons';
import { getIconByName } from '../../iconMap';
import { renderContentWithLinks } from '../../../editor/text/pasteUtils';
import { handleInlineLinkClick, handleInlineLinkKeyDown } from '../../../editor/text/inlineNavigation';
import { readTableRows } from '../../../editor/document/tableRows';
import { useCanvasOverview } from '../../../canvas/hooks/navigation/useCanvasOverview';
import type { Block, BlockMetadata } from '../../../editor/types';
import { IntelligentUIPreview } from '../../../intelligent-ui/ui/preview/IntelligentUIPreview';
import editorStyles from '../../../editor/ui/surface/BlockEditor.module.css';
import codeStyles from '../../../editor/blocks/code/CodeBlock.module.css';
import tableStyles from '../../../editor/blocks/table/TableBlock.module.css';
import columnsStyles from '../../../editor/blocks/layout/ColumnsBlock.module.css';
import containerStyles from '../../../editor/blocks/layout/ContainerBlock.module.css';
import galleryStyles from '../../../editor/gallery/GalleryBlock.module.css';
import linkStyles from '../../../editor/blocks/link/LinkBlock.module.css';
import pageStyles from '../../../editor/blocks/layout/PageBlock.module.css';
import styles from './NoteBodyPreview.module.css';
import { AssetImage } from '../../../../services/assets';
import { describeFile } from '../../../file';
import { formatBytes } from '../../../editor/blocks/media/mediaTypes';
import { CardIcon } from '../../iconMap';
import { BlockFrame } from '../../../editor/ui/surface/BlockFrame';
import { InlineTextSurface } from '../../../editor/blocks/text/InlineTextSurface';
import { TableCellSurface } from '../../../editor/blocks/table/TableCellSurface';
import { createRenderTreeBuilder, type RenderNode } from '../../../editor/document/blockTree';
import { useProgressiveCount } from '../../reading/useProgressiveCount';

interface NoteBodyPreviewProps {
    content: Block[];
    loading?: boolean;
    scaleMode?: 'card' | 'canvas';
    /** Standalone nodes need the same wrapper hooks as their live editor. */
    nodeSurface?: 'single';
    globalStartIndex?: number;
    useStoredListNumbers?: boolean;
    /** Expanded reading surfaces expose the entire document, not a prefix. */
    complete?: boolean;
    onBlockChange?: (id: string, patch: Partial<Block>) => void;
    reserveHandles?: boolean;
    deferReading?: boolean;
    progressive?: boolean;
    fusedNoteMedia?: boolean;
}

const ReadingActions = createContext<{ onBlockChange?: NoteBodyPreviewProps['onBlockChange']; reserveHandles: boolean; progressive: boolean; fusedNoteMedia: boolean }>({ reserveHandles: true, progressive: true, fusedNoteMedia: false });

const MAX_TABLE_ROWS = 12;
const MAX_TABLE_COLUMNS = 8;
const MAX_GALLERY_ITEMS = 12;
const MAX_NESTING = 4;
/* A passive card is clipped by its canvas viewport. Building content far below
   that clip only adds DOM and style work to every gesture, so each deeper
   level gets a deliberately smaller semantic projection. */
const MAX_BLOCKS_BY_DEPTH = [16, 12, 8, 4, 2] as const;

const htmlFor = (content: string) => ({ __html: renderContentWithLinks(content) });

function blockStyle(block: Block): CSSProperties {
    return {
        color: block.metadata?.textColor as string | undefined,
        backgroundColor: block.metadata?.backgroundColor as string | undefined,
    };
}

function indentation(block: Block): CSSProperties {
    return { '--block-indent': `${Math.min(Math.max(block.indent ?? 0, 0), 8) * 18}px` } as CSSProperties;
}

function formatDisplayDate(dateString: string) {
    const hasTime = dateString.includes('T');
    const date = hasTime
        ? new Date(dateString)
        : new Date(...dateString.split('-').map((part, index) => index === 1 ? Number(part) - 1 : Number(part)) as [number, number, number]);
    let result = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (hasTime) result += ` ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    return result;
}

/** A collapsed toggle hides only its indented descendants, just like the editor. */
function visibleBlocks(blocks: Block[]) {
    let collapsedAt: number | null = null;
    return blocks.filter((block) => {
        const indent = block.indent ?? 0;
        if (collapsedAt !== null && indent > collapsedAt) return false;
        if (collapsedAt !== null && indent <= collapsedAt) collapsedAt = null;
        if (block.type === 'toggle' && block.metadata?.isCollapsed) collapsedAt = indent;
        return true;
    });
}

/** Older saves stored a column's children in `blocks`; current saves use
 * `content`. Read both so a legacy card remains previewable while it is being
 * migrated by the next normal editor write. */
function columnBlocks(column: unknown): Block[] {
    if (!column || typeof column !== 'object') return [];
    const value = column as { content?: unknown; blocks?: unknown };
    const nested = Array.isArray(value.content) ? value.content : Array.isArray(value.blocks) ? value.blocks : [];
    return nested.filter((block): block is Block => Boolean(
        block &&
        typeof block === 'object' &&
        typeof (block as Block).id === 'string' &&
        typeof (block as Block).type === 'string' &&
        typeof (block as Block).content === 'string',
    ));
}

function staticFileName(block: Block) {
    return block.metadata?.name || block.content.split('/').pop() || 'File';
}

function shortUrl(url: string) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const StaticTableRow = memo(function StaticTableRow({ row, index, metadata, columns }: { row: string[]; index: number; metadata?: BlockMetadata; columns: number }) {
    return <tr style={{ height: metadata?.rowHeights?.[index] }}>
        {row.slice(0, columns).map((value, column) => {
            const surface = <TableCellSurface align={metadata?.alignments?.[column] ?? 'left'}
                data-table-row={index} data-table-column={column} data-reader-text=""
                data-placeholder={index ? undefined : 'Header'} data-is-empty={!value ? 'true' : 'false'} dangerouslySetInnerHTML={htmlFor(value)} />;
            return index === 0
                ? <th key={column} scope="col" className={tableStyles.tableHeader}>{surface}</th>
                : <td key={column} className={tableStyles.tableData}>{surface}</td>;
        })}
    </tr>;
});

function StaticTable({ metadata, complete }: { metadata?: BlockMetadata; complete?: boolean }) {
    const { progressive } = useContext(ReadingActions);
    /* Same repair the live `TableBlock` does, for the same reason: this
       projection stands in for that editor, so a table already saved with a
       delimiter row glued to its first data row has to read identically in
       both — see `normalizeTableRows`. */
    const rows = readTableRows(metadata?.rows, metadata?.tableRowsVersion === 1);
    const widths = metadata?.columnWidths ?? [];
    const heights = metadata?.rowHeights ?? [];
    const costs = useMemo(() => rows.map(row => Math.max(1, row.length)), [rows]);
    const count = useProgressiveCount(costs, 96, complete && progressive);
    if (!rows.length) return <div className={editorStyles.tableWrapper} />;
    const shown = rows.slice(0, complete ? count : MAX_TABLE_ROWS);
    const columns = complete ? Infinity : MAX_TABLE_COLUMNS;
    const isSized = widths.length === rows[0].length && widths.every((width) => width > 0);
    const pendingHeight = rows.slice(count).reduce((sum, _, index) => sum + (heights[index + count] || 36), 0);

    return (
        <div className={editorStyles.tableWrapper} data-table-sized={isSized ? 'true' : undefined}>
            <div className={tableStyles.tableScroll} data-table-scroll="">
                <div className={`${tableStyles.tableInner} ${isSized ? tableStyles.tableInnerSized : ''}`}>
                    <div className={tableStyles.tableRow}><div className={tableStyles.tableMain}>
                        <table aria-busy={complete && count < rows.length || undefined} className={`${tableStyles.table} ${isSized ? tableStyles.tableSized : ''}`}>
                            <colgroup>{shown[0].slice(0, columns).map((_, index) => <col key={index} style={{ width: widths[index] ? `${widths[index]}px` : undefined }} />)}</colgroup>
                            <thead><StaticTableRow row={shown[0]} index={0} metadata={metadata} columns={columns} /></thead>
                            <tbody>{shown.slice(1).map((row, rowIndex) => <StaticTableRow key={rowIndex} row={row} index={rowIndex + 1} metadata={metadata} columns={columns} />)}
                                {complete && count < rows.length && <tr data-reading-pending="" aria-hidden="true"><td colSpan={Math.max(1, rows[0].length)} style={{ padding: 0, border: 0 }}>
                                    <div style={{ height: pendingHeight }} />
                                </td></tr>}
                            </tbody>
                        </table>
                    </div></div>
                </div>
            </div>
            {rows.length > shown.length && <span className={styles.moreRows}>+{rows.length - shown.length} rows</span>}
            {!complete && rows[0].length > MAX_TABLE_COLUMNS && <span className={styles.moreRows}>+{rows[0].length - MAX_TABLE_COLUMNS} columns</span>}
        </div>
    );
}

/* The closed file row, tinted by kind. Matches FileBlock's own closed state in
   the live editor — the projection has to agree with what it is standing in
   for, or a card visibly changes as it becomes editable. */
function StaticFile({ block }: { block: Block }) {
    const name = staticFileName(block);
    const kind = describeFile(block.metadata?.type as string | undefined, name);
    const size = block.metadata?.size;
    return (
        <div className={editorStyles.fileWrapper} style={{ ['--file-kind' as string]: `var(${kind.hue})` }}>
            <div className={editorStyles.fileIconWrapper}>
                <CardIcon icon={kind.icon} size={26} style={{ color: 'inherit' }} />
            </div>
            <div className={editorStyles.fileInfo}>
                <span className={editorStyles.fileLink}>{name}</span>
                <span className={editorStyles.fileMeta}>
                    {kind.label}{typeof size === 'number' ? ` · ${formatBytes(size)}` : ''}
                </span>
            </div>
        </div>
    );
}

function StaticGallery({ block, complete }: { block: Block; complete?: boolean }) {
    const { progressive } = useContext(ReadingActions);
    const costs = useMemo(() => (block.metadata?.items ?? []).map(() => 8), [block.metadata?.items]);
    const count = useProgressiveCount(costs, 96, complete && progressive);
    const items = (block.metadata?.items ?? []).slice(0, complete ? count : MAX_GALLERY_ITEMS);
    const layout = block.metadata?.galleryLayout ?? 'bento';
    const layoutClass = layout === 'grid' ? galleryStyles.layoutGrid : layout === 'masonry' ? galleryStyles.layoutMasonry : layout === 'scatter' ? galleryStyles.layoutScatter : galleryStyles.layoutBento;
    const title = block.content || 'Untitled board';
    return (
        <div className={galleryStyles.gallery}>
            <div className={galleryStyles.titleRow}><span className={galleryStyles.title}>{title}</span><span className={galleryStyles.count}>{items.length}</span></div>
            <div className={galleryStyles.board}>
                <div className={`${galleryStyles.grid} ${layoutClass} ${block.metadata?.galleryFit === 'contain' ? galleryStyles.fitContain : ''}`} style={{ '--gal-cols': 3, '--gal-row': '92px', '--gal-gap': '8px' } as CSSProperties}>
                    {items.map((item) => {
                        const image = item.type === 'image' && item.content;
                        const video = item.type === 'video';
                        const poster = item.metadata?.poster;
                        return <div key={item.id} className={galleryStyles.tile} style={{ gridColumn: item.metadata?.span === 'wide' || item.metadata?.span === 'lg' ? 'span 2' : undefined, gridRow: item.metadata?.span === 'tall' || item.metadata?.span === 'lg' ? 'span 2' : undefined }}>
                            {image ? <AssetImage className={galleryStyles.tileMedia} src={item.metadata?.thumb ?? item.content} alt={item.metadata?.name || ''} loading="lazy" draggable={false} /> : video && poster ? <><AssetImage className={galleryStyles.tileMedia} src={poster} alt="" loading="lazy" draggable={false} /><span className={galleryStyles.playBadge}><Play size={14} fill="currentColor" /></span></> : <div className={galleryStyles.tileFile}>{video ? <Play size={20} /> : <FileText size={20} />}<span>{staticFileName(item)}</span></div>}
                        </div>;
                    })}
                    {complete && count < costs.length && <div data-reading-pending="" aria-hidden="true" style={{ gridColumn: '1 / -1', gridRow: `span ${Math.ceil((costs.length - count) / 3)}` }} />}
                    {!items.length && <div className={galleryStyles.emptyBoard}><ImageOff size={18} />Empty board</div>}
                </div>
            </div>
        </div>
    );
}

function StaticLink({ block }: { block: Block }) {
    const metadata = block.metadata ?? {};
    const displayMode = metadata.displayMode ?? 'bookmark';
    const title = metadata.customTitle as string | undefined || metadata.title || shortUrl(block.content);
    if (displayMode === 'text') {
        return <div className={linkStyles.container}><span className={linkStyles.textLinkWrapper}>{metadata.favicon && <img className={linkStyles.textLinkIcon} src={metadata.favicon} alt="" />}<span>{title}</span><ExternalLink size={10} /></span></div>;
    }
    if (displayMode === 'embed') {
        return <div className={linkStyles.embedContainer}><div className={linkStyles.embedHeader}><div className={linkStyles.embedTitle}><Tv size={12} /><span>{metadata.title || `Embedded ${shortUrl(block.content)}`}</span></div></div><div className={linkStyles.embedContent} /></div>;
    }
    return <div className={linkStyles.container}><div className={linkStyles.bookmarkCard}><div className={linkStyles.bookmarkInfo}><div className={linkStyles.bookmarkTitle}>{title}</div><div className={linkStyles.bookmarkDesc}>{metadata.description || 'No description available for this link.'}</div><div className={linkStyles.bookmarkMeta}>{metadata.favicon && <img className={linkStyles.bookmarkFavicon} src={metadata.favicon} alt="" />}<span className={linkStyles.bookmarkDomain}>{shortUrl(block.content)}</span></div></div>{metadata.image && <div className={linkStyles.bookmarkImageContainer}><img className={linkStyles.bookmarkImage} src={metadata.image} alt="" loading="lazy" /></div>}</div></div>;
}

function StaticChildren({ blocks, depth, nodeSurface, complete }: { blocks?: Block[]; depth: number; nodeSurface?: 'single'; complete?: boolean }) {
    if (!blocks?.length || (!complete && depth >= MAX_NESTING)) return null;
    return <div className={styles.children}><StaticBlocks blocks={blocks} depth={depth + 1} nodeSurface={nodeSurface} complete={complete} /></div>;
}

function StaticBlock({ block, depth, numberedIndex, nodeSurface, complete, parentIndent = 0 }: { block: Block; depth: number; numberedIndex: number; nodeSurface?: 'single'; complete?: boolean; parentIndent?: number }) {
    const { onBlockChange, reserveHandles, fusedNoteMedia } = useContext(ReadingActions);
    const metadata = block.metadata;
    const nested = metadata?.blocks ?? metadata?.content;
    const textClass = `${editorStyles.block} ${editorStyles.text}`;
    const textHTML = complete && !block.content ? { __html: '<br>' } : htmlFor(block.content);
    const empty = !block.content.trim() ? 'true' : 'false';
    const placeholder = block.type === 'bullet' || block.type === 'numbered' ? 'List item' : "Type '/' for commands";
    const richText = <InlineTextSurface block={block} data-reader-text="" data-is-empty={empty} data-placeholder={placeholder} dangerouslySetInnerHTML={textHTML} />;
    let content: React.ReactNode;

    switch (block.type) {
        case 'heading1': content = <InlineTextSurface block={block} variant="heading1" data-reader-text="" data-is-empty={empty} data-placeholder="Heading 1..." dangerouslySetInnerHTML={textHTML} />; break;
        case 'heading2': content = <InlineTextSurface block={block} variant="heading2" data-reader-text="" data-is-empty={empty} data-placeholder="Heading 2..." dangerouslySetInnerHTML={textHTML} />; break;
        case 'heading3': content = <InlineTextSurface block={block} variant="heading3" data-reader-text="" data-is-empty={empty} data-placeholder="Heading 3..." dangerouslySetInnerHTML={textHTML} />; break;
        case 'todo': content = <div className={editorStyles.todoWrapper}><input type="checkbox" aria-label={block.content || 'To-do item'} disabled={!complete || !onBlockChange} className={editorStyles.todoCheckbox} checked={metadata?.checked || false} onChange={event => onBlockChange?.(block.id, { metadata: { ...metadata, checked: event.target.checked } })} /><div data-reader-text="" className={`${editorStyles.block} ${editorStyles.todo} ${metadata?.checked ? editorStyles.todoChecked : ''}`} style={blockStyle(block)} dangerouslySetInnerHTML={textHTML} />{metadata?.dueDate && <div className={editorStyles.todoDateWrapper}><div className={editorStyles.todoDateDisplay}>{formatDisplayDate(metadata.dueDate)}</div></div>}</div>; break;
        case 'quote': content = <div className={editorStyles.quoteWrapper}><div data-reader-text="" className={`${editorStyles.block} ${editorStyles.quote}`} style={blockStyle(block)} dangerouslySetInnerHTML={textHTML} /></div>; break;
        case 'bullet': content = <div className={editorStyles.listWrapper}><span className={editorStyles.listBullet}>•</span>{richText}</div>; break;
        case 'numbered': content = <div className={editorStyles.listWrapper}><span className={editorStyles.listNumber}>{numberedIndex}.</span>{richText}</div>; break;
        case 'toggle': {
            const heading = metadata?.toggleHeaderLevel;
            const contentClass = heading ? `${editorStyles.block} ${editorStyles[`heading${heading}`]} ${editorStyles.toggleHeaderContent}` : textClass;
            const toggle = () => onBlockChange?.(block.id, { metadata: { ...metadata, isCollapsed: !metadata?.isCollapsed } });
            content = <div className={editorStyles.toggleWrapper}><div className={`${editorStyles.toggleTriangle} ${!metadata?.isCollapsed ? editorStyles.expanded : ''}`}
                role={complete ? 'button' : undefined} tabIndex={complete ? 0 : undefined} aria-expanded={!metadata?.isCollapsed}
                aria-label={metadata?.isCollapsed ? 'Expand toggle' : 'Collapse toggle'}
                onClick={complete ? toggle : undefined} onKeyDown={event => { if (complete && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); toggle(); } }}><ChevronRight /></div><div role={heading ? 'heading' : undefined} aria-level={heading} data-reader-text="" data-is-empty={empty} data-placeholder={heading ? `Heading ${heading}...` : 'Toggle list item'} className={contentClass} style={blockStyle(block)} dangerouslySetInnerHTML={textHTML} /></div>;
            break;
        }
        case 'callout': {
            const Icon = getIconByName(metadata?.icon || 'Lightbulb');
            content = <div className={editorStyles.calloutWrapper} style={{ backgroundColor: metadata?.backgroundColor || undefined }}><div className={editorStyles.calloutIconWrapper}>{createElement(Icon, { size: 20, className: editorStyles.calloutIconSvg })}</div><div className={textClass} style={{ color: metadata?.textColor as string | undefined }} dangerouslySetInnerHTML={textHTML} /></div>;
            break;
        }
        case 'code': {
            const lines = block.content ? block.content.split('\n').length : 0;
            content = <div className={codeStyles.codeBlockWrapper}><div className={codeStyles.codeHeader}><span className={codeStyles.codeLangStatic}>{metadata?.language || 'text'}</span><span className={codeStyles.codeMeta}>{lines > 0 && `${lines} ${lines === 1 ? 'line' : 'lines'}`}</span><span className={codeStyles.codeCopyBtn}><Copy /><span>Copy</span></span></div><div className={`${editorStyles.block} ${codeStyles.codeBlock}`}>{block.content}</div></div>;
            break;
        }
        case 'table': content = <StaticTable metadata={metadata} complete={complete} />; break;
        case 'intelligent-ui': content = <IntelligentUIPreview block={block} />; break;
        case 'divider': content = <div className={editorStyles.divider} />; break;
        case 'image': {
            const imageHeight = metadata?.height ?? (fusedNoteMedia ? 180 : undefined);
            content = block.content ? <div className={editorStyles.mediaWrapper} style={{ display: 'flex', justifyContent: metadata?.alignment === 'center' ? 'center' : metadata?.alignment === 'right' ? 'flex-end' : 'flex-start' }}><AssetImage src={block.content} alt="User content" className={editorStyles.mediaImage} loading="lazy" draggable={false} style={imageHeight ? { height: `${imageHeight}px`, width: 'auto', maxWidth: '100%', objectFit: 'contain' } : undefined} /></div> : null;
            break;
        }
        case 'video': content = block.content ? <div className={editorStyles.mediaWrapper}>{metadata?.poster ? <AssetImage src={metadata.poster} alt="" className={editorStyles.mediaImage} loading="lazy" draggable={false} /> : <div className={styles.mediaFallback}><Play size={16} />Video</div>}</div> : null; break;
        case 'file': content = <StaticFile block={block} />; break;
        case 'media': content = <div className={styles.mediaFallback}>Media</div>; break;
        case 'gallery': content = <StaticGallery block={block} complete={complete} />; break;
        case 'link': content = <StaticLink block={block} />; break;
        case 'page': content = <div className={pageStyles.pageBlock}><FileText size={16} className={pageStyles.pageIcon} /><span className={pageStyles.pageTitle}>{block.content || 'Untitled Page'}</span></div>; break;
        case 'color': content = <div className={editorStyles.colorBlockWrapper} style={{ backgroundColor: block.content || '#1E944A' }} title={metadata?.name || block.content} />; break;
        case 'columns': content = <div className={columnsStyles.columnsWrapper}><div className={columnsStyles.columnsContainer} style={{ gridTemplateColumns: `repeat(${complete ? metadata?.columns?.length || 1 : Math.min(metadata?.columns?.length || 1, 4)}, minmax(0, 1fr))` }}>{metadata?.columns?.slice(0, complete ? undefined : 4).map((column, index) => <div key={column.id || index} className={columnsStyles.column}><StaticBlocks blocks={columnBlocks(column)} depth={depth + 1} complete={complete} /></div>)}</div>{!complete && (metadata?.columns?.length || 0) > 4 && <span className={styles.moreRows}>+{metadata!.columns!.length - 4} columns</span>}</div>; break;
        case 'container': content = <div className={containerStyles.containerBlock}><StaticChildren blocks={nested} depth={depth} nodeSurface={nodeSurface} complete={complete} /></div>; break;
        default: content = richText;
    }

    if (!content && !nested?.length) return null;
    if (complete) return <BlockFrame className={`${editorStyles.sortableWrapper} nodrag`}
        controls={reserveHandles && !['media', 'image', 'video', 'file', 'color', 'gallery', 'intelligent-ui'].includes(block.type)
            ? <div className={editorStyles.dragHandle} aria-hidden="true" style={{ visibility: 'hidden', pointerEvents: 'none' }} /> : undefined}
        data-block-id={block.id} data-block-type={block.type}
        data-toggle-heading={block.type === 'toggle' ? metadata?.toggleHeaderLevel : undefined}
        style={{ '--block-indent': `${Math.max(0, (block.indent || 0) - parentIndent) * 24}px` } as CSSProperties}>
        <span className={editorStyles.dropMarker} data-block-drop-marker aria-hidden="true" />
        {content}{block.type === 'container' ? null : <StaticChildren blocks={nested} depth={depth} nodeSurface={nodeSurface} complete />}
    </BlockFrame>;
    return (
        <div
            className={`${styles.staticBlock} ${nodeSurface ? editorStyles.sortableWrapper : ''}`}
            data-block-type={nodeSurface ? block.type : undefined}
            style={indentation(block)}
        >
            {content}{block.type === 'container' ? null : <StaticChildren blocks={nested} depth={depth} nodeSurface={nodeSurface} />}
        </div>
    );
}

function lastIndex(node: RenderNode): number {
    const last = node.children.at(-1);
    return last ? lastIndex(last) : node.index;
}
const limitFor = (node: RenderNode, limit: number | undefined) =>
    limit !== undefined && node.children.length > 0 && lastIndex(node) >= limit ? limit : undefined;

const ReadingBranch = memo(function ReadingBranchView({ node, parentIndent = 0, depth, storedNumbers, limit }: { node: RenderNode; parentIndent?: number; depth: number; storedNumbers: boolean; limit?: number }) {
    const indent = node.block.indent || 0;
    const item = <StaticBlock block={node.block} complete depth={depth} parentIndent={node.kind === 'toggle-group' ? indent : parentIndent}
        numberedIndex={storedNumbers ? node.block.metadata?.listNumber ?? node.listIndex ?? 1 : node.listIndex ?? 1} />;
    if (node.kind === 'block') return item;
    return <div className={editorStyles.toggleGroupContainer} style={{ '--toggle-indent': `${Math.max(0, indent - parentIndent) * 24}px` } as CSSProperties}>
        {item}{node.children.length > 0 && !node.block.metadata?.isCollapsed && <div className={editorStyles.toggleChildrenContainer}>
            {node.children.filter(child => limit === undefined || child.index < limit).map(child => <ReadingBranch key={child.block.id}
                node={child} parentIndent={indent} depth={depth} storedNumbers={storedNumbers} limit={limitFor(child, limit)} />)}
        </div>}
    </div>;
});

function CompleteBlocks({ blocks, startIndex, storedNumbers, depth }: { blocks: Block[]; startIndex: number; storedNumbers: boolean; depth: number }) {
    const { progressive } = useContext(ReadingActions);
    const [buildTree] = useState(createRenderTreeBuilder);
    const nodes = buildTree(blocks, startIndex);
    const costs = useMemo(() => blocks.map(block => ['table', 'gallery', 'columns', 'container', 'intelligent-ui'].includes(block.type) ? 16 : 1), [blocks]);
    const count = useProgressiveCount(costs, 16, progressive);
    return <>
        {nodes.filter(node => node.index < count).map(node => <ReadingBranch key={node.block.id} node={node}
            depth={depth} storedNumbers={storedNumbers} limit={limitFor(node, count)} />)}
        {count < blocks.length && <div data-reading-pending="" aria-hidden="true" style={{ height: (blocks.length - count) * 48 }} />}
    </>;
}

function StaticBlocks({ blocks, depth = 0, nodeSurface, startIndex = 1, storedNumbers = false, complete }: { blocks: Block[]; depth?: number; nodeSurface?: 'single'; startIndex?: number; storedNumbers?: boolean; complete?: boolean }) {
    if (complete) return <CompleteBlocks blocks={blocks} startIndex={startIndex} depth={depth} storedNumbers={storedNumbers} />;
    if (depth >= MAX_NESTING) return <span className={styles.moreRows}>Nested content</span>;
    const maxBlocks = MAX_BLOCKS_BY_DEPTH[Math.min(depth, MAX_BLOCKS_BY_DEPTH.length - 1)];
    const visible = visibleBlocks(blocks);
    const indexedBlocks = visible.slice(0, maxBlocks).reduce<Array<{ block: Block; numberedIndex: number }>>(
        (entries, block) => {
            const previousIndex = entries.at(-1)?.numberedIndex ?? startIndex - 1;
            return [...entries, {
                block,
                numberedIndex: block.type === 'numbered' ? (storedNumbers ? block.metadata?.listNumber ?? previousIndex + 1 : previousIndex + 1) : 0,
            }];
        },
        [],
    );
    return <>{indexedBlocks.map(({ block, numberedIndex }) => {
        return <StaticBlock key={block.id} block={block} depth={depth} numberedIndex={numberedIndex || 1} nodeSurface={nodeSurface} />;
    })}{visible.length > maxBlocks && <span className={styles.moreRows}>More content</span>}</>;
}

export const NoteBodyPreview = memo(function NoteBodyPreview({ content, loading = false, scaleMode = 'card', nodeSurface, globalStartIndex, useStoredListNumbers, complete = false, onBlockChange, reserveHandles = true, deferReading = false, progressive = true, fusedNoteMedia = false }: NoteBodyPreviewProps) {
    const overview = useCanvasOverview(!complete);
    const actions = useMemo(() => ({ onBlockChange: complete ? onBlockChange : undefined, reserveHandles, progressive, fusedNoteMedia }), [complete, onBlockChange, reserveHandles, progressive, fusedNoteMedia]);
    return <ReadingActions.Provider value={actions}><section onClick={handleInlineLinkClick} onKeyDownCapture={handleInlineLinkKeyDown} tabIndex={complete ? 0 : undefined} data-node-surface={nodeSurface} data-canvas-card-preview="true" data-reading-deferred={deferReading || undefined} data-complete-reader={complete || undefined} className={`${styles.preview} ${complete ? styles.complete : ''} ${editorStyles.editor} ${scaleMode === 'canvas' ? editorStyles.minimal : ''} ${loading && !complete ? styles.loading : ''}`} aria-label="Read-only note content">{deferReading || overview && !complete
        ? <div className={styles.overview}>{content[0]?.content.slice(0, 120) || 'Note'}</div>
        : content.length ? <StaticBlocks blocks={content} nodeSurface={nodeSurface} startIndex={globalStartIndex} storedNumbers={useStoredListNumbers} complete={complete} /> : complete ? <StaticBlocks blocks={[{ id: 'empty', type: 'text', content: '' }]} complete /> : <div className={styles.empty}><span className={styles.emptyAction}>Click to start writing</span><span className={styles.emptyHint}>Your first block will appear here.</span></div>}</section></ReadingActions.Provider>;
});
