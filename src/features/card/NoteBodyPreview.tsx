/**
 * Static canvas projection of the editor.
 *
 * It uses the editor's own visual tokens and CSS module classes, but never
 * mounts BlockEditor, contenteditables, drag handlers, stateful media viewers,
 * or sync-producing block components. That keeps the projection faithful while
 * navigation remains cheap.
 */
import { createElement, memo, type CSSProperties } from 'react';
import { ChevronRight, Copy, ExternalLink, FileText, ImageOff, Play, Tv } from '../../components/icons';
import { getIconByName } from '../card/IconPicker';
import { normalizeTableRows, renderContentWithLinks } from '../editor/pasteUtils';
import type { Block, BlockMetadata } from '../editor/types';
import editorStyles from '../editor/BlockEditor.module.css';
import columnsStyles from '../editor/ColumnsBlock.module.css';
import containerStyles from '../editor/ContainerBlock.module.css';
import galleryStyles from '../editor/GalleryBlock.module.css';
import linkStyles from '../editor/LinkBlock.module.css';
import pageStyles from '../editor/PageBlock.module.css';
import styles from './NoteBodyPreview.module.css';
import { AssetImage } from '../../services/assets';
import { describeFile } from '../file';
import { formatBytes } from '../editor/mediaTypes';
import { CardIcon } from './iconMap';

interface NoteBodyPreviewProps {
    content: Block[];
    loading?: boolean;
    scaleMode?: 'card' | 'canvas';
    /** Standalone nodes need the same wrapper hooks as their live editor. */
    nodeSurface?: 'single';
}

const MAX_TABLE_ROWS = 12;
const MAX_GALLERY_ITEMS = 12;
const MAX_NESTING = 4;
/* A passive card is clipped by its canvas viewport. Building content far below
   that clip only adds DOM and style work to every gesture, so each deeper
   level gets a deliberately smaller semantic projection. */
const MAX_BLOCKS_BY_DEPTH = [48, 24, 12, 6, 4] as const;

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

function StaticTable({ metadata }: { metadata?: BlockMetadata }) {
    /* Same repair the live `TableBlock` does, for the same reason: this
       projection stands in for that editor, so a table already saved with a
       delimiter row glued to its first data row has to read identically in
       both — see `normalizeTableRows`. */
    const rows = normalizeTableRows(metadata?.rows ?? []);
    const widths = metadata?.columnWidths ?? [];
    const heights = metadata?.rowHeights ?? [];
    const alignments = metadata?.alignments ?? [];
    if (!rows.length) return <div className={editorStyles.tableWrapper} />;
    const shown = rows.slice(0, MAX_TABLE_ROWS);
    const isSized = widths.length === rows[0].length && widths.every((width) => width > 0);
    const cell = (value: string, column: number) => (
        <div
            className={editorStyles.tableCell}
            style={{ textAlign: alignments[column] ?? 'left' }}
            dangerouslySetInnerHTML={htmlFor(value)}
        />
    );

    return (
        <div className={editorStyles.tableWrapper} data-table-sized={isSized ? 'true' : undefined}>
            <div className={editorStyles.tableScroll}>
                <div className={`${editorStyles.tableInner} ${isSized ? editorStyles.tableInnerSized : ''}`}>
                    <div className={editorStyles.tableRow}><div className={editorStyles.tableMain}>
                        <table className={`${editorStyles.table} ${isSized ? editorStyles.tableSized : ''}`}>
                            <colgroup>{shown[0].map((_, index) => <col key={index} style={{ width: widths[index] ? `${widths[index]}px` : undefined }} />)}</colgroup>
                            <thead><tr style={{ height: heights[0] ? `${heights[0]}px` : undefined }}>
                                {shown[0].map((value, index) => <th key={index} scope="col" className={editorStyles.tableHeader}>{cell(value, index)}</th>)}
                            </tr></thead>
                            <tbody>{shown.slice(1).map((row, rowIndex) => <tr key={rowIndex} style={{ height: heights[rowIndex + 1] ? `${heights[rowIndex + 1]}px` : undefined }}>
                                {row.map((value, column) => <td key={column} className={editorStyles.tableData}>{cell(value, column)}</td>)}
                            </tr>)}</tbody>
                        </table>
                    </div></div>
                </div>
            </div>
            {rows.length > shown.length && <span className={styles.moreRows}>+{rows.length - shown.length} rows</span>}
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

function StaticGallery({ block }: { block: Block }) {
    const items = (block.metadata?.items ?? []).slice(0, MAX_GALLERY_ITEMS);
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

function StaticChildren({ blocks, depth, nodeSurface }: { blocks?: Block[]; depth: number; nodeSurface?: 'single' }) {
    if (!blocks?.length || depth >= MAX_NESTING) return null;
    return <div className={styles.children}><StaticBlocks blocks={blocks} depth={depth + 1} nodeSurface={nodeSurface} /></div>;
}

function StaticBlock({ block, depth, numberedIndex, nodeSurface }: { block: Block; depth: number; numberedIndex: number; nodeSurface?: 'single' }) {
    const metadata = block.metadata;
    const nested = metadata?.blocks ?? metadata?.content;
    const textClass = `${editorStyles.block} ${editorStyles.text}`;
    const richText = <div className={textClass} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} />;
    let content: React.ReactNode;

    switch (block.type) {
        case 'heading1': content = <div className={`${editorStyles.block} ${editorStyles.heading1}`} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} />; break;
        case 'heading2': content = <div className={`${editorStyles.block} ${editorStyles.heading2}`} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} />; break;
        case 'heading3': content = <div className={`${editorStyles.block} ${editorStyles.heading3}`} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} />; break;
        case 'todo': content = <div className={editorStyles.todoWrapper}><input type="checkbox" disabled className={editorStyles.todoCheckbox} checked={metadata?.checked || false} readOnly /><div className={`${editorStyles.block} ${editorStyles.todo} ${metadata?.checked ? editorStyles.todoChecked : ''}`} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} />{metadata?.dueDate && <div className={editorStyles.todoDateWrapper}><div className={editorStyles.todoDateDisplay}>{formatDisplayDate(metadata.dueDate)}</div></div>}</div>; break;
        case 'quote': content = <div className={editorStyles.quoteWrapper}><div className={`${editorStyles.block} ${editorStyles.quote}`} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} /></div>; break;
        case 'bullet': content = <div className={editorStyles.listWrapper}><span className={editorStyles.listBullet}>•</span>{richText}</div>; break;
        case 'numbered': content = <div className={editorStyles.listWrapper}><span className={editorStyles.listNumber}>{numberedIndex}.</span>{richText}</div>; break;
        case 'toggle': {
            const heading = metadata?.toggleHeaderLevel;
            const contentClass = heading ? `${editorStyles.block} ${editorStyles[`heading${heading}`]} ${editorStyles.toggleHeaderContent}` : textClass;
            content = <div className={editorStyles.toggleWrapper}><div className={`${editorStyles.toggleTriangle} ${!metadata?.isCollapsed ? editorStyles.expanded : ''}`}><ChevronRight /></div><div className={contentClass} style={blockStyle(block)} dangerouslySetInnerHTML={htmlFor(block.content)} /></div>;
            break;
        }
        case 'callout': {
            const Icon = getIconByName(metadata?.icon || 'Lightbulb');
            content = <div className={editorStyles.calloutWrapper} style={{ backgroundColor: metadata?.backgroundColor || undefined }}><div className={editorStyles.calloutIconWrapper}>{createElement(Icon, { size: 20, className: editorStyles.calloutIconSvg })}</div><div className={textClass} style={{ color: metadata?.textColor as string | undefined }} dangerouslySetInnerHTML={htmlFor(block.content)} /></div>;
            break;
        }
        case 'code': {
            const lines = block.content ? block.content.split('\n').length : 0;
            content = <div className={editorStyles.codeBlockWrapper}><div className={editorStyles.codeHeader}><span className={editorStyles.codeLangStatic}>{metadata?.language || 'text'}</span><span className={editorStyles.codeMeta}>{lines > 0 && `${lines} ${lines === 1 ? 'line' : 'lines'}`}</span><span className={editorStyles.codeCopyBtn}><Copy /><span>Copy</span></span></div><div className={`${editorStyles.block} ${editorStyles.codeBlock}`}>{block.content}</div></div>;
            break;
        }
        case 'table': content = <StaticTable metadata={metadata} />; break;
        case 'divider': content = <div className={editorStyles.divider} />; break;
        case 'image': content = block.content ? <div className={editorStyles.mediaWrapper}><AssetImage src={block.content} alt="User content" className={editorStyles.mediaImage} loading="lazy" draggable={false} style={metadata?.height ? { height: `${metadata.height}px`, width: 'auto', maxWidth: '100%', objectFit: 'contain' } : undefined} /></div> : null; break;
        case 'video': content = block.content ? <div className={editorStyles.mediaWrapper}>{metadata?.poster ? <AssetImage src={metadata.poster} alt="" className={editorStyles.mediaImage} loading="lazy" draggable={false} /> : <div className={styles.mediaFallback}><Play size={16} />Video</div>}</div> : null; break;
        case 'file': content = <StaticFile block={block} />; break;
        case 'media': content = <div className={styles.mediaFallback}>Media</div>; break;
        case 'gallery': content = <StaticGallery block={block} />; break;
        case 'link': content = <StaticLink block={block} />; break;
        case 'page': content = <div className={pageStyles.pageBlock}><FileText size={16} className={pageStyles.pageIcon} /><span className={pageStyles.pageTitle}>{block.content || 'Untitled Page'}</span></div>; break;
        case 'color': content = <div className={editorStyles.colorBlockWrapper} style={{ backgroundColor: block.content || '#1E944A' }} title={metadata?.name || block.content} />; break;
        case 'columns': content = <div className={columnsStyles.columnsWrapper}><div className={columnsStyles.columnsContainer} style={{ gridTemplateColumns: `repeat(${metadata?.columns?.length || 1}, minmax(0, 1fr))` }}>{metadata?.columns?.map((column, index) => <div key={column.id || index} className={columnsStyles.column}><StaticBlocks blocks={columnBlocks(column)} depth={depth + 1} /></div>)}</div></div>; break;
        case 'container': content = <div className={containerStyles.containerBlock}><StaticChildren blocks={nested} depth={depth} nodeSurface={nodeSurface} /></div>; break;
        default: content = richText;
    }

    if (!content && !nested?.length) return null;
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

function StaticBlocks({ blocks, depth = 0, nodeSurface }: { blocks: Block[]; depth?: number; nodeSurface?: 'single' }) {
    const maxBlocks = MAX_BLOCKS_BY_DEPTH[Math.min(depth, MAX_BLOCKS_BY_DEPTH.length - 1)];
    const indexedBlocks = visibleBlocks(blocks).slice(0, maxBlocks).reduce<Array<{ block: Block; numberedIndex: number }>>(
        (entries, block) => {
            const previousIndex = entries.at(-1)?.numberedIndex ?? 0;
            return [...entries, {
                block,
                numberedIndex: block.type === 'numbered' ? previousIndex + 1 : 0,
            }];
        },
        [],
    );
    return <>{indexedBlocks.map(({ block, numberedIndex }) => {
        return <StaticBlock key={block.id} block={block} depth={depth} numberedIndex={numberedIndex || 1} nodeSurface={nodeSurface} />;
    })}</>;
}

export const NoteBodyPreview = memo(function NoteBodyPreview({ content, loading = false, scaleMode = 'card', nodeSurface }: NoteBodyPreviewProps) {
    return <section className={`${styles.preview} ${editorStyles.editor} ${scaleMode === 'canvas' ? editorStyles.minimal : ''} ${loading ? styles.loading : ''}`} aria-label="Read-only note content">{content.length ? <StaticBlocks blocks={content} nodeSurface={nodeSurface} /> : <div className={styles.empty}><span className={styles.emptyAction}>Click to start writing</span><span className={styles.emptyHint}>Your first block will appear here.</span></div>}</section>;
});
