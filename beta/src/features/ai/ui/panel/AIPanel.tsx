import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Maximize2, Monitor, PanelLeftOpen, Sparkles, Square, SquarePen, X } from '../../../../shared/icons';
import { useStore } from '../../../../store/useStore';
import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from '../../../../store/slices/aiSlice';
import { effortLabel } from '../../../../config/aiEffort';
import { modelLabel } from '../../../../config/aiModels';
import { AIChatHistory } from '../transcript/AIChatHistory';
import { AICitationPreview } from '../citations/AICitationPreview';
import { AIClarifierOverlay } from '../clarification/AIClarifierOverlay';
import { AICommandPicker } from '../composer/AICommandPicker';
import { AIComposer } from '../composer/AIComposer';
import { AIMentionPicker } from '../composer/AIMentionPicker';
import { AIRegenerateDialog } from '../dialogs/AIRegenerateDialog';
import { AIThinkingOrb } from '../transcript/AIThinkingOrb';
import { AITranscript } from '../transcript/AITranscript';
import { SelectedNodeStrip } from '../composer/SelectedNodeStrip';
import { CANVAS_QUICK_ACTIONS, quickActionPrompt } from './constants';
import { useAIRun } from './hooks/useAIRun';
import { useComposerDraft } from './hooks/useComposerDraft';
import { useTurnActions } from './hooks/useTurnActions';
import type { AIAssistantMessage } from '../../aiTypes';
import styles from './AIPanel.module.css';

/**
 * The AI panel.
 *
 * This file is the shell — where the pieces sit, how wide it is, and which of
 * the three presentations it is in. The conversation renders in AITranscript,
 * the draft lives in AIComposer, and everything a turn does happens in the
 * hooks under ./panel. Keeping the shell this thin is what lets each of those
 * be read on its own.
 */
export function AIPanel() {
    const isOpen = useStore((s) => s.isAIPanelOpen);
    const presentation = useStore((s) => s.aiPresentation);
    const setAIPresentation = useStore((s) => s.setAIPresentation);
    const historyRailOpen = useStore((s) => s.aiHistoryRailOpen);
    const setAIHistoryRailOpen = useStore((s) => s.setAIHistoryRailOpen);
    const messages = useStore((s) => s.aiMessages);
    const selectedCanvasNodeIds = useStore((s) => s.selectedCanvasNodeIds);
    const currentParentId = useStore((s) => s.currentParentId);
    const setAIPanelOpen = useStore((s) => s.setAIPanelOpen);
    const setAIMode = useStore((s) => s.setAIMode);
    const addAIScopeSource = useStore((s) => s.addAIScopeSource);
    const newAIChat = useStore((s) => s.newAIChat);
    const persistAIChat = useStore((s) => s.persistAIChat);
    const refreshAIChats = useStore((s) => s.refreshAIChats);
    const aiPanelWidth = useStore((s) => s.aiPanelWidth);
    const setAIPanelWidth = useStore((s) => s.setAIPanelWidth);
    const aiModel = useStore((s) => s.aiModel);
    const aiEffort = useStore((s) => s.aiEffort);

    const composer = useComposerDraft();
    const run = useAIRun(composer);
    const actions = useTurnActions(composer, run);

    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [dragWidth, setDragWidth] = useState<number | null>(null);

    const { isRunning, runStatus, elapsed, clarifier } = run;

    const { focusInput } = composer;
    useEffect(() => {
        if (isOpen) focusInput();
    }, [isOpen, focusInput]);

    // Pin to the newest content while a turn streams.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, isOpen]);

    /* Autosave the transcript.
     *
     * Debounced because `appendAIText` fires per streamed token — saving on
     * every change would write to IndexedDB hundreds of times per answer.
     * Waiting for the run to finish instead would lose the conversation if the
     * tab closed mid-answer, which is exactly when a long one is worth keeping,
     * so this saves *during* the stream but only every 1.2s. */
    useEffect(() => {
        if (messages.length === 0) return;
        const timer = window.setTimeout(() => { void persistAIChat(); }, 1200);
        return () => window.clearTimeout(timer);
    }, [messages, persistAIChat]);

    // Prime the history list once, so the button opens to content rather than
    // a flash of "Loading…".
    useEffect(() => {
        if (isOpen) void refreshAIChats();
    }, [isOpen, refreshAIChats]);

    const prepareQuickAction = useCallback((id: typeof CANVAS_QUICK_ACTIONS[number]['id']) => {
        const action = CANVAS_QUICK_ACTIONS.find((candidate) => candidate.id === id);
        if (!action) return;
        const target = selectedCanvasNodeIds.size > 0 ? 'the selected cards' : 'this canvas';
        setAIMode(action.mode);
        addAIScopeSource({ kind: 'canvas', parentId: currentParentId ?? null });
        composer.setDraft(quickActionPrompt(id, target));
        composer.focusInput();
    }, [addAIScopeSource, composer, currentParentId, selectedCanvasNodeIds.size, setAIMode]);

    /**
     * Drag the panel's left edge to resize. The panel docks to the right of the
     * canvas, so dragging left (negative clientX movement) widens it — the
     * opposite sign from a left-docked panel.
     *
     * Width during the drag lives in React state, not a raw DOM mutation: the
     * panel's `style.width` is React-controlled, so any unrelated re-render
     * mid-drag would overwrite a direct write with the stale store value and
     * the handle would appear to do nothing. The store (and its localStorage
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

    return (
        <>
            {isOpen && presentation === 'center' && createPortal(
                <button
                    type="button"
                    className={styles.presentationBackdrop}
                    onClick={() => setAIPresentation('side')}
                    aria-label="Exit center peek"
                />,
                document.body,
            )}
            <div
                ref={panelRef}
                className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed} ${presentation === 'center' ? styles.panelCenter : ''} ${presentation === 'fullscreen' ? styles.panelFullscreen : ''}`}
                style={isOpen && presentation === 'side' ? { width: dragWidth ?? aiPanelWidth } : undefined}
                data-app-menu
            >
                {/* One delegated hover listener for every citation chip in the
                    transcript — see AICitationPreview for why not one per chip. */}
                {isOpen && <AICitationPreview scopeRef={panelRef} />}

                {isOpen && presentation === 'side' && (
                    <div
                        className={styles.resizeHandle}
                        onMouseDown={handleResizeStart}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize AI panel"
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
                            className={`${styles.headerBtn} ${(presentation === 'fullscreen' ? historyRailOpen : historyOpen) ? styles.headerBtnActive : ''}`}
                            onClick={() => presentation === 'fullscreen'
                                ? setAIHistoryRailOpen(!historyRailOpen)
                                : setHistoryOpen((open) => !open)}
                            title="Chat history"
                        >
                            <History size={15} />
                        </button>
                        <button
                            className={`${styles.headerBtn} ${presentation === 'center' ? styles.headerBtnActive : ''}`}
                            onClick={() => setAIPresentation(presentation === 'center' ? 'side' : 'center')}
                            title={presentation === 'center' ? 'Return AI to side panel' : 'Open in center peek'}
                        >
                            <Monitor size={15} />
                        </button>
                        <button
                            className={`${styles.headerBtn} ${presentation === 'fullscreen' ? styles.headerBtnActive : ''}`}
                            onClick={() => setAIPresentation(presentation === 'fullscreen' ? 'side' : 'fullscreen')}
                            title={presentation === 'fullscreen' ? 'Exit fullscreen' : 'Open fullscreen'}
                        >
                            <Maximize2 size={15} />
                        </button>
                        <button
                            className={styles.headerBtn}
                            onClick={() => { newAIChat(); setHistoryOpen(false); setAIHistoryRailOpen(true); }}
                            title="New chat"
                            disabled={messages.length === 0}
                        >
                            <SquarePen size={15} />
                        </button>
                        <button
                            className={styles.headerBtn}
                            onClick={() => presentation === 'side' ? setAIPanelOpen(false) : setAIPresentation('side')}
                            title={presentation === 'side' ? 'Close AI panel' : 'Return AI to side panel'}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className={styles.panelBody}>
                    {/* The running state: a traced border, a warm mesh and a few
                        sparks. All decoration, all CSS — nothing here re-renders
                        the transcript, which a JS-driven beam would do on every
                        frame of a 30-second run. */}
                    {isRunning && <span className={styles.panelBeam} aria-hidden="true" />}
                    {isRunning && <span className={styles.panelMesh} aria-hidden="true" />}
                    {isRunning && <span className={styles.panelLightRails} aria-hidden="true" />}
                    {isRunning && (
                        <span className={styles.panelSparkles} aria-hidden="true">
                            <i /><i /><i /><i /><i /><i /><i />
                        </span>
                    )}

                    {presentation === 'fullscreen' && (
                        historyRailOpen ? (
                            <aside className={styles.fullscreenHistoryRail} aria-label="Chat history rail">
                                <AIChatHistory variant="rail" closeOnOpen={false} onClose={() => setAIHistoryRailOpen(false)} />
                            </aside>
                        ) : (
                            <button
                                type="button"
                                className={styles.historyRailToggle}
                                onClick={() => setAIHistoryRailOpen(true)}
                                title="Open chat history"
                                aria-label="Open chat history"
                            >
                                <PanelLeftOpen size={16} />
                            </button>
                        )
                    )}
                    {historyOpen && presentation !== 'fullscreen' && <AIChatHistory onClose={() => setHistoryOpen(false)} />}

                    <div className={styles.scrollContent} ref={scrollRef}>
                        <AITranscript messages={messages} composer={composer} run={run} actions={actions} />
                    </div>

                    {actions.regenerateTarget && (
                        <AIRegenerateDialog
                            kind={actions.regenerateTarget.part.kind}
                            preview={actions.regenerateTarget.part.text}
                            onClose={() => actions.setRegenerateTarget(null)}
                            onSubmit={(request) => {
                                const target = messages.find(
                                    (m): m is AIAssistantMessage => m.id === actions.regenerateTarget?.messageId && m.role === 'assistant',
                                );
                                const part = actions.regenerateTarget?.part;
                                actions.setRegenerateTarget(null);
                                if (target && part) void actions.regenerateResultPart(target, part, request);
                            }}
                        />
                    )}

                    {clarifier && (
                        <AIClarifierOverlay
                            draft={clarifier}
                            onChange={run.setClarifier}
                            onCancel={run.cancelClarifier}
                            onSubmit={run.submitClarifier}
                            onAddQuestion={() => void run.addClarifierQuestion()}
                            onRegenerateQuestion={(id) => void run.regenerateClarifierQuestion(id)}
                        />
                    )}

                    {!clarifier && (
                        <>
                            {/* Cards the turn is pointed at. A sibling above the
                                composer's own border, not inside it — these
                                qualify the message, they aren't part of what
                                gets typed. */}
                            <div className={styles.selectedNodeLayer}>
                                <SelectedNodeStrip selectedIds={selectedCanvasNodeIds} />
                            </div>

                            {/* The pickers open UPWARD out of the composer, so
                                they are siblings above it rather than children —
                                a child would be clipped by its rounded box. */}
                            {composer.commandQuery !== null && (
                                <div className={styles.mentionLayer}>
                                    <AICommandPicker
                                        query={composer.commandQuery}
                                        onPick={(command) => {
                                            // Commands are intent tokens, not text the user
                                            // has to remember to delete. This leaves the
                                            // field ready for an optional request.
                                            if (command.effect === 'force-clarify') composer.setAskMeArmed(true);
                                            composer.setDraft('');
                                            composer.setCommandQuery(null);
                                            composer.focusInput();
                                        }}
                                        onClose={() => composer.setCommandQuery(null)}
                                    />
                                </div>
                            )}

                            {composer.mentionQuery !== null && composer.commandQuery === null && (
                                <div className={styles.mentionLayer}>
                                    <AIMentionPicker
                                        query={composer.mentionQuery}
                                        onPick={(source) => {
                                            addAIScopeSource(source);
                                            composer.closeMention(true);
                                        }}
                                        onClose={() => composer.closeMention(false)}
                                    />
                                </div>
                            )}

                            {isRunning && (
                                <div className={styles.runBar}>
                                    <div className={styles.runBarTop}>
                                        <span className={styles.runOrb}><AIThinkingOrb phase={runStatus.phase} /></span>
                                        <span className={styles.runLabel}>{runStatus.label}</span>
                                        {runStatus.counter && <span className={styles.runCounter}>{runStatus.counter}</span>}
                                        <button
                                            type="button"
                                            className={styles.runStop}
                                            onClick={run.stop}
                                            title="Stop — anything already placed is kept"
                                        >
                                            <Square size={10} /> Stop
                                        </button>
                                    </div>
                                    <div className={styles.runBarSub}>
                                        <span>{effortLabel(aiEffort)} · {modelLabel(aiModel)}</span>
                                        {/* What stopping now would actually cost.
                                            "Nothing placed yet" is the fact that
                                            makes Stop safe to press; once items
                                            have landed, they are kept. */}
                                        <span>
                                            {elapsed < 1000
                                                ? 'starting…'
                                                : `${Math.floor(elapsed / 60_000) > 0
                                                    ? `${Math.floor(elapsed / 60_000)}:${String(Math.floor((elapsed % 60_000) / 1000)).padStart(2, '0')}`
                                                    : `0:${String(Math.floor(elapsed / 1000)).padStart(2, '0')}`} elapsed`}
                                            {' · '}
                                            {runStatus.placed > 0 ? `${runStatus.placed} placed` : 'nothing placed yet'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isRunning && (
                                <div className={styles.canvasQuickActions} aria-label="Canvas AI actions">
                                    {CANVAS_QUICK_ACTIONS.map((action) => {
                                        const Icon = action.icon;
                                        return (
                                            <button
                                                key={action.id}
                                                type="button"
                                                className={styles.canvasQuickAction}
                                                onClick={() => prepareQuickAction(action.id)}
                                            >
                                                <Icon size={13} />
                                                {action.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <AIComposer composer={composer} run={run} />
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
