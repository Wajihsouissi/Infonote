import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    BookOpen,
    Camera,
    Check,
    ExternalLink,
    Eye,
    EyeOff,
    GripVertical,
    LogIn,
    Pencil,
    Play,
    Quote,
    RefreshCw,
    RotateCcw,
    Scissors,
    Search,
    Sparkles,
    Trash2,
    Upload,
    X,
} from '../../components/icons';
import { FEATURES } from '../../config/featureFlags';
import { useStore } from '../../store/useStore';
import type { AppNodeData } from '../../types';
import { BlockEditor } from '../editor/BlockEditor';
import { parsePlainText } from '../editor/pasteUtils';
import { requestYouTubeTranscript, pollYouTubeTranscript } from './youtubeTranscriptService';
import { rewriteStudySelection, summarizeVideo } from './studyAiService';
import {
    VIDEO_STUDY_SELECTION_MIME,
    applyTranscriptEdits,
    createStudyCardBlocks,
    formatTimestamp,
    parseTimedTextFile,
    selectionRange,
    validateClipRange,
    youtubeUrlAt,
    type StudyClip,
    type TranscriptSegment,
    type VideoStudyDragPayload,
    type YouTubeStudyNodeData,
} from './youtubeStudy';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';
import styles from './YouTubeStudio.module.css';
import { Tabs } from '../../components/ui/Tabs';

type Props = {
    nodeId: string;
    data: YouTubeStudyNodeData;
    onUpdate: (id: string, data: Partial<AppNodeData>) => void;
    onClose: () => void;
};

type Tab = 'transcript' | 'notes' | 'clips';
type CopyMode = 'study' | 'original';
type ClipDraft = { title: string; startSeconds: string; endSeconds: string; segmentIds: string[]; excerpt: string };
type AiPreview = { kind: 'rewrite' | 'summary'; text: string };
type AiError = { message: string; kind: 'rewrite' | 'summary'; isCapacityLimit?: boolean };

const ROW_HEIGHT = 72;
const OVERSCAN = 8;

function isAiCapacityLimit(error: unknown): boolean {
    return error instanceof Error && /(?:available credits|in-flight requests|insufficient credits|credit limit|quota (?:is )?exceeded|payment required)/i.test(error.message);
}

export function YouTubeStudio({ nodeId, data, onUpdate, onClose }: Props) {
    const playerRef = useRef<YouTubePlayerHandle>(null);
    const transcriptListRef = useRef<HTMLDivElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const fetchBusyRef = useRef(false);
    const pollBusyRef = useRef(false);
    const [tab, setTab] = useState<Tab>('transcript');
    const [copyMode, setCopyMode] = useState<CopyMode>('study');
    const [query, setQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [playerError, setPlayerError] = useState<string | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(620);
    const [editingSelection, setEditingSelection] = useState(false);
    const [correction, setCorrection] = useState('');
    const [clipDraft, setClipDraft] = useState<ClipDraft | null>(null);
    const [openClipId, setOpenClipId] = useState<string | null>(null);
    const [aiBusy, setAiBusy] = useState<'rewrite' | 'summary' | null>(null);
    const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
    const [aiError, setAiError] = useState<AiError | null>(null);
    const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
    const setAuthModalOpen = useStore((state) => state.setAuthModalOpen);
    const nodes = useStore((state) => state.nodes);
    const addNode = useStore((state) => state.addNode);
    const onConnect = useStore((state) => state.onConnect);

    const patch = useCallback((next: Partial<YouTubeStudyNodeData>) => {
        onUpdate(nodeId, next as Partial<AppNodeData>);
    }, [nodeId, onUpdate]);

    const displayed = useMemo(
        () => applyTranscriptEdits(data.transcript.segments, data.transcript.edits, copyMode),
        [copyMode, data.transcript.edits, data.transcript.segments],
    );
    const studyCopy = useMemo(
        () => applyTranscriptEdits(data.transcript.segments, data.transcript.edits, 'study'),
        [data.transcript.edits, data.transcript.segments],
    );
    const visibleSegments = useMemo(() => {
        const search = query.trim().toLocaleLowerCase();
        return displayed.filter((segment) => !segment.hidden && (!search || segment.displayText.toLocaleLowerCase().includes(search)));
    }, [displayed, query]);
    const activeSegmentId = useMemo(() => {
        const segments = data.transcript.segments;
        for (let index = segments.length - 1; index >= 0; index -= 1) {
            if (segments[index].startMs <= currentTime) return segments[index].id;
        }
        return null;
    }, [currentTime, data.transcript.segments]);
    const selectedSegments = useMemo(() => {
        const lookup = new Map(studyCopy.filter((segment) => !segment.hidden).map((segment) => [segment.id, segment]));
        return [...selectedIds]
            .map((id) => lookup.get(id))
            .filter((segment): segment is TranscriptSegment & { displayText: string; hidden: boolean } => Boolean(segment))
            .sort((a, b) => a.startMs - b.startMs)
            .map((segment) => ({ ...segment, text: segment.displayText }));
    }, [selectedIds, studyCopy]);
    const selectedRange = useMemo(() => selectionRange(selectedSegments), [selectedSegments]);
    const selectedText = useMemo(() => selectedSegments.map((segment) => segment.text).join(' '), [selectedSegments]);

    const updateTranscript = useCallback((transcript: YouTubeStudyNodeData['transcript']) => patch({ transcript }), [patch]);

    const beginTranscriptFetch = useCallback(async () => {
        if (!data.video || !isAuthenticated || fetchBusyRef.current) return;
        fetchBusyRef.current = true;
        updateTranscript({ ...data.transcript, status: 'loading', error: undefined });
        try {
            const result = await requestYouTubeTranscript(data.video.url, data.transcript.language);
            if (result.status === 'queued') {
                updateTranscript({ ...data.transcript, status: 'queued', jobId: result.jobId, error: undefined });
            } else if (result.status === 'ready') {
                updateTranscript({
                    ...data.transcript,
                    status: 'ready',
                    jobId: undefined,
                    error: undefined,
                    segments: result.segments,
                    language: result.language,
                    availableLanguages: result.availableLanguages,
                    importedAt: new Date().toISOString(),
                });
            } else {
                updateTranscript({ ...data.transcript, status: 'error', error: result.error });
            }
        } catch (error) {
            updateTranscript({ ...data.transcript, status: 'error', error: error instanceof Error ? error.message : 'Transcript retrieval failed.' });
        } finally {
            fetchBusyRef.current = false;
        }
    }, [data.transcript, data.video, isAuthenticated, updateTranscript]);

    useEffect(() => {
        if (data.video && (data.transcript.status === 'idle' || data.transcript.status === 'loading') && isAuthenticated) {
            void beginTranscriptFetch();
        }
    }, [beginTranscriptFetch, data.transcript.status, data.video, isAuthenticated]);

    useEffect(() => {
        if (data.transcript.status !== 'queued' || !data.transcript.jobId || pollBusyRef.current) return;
        const timer = window.setTimeout(async () => {
            pollBusyRef.current = true;
            try {
                const result = await pollYouTubeTranscript(data.transcript.jobId!);
                if (result.status === 'queued') {
                    updateTranscript({ ...data.transcript, status: 'queued', jobId: result.jobId });
                } else if (result.status === 'ready') {
                    updateTranscript({
                        ...data.transcript,
                        status: 'ready',
                        jobId: undefined,
                        error: undefined,
                        segments: result.segments,
                        language: result.language,
                        availableLanguages: result.availableLanguages,
                        importedAt: new Date().toISOString(),
                    });
                } else updateTranscript({ ...data.transcript, status: 'error', jobId: undefined, error: result.error });
            } catch (error) {
                updateTranscript({ ...data.transcript, status: 'error', error: error instanceof Error ? error.message : 'Transcript polling failed.' });
            } finally {
                pollBusyRef.current = false;
            }
        }, 4000);
        return () => window.clearTimeout(timer);
    }, [data.transcript, updateTranscript]);

    useEffect(() => {
        const host = transcriptListRef.current;
        if (!host) return;
        const observer = new ResizeObserver(() => setViewportHeight(host.clientHeight));
        observer.observe(host);
        return () => observer.disconnect();
    }, [tab]);

    useEffect(() => {
        const host = transcriptListRef.current;
        if (!host || !activeSegmentId || query) return;
        const index = visibleSegments.findIndex((segment) => segment.id === activeSegmentId);
        if (index < 0) return;
        const top = index * ROW_HEIGHT;
        const bottom = top + ROW_HEIGHT;
        if (top < host.scrollTop + ROW_HEIGHT || bottom > host.scrollTop + host.clientHeight - ROW_HEIGHT) {
            host.scrollTo({ top: Math.max(0, top - host.clientHeight * .35), behavior: 'smooth' });
        }
    }, [activeSegmentId, query, visibleSegments]);

    useEffect(() => {
        const eventName = 'chnk-it:youtube-seek';
        const listener = (event: Event) => {
            const detail = (event as CustomEvent<{ nodeId?: string; startMs?: number; endMs?: number }>).detail;
            if (detail?.nodeId !== nodeId || typeof detail.startMs !== 'number') return;
            if (typeof detail.endMs === 'number') playerRef.current?.playRange(detail.startMs, detail.endMs);
            else playerRef.current?.seekTo(detail.startMs, true);
        };
        window.addEventListener(eventName, listener);
        return () => window.removeEventListener(eventName, listener);
    }, [nodeId]);

    const selectSegment = (event: React.MouseEvent | React.KeyboardEvent, segmentId: string) => {
        if (window.getSelection()?.toString()) return;
        const next = new Set(selectedIds);
        if (event.shiftKey && anchorId) {
            const from = visibleSegments.findIndex((segment) => segment.id === anchorId);
            const to = visibleSegments.findIndex((segment) => segment.id === segmentId);
            if (from >= 0 && to >= 0) {
                for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) next.add(visibleSegments[index].id);
            }
        } else if (next.has(segmentId)) next.delete(segmentId);
        else next.add(segmentId);
        setSelectedIds(next);
        setAnchorId(segmentId);
    };

    const payloadFor = (kind: VideoStudyDragPayload['kind']): VideoStudyDragPayload | null => {
        if (!data.video || !selectedRange || !selectedText.trim()) return null;
        return {
            version: 1,
            sourceNodeId: nodeId,
            video: data.video,
            segments: selectedSegments,
            cleanedText: selectedText,
            startMs: selectedRange.startMs,
            endMs: selectedRange.endMs,
            kind,
        };
    };

    const createCanvasArtifact = (payload: VideoStudyDragPayload) => {
        const sourceNode = nodes.find((node) => node.id === nodeId);
        const newId = uuidv4();
        addNode('note', {
            x: (sourceNode?.position.x || 0) + 420,
            y: (sourceNode?.position.y || 0) + 32 + Math.min(160, Math.random() * 80),
        }, {
            label: payload.kind === 'moment' ? `Moment · ${formatTimestamp(payload.startMs)}` : data.video?.title || 'Video study note',
            content: createStudyCardBlocks(payload),
            coverImage: payload.kind === 'moment' ? payload.video.thumbnailUrl : undefined,
            sourceRef: {
                kind: 'youtube',
                sourceNodeId: nodeId,
                videoId: payload.video.videoId,
                url: payload.video.url,
                title: payload.video.title,
                startMs: payload.startMs,
                endMs: payload.kind === 'clip' ? payload.endMs : undefined,
                segmentIds: payload.segments.map((segment) => segment.id),
            },
        }, undefined, sourceNode?.parentId || undefined, newId);
        if (useStore.getState().nodes.some((node) => node.id === newId)) {
            onConnect({ source: nodeId, target: newId, sourceHandle: 'out', targetHandle: null });
            window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [newId] } }));
        }
    };

    const addSelectionToCanvas = (kind: VideoStudyDragPayload['kind']) => {
        const payload = payloadFor(kind);
        if (payload) createCanvasArtifact(payload);
    };

    const addClipToCanvas = (clip: StudyClip) => {
        if (!data.video) return;
        const segmentIds = new Set(clip.segmentIds);
        const segments = data.transcript.segments.filter((segment) => segmentIds.has(segment.id));
        createCanvasArtifact({
            version: 1,
            sourceNodeId: nodeId,
            video: data.video,
            segments,
            cleanedText: clip.excerpt,
            startMs: clip.startMs,
            endMs: clip.endMs,
            kind: 'clip',
        });
    };

    const onSelectionDragStart = (event: React.DragEvent) => {
        const payload = payloadFor('quote');
        if (!payload) return;
        event.dataTransfer.setData(VIDEO_STUDY_SELECTION_MIME, JSON.stringify(payload));
        event.dataTransfer.effectAllowed = 'copy';
    };

    const hideSelection = () => {
        const hidden = new Set(data.transcript.edits.hiddenSegmentIds);
        selectedIds.forEach((id) => hidden.add(id));
        updateTranscript({ ...data.transcript, edits: { ...data.transcript.edits, hiddenSegmentIds: [...hidden] } });
        setSelectedIds(new Set());
    };

    const restoreSelection = () => {
        const correctedText = { ...data.transcript.edits.correctedText };
        selectedIds.forEach((id) => delete correctedText[id]);
        updateTranscript({
            ...data.transcript,
            edits: {
                correctedText,
                hiddenSegmentIds: data.transcript.edits.hiddenSegmentIds.filter((id) => !selectedIds.has(id)),
            },
        });
    };

    const openCorrection = () => {
        setCorrection(selectedText);
        setEditingSelection(true);
    };

    const applyCorrection = () => {
        if (!correction.trim() || selectedSegments.length === 0) return;
        const correctedText = { ...data.transcript.edits.correctedText, [selectedSegments[0].id]: correction.trim() };
        const hidden = new Set(data.transcript.edits.hiddenSegmentIds);
        selectedSegments.slice(1).forEach((segment) => hidden.add(segment.id));
        updateTranscript({ ...data.transcript, edits: { correctedText, hiddenSegmentIds: [...hidden] } });
        setEditingSelection(false);
        setSelectedIds(new Set([selectedSegments[0].id]));
    };

    const beginClip = () => {
        if (!selectedRange) return;
        setClipDraft({
            title: `Clip · ${formatTimestamp(selectedRange.startMs)}`,
            startSeconds: (selectedRange.startMs / 1000).toFixed(1),
            endSeconds: (selectedRange.endMs / 1000).toFixed(1),
            segmentIds: selectedSegments.map((segment) => segment.id),
            excerpt: selectedText,
        });
        setTab('clips');
    };

    const saveClip = () => {
        if (!clipDraft) return;
        const range = validateClipRange(Number(clipDraft.startSeconds) * 1000, Number(clipDraft.endSeconds) * 1000);
        const clip: StudyClip = {
            id: uuidv4(),
            title: clipDraft.title.trim() || `Clip · ${formatTimestamp(range.startMs)}`,
            startMs: range.startMs,
            endMs: range.endMs,
            segmentIds: clipDraft.segmentIds,
            excerpt: clipDraft.excerpt,
            notes: [],
            createdAt: new Date().toISOString(),
        };
        patch({ clips: [...data.clips, clip] });
        setClipDraft(null);
        setOpenClipId(clip.id);
    };

    const updateClip = (clipId: string, next: Partial<StudyClip>) => {
        patch({ clips: data.clips.map((clip) => clip.id === clipId ? { ...clip, ...next } : clip) });
    };

    const importTranscript = async (file: File) => {
        try {
            const segments = parseTimedTextFile(await file.text());
            updateTranscript({
                ...data.transcript,
                status: 'ready',
                segments,
                error: undefined,
                jobId: undefined,
                importedAt: new Date().toISOString(),
            });
        } catch (error) {
            updateTranscript({ ...data.transcript, status: 'error', error: error instanceof Error ? error.message : 'The transcript file is malformed.' });
        }
    };

    const runAi = async (kind: 'rewrite' | 'summary') => {
        const cleanedTranscript = studyCopy
            .filter((segment) => !segment.hidden)
            .map((segment) => ({ ...segment, text: segment.displayText }));
        const source = kind === 'rewrite' ? selectedSegments : (selectedSegments.length ? selectedSegments : cleanedTranscript);
        if (source.length === 0) {
            setAiError({
                kind,
                message: kind === 'summary'
                    ? 'There is no usable video content to summarize yet.'
                    : 'Select one or more transcript lines before rewriting.',
            });
            return;
        }
        setAiError(null);
        setAiBusy(kind);
        try {
            const text = kind === 'rewrite' ? await rewriteStudySelection(source) : await summarizeVideo(source, data.video?.title);
            setAiPreview({ kind, text });
        } catch (error) {
            const isCapacityLimit = isAiCapacityLimit(error);
            setAiError({
                kind,
                isCapacityLimit,
                message: isCapacityLimit
                    ? 'AI capacity is temporarily busy. Wait for other AI requests to finish, then retry this video summary. Your video and notes are unchanged.'
                    : error instanceof Error ? error.message : 'The study AI action failed. Please try again.',
            });
        } finally {
            setAiBusy(null);
        }
    };

    const applyAiRewrite = () => {
        if (aiPreview?.kind !== 'rewrite') return;
        setCorrection(aiPreview.text);
        setEditingSelection(true);
        setAiPreview(null);
    };

    const addAiToNotes = () => {
        if (!aiPreview) return;
        const heading = aiPreview.kind === 'summary' ? 'Video summary' : 'AI rewritten passage';
        patch({
            notes: [
                ...data.notes,
                { id: uuidv4(), type: 'heading2', content: heading },
                ...parsePlainText(aiPreview.text),
            ],
        });
        setAiPreview(null);
        setTab('notes');
    };

    const addAiToCanvas = () => {
        if (!aiPreview || !data.video) return;
        const sourceNode = nodes.find((node) => node.id === nodeId);
        const fullRange = selectionRange(data.transcript.segments);
        const range = selectedRange || fullRange || { startMs: 0, endMs: 1000 };
        const newId = uuidv4();
        addNode('note', {
            x: (sourceNode?.position.x || 0) + 420,
            y: (sourceNode?.position.y || 0) + 120,
        }, {
            label: aiPreview.kind === 'summary'
                ? `Video summary · ${data.video.title}`
                : `Rewritten passage · ${data.video.title}`,
            content: parsePlainText(aiPreview.text),
            sourceRef: {
                kind: 'youtube',
                sourceNodeId: nodeId,
                videoId: data.video.videoId,
                url: data.video.url,
                title: data.video.title,
                startMs: range.startMs,
                endMs: range.endMs,
                segmentIds: selectedSegments.length
                    ? selectedSegments.map((segment) => segment.id)
                    : data.transcript.segments.map((segment) => segment.id),
            },
        }, undefined, sourceNode?.parentId || undefined, newId);
        if (useStore.getState().nodes.some((node) => node.id === newId)) {
            onConnect({ source: nodeId, target: newId, sourceHandle: 'out', targetHandle: null });
            window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [newId] } }));
        }
        setAiPreview(null);
    };

    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(visibleSegments.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    const windowedSegments = visibleSegments.slice(startIndex, endIndex);

    if (!data.video) return null;

    return (
        <section className={styles.studio} aria-label="YouTube Study Studio">
            <header className={styles.header}>
                <div className={styles.headerText}>
                    <span className={styles.kicker}>YouTube Study Studio</span>
                    <strong>{data.video.title}</strong>
                </div>
                <a className={styles.iconButton} href={youtubeUrlAt(data.video.url, currentTime)} target="_blank" rel="noreferrer" aria-label="Open on YouTube">
                    <ExternalLink size={17} />
                </a>
                <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close study studio"><X size={19} /></button>
            </header>

            <YouTubePlayer ref={playerRef} videoId={data.video.videoId} onTimeChange={setCurrentTime} onUnavailable={setPlayerError} />
            {playerError && <div className={styles.playerNotice}>{playerError}</div>}
            {aiError && (
                <div className={styles.aiNotice} role="alert">
                    <span>{aiError.message}</span>
                    <button type="button" disabled={aiBusy !== null} onClick={() => void runAi(aiError.kind)}>{aiError.isCapacityLimit ? 'Retry when ready' : 'Try again'}</button>
                    <button type="button" onClick={() => setAiError(null)}>Dismiss</button>
                </div>
            )}

            <Tabs
                className={styles.tabs}
                items={[
                    { id: 'transcript', label: 'Transcript', icon: <Quote size={15} /> },
                    { id: 'notes', label: 'Notes', icon: <BookOpen size={15} /> },
                    { id: 'clips', label: 'Clips', icon: <Scissors size={15} />, badge: data.clips.length },
                ]}
                value={tab}
                onChange={setTab}
                variant="underlined"
                color="accent"
                fullWidth
                aria-label="Study sections"
            />

            <div className={styles.body}>
                {tab === 'transcript' && (
                    <div className={styles.transcriptPane}>
                        <div className={styles.transcriptTools}>
                            <label className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcript" /></label>
                            <div className={styles.copyToggle} aria-label="Transcript version">
                                <button className={copyMode === 'study' ? styles.toggleActive : ''} onClick={() => setCopyMode('study')}>Study copy</button>
                                <button className={copyMode === 'original' ? styles.toggleActive : ''} onClick={() => setCopyMode('original')}>Original</button>
                            </div>
                        </div>
                        {data.transcript.status === 'ready' && (
                            <div className={styles.transcriptMeta}>
                                <span>{data.transcript.language || 'Language not reported'}</span>
                                <span>{data.transcript.segments.length} lines</span>
                                <button onClick={() => importInputRef.current?.click()}><Upload size={12} /> Replace with SRT/VTT</button>
                            </div>
                        )}

                        {data.transcript.status === 'loading' || data.transcript.status === 'queued' ? (
                            <div className={styles.emptyState}><RefreshCw className={styles.spin} size={22} /><strong>{data.transcript.status === 'queued' ? 'Transcript is queued' : 'Finding the transcript'}</strong><p>You can keep taking notes while this finishes.</p></div>
                        ) : data.transcript.status !== 'ready' ? (
                            <div className={styles.emptyState}>
                                <Quote size={24} />
                                <strong>{data.transcript.status === 'error' ? 'Transcript unavailable' : 'Add a transcript'}</strong>
                                <p>{data.transcript.error || (isAuthenticated ? 'Fetch the timestamped transcript or import an SRT/VTT file.' : 'Guests can import SRT/VTT. Sign in for automatic retrieval.')}</p>
                                <div className={styles.emptyActions}>
                                    {isAuthenticated
                                        ? <button onClick={() => void beginTranscriptFetch()}><RefreshCw size={15} /> Fetch transcript</button>
                                        : <button onClick={() => setAuthModalOpen(true)}><LogIn size={15} /> Sign in</button>}
                                    <button onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import SRT/VTT</button>
                                </div>
                            </div>
                        ) : (
                            <div
                                ref={transcriptListRef}
                                className={styles.transcriptList}
                                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                                role="listbox"
                                aria-multiselectable="true"
                            >
                                <div style={{ height: startIndex * ROW_HEIGHT }} />
                                {windowedSegments.map((segment) => (
                                    <div
                                        key={segment.id}
                                        className={`${styles.segment} ${selectedIds.has(segment.id) ? styles.segmentSelected : ''} ${activeSegmentId === segment.id ? styles.segmentActive : ''}`}
                                        onClick={(event) => selectSegment(event, segment.id)}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            selectSegment(event, segment.id);
                                        }}
                                        tabIndex={0}
                                        role="option"
                                        aria-selected={selectedIds.has(segment.id)}
                                    >
                                        <button className={styles.timestamp} type="button" onClick={(event) => { event.stopPropagation(); playerRef.current?.seekTo(segment.startMs, true); }}>
                                            {formatTimestamp(segment.startMs)}
                                        </button>
                                        <p>{segment.displayText}</p>
                                    </div>
                                ))}
                                <div style={{ height: Math.max(0, (visibleSegments.length - endIndex) * ROW_HEIGHT) }} />
                                {visibleSegments.length === 0 && <div className={styles.noMatches}>No transcript lines match “{query}”.</div>}
                            </div>
                        )}

                        <input ref={importInputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTranscript(file); event.target.value = ''; }} />

                        {selectedIds.size > 0 && (
                            <div className={styles.selectionBar}>
                                <button className={styles.dragHandle} draggable onDragStart={onSelectionDragStart} title="Drag selected lines to the canvas"><GripVertical size={17} /></button>
                                <span className={styles.selectionCount}>{selectedIds.size} selected</span>
                                <button onClick={() => addSelectionToCanvas('quote')}><Quote size={15} /> Add to canvas</button>
                                <button onClick={() => addSelectionToCanvas('moment')}><Camera size={15} /> Moment</button>
                                <button onClick={beginClip}><Scissors size={15} /> Clip</button>
                                {copyMode === 'study' && <button onClick={hideSelection}><EyeOff size={15} /> Hide</button>}
                                {copyMode === 'study' && <button onClick={openCorrection}><Pencil size={15} /> Correct</button>}
                                <button onClick={restoreSelection}><RotateCcw size={15} /> Restore</button>
                                {FEATURES.youtubeStudyAI && <button disabled={aiBusy != null} onClick={() => void runAi('rewrite')}><Sparkles size={15} /> Rewrite</button>}
                                <button className={styles.iconButton} onClick={() => setSelectedIds(new Set())} aria-label="Clear selection"><X size={15} /></button>
                            </div>
                        )}
                        {FEATURES.youtubeStudyAI && data.transcript.status === 'ready' && (
                            <button className={styles.summaryButton} disabled={aiBusy != null} onClick={() => void runAi('summary')}><Sparkles size={15} /> {aiBusy === 'summary' ? 'Summarizing…' : selectedIds.size ? 'Summarize video part' : 'Summarize video'}</button>
                        )}
                    </div>
                )}

                {tab === 'notes' && (
                    <div className={styles.notesPane}>
                        <div className={styles.sectionIntro}>
                            <div><span>Video notebook</span><strong>Notes that stay with this video</strong></div>
                            <div className={styles.notesHeaderActions}>
                                {FEATURES.youtubeStudyAI && (
                                    <button
                                        type="button"
                                        className={styles.notesSummaryButton}
                                        disabled={aiBusy !== null || data.transcript.status !== 'ready'}
                                        title={data.transcript.status === 'ready'
                                            ? 'Create a bullet-point summary of this video'
                                            : 'Add or fetch spoken video content before creating a summary'}
                                        onClick={() => void runAi('summary')}
                                    >
                                        <Sparkles size={14} />
                                        {aiBusy === 'summary' ? 'Summarizing…' : 'Video summary'}
                                    </button>
                                )}
                                <span className={styles.timePill}>{formatTimestamp(currentTime)}</span>
                            </div>
                        </div>
                        <BlockEditor nodeId={`${nodeId}:youtube-notes`} initialContent={data.notes} onUpdate={(notes) => patch({ notes })} autoFocus={false} />
                    </div>
                )}

                {tab === 'clips' && (
                    <div className={styles.clipsPane}>
                        <div className={styles.sectionIntro}><div><span>Timestamp ranges</span><strong>Playable clips, not downloaded media</strong></div></div>
                        {clipDraft && (
                            <div className={styles.clipDraft}>
                                <label>Title<input value={clipDraft.title} onChange={(event) => setClipDraft({ ...clipDraft, title: event.target.value })} /></label>
                                <div className={styles.rangeFields}>
                                    <label>Start (seconds)<input type="number" min="0" step="0.1" value={clipDraft.startSeconds} onChange={(event) => setClipDraft({ ...clipDraft, startSeconds: event.target.value })} /></label>
                                    <label>End (seconds)<input type="number" min="1" step="0.1" value={clipDraft.endSeconds} onChange={(event) => setClipDraft({ ...clipDraft, endSeconds: event.target.value })} /></label>
                                </div>
                                <p>{clipDraft.excerpt}</p>
                                <div className={styles.clipDraftActions}><button onClick={() => playerRef.current?.playRange(Number(clipDraft.startSeconds) * 1000, Number(clipDraft.endSeconds) * 1000)}><Play size={14} /> Preview</button><button className={styles.primaryButton} onClick={saveClip}><Check size={14} /> Save clip</button><button onClick={() => setClipDraft(null)}>Cancel</button></div>
                            </div>
                        )}
                        {data.clips.length === 0 && !clipDraft && <div className={styles.emptyState}><Scissors size={24} /><strong>No clips yet</strong><p>Select transcript lines, then choose Clip to create a playable timestamp range.</p></div>}
                        <div className={styles.clipList}>
                            {data.clips.map((clip) => (
                                <article className={styles.clipCard} key={clip.id}>
                                    <button className={styles.clipHeading} onClick={() => setOpenClipId(openClipId === clip.id ? null : clip.id)}>
                                        <span><strong>{clip.title}</strong><small>{formatTimestamp(clip.startMs)}–{formatTimestamp(clip.endMs)}</small></span>
                                        <Play size={16} />
                                    </button>
                                    <p>{clip.excerpt}</p>
                                    <div className={styles.clipActions}>
                                        <button onClick={() => playerRef.current?.playRange(clip.startMs, clip.endMs)}><Play size={14} /> Play range</button>
                                        <button onClick={() => { setSelectedIds(new Set(clip.segmentIds)); setTab('transcript'); }}><Eye size={14} /> Transcript</button>
                                        <button onClick={() => addClipToCanvas(clip)}><Quote size={14} /> Add to canvas</button>
                                        <button onClick={() => patch({ clips: data.clips.filter((item) => item.id !== clip.id) })}><Trash2 size={14} /> Delete</button>
                                    </div>
                                    {openClipId === clip.id && <div className={styles.clipNotes}><span>Clip notes</span><BlockEditor nodeId={`${nodeId}:clip:${clip.id}`} initialContent={clip.notes} onUpdate={(notes) => updateClip(clip.id, { notes })} autoFocus={false} /></div>}
                                </article>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {editingSelection && (
                <div className={styles.dialogBackdrop} role="presentation" onKeyDown={(event) => {
                    if (event.key === 'Escape') { event.stopPropagation(); setEditingSelection(false); }
                }}>
                    <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Correct transcript selection">
                        <span>Study copy correction</span>
                        <strong>Replace {selectedSegments.length} selected {selectedSegments.length === 1 ? 'line' : 'lines'}</strong>
                        <textarea value={correction} onChange={(event) => setCorrection(event.target.value)} autoFocus />
                        <p>The imported source remains unchanged. Replacing multiple lines stores this as one corrected passage.</p>
                        <div><button onClick={() => setEditingSelection(false)}>Cancel</button><button className={styles.primaryButton} onClick={applyCorrection}><Check size={15} /> Apply correction</button></div>
                    </div>
                </div>
            )}

            {aiPreview && (
                <div className={styles.dialogBackdrop} role="presentation" onKeyDown={(event) => {
                    if (event.key === 'Escape') { event.stopPropagation(); setAiPreview(null); }
                }}>
                    <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="AI study preview">
                        <span>Preview · nothing changed yet</span>
                        <strong>{aiPreview.kind === 'rewrite' ? 'Rewritten passage' : 'Video summary'}</strong>
                        <textarea value={aiPreview.text} onChange={(event) => setAiPreview({ ...aiPreview, text: event.target.value })} />
                        <div><button onClick={() => setAiPreview(null)}>Cancel</button>{aiPreview.kind === 'rewrite' && <button onClick={applyAiRewrite}>Use as correction</button>}<button onClick={addAiToCanvas}><Quote size={15} /> Add to canvas</button><button className={styles.primaryButton} onClick={addAiToNotes}><BookOpen size={15} /> Add to Notes</button></div>
                    </div>
                </div>
            )}

            <footer className={styles.footer}>Playback stays on YouTube. <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube terms</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy</a></footer>
        </section>
    );
}
