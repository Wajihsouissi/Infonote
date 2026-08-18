import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import {
    Sparkles,
    X,
    SquarePen,
    Send,
    Square,
    ImagePlus,
    Check,
    Loader2,
    AlertCircle,
    CornerDownLeft,
    Undo2,
    Copy,
    Plus,
    Paperclip,
    ChevronDown,
    FileText,
    Gauge,
    Network,
    Layers,
    Kanban,
    Waypoints,
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import { streamText, FREEFORM_SYSTEM_PROMPT } from '../../services/aiService';
import { buildCanvasContext, nodeTitle } from './canvasContext';
import { buildConversationPrompt } from './aiPrompt';
import {
    ATTACHMENT_ACCEPT,
    MAX_ATTACHMENTS,
    attachmentImages,
    attachmentPreamble,
    readAttachment,
    type AIAttachment,
} from './attachments';
import { AI_MODELS, modelLabel } from '../../config/aiModels';
import { AI_EFFORT_LEVELS, effortLabel } from '../../config/aiEffort';
import { AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH } from '../../store/slices/aiSlice';
import { formatBytes } from '../editor/mediaTypes';
import { addAnswerToCanvas, runCreate, runEdit, runImage, type RunnerContext } from './aiRunner';
import { AIMarkdown } from './AIMarkdown';
import { SelectedNodeStrip } from './SelectedNodeStrip';
import type { AIAssistantMessage, AIIntent, AIStep } from './aiTypes';
import { AI_CONTEXT_DEFINITIONS } from './aiTypes';
import styles from './AIPanel.module.css';

const SUGGESTIONS: { label: string; prompt: string; mode: 'create' | 'ask' }[] = [
    { label: 'Break this topic into cards', prompt: 'Create 4 cards breaking down ', mode: 'create' },
    { label: 'Mindmap a subject', prompt: 'Mindmap of ', mode: 'create' },
    { label: 'Summarise my canvas', prompt: 'Summarise what is on this canvas and what is missing.', mode: 'ask' },
    { label: 'Rewrite the selected card', prompt: 'Rewrite this more clearly and tighten the wording.', mode: 'create' },
];

/* Keys must match the `icon` field in AI_CONTEXT_DEFINITIONS. A definition
   naming an icon that is missing here resolves to `undefined` and React throws
   on render, so the two lists have to move together. */
const CONTEXT_ICONS: Record<string, React.FC<{ size?: number }>> = {
    Network,
    Layers,
    Kanban,
    FileText,
    Waypoints,
};

export function AIPanel() {
    const isOpen = useStore((s) => s.isAIPanelOpen);
    const mode = useStore((s) => s.aiMode);
    const imageMode = useStore((s) => s.aiImageMode);
    const messages = useStore((s) => s.aiMessages);
    const isRunning = useStore((s) => s.aiIsRunning);
    const selectedCanvasNodeIds = useStore((s) => s.selectedCanvasNodeIds);
    const currentParentId = useStore((s) => s.currentParentId);

    const setAIPanelOpen = useStore((s) => s.setAIPanelOpen);
    const setAIMode = useStore((s) => s.setAIMode);
    const setAIImageMode = useStore((s) => s.setAIImageMode);
    const setAIRunning = useStore((s) => s.setAIRunning);
    const aiSelectedContexts = useStore((s) => s.aiSelectedContexts);
    const toggleAIContext = useStore((s) => s.toggleAIContext);
    const clearAIContexts = useStore((s) => s.clearAIContexts);
    const appendAIMessage = useStore((s) => s.appendAIMessage);
    const startAITurn = useStore((s) => s.startAITurn);
    const updateAITurn = useStore((s) => s.updateAITurn);
    const pushAIStep = useStore((s) => s.pushAIStep);
    const appendAIText = useStore((s) => s.appendAIText);
    const newAIChat = useStore((s) => s.newAIChat);

    const aiModel = useStore((s) => s.aiModel);
    const aiEffort = useStore((s) => s.aiEffort);
    const setAIEffort = useStore((s) => s.setAIEffort);
    const aiPanelWidth = useStore((s) => s.aiPanelWidth);
    const setAIPanelWidth = useStore((s) => s.setAIPanelWidth);
    // Live width while a resize drag is in flight; null outside a drag, when
    // the panel is simply the persisted aiPanelWidth.
    const [dragWidth, setDragWidth] = useState<number | null>(null);
    const setAIModel = useStore((s) => s.setAIModel);

    const { screenToFlowPosition, getViewport } = useReactFlow();
    const [draft, setDraft] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<AIAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [effortMenuOpen, setEffortMenuOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const effortMenuRef = useRef<HTMLDivElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Cards the turn will be about. Read live so the chip updates as the user
    // selects on the canvas with the panel open — that pairing is the whole
    // reason this is a panel and not a popover.
    const selectedNodes = useMemo(
        () => useStore.getState().nodes.filter((n) => selectedCanvasNodeIds.has(n.id)),
        [selectedCanvasNodeIds]
    );

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Pin to the newest content while a turn streams.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, isOpen]);

    const runnerContext = useCallback((): RunnerContext => {
        const { x, y, zoom } = getViewport();
        return {
            origin: screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
            viewport: () => ({ x, y, zoom, screenW: window.innerWidth, screenH: window.innerHeight }),
            currentParentId,
            step: () => '',
            settle: () => {},
        };
    }, [getViewport, screenToFlowPosition, currentParentId]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setAIRunning(false);
    }, [setAIRunning]);

    // Close the model menu on any click outside it.
    useEffect(() => {
        if (!modelMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [modelMenuOpen]);

    // Same for the effort menu — its own listener so opening one closes nothing.
    useEffect(() => {
        if (!effortMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (!effortMenuRef.current?.contains(e.target as Node)) setEffortMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [effortMenuOpen]);

    // Context picker popover — portal renders into body, so check both the
    // anchor ref and the portal wrapper (tagged with data-context-popover).
    useEffect(() => {
        if (!contextMenuOpen) return;
        const close = (e: MouseEvent) => {
            const target = e.target as Node;
            if (contextMenuRef.current?.contains(target)) return;
            if ((target as HTMLElement)?.closest?.('[data-context-popover]')) return;
            setContextMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [contextMenuOpen]);

    /**
     * Take files from the picker, a drop, or a paste. Each is read on its own so
     * one unreadable file (a video, an oversized image) reports its reason
     * without discarding the ones that were fine.
     */
    const addFiles = useCallback(async (files: FileList | File[]) => {
        const incoming = Array.from(files);
        if (incoming.length === 0) return;
        setAttachError(null);

        const accepted: AIAttachment[] = [];
        const refused: string[] = [];

        for (const file of incoming) {
            if (attachments.length + accepted.length >= MAX_ATTACHMENTS) {
                refused.push(`Only ${MAX_ATTACHMENTS} attachments per message.`);
                break;
            }
            try {
                accepted.push(await readAttachment(file));
            } catch (err) {
                refused.push(err instanceof Error ? err.message : `Could not read ${file.name}.`);
            }
        }

        if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
        if (refused.length > 0) setAttachError(refused[0]);
    }, [attachments.length]);

    const submit = useCallback(async (rawQuery?: string) => {
        const query = (rawQuery ?? draft).trim();
        if (!query || isRunning) return;

        const selectedIds = Array.from(selectedCanvasNodeIds);
        const intent: AIIntent = mode === 'ask' ? 'ask' : imageMode ? 'image' : selectedIds.length > 0 ? 'edit' : 'create';

        const turnAttachments = attachments;
        appendAIMessage({
            id: uuidv4(),
            role: 'user',
            text: query,
            intent,
            contextLabels: [...selectedNodes.map(nodeTitle), ...turnAttachments.map((a) => a.name)],
            // Declared on AIUserMessage since the picker shipped but never
            // populated, so "why did I get a board" was unanswerable after the
            // fact. Recorded per turn now.
            selectedContexts: intent === 'create' && aiSelectedContexts.length > 0 ? [...aiSelectedContexts] : undefined,
            at: new Date().toISOString(),
        });
        setDraft('');
        setAttachments([]);
        setAttachError(null);

        const turnId = startAITurn(intent);
        const controller = new AbortController();
        abortRef.current = controller;

        // Documents are folded into the prompt; images travel as their own parts.
        const request = {
            model: aiModel,
            effort: aiEffort,
            images: attachmentImages(turnAttachments),
            /* Create-only. streamText destructures everything except `contexts`
               and runImage ignores ctx.request entirely, so attaching them to an
               Ask or an image turn packed and sent a field that was then
               silently dropped — a picker that appeared to do something and
               did nothing. */
            contexts: intent === 'create' && aiSelectedContexts.length > 0 ? aiSelectedContexts : undefined,
        };
        const promptWithFiles = `${attachmentPreamble(turnAttachments)}${query}`;

        const base = runnerContext();
        const ctx: RunnerContext = {
            ...base,
            signal: controller.signal,
            request,
            step: (kind, text, status) => {
                const id = uuidv4();
                pushAIStep(turnId, { id, kind, text, status } as AIStep);
                return id;
            },
            settle: (id, status, text) => {
                pushAIStep(turnId, { id, kind: status === 'failed' ? 'error' : 'result', text: text ?? '', status } as AIStep);
            },
        };

        const context = buildCanvasContext(useStore.getState().nodes, selectedCanvasNodeIds, currentParentId);

        try {
            if (intent === 'ask') {
                const system = `${FREEFORM_SYSTEM_PROMPT}

You are answering inside the user's canvas, and you can see what is on it. Ground your answer in these cards when they are relevant, and say so plainly when they are not:

${context}`;
                await streamText(buildConversationPrompt(useStore.getState().aiMessages, promptWithFiles), {
                    system,
                    ...request,
                    signal: controller.signal,
                    onDelta: (delta) => appendAIText(turnId, delta),
                });
                updateAITurn(turnId, { status: 'done' });
            } else {
                const result = intent === 'image'
                    ? await runImage(query, ctx)
                    : intent === 'edit'
                        ? await runEdit(promptWithFiles, selectedIds, ctx)
                        : await runCreate(promptWithFiles, context, ctx);
                updateAITurn(turnId, {
                    status: 'done',
                    text: result.summary,
                    createdNodeIds: result.createdNodeIds,
                });
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                updateAITurn(turnId, { status: 'done', text: 'Stopped.' });
            } else {
                updateAITurn(turnId, {
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Something went wrong.',
                });
            }
        } finally {
            abortRef.current = null;
            setAIRunning(false);
        }
    }, [
        draft, isRunning, mode, imageMode, selectedCanvasNodeIds, selectedNodes, currentParentId,
        attachments, aiModel, aiEffort, aiSelectedContexts,
        appendAIMessage, startAITurn, pushAIStep, appendAIText, updateAITurn, setAIRunning, runnerContext,
    ]);

    // Undo logs itself as a step rather than rewriting the bubble: for an Ask
    // turn the text *is* the answer, and pulling the card shouldn't lose it.
    const undoTurn = useCallback((message: AIAssistantMessage) => {
        const count = message.createdNodeIds.length;
        if (count === 0) return;
        useStore.getState().bulkDeleteNodes(message.createdNodeIds, true);
        pushAIStep(message.id, {
            id: uuidv4(),
            kind: 'result',
            text: `Removed ${count} item${count === 1 ? '' : 's'} from the canvas`,
            status: 'done',
        });
        updateAITurn(message.id, { createdNodeIds: [] });
    }, [pushAIStep, updateAITurn]);

    /** The question this answer belongs to — not simply the newest one. */
    const questionFor = useCallback((messageId: string) => {
        const index = messages.findIndex((m) => m.id === messageId);
        for (let i = index - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role === 'user') return m.text;
        }
        return 'AI answer';
    }, [messages]);

    const keepAnswer = useCallback((message: AIAssistantMessage) => {
        const id = addAnswerToCanvas(questionFor(message.id).slice(0, 60), message.text, runnerContext());
        updateAITurn(message.id, { createdNodeIds: [...message.createdNodeIds, id] });
    }, [questionFor, runnerContext, updateAITurn]);

    const copy = useCallback((message: AIAssistantMessage) => {
        void navigator.clipboard?.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId((c) => (c === message.id ? null : c)), 1400);
    }, []);

    /**
     * Drag the panel's left edge to resize. The panel docks to the right of the
     * canvas, so dragging left (negative clientX movement) widens it — the
     * opposite sign from a left-docked panel like SidePeek.
     *
     * Width during the drag lives in React state (dragWidth), not a raw DOM
     * mutation — the panel's `style.width` is React-controlled (bound to
     * aiPanelWidth below), so any unrelated re-render mid-drag would overwrite
     * a direct `panel.style.width =` write with the stale store value and the
     * handle would appear to do nothing. This is the same tradeoff SidePeek's
     * resize handle makes for the same reason. The store (and its localStorage
     * mirror) is written once, on mouseup.
     */
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const panel = panelRef.current;
        if (!panel) return;

        const startX = e.clientX;
        const startWidth = panel.getBoundingClientRect().width;
        panel.style.transition = 'none';
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvent: MouseEvent) => {
            const dragged = startWidth + (startX - moveEvent.clientX);
            // Live ceiling on top of the fixed AI_PANEL_MAX_WIDTH so a maximized
            // panel can never eat more than half a narrow window's canvas.
            const liveMax = Math.min(AI_PANEL_MAX_WIDTH, window.innerWidth * 0.5);
            setDragWidth(Math.min(liveMax, Math.max(AI_PANEL_MIN_WIDTH, dragged)));
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            panel.style.transition = '';
            setDragWidth((current) => {
                if (current != null) setAIPanelWidth(current);
                return null;
            });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [setAIPanelWidth]);

    const placeholder = mode === 'ask'
        ? 'Ask about your canvas…'
        : imageMode
            ? 'Describe an image to generate…'
            : selectedNodes.length > 0
                ? `Tell AI how to change ${selectedNodes.length} selected card${selectedNodes.length === 1 ? '' : 's'}…`
                : 'Describe what to build on the canvas…';

    return (
        <div
            ref={panelRef}
            className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed}`}
            style={isOpen ? { width: dragWidth ?? aiPanelWidth } : undefined}
            data-app-menu
        >
            {isOpen && (
                <div
                    className={styles.resizeHandle}
                    onMouseDown={handleResizeStart}
                >
                    <span className={styles.resizeGrip} aria-hidden="true" />
                    <span className={styles.resizeTooltip}>Resize</span>
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <Sparkles size={15} className={styles.headerIcon} />
                    <span>AI</span>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.headerBtn}
                        onClick={newAIChat}
                        title="New chat"
                        disabled={messages.length === 0}
                    >
                        <SquarePen size={15} />
                    </button>
                    <button className={styles.headerBtn} onClick={() => setAIPanelOpen(false)} title="Close AI panel">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.panelBody}>
                {/* Travelling light around the chat surface while a run is in
                    flight. Decorative only — `aria-hidden`, since the
                    transcript already announces the working state. */}
                {isRunning && <span className={styles.panelBeam} aria-hidden="true" />}

                <div className={styles.scrollContent} ref={scrollRef}>
                    {messages.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Sparkles size={20} className={styles.emptyIcon} />
                            <p className={styles.emptyTitle}>Build with AI</p>
                            <p className={styles.emptyText}>
                                <strong>Create</strong> puts cards, docs and mindmaps on the canvas — or rewrites the
                                cards you have selected. <strong>Ask</strong> answers questions about what's already there.
                            </p>
                            <div className={styles.suggestions}>
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s.label}
                                        className={styles.suggestion}
                                        onClick={() => {
                                            setAIMode(s.mode);
                                            setDraft(s.prompt);
                                            inputRef.current?.focus();
                                        }}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => message.role === 'user' ? (
                            <div key={message.id} className={styles.userTurn}>
                                {message.contextLabels.length > 0 && (
                                    <div className={styles.contextChips}>
                                        {message.contextLabels.slice(0, 3).map((label, i) => (
                                            <span key={i} className={styles.contextChip}>{label}</span>
                                        ))}
                                        {message.contextLabels.length > 3 && (
                                            <span className={styles.contextChip}>+{message.contextLabels.length - 3}</span>
                                        )}
                                    </div>
                                )}
                                <div className={styles.userBubble}>{message.text}</div>
                            </div>
                        ) : (
                            <div key={message.id} className={styles.assistantTurn}>
                                {message.steps.length > 0 && (
                                    <div className={styles.steps}>
                                        {message.steps.map((step) => (
                                            <div key={step.id} className={styles.step}>
                                                <span className={styles.stepIcon}>
                                                    {step.status === 'running' ? <Loader2 size={12} className={styles.spin} />
                                                        : step.kind === 'error' ? <AlertCircle size={12} className={styles.stepError} />
                                                        : step.kind === 'result' ? <Check size={12} className={styles.stepDone} />
                                                        : <CornerDownLeft size={12} />}
                                                </span>
                                                <span className={step.kind === 'error' ? styles.stepTextError : styles.stepText}>
                                                    {step.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {message.text && <AIMarkdown text={message.text} />}

                                {message.status === 'streaming' && !message.text && message.steps.length === 0 && (
                                    <div className={styles.thinking}>
                                        <Loader2 size={13} className={styles.spin} /> Thinking…
                                    </div>
                                )}

                                {message.status === 'error' && (
                                    <div className={styles.errorBox}>
                                        <AlertCircle size={13} />
                                        <span>{message.error}</span>
                                    </div>
                                )}

                                {message.status === 'done' && (
                                    <div className={styles.turnActions}>
                                        {message.intent === 'ask' && message.text && (
                                            <button className={styles.turnAction} onClick={() => keepAnswer(message)}>
                                                <Plus size={12} /> Add to canvas
                                            </button>
                                        )}
                                        {message.createdNodeIds.length > 0 && (
                                            <button className={styles.turnAction} onClick={() => undoTurn(message)}>
                                                <Undo2 size={12} /> Undo {message.createdNodeIds.length} item{message.createdNodeIds.length === 1 ? '' : 's'}
                                            </button>
                                        )}
                                        {message.text && (
                                            <button className={styles.turnAction} onClick={() => copy(message)}>
                                                <Copy size={12} /> {copiedId === message.id ? 'Copied' : 'Copy'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Cards the turn is pointed at. A sibling above the composer's
                    own border, not inside it — these qualify the message, they
                    aren't part of what gets typed. */}
                <SelectedNodeStrip selectedIds={selectedCanvasNodeIds} />

                <div
                    className={styles.composer}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => {
                        if (e.dataTransfer.files.length === 0) return;
                        e.preventDefault();
                        void addFiles(e.dataTransfer.files);
                    }}
                >
                    {attachments.length > 0 && (
                        <div className={styles.attachments}>
                            {attachments.map((file) => (
                                <span key={file.id} className={styles.attachment}>
                                    {file.kind === 'image'
                                        ? <img src={file.payload} alt="" className={styles.attachmentThumb} />
                                        : <FileText size={12} className={styles.attachmentIcon} />}
                                    <span className={styles.attachmentName}>{file.name}</span>
                                    <span className={styles.attachmentSize}>{formatBytes(file.size)}</span>
                                    <button
                                        className={styles.attachmentRemove}
                                        onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                                        title={`Remove ${file.name}`}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {attachError && (
                        <div className={styles.attachError}>
                            <AlertCircle size={12} />
                            <span>{attachError}</span>
                        </div>
                    )}

                    {selectedNodes.length > 0 && (
                        <div className={styles.composerContext}>
                            <span className={styles.contextChip}>
                                {selectedNodes.length === 1 ? nodeTitle(selectedNodes[0]) : `${selectedNodes.length} cards selected`}
                            </span>
                            <span className={styles.composerContextHint}>
                                {mode === 'ask' ? 'used as context' : 'will be rewritten'}
                            </span>
                        </div>
                    )}

                    <textarea
                        ref={inputRef}
                        className={styles.input}
                        placeholder={placeholder}
                        value={draft}
                        rows={1}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void submit();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setAIPanelOpen(false);
                            }
                        }}
                        onPaste={(e) => {
                            const files = Array.from(e.clipboardData.files);
                            if (files.length === 0) return;
                            e.preventDefault();
                            void addFiles(files);
                        }}
                    />

                    <div className={styles.composerRow}>
                        <div className={styles.modeToggle}>
                            <button
                                className={`${styles.modePill} ${mode === 'create' ? styles.modePillActive : ''}`}
                                onClick={() => setAIMode('create')}
                                title="Put things on the canvas"
                            >
                                Create
                            </button>
                            <button
                                className={`${styles.modePill} ${mode === 'ask' ? styles.modePillActive : ''}`}
                                onClick={() => setAIMode('ask')}
                                title="Answer here, leave the canvas alone"
                            >
                                Ask
                            </button>
                        </div>

                        <button
                            className={`${styles.sendBtn} special-primary-btn`}
                            style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                            onClick={() => (isRunning ? stop() : void submit())}
                            disabled={!isRunning && !draft.trim() && attachments.length === 0}
                            title={isRunning ? 'Stop' : 'Send'}
                        >
                            {isRunning ? <Square size={13} color="#fff" /> : <Send size={14} color="#fff" />}
                        </button>
                    </div>
                </div>

                {/* Attach/image toggles and the effort/model pickers live below
                    the input box rather than inside its border — they are
                    per-turn settings, not part of the composer surface itself. */}
                <div className={styles.composerToolbar}>
                    <input
                        ref={fileRef}
                        type="file"
                        multiple
                        accept={ATTACHMENT_ACCEPT}
                        className={styles.fileInput}
                        onChange={(e) => {
                            if (e.target.files) void addFiles(e.target.files);
                            e.target.value = '';
                        }}
                    />
                    <button
                        className={styles.iconToggle}
                        onClick={() => fileRef.current?.click()}
                        disabled={attachments.length >= MAX_ATTACHMENTS}
                        title="Attach an image or text file"
                    >
                        <Paperclip size={15} />
                    </button>

                    {mode === 'create' && (
                        <button
                            className={`${styles.iconToggle} ${imageMode ? styles.iconToggleActive : ''}`}
                            onClick={() => setAIImageMode(!imageMode)}
                            title={imageMode ? 'Image generation on' : 'Generate an image instead'}
                        >
                            <ImagePlus size={15} />
                        </button>
                    )}

                    {mode === 'create' && (
                        <div className={styles.contextPickerWrap} ref={contextMenuRef}>
                            <button
                                className={`${styles.iconToggle} ${aiSelectedContexts.length > 0 ? styles.iconToggleActive : ''}`}
                                onClick={() => {
                                    if (!contextMenuOpen) {
                                        const btn = contextMenuRef.current?.querySelector('button');
                                        if (btn) {
                                            const r = btn.getBoundingClientRect();
                                            setContextMenuPos({ top: r.top - 8, left: r.left + r.width / 2 });
                                        }
                                    }
                                    setContextMenuOpen((o) => !o);
                                }}
                                title="Choose what to generate"
                            >
                                <Layers size={15} />
                                {aiSelectedContexts.length > 0 && (
                                    <span className={styles.contextBadge}>{aiSelectedContexts.length}</span>
                                )}
                            </button>
                            {contextMenuOpen && createPortal(
                                <div data-context-popover>
                                    <div className={styles.contextPopoverBackdrop} onClick={() => setContextMenuOpen(false)} />
                                    <div
                                        className={styles.contextPopover}
                                        style={{ top: contextMenuPos.top, left: contextMenuPos.left }}
                                    >
                                        <div className={styles.contextPopoverArrow} />
                                        <div className={styles.contextPopoverHeader}>
                                            <span className={styles.contextPopoverTitle}>Content types</span>
                                            {aiSelectedContexts.length > 0 && (
                                                <button
                                                    className={styles.contextClearSmall}
                                                    onClick={clearAIContexts}
                                                    type="button"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <div className={styles.contextPopoverGrid}>
                                            {AI_CONTEXT_DEFINITIONS.map((ctx) => {
                                                const Icon = CONTEXT_ICONS[ctx.icon];
                                                const active = aiSelectedContexts.includes(ctx.id);
                                                return (
                                                    <button
                                                        key={ctx.id}
                                                        className={`${styles.contextPopoverChip} ${active ? styles.contextPopoverChipActive : ''}`}
                                                        style={active ? { '--chip-rgb': ctx.accentRgb, '--chip-color': ctx.color } as React.CSSProperties : undefined}
                                                        onClick={() => toggleAIContext(ctx.id)}
                                                        title={ctx.description}
                                                        type="button"
                                                    >
                                                        {Icon && <Icon size={13} />}
                                                        <span>{ctx.shortLabel}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}

                    <div className={styles.pickers}>
                        <div className={styles.modelPicker} ref={effortMenuRef}>
                            <button
                                className={styles.modelBtn}
                                onClick={() => setEffortMenuOpen((open) => !open)}
                                title="Effort — how deep the answer goes"
                            >
                                <Gauge size={12} />
                                {effortLabel(aiEffort)}
                            </button>
                            {effortMenuOpen && (
                                <div className={styles.modelMenu}>
                                    {AI_EFFORT_LEVELS.map((option) => (
                                        <button
                                            key={option.id}
                                            className={`${styles.modelOption} ${option.id === aiEffort ? styles.modelOptionActive : ''}`}
                                            onClick={() => {
                                                setAIEffort(option.id);
                                                setEffortMenuOpen(false);
                                            }}
                                        >
                                            <span className={styles.modelOptionLabel}>
                                                {option.label}
                                                {option.id === aiEffort && <Check size={12} />}
                                            </span>
                                            <span className={styles.modelOptionHint}>{option.hint}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.modelPicker} ref={modelMenuRef}>
                            <button
                                className={styles.modelBtn}
                                onClick={() => setModelMenuOpen((open) => !open)}
                                title="Model"
                            >
                                {modelLabel(aiModel)}
                                <ChevronDown size={12} />
                            </button>
                            {modelMenuOpen && (
                                <div className={styles.modelMenu}>
                                    {AI_MODELS.map((option) => (
                                        <button
                                            key={option.label}
                                            className={`${styles.modelOption} ${option.id === aiModel ? styles.modelOptionActive : ''}`}
                                            onClick={() => {
                                                setAIModel(option.id);
                                                setModelMenuOpen(false);
                                            }}
                                        >
                                            <span className={styles.modelOptionLabel}>
                                                {option.label}
                                                {option.id === aiModel && <Check size={12} />}
                                            </span>
                                            <span className={styles.modelOptionHint}>{option.hint}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
