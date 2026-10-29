/** Durable, provider-independent form of an interactive answer. */
export type UIControlState = Record<string, string | boolean | number>;
export const UI_LIBRARIES = ['three', 'd3', 'chart.js', 'gsap', 'leaflet'] as const;
export type UILibrary = typeof UI_LIBRARIES[number];
export interface UIStreamPreview { css: string; html: string; initialHeight: number }
export interface UIFollowUp { text: string; values: UIControlState }

export function isUILibraries(value: unknown): value is UILibrary[] {
    return Array.isArray(value) && value.length <= UI_LIBRARIES.length
        && new Set(value).size === value.length && value.every(name => UI_LIBRARIES.includes(name));
}

export type UINativeTextBlock = {
    id: string;
    type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'quote';
    content: string;
};

const NATIVE_TEXT_TYPES = new Set(['text', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'quote']);

export function isNativeUITextBlocks(value: unknown): value is UINativeTextBlock[] {
    return Array.isArray(value) && value.length <= 16 && value.every(block =>
        block && typeof block === 'object' && typeof block.id === 'string'
        && NATIVE_TEXT_TYPES.has(block.type) && typeof block.content === 'string'
        && block.content.trim().length > 0 && block.content.length <= 6000);
}

export interface IntelligentUIArtifact {
    version: 1;
    id: string;
    title: string;
    summary: string;
    prompt: string;
    createdAt: string;
    model?: string;
    initialHeight: number;
    css: string;
    html: string;
    jsFunctions: string;
    jsExpressions: string[];
    libraries?: UILibrary[];
    state?: UIControlState;
    /** Ordinary editor blocks, never rendered as part of the iframe document. */
    before?: UINativeTextBlock[];
    after?: UINativeTextBlock[];
}

export interface IntelligentUIData {
    artifact?: IntelligentUIArtifact;
    /** One prior successful revision; failed requests never replace either. */
    previous?: IntelligentUIArtifact;
    draft?: string;
    /** Refining the visual must not overwrite independently editable prose. */
    nativeTextPlaced?: boolean;
}

export const UI_MIN_HEIGHT = 160;
export const UI_MAX_HEIGHT = 1600;

/** Bounded resize pattern adapted from OpenIntelligentUI (see THIRD_PARTY_NOTICES.md). */
export function clampUIHeight(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(UI_MIN_HEIGHT, Math.min(Math.ceil(value), UI_MAX_HEIGHT)) : null;
}

export function validateControlState(value: unknown): UIControlState | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const entries = Object.entries(value);
    if (entries.length > 100) return undefined;
    const state: UIControlState = {};
    for (const [key, item] of entries) {
        if (!key || key.length > 160 || ['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
        if (typeof item === 'string' && item.length <= 2000) state[key] = item;
        else if (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) state[key] = item;
        else return undefined;
    }
    return JSON.stringify(state).length <= 16_000 ? state : undefined;
}

/** Validate on generation AND load/import: saved code is still untrusted code. */
export function isIntelligentUIArtifact(value: unknown): value is IntelligentUIArtifact {
    if (!value || typeof value !== 'object') return false;
    const a = value as Record<string, unknown>;
    return a.version === 1 && typeof a.id === 'string' && a.id.length <= 100
        && typeof a.title === 'string' && a.title.length > 0 && a.title.length <= 160
        && typeof a.summary === 'string' && a.summary.length <= 2000
        && typeof a.prompt === 'string' && a.prompt.length <= 20_000
        && typeof a.createdAt === 'string' && a.createdAt.length <= 40
        && (a.model === undefined || (typeof a.model === 'string' && a.model.length <= 160))
        && clampUIHeight(a.initialHeight) === a.initialHeight
        && typeof a.html === 'string' && a.html.trim().length > 0 && a.html.length <= 80_000
        && typeof a.css === 'string' && a.css.length <= 30_000
        && typeof a.jsFunctions === 'string' && a.jsFunctions.length <= 60_000
        && Array.isArray(a.jsExpressions) && a.jsExpressions.length <= 30
        && a.jsExpressions.every((s) => typeof s === 'string' && s.length <= 4000)
        && (a.libraries === undefined || isUILibraries(a.libraries))
        && (a.state === undefined || validateControlState(a.state) !== undefined)
        && (a.before === undefined || isNativeUITextBlocks(a.before))
        && (a.after === undefined || isNativeUITextBlocks(a.after));
}
