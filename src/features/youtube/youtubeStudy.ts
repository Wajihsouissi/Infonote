import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../editor/types';

export type TranscriptStatus = 'idle' | 'loading' | 'queued' | 'ready' | 'error';

export type TranscriptSegment = {
    id: string;
    startMs: number;
    durationMs: number;
    language: string;
    text: string;
};

export type TranscriptEdits = {
    hiddenSegmentIds: string[];
    correctedText: Record<string, string>;
};

export type StudyClip = {
    id: string;
    title: string;
    startMs: number;
    endMs: number;
    segmentIds: string[];
    excerpt: string;
    notes: Block[];
    createdAt: string;
};

export type YouTubeSourceRef = {
    kind: 'youtube';
    sourceNodeId: string;
    videoId: string;
    url: string;
    title: string;
    startMs: number;
    endMs?: number;
    segmentIds: string[];
};

export type YouTubeVideoMetadata = {
    videoId: string;
    url: string;
    title: string;
    channel: string;
    thumbnailUrl: string;
};

export type YouTubeTranscriptState = {
    status: TranscriptStatus;
    segments: TranscriptSegment[];
    edits: TranscriptEdits;
    language?: string;
    availableLanguages?: string[];
    jobId?: string;
    error?: string;
    importedAt?: string;
};

export type YouTubeStudyNodeData = {
    label: string;
    video: YouTubeVideoMetadata | null;
    transcript: YouTubeTranscriptState;
    notes: Block[];
    clips: StudyClip[];
    createdAt: string;
    updatedAt?: string;
};

export type VideoStudyDragPayload = {
    version: 1;
    sourceNodeId: string;
    video: YouTubeVideoMetadata;
    segments: TranscriptSegment[];
    cleanedText: string;
    startMs: number;
    endMs: number;
    kind: 'quote' | 'moment' | 'clip';
};

export const VIDEO_STUDY_SELECTION_MIME = 'application/chnk-it-video-study-selection';
/**
 * Smart-link blocks cannot access React Flow's canvas instance directly. They
 * request a studio through this event and CanvasBoard creates (or reuses) the
 * source node in the active canvas.
 */
export const OPEN_YOUTUBE_STUDY_EVENT = 'chnk-it:open-youtube-study';

export type OpenYouTubeStudyDetail = {
    url: string;
};

export function parseYouTubeUrl(input: string): { videoId: string; canonicalUrl: string } | null {
    const value = input.trim();
    if (!value) return null;

    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
        return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
        else if (['embed', 'shorts', 'live'].includes(parts[0])) videoId = parts[1] || '';
    }

    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

export function youtubeThumbnail(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function createYouTubeStudyData(url = ''): YouTubeStudyNodeData {
    const parsed = parseYouTubeUrl(url);
    const createdAt = new Date().toISOString();
    return {
        label: parsed ? 'YouTube study' : 'Add a YouTube video',
        video: parsed ? {
            videoId: parsed.videoId,
            url: parsed.canonicalUrl,
            title: 'YouTube video',
            channel: 'YouTube',
            thumbnailUrl: youtubeThumbnail(parsed.videoId),
        } : null,
        transcript: {
            status: 'idle',
            segments: [],
            edits: { hiddenSegmentIds: [], correctedText: {} },
        },
        notes: [],
        clips: [],
        createdAt,
        updatedAt: createdAt,
    };
}

function stableHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function stableSegmentId(startMs: number, durationMs: number, text: string, index: number): string {
    return `yt-${Math.max(0, Math.round(startMs))}-${stableHash(`${durationMs}|${text.trim()}|${index}`)}`;
}

type ProviderSegment = {
    text?: unknown;
    offset?: unknown;
    start?: unknown;
    duration?: unknown;
    lang?: unknown;
    language?: unknown;
};

function finiteNumber(value: unknown, fallback = 0): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/** Supadata offsets and durations are milliseconds; native imports use this same shape. */
export function normalizeTranscriptSegments(input: unknown, fallbackLanguage = 'und'): TranscriptSegment[] {
    if (!Array.isArray(input)) return [];
    return input.flatMap((item, index) => {
        const segment = (item || {}) as ProviderSegment;
        const text = typeof segment.text === 'string' ? segment.text.trim() : '';
        if (!text) return [];
        const startMs = Math.max(0, finiteNumber(segment.offset ?? segment.start));
        const durationMs = Math.max(0, finiteNumber(segment.duration));
        const language = typeof (segment.lang ?? segment.language) === 'string'
            ? String(segment.lang ?? segment.language)
            : fallbackLanguage;
        return [{
            id: stableSegmentId(startMs, durationMs, text, index),
            startMs,
            durationMs,
            language,
            text,
        }];
    });
}

export function applyTranscriptEdits(
    segments: TranscriptSegment[],
    edits: TranscriptEdits,
    mode: 'original' | 'study' = 'study',
): Array<TranscriptSegment & { hidden: boolean; displayText: string }> {
    const hidden = new Set(edits.hiddenSegmentIds);
    return segments.map((segment) => ({
        ...segment,
        hidden: mode === 'study' && hidden.has(segment.id),
        displayText: mode === 'study' ? (edits.correctedText[segment.id] ?? segment.text) : segment.text,
    }));
}

export function formatTimestamp(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function youtubeUrlAt(url: string, startMs: number): string {
    const parsed = parseYouTubeUrl(url);
    if (!parsed) return url;
    return `${parsed.canonicalUrl}&t=${Math.max(0, Math.floor(startMs / 1000))}s`;
}

export function selectionRange(segments: TranscriptSegment[]): { startMs: number; endMs: number } | null {
    if (segments.length === 0) return null;
    const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return { startMs: first.startMs, endMs: Math.max(last.startMs + Math.max(last.durationMs, 1000), first.startMs + 1000) };
}

export function validateClipRange(startMs: number, endMs: number): { startMs: number; endMs: number } {
    const start = Number.isFinite(startMs) ? Math.max(0, Math.round(startMs)) : 0;
    const requestedEnd = Number.isFinite(endMs) ? Math.round(endMs) : start + 1000;
    const end = Math.max(start + 1000, requestedEnd);
    return { startMs: start, endMs: end };
}

function parseTimestamp(value: string): number | null {
    const match = value.trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const millis = Number((match[4] || '').padEnd(3, '0') || 0);
    if (minutes > 59 || seconds > 59) return null;
    return ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis;
}

export function parseTimedTextFile(source: string, language = 'und'): TranscriptSegment[] {
    const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) throw new Error('The transcript file is empty.');
    const blocks = normalized.replace(/^WEBVTT[^\n]*\n+/i, '').split(/\n{2,}/);
    const parsed: Array<{ startMs: number; durationMs: number; text: string; language: string }> = [];

    for (const block of blocks) {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const timingIndex = lines.findIndex((line) => line.includes('-->'));
        if (timingIndex < 0) continue;
        const [rawStart, rawEnd] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
        const startMs = parseTimestamp(rawStart);
        const endMs = parseTimestamp(rawEnd);
        const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (startMs == null || endMs == null || endMs <= startMs || !text) continue;
        parsed.push({ startMs, durationMs: endMs - startMs, text, language });
    }

    if (parsed.length === 0) throw new Error('No valid timestamped cues were found. Use an SRT or VTT file.');
    return parsed.map((segment, index) => ({
        ...segment,
        id: stableSegmentId(segment.startMs, segment.durationMs, segment.text, index),
    }));
}

export function createStudyCardBlocks(payload: VideoStudyDragPayload): Block[] {
    const timestampUrl = youtubeUrlAt(payload.video.url, payload.startMs);
    return [
        { id: uuidv4(), type: 'quote', content: payload.cleanedText },
        {
            id: uuidv4(),
            type: 'link',
            content: timestampUrl,
            metadata: {
                title: `${payload.video.title} · ${formatTimestamp(payload.startMs)}`,
                description: payload.kind === 'moment' ? 'YouTube moment citation' : 'YouTube transcript citation',
                image: payload.video.thumbnailUrl,
                displayMode: 'bookmark',
                isLoading: false,
            },
        },
    ];
}

export function decodeVideoStudyDragPayload(value: string): VideoStudyDragPayload | null {
    try {
        const candidate = JSON.parse(value) as Partial<VideoStudyDragPayload>;
        if (candidate.version !== 1 || !candidate.sourceNodeId || !candidate.video || !Array.isArray(candidate.segments)) return null;
        if (!Number.isFinite(candidate.startMs) || !Number.isFinite(candidate.endMs)) return null;
        if (typeof candidate.cleanedText !== 'string' || !candidate.cleanedText.trim()) return null;
        return candidate as VideoStudyDragPayload;
    } catch {
        return null;
    }
}
