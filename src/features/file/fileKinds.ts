/**
 * fileKinds
 * --------------------------------------------------------------------------
 * One ladder from a file's MIME type and name to the way the app treats it,
 * in the same spirit as `editor/mediaTypes.ts` — which answers the coarser
 * question of which block type a file becomes (image / video / file). This
 * answers the finer one: given that it is a file, what kind of file, how do we
 * draw it, and can we show its contents.
 *
 * MIME is trusted first and the extension second, because several operating
 * systems report `application/octet-stream` for a dragged file and the browser
 * reports an empty string for anything it does not recognise.
 */

export type FileKind =
    | 'pdf'
    | 'image'
    | 'video'
    | 'audio'
    | 'text'
    | 'markdown'
    | 'code'
    | 'html'
    | 'csv'
    | 'docx'
    | 'xlsx'
    | 'pptx'
    | 'archive'
    | 'unknown';

/**
 * How a kind is rendered.
 *
 * `native`  the browser draws it with no help from us — an iframe, an img, a
 *           video element. Costs nothing and is always the best option when it
 *           is available.
 * `text`    we read the bytes as text and lay them out ourselves.
 * `lazy`    needs a converter fetched on first open.
 * `none`    nothing can show it; offer the file itself instead.
 */
export type RenderStrategy = 'native' | 'text' | 'lazy' | 'none';

export interface FileKindInfo {
    kind: FileKind;
    /** Spoken name, used in the viewer header and for screen readers. */
    label: string;
    /** Solar icon id. All of these live in SOLAR_CORE, so a file card never
     *  renders a blank glyph while the lazy icon chunk lands. */
    icon: string;
    /** Design-system token for this kind's colour, e.g. `--file-pdf`. */
    hue: string;
    /** Fallback badge when the filename carries no usable extension. */
    badge: string;
    strategy: RenderStrategy;
}

/*
 * On the colours.
 *
 * These come from the file-kind palette in design-system.css, not from the §7
 * accents. That was tried first and had to be undone: the §7 hues are
 * user-assigned and currently collide — rose, amber and azure are all one
 * value, teal, indigo and magenta another — so a Word file and a PDF came out
 * identically red.
 *
 * The colours are worn ONLY by a file's icon and its artwork. Chrome stays
 * neutral, and colour on a button, a spine or a border still means what it
 * means everywhere else in this app: the user chose it. A recoloured node still
 * overrides the kind by setting `--file-ink`, exactly as a folder card
 * overrides `--folder-ink`.
 */

const KINDS: Record<FileKind, FileKindInfo> = {
    pdf: { kind: 'pdf', label: 'PDF document', icon: 'file-text', hue: '--file-pdf', badge: 'PDF', strategy: 'native' },
    image: { kind: 'image', label: 'Image', icon: 'gallery', hue: '--file-image', badge: 'IMG', strategy: 'native' },
    video: { kind: 'video', label: 'Video', icon: 'videocamera', hue: '--file-video', badge: 'VID', strategy: 'native' },
    audio: { kind: 'audio', label: 'Audio', icon: 'music-note', hue: '--file-audio', badge: 'AUD', strategy: 'native' },
    text: { kind: 'text', label: 'Text file', icon: 'file-text', hue: '--file-text', badge: 'TXT', strategy: 'text' },
    markdown: { kind: 'markdown', label: 'Markdown', icon: 'notes', hue: '--file-text', badge: 'MD', strategy: 'text' },
    code: { kind: 'code', label: 'Code', icon: 'code', hue: '--file-code', badge: 'CODE', strategy: 'text' },
    html: { kind: 'html', label: 'Web page', icon: 'code', hue: '--file-code', badge: 'HTML', strategy: 'native' },
    csv: { kind: 'csv', label: 'Spreadsheet', icon: 'chart-square', hue: '--file-sheet', badge: 'CSV', strategy: 'text' },
    docx: { kind: 'docx', label: 'Word document', icon: 'notes', hue: '--file-doc', badge: 'DOC', strategy: 'lazy' },
    xlsx: { kind: 'xlsx', label: 'Excel workbook', icon: 'chart-square', hue: '--file-sheet', badge: 'XLS', strategy: 'lazy' },
    pptx: { kind: 'pptx', label: 'Presentation', icon: 'monitor', hue: '--file-slides', badge: 'PPT', strategy: 'none' },
    archive: { kind: 'archive', label: 'Archive', icon: 'box', hue: '--file-archive', badge: 'ZIP', strategy: 'none' },
    unknown: { kind: 'unknown', label: 'File', icon: 'file', hue: '--text-faint', badge: '', strategy: 'none' },
};

const EXT_KIND: Record<string, FileKind> = {
    pdf: 'pdf',

    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image',
    svg: 'image', bmp: 'image', ico: 'image', heic: 'image', heif: 'image', tif: 'image', tiff: 'image',

    mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video', avi: 'video', mkv: 'video',

    mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',

    txt: 'text', log: 'text', rtf: 'text',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    csv: 'csv', tsv: 'csv',
    htm: 'html', html: 'html', xhtml: 'html',

    doc: 'docx', docx: 'docx', odt: 'docx',
    xls: 'xlsx', xlsx: 'xlsx', xlsm: 'xlsx', ods: 'xlsx',
    ppt: 'pptx', pptx: 'pptx', odp: 'pptx',

    zip: 'archive', rar: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',

    js: 'code', jsx: 'code', ts: 'code', tsx: 'code', json: 'code', yaml: 'code', yml: 'code',
    xml: 'code', toml: 'code', ini: 'code', css: 'code', scss: 'code', less: 'code',
    py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', kt: 'code', swift: 'code',
    c: 'code', h: 'code', cpp: 'code', hpp: 'code', cs: 'code', php: 'code', sh: 'code', sql: 'code',
};

const MIME_KIND: Array<[RegExp, FileKind]> = [
    [/^application\/pdf$/, 'pdf'],
    [/^image\//, 'image'],
    [/^video\//, 'video'],
    [/^audio\//, 'audio'],
    [/^text\/html$/, 'html'],
    [/^text\/markdown$/, 'markdown'],
    [/^text\/csv$/, 'csv'],
    [/^text\/tab-separated-values$/, 'csv'],
    [/wordprocessingml|msword|opendocument\.text/, 'docx'],
    [/spreadsheetml|ms-excel|opendocument\.spreadsheet/, 'xlsx'],
    [/presentationml|ms-powerpoint|opendocument\.presentation/, 'pptx'],
    [/^application\/(zip|x-7z-compressed|x-rar-compressed|x-tar|gzip)$/, 'archive'],
    [/^application\/(json|xml|javascript)$/, 'code'],
    [/^text\//, 'text'],
];

/** Lowercase extension without the dot, or an empty string when there is none. */
export const fileExtension = (name?: string): string => {
    if (!name) return '';
    const base = name.split(/[\\/]/).pop() ?? '';
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return '';
    return base.slice(dot + 1).toLowerCase();
};

export function resolveFileKind(mime?: string, name?: string): FileKind {
    // The extension wins for the office formats and for code, where the MIME an
    // OS reports is routinely wrong or absent. Everything else asks the MIME
    // first, since a file can be renamed but its bytes cannot.
    const ext = fileExtension(name);
    const byExt = ext ? EXT_KIND[ext] : undefined;
    if (byExt === 'docx' || byExt === 'xlsx' || byExt === 'pptx' || byExt === 'code' || byExt === 'markdown') {
        return byExt;
    }

    const type = (mime || '').toLowerCase();
    if (type && type !== 'application/octet-stream') {
        for (const [pattern, kind] of MIME_KIND) {
            if (pattern.test(type)) return kind;
        }
    }

    return byExt ?? 'unknown';
}

export const fileKindInfo = (kind: FileKind): FileKindInfo => KINDS[kind];

/** Everything a card or a viewer needs to draw itself, resolved in one call. */
export function describeFile(mime?: string, name?: string): FileKindInfo {
    const info = KINDS[resolveFileKind(mime, name)];
    const ext = fileExtension(name);
    // The real extension is more honest than a category label: a .tar.gz says
    // GZ and a .mdx says MDX. Only fall back when there is not one.
    const badge = ext && ext.length <= 4 ? ext.toUpperCase() : info.badge;
    return { ...info, badge };
}

/** An SVG inside an img is inert; an SVG inside an iframe is a script host.
 *  Anything that came from a user is drawn the inert way. */
export const isSvg = (mime?: string, name?: string): boolean =>
    mime === 'image/svg+xml' || fileExtension(name) === 'svg';
