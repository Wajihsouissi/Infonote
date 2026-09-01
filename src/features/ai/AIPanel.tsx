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
    Undo2,
    Copy,
    Paperclip,
    ChevronDown,
    FileText,
    Network,
    Layers,
    Kanban,
    Waypoints,
    History,
    Globe,
    ListTodo,
    Search,
    Crosshair,
    MessageSquare,
    RotateCcw,
    Monitor,
    Maximize2,
    PanelLeftOpen,
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AIProvenance } from '../../types';
import { streamText, FREEFORM_SYSTEM_PROMPT, PART_REWRITE_SYSTEM_PROMPT } from '../../services/aiService';
import { groundedAsk } from '../../services/searchService';
import { citationsAsMarkdown, insertWebCitations, resolveNodeCitations } from './aiCitations';
import { buildCanvasContext, buildScopeRefs, nodeTitle } from './canvasContext';
import { resolveScope, type AIScopeSource } from './aiScope';
import { AIContextBar } from './AIContextBar';
import { AIMentionPicker } from './AIMentionPicker';
import { AIRunTrace } from './AIRunTrace';
import { AIClarifyForm } from './AIClarifyForm';
import { AIClarifierOverlay } from './AIClarifierOverlay';
import { AIRegenerateDialog, type AIRegenerateRequest } from './AIRegenerateDialog';
import { AICommandPicker } from './AICommandPicker';
import { AITurnResult } from './AITurnResult';
import { AICitationPreview } from './AICitationPreview';
import { AICanvasOrganizationPreview } from './AICanvasOrganizationPreview';
import { planCanvasOrganization, type CanvasOrganizationProposal } from './aiCanvasOperations';
import { parseCommand } from './aiCommands';
import { answersAsBrief, planAdditionalClarificationQuestion, planClarification } from './aiRouter';
import { FEATURES } from '../../config/featureFlags';
import { buildConversationHistory } from './aiPrompt';
import {
    ATTACHMENT_ACCEPT,
    MAX_ATTACHMENTS,
    attachmentImages,
    attachmentPreamble,
    readAttachment,
    type AIAttachment,
} from './attachments';
import { AI_MODELS, modelLabel } from '../../config/aiModels';
import { AI_EFFORT_LEVELS, effortLabel, effortMaxTokens, type AIEffort } from '../../config/aiEffort';
import { AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH } from '../../store/slices/aiSlice';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { formatBytes } from '../editor/mediaTypes';
import { addAnswerToCanvas, runCreate, runEdit, runImage, type AIEditSnapshot, type RunnerContext } from './aiRunner';
import { AIMarkdown } from './AIMarkdown';
import {
    constrainReplacementBlocks,
    getAIResultBlocks,
    serializeAIBlocks,
    type AIResultPart,
} from './aiResultUtils';
import { SelectedNodeStrip } from './SelectedNodeStrip';
import { AIChatHistory } from './AIChatHistory';
import type { AIAssistantMessage, AIClarifyDraft, AIContextType, AIFormQuestion, AIIntent, AIStep } from './aiTypes';
import { AI_CONTEXT_DEFINITIONS } from './aiTypes';
import styles from './AIPanel.module.css';

const SUGGESTIONS: { label: string; description: string; prompt: string; mode: 'create' | 'ask'; icon: React.FC<{ size?: number }> }[] = [
    { label: 'Create cards', description: 'Break a topic into useful pieces.', prompt: 'Create 4 cards breaking down ', mode: 'create', icon: Layers },
    { label: 'Build a mindmap', description: 'Explore the important connections.', prompt: 'Mindmap of ', mode: 'create', icon: Network },
    { label: 'Summarise canvas', description: 'Find the signal across your work.', prompt: 'Summarise what is on this canvas and what is missing.', mode: 'ask', icon: MessageSquare },
    { label: 'Rewrite selection', description: 'Make selected ideas clearer.', prompt: 'Rewrite this more clearly and tighten the wording.', mode: 'create', icon: RotateCcw },
];

const CANVAS_QUICK_ACTIONS: Array<{
    id: 'summary' | 'actions' | 'gaps' | 'organize' | 'translate';
    label: string;
    mode: 'create' | 'ask';
    icon: React.FC<{ size?: number }>;
}> = [
    { id: 'summary', label: 'Summary', mode: 'ask', icon: FileText },
    { id: 'actions', label: 'Action items', mode: 'create', icon: ListTodo },
    { id: 'gaps', label: 'Find gaps', mode: 'ask', icon: Search },
    { id: 'organize', label: 'Organize', mode: 'create', icon: Network },
    { id: 'translate', label: 'Translate', mode: 'ask', icon: Globe },
];

type AnswerArtifact = 'card' | 'mindmap' | 'timeline' | 'board';

const ANSWER_ARTIFACTS: Array<{
    id: AnswerArtifact;
    label: string;
    icon: React.FC<{ size?: number }>;
}> = [
    { id: 'card', label: 'Create card', icon: Layers },
    { id: 'mindmap', label: 'Add as mind map', icon: Network },
    { id: 'timeline', label: 'Make a plan', icon: Waypoints },
    { id: 'board', label: 'Create board', icon: Kanban },
];

const ANSWER_ARTIFACT_REQUESTS: Record<Exclude<AnswerArtifact, 'card'>, {
    context: AIContextType;
    instruction: string;
}> = {
    mindmap: {
        context: 'mindmap',
        instruction: 'Turn this answer into one connected clustered mindmap. Use the central idea as one root. Convert each major ## or ### answer section into a first-level section node, then put its related points as children below it. Keep every point connected to its direct parent; no disconnected nodes. Use 3–6 section clusters with 2–5 concise elements per section where the answer supports it.',
    },
    timeline: {
        context: 'timeline',
        instruction: 'Turn this answer into one practical, ordered plan. Create a timeline of the necessary phases and milestones, with useful details for each step.',
    },
    board: {
        context: 'boards',
        instruction: 'Turn this answer into one actionable board. Use clear workflow stages and concrete cards that capture the work described in the answer.',
    },
};

type AIReplyContext = {
    messageId: string;
    kind: AIResultPart['kind'];
    text: string;
};

type CanvasOrganizationWorkbench = {
    proposal: CanvasOrganizationProposal;
    status: 'ready' | 'applied' | 'undone';
    turnId: string;
    snapshot?: {
        positions: Record<string, { x: number; y: number }>;
        edges: import('@xyflow/react').Edge[];
    };
};

function isCanvasOrganizationRequest(query: string) {
    const normalized = query.toLowerCase();
    const asksToOrganize = /\b(organize|organise|reorganize|reorganise|cluster|group)\b/.test(normalized);
    const namesCanvas = /\b(canvas|board|cards?|notes?)\b/.test(normalized);
    return asksToOrganize && namesCanvas;
}

function focusCanvasNodes(ids: readonly string[]) {
    if (ids.length === 0) return;
    window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focusCanvasNodes', {
            detail: { ids: [...ids] },
        }));
    });
}

function responseReceipt(message: AIAssistantMessage): string {
    const parts = [modelLabel(message.model ?? null)];
    if (typeof message.durationMs === 'number') {
        parts.push(message.durationMs < 1_000 ? '<1s' : `${(message.durationMs / 1_000).toFixed(message.durationMs < 10_000 ? 1 : 0)}s`);
    }
    return parts.join(' · ');
}

/**
 * What each effort level buys, in outcomes rather than adjectives.
 *
 * `AI_EFFORT_LEVELS[].hint` describes the writing ("Long, deep and richly
 * formatted"); this describes what lands. Kept beside the segmented control so
 * the dial can be understood without being operated. The numbers here are the
 * budgets ai-Plan.md §5.5 will enforce — until P2 lands they describe intent,
 * which is why they are deliberately loose ("aims for") rather than exact.
 */
const EFFORT_CONSEQUENCE: Record<AIEffort, string> = {
    fast: 'Fast · short answers, fewest items — quickest',
    efficient: 'Efficient · a scannable page per card — usually a few seconds',
    /* The time matters as much as the depth. Smart asks for a long answer and
       allows an 8000-token ceiling, so a simple question can still take half a
       minute; saying only what it produces let people pick it for quality and
       then be surprised by the wait. */
    smart: 'Smart · deep bodies, tables and checklists — slowest, often 20–40s',
};

/* The effort dial as tab items. Derived from the config rather than written
   out, so adding a level in aiEffort.ts still only takes one edit. Radio
   semantics, not tabs: this picks a setting, it does not switch a panel. */
const effortTabs: TabItem<AIEffort>[] = AI_EFFORT_LEVELS.map((option) => ({
    id: option.id,
    label: option.label,
    hint: option.hint,
}));

/* Create vs Ask is the composer's one real fork — whether the turn writes on
   the canvas or answers in the panel — so it is a setting the user rests in,
   not a panel switch: radio semantics, neutral colour, same as effort above. */
const MODE_TABS: TabItem<'create' | 'ask'>[] = [
    { id: 'create', label: 'Create', hint: 'Put things on the canvas' },
    { id: 'ask', label: 'Ask', hint: 'Answer here, leave the canvas alone' },
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
    const presentation = useStore((s) => s.aiPresentation);
    const setAIPresentation = useStore((s) => s.setAIPresentation);
    const historyRailOpen = useStore((s) => s.aiHistoryRailOpen);
    const setAIHistoryRailOpen = useStore((s) => s.setAIHistoryRailOpen);
    const messages = useStore((s) => s.aiMessages);
    const isRunning = useStore((s) => s.aiIsRunning);
    const selectedCanvasNodeIds = useStore((s) => s.selectedCanvasNodeIds);
    const currentParentId = useStore((s) => s.currentParentId);
    const displayName = useStore((s) => s.auth.displayName);
    const firstName = displayName?.trim().split(/\s+/)[0] || 'there';

    const setAIPanelOpen = useStore((s) => s.setAIPanelOpen);
    const setAIMode = useStore((s) => s.setAIMode);
    const setAIImageMode = useStore((s) => s.setAIImageMode);
    const webSearch = useStore((s) => s.aiWebSearch);
    const setAIWebSearch = useStore((s) => s.setAIWebSearch);
    const setAIRunning = useStore((s) => s.setAIRunning);
    const aiSelectedContexts = useStore((s) => s.aiSelectedContexts);
    const toggleAIContext = useStore((s) => s.toggleAIContext);
    const clearAIContexts = useStore((s) => s.clearAIContexts);
    const aiScope = useStore((s) => s.aiScope);
    const addAIScopeSource = useStore((s) => s.addAIScopeSource);
    const removeAIScopeSource = useStore((s) => s.removeAIScopeSource);
    const clearAIScope = useStore((s) => s.clearAIScope);
    const settleAIForm = useStore((s) => s.settleAIForm);
    const appendAIMessage = useStore((s) => s.appendAIMessage);
    const startAITurn = useStore((s) => s.startAITurn);
    const updateAITurn = useStore((s) => s.updateAITurn);
    const pushAIStep = useStore((s) => s.pushAIStep);
    const appendAIText = useStore((s) => s.appendAIText);
    const newAIChat = useStore((s) => s.newAIChat);
    const persistAIChat = useStore((s) => s.persistAIChat);
    const refreshAIChats = useStore((s) => s.refreshAIChats);
    const applyCanvasOrganization = useStore((s) => s.applyCanvasOrganization);
    const restoreCanvasOrganization = useStore((s) => s.restoreCanvasOrganization);

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
    const [replyContext, setReplyContext] = useState<AIReplyContext | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<AIAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [effortMenuOpen, setEffortMenuOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    /* Open/closed per turn used to live here as a map keyed by message id, and
       leaked: a chat of forty turns kept forty booleans alive for a control the
       user had touched once. AIRunTrace owns that state per instance now, so it
       dies with the turn that is scrolled away. */
    const [contextMenuPos, setContextMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    /* The `@` picker. `null` is closed; a string is the text typed after the
       `@` that opened it (empty when opened from the context bar's Add button).
       `mentionAt` is where that `@` sits in the draft, so accepting a mention
       can replace the token it was typed as rather than leaving it behind. */
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionAt, setMentionAt] = useState<number | null>(null);
    /** Text typed after a leading `/`; null when the command picker is closed. */
    const [commandQuery, setCommandQuery] = useState<string | null>(null);
    /** `/ask` becomes a visible, removable intent token rather than text the
       user has to keep editing around. */
    const [askMeArmed, setAskMeArmed] = useState(false);
    /** Wall-clock start of the running turn, for the run bar's elapsed readout. */
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [elapsed, setElapsed] = useState(0);
    /* Building the clarifying form is its own short wait, before any turn
       exists to hang a trace off. Tracked separately from `isRunning` so it
       does not swap the composer for a run bar that has nothing to report. */
    const [clarifier, setClarifier] = useState<AIClarifyDraft | null>(null);
    const [organization, setOrganization] = useState<CanvasOrganizationWorkbench | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const effortMenuRef = useRef<HTMLDivElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    /* Rewriting one line or section is scoped work: its own controller, so the
       turn-level Stop and this one can never abort each other, and its own
       state, so the panel does not put on the whole-turn running dress (beam,
       mesh, run bar, streaming answer) for an edit to a single line. */
    const regenAbortRef = useRef<AbortController | null>(null);
    const [regeneratingPart, setRegeneratingPart] = useState<{
        messageId: string;
        start: number;
        count: number;
        text: string;
    } | null>(null);
    /** The part whose Redo was pressed, waiting on "what should change?". */
    const [regenerateTarget, setRegenerateTarget] = useState<{ messageId: string; part: AIResultPart } | null>(null);

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

    /* Elapsed time for the run bar. A second's granularity is all this needs,
       and ticking on an interval rather than an animation frame keeps a long
       run from re-rendering the transcript 60 times a second. */
    useEffect(() => {
        if (!isRunning || runStartedAt === null) { setElapsed(0); return; }
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed(Date.now() - runStartedAt), 1000);
        return () => window.clearInterval(timer);
    }, [isRunning, runStartedAt]);

    /**
     * The line the run bar shows: the newest still-running step.
     *
     * Reading it off the trace rather than tracking a separate "current phase"
     * means the bar can never claim something the transcript disagrees with —
     * they are literally the same data.
     */
    const runStatus = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const message = messages[i];
            if (message.role !== 'assistant' || message.status !== 'streaming') continue;

            const running = [...message.steps].reverse().find((step) => step.status === 'running');
            const last = message.steps[message.steps.length - 1];
            const label = running?.text ?? last?.text ?? 'Reading your request';

            /* "2 of 4" comes from the artifact steps the trace already carries,
               so the bar and the list can never disagree about progress. */
            const artifactSteps = message.steps.filter((s) => s.detail?.kind === 'artifact');
            const finished = artifactSteps.filter((s) => s.status === 'done' || s.status === 'failed').length;
            const counter = artifactSteps.length > 0
                ? `${Math.min(finished + (running?.detail?.kind === 'artifact' ? 1 : 0), artifactSteps.length)} of ${artifactSteps.length}`
                : null;

            return { label, counter, placed: message.createdNodeIds.length };
        }
        return { label: 'Working', counter: null, placed: 0 };
    }, [messages]);

    /* Canvas content is opt-in. A visual selection may still be an edit target,
       but it must never become ambient prompt material until the user attaches
       it with an @ mention. */
    const effectiveScope = useMemo((): AIScopeSource[] => [
        ...aiScope,
        ...(webSearch ? [{ kind: 'web' } as const] : []),
    ], [aiScope, webSearch]);

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

    /* ---------------------------------------------------------- @ mentions */

    const openMention = useCallback((query: string) => {
        setMentionQuery(query);
        setMentionAt(null);
        inputRef.current?.focus();
    }, []);

    /**
     * Close the picker, optionally removing the `@token` that opened it.
     *
     * The token is scaffolding for choosing a source, not content: once the
     * chip exists in the context bar, leaving "@pri" in the sentence would send
     * the model a fragment of a word it has no way to resolve.
     */
    const closeMention = useCallback((consumeToken: boolean) => {
        if (consumeToken && mentionAt !== null) {
            setDraft((current) => {
                const after = current.slice(mentionAt).search(/\s/);
                const end = after === -1 ? current.length : mentionAt + after;
                return `${current.slice(0, mentionAt)}${current.slice(end)}`.replace(/\s{2,}/g, ' ');
            });
        }
        setMentionQuery(null);
        setMentionAt(null);
    }, [mentionAt]);

    /**
     * Watch the caret for an `@word` it is sitting inside.
     *
     * Deliberately caret-driven rather than fired once on the `@` keystroke:
     * clicking back into a mention you already typed should reopen the picker,
     * and moving away from it should close it. The token has to start at a word
     * boundary so an email address in the prompt does not open a card search.
     */
    const syncMention = useCallback((value: string, caret: number | null) => {
        if (caret === null) return;
        const before = value.slice(0, caret);
        const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
        if (!match) {
            if (mentionAt !== null || mentionQuery !== null) { setMentionQuery(null); setMentionAt(null); }
            return;
        }
        setMentionQuery(match[1]);
        setMentionAt(caret - match[1].length - 1);
    }, [mentionAt, mentionQuery]);

    /**
     * Watch for a `/command` the caret is inside.
     *
     * Only at the very start of the draft, unlike `@` which can appear
     * anywhere: a command changes how the whole turn runs, and a slash
     * mid-sentence is far more likely to be a date or a path than an
     * instruction. Anchoring it removes that ambiguity entirely.
     */
    const syncCommand = useCallback((value: string, caret: number | null) => {
        if (caret === null) return;
        const match = /^\/([a-z-]*)$/i.exec(value.slice(0, caret));
        if (!match) {
            if (commandQuery !== null) setCommandQuery(null);
            return;
        }
        setCommandQuery(match[1]);
    }, [commandQuery]);

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

    /**
     * The organiser gets its own narrow path rather than being folded into the
     * generic create runner. It builds a proposal first, and only this panel's
     * explicit Apply button is allowed to mutate existing cards or connectors.
     */
    const planOrganization = useCallback(async (query: string) => {
        const state = useStore.getState();
        const activeNodes = state.nodes.filter((node) => (node.parentId ?? null) === (currentParentId ?? null));
        if (activeNodes.length < 2) {
            setAttachError('Add at least two cards to this canvas before asking AI to organize it.');
            return;
        }

        const userMessageId = uuidv4();
        appendAIMessage({
            id: userMessageId,
            role: 'user',
            text: query,
            intent: 'create',
            contextLabels: [],
            scope: [{ kind: 'canvas', parentId: currentParentId ?? null }],
            at: new Date().toISOString(),
        });
        clearAIScope();
        setDraft('');
        setAskMeArmed(false);
        setReplyContext(null);
        setRunStartedAt(Date.now());

        const turnId = startAITurn('create');
        const planningStepId = uuidv4();
        pushAIStep(turnId, {
            id: planningStepId,
            kind: 'action',
            text: `Reviewing ${activeNodes.length} existing cards`,
            status: 'running',
            phase: 'gather',
            startedAt: Date.now(),
            detail: { kind: 'cards', nodeIds: activeNodes.map((node) => node.id), readCount: activeNodes.length },
        });

        try {
            const conversation = buildConversationHistory(state.aiMessages, userMessageId)
                .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content}`)
                .join('\n\n');
            const proposal = await planCanvasOrganization(query, activeNodes, state.edges, {
                model: aiModel,
                conversation,
            });
            setOrganization({ proposal, status: 'ready', turnId });
            pushAIStep(turnId, {
                id: planningStepId,
                kind: 'result',
                text: `Proposed ${proposal.clusters.length} clusters and ${proposal.connections.length} connections`,
                status: 'done',
                phase: 'verify',
                endedAt: Date.now(),
            });
            updateAITurn(turnId, {
                text: 'I prepared a reversible organization plan. Review the clusters below, then apply it when it looks right.',
                status: 'done',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not prepare a safe organization plan.';
            pushAIStep(turnId, {
                id: planningStepId,
                kind: 'error',
                text: message,
                status: 'failed',
                phase: 'verify',
                endedAt: Date.now(),
            });
            updateAITurn(turnId, { status: 'error', error: message });
        } finally {
            setAIRunning(false);
        }
    }, [aiModel, appendAIMessage, clearAIScope, currentParentId, pushAIStep, setAIRunning, startAITurn, updateAITurn]);

    const prepareCanvasQuickAction = useCallback((id: typeof CANVAS_QUICK_ACTIONS[number]['id']) => {
        const hasSelection = selectedCanvasNodeIds.size > 0;
        const target = hasSelection ? 'the selected cards' : 'this canvas';
        const prompts = {
            summary: `Summarize ${target}. Identify the main ideas, their relationships, and the most useful next question.`,
            actions: `Extract action items from ${target}. Create concise todo chunks only; preserve the source cards unchanged.`,
            gaps: `Find gaps and contradictions in ${target}. Cite the specific cards that support each observation.`,
            organize: `Organize the ${hasSelection ? 'selected cards on this canvas' : 'existing cards on this canvas'} into meaningful clusters and connect only high-confidence relationships.`,
            translate: `Translate ${target} into [language]. Preserve its hierarchy, formatting, and meaning.`,
        } as const;
        const action = CANVAS_QUICK_ACTIONS.find((candidate) => candidate.id === id);
        if (!action) return;
        setAIMode(action.mode);
        addAIScopeSource({ kind: 'canvas', parentId: currentParentId ?? null });
        setDraft(prompts[id]);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [addAIScopeSource, currentParentId, selectedCanvasNodeIds.size, setAIMode]);

    const submit = useCallback(async (rawQuery?: string, options?: { brief?: string; skipClarify?: boolean; forceClarify?: boolean }) => {
        const raw = (rawQuery ?? draft).trim();
        if ((!raw && !askMeArmed) || isRunning) return;

        /* A leading slash command is an instruction about HOW to run, not part
           of the request, so it is stripped before anything sees the text. */
        const parsed = parseCommand(raw);
        const requestedQuery = parsed ? parsed.query : raw;
        const forceClarify = Boolean(options?.forceClarify || askMeArmed || parsed?.command.effect === 'force-clarify');
        // An empty Ask Me chip is still a valid request: conversation and any
        // explicitly attached context are enough to help frame the question.
        const query = requestedQuery || (forceClarify ? 'Help me define the question I need answered and the guidance I need.' : '');
        if (!query) return;

        const selectedIds = Array.from(selectedCanvasNodeIds);

        // This phrase has a concrete canvas meaning, so do not send it through
        // the generic generator where it could silently create replacement
        // cards. The workbench always presents a reviewable plan first.
        const hasCanvasScope = effectiveScope.some((source) => source.kind === 'canvas');
        if (!options?.skipClarify && !options?.brief && !forceClarify && !imageMode && isCanvasOrganizationRequest(query) && !hasCanvasScope) {
            setAttachError('Attach @Canvas before asking AI to analyze or organize the canvas.');
            return;
        }
        if (!options?.skipClarify && !options?.brief && !forceClarify && !imageMode && isCanvasOrganizationRequest(query)) {
            await planOrganization(query);
            return;
        }

        /* A clarifying form is an explicit interaction, not a surprise pause.
           `/ask` is the sole way to request it; ordinary prompts run directly. */
        if (!options?.skipClarify && !options?.brief && !imageMode && forceClarify) {
                setDraft('');
                setAskMeArmed(false);
                setClarifier({
                    pendingQuery: query,
                    reason: '',
                    questions: [],
                    answers: {},
                    customAnswers: {},
                    additionalInfo: '',
                    status: 'loading',
                    generatingQuestionIds: [],
                });
                try {
                    const conversation = buildConversationHistory(useStore.getState().aiMessages)
                        .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content}`)
                        .join('\n\n');
                    const plan = await planClarification(query, mode, {
                        model: aiModel,
                        conversation,
                        canvasContext: buildCanvasContext(resolveScope(effectiveScope, useStore.getState().nodes, selectedCanvasNodeIds)),
                    });
                    if (plan) {
                        setClarifier({
                            pendingQuery: query,
                            reason: plan.reason,
                            questions: plan.questions,
                            answers: Object.fromEntries(plan.questions.map((question) => [question.id, [...(question.defaults ?? [])]])),
                            customAnswers: {},
                            additionalInfo: '',
                            status: 'ready',
                            generatingQuestionIds: [],
                        });
                        return;
                    }
                    const fallback: AIFormQuestion = {
                        id: `q-${uuidv4()}`,
                        prompt: `What would make an answer about “${query.slice(0, 80)}” most useful to you?`,
                        kind: 'text',
                        defaults: [],
                    };
                    setClarifier({
                        pendingQuery: query,
                        reason: 'A little direction will help tailor the answer to what you need.',
                        questions: [fallback],
                        answers: { [fallback.id]: [] },
                        customAnswers: {},
                        additionalInfo: '',
                        status: 'ready',
                        generatingQuestionIds: [],
                    });
                    return;
                } finally {
                    // A successful plan or fallback replaces this loading shell.
                    setClarifier((current) => current?.status === 'loading' ? null : current);
                }
        }
        const intent: AIIntent = mode === 'ask' ? 'ask' : imageMode ? 'image' : selectedIds.length > 0 ? 'edit' : 'create';
        const turnScope = effectiveScope;
        setRunStartedAt(Date.now());

        const turnAttachments = attachments;
        const turnReplyContext = replyContext;
        const userMessageId = uuidv4();
        appendAIMessage({
            id: userMessageId,
            role: 'user',
            text: query,
            intent,
            contextLabels: [...selectedNodes.map(nodeTitle), ...turnAttachments.map((a) => a.name)],
            selectedNodeIds: selectedIds.length > 0 ? selectedIds : undefined,
            // Declared on AIUserMessage since the picker shipped but never
            // populated, so "why did I get a board" was unanswerable after the
            // fact. Recorded per turn now.
            selectedContexts: intent === 'create' && aiSelectedContexts.length > 0 ? [...aiSelectedContexts] : undefined,
            // Frozen onto the message: the selection moves on, the web toggle
            // gets flipped, but "what could it see when I asked this" has to
            // stay answerable afterwards.
            scope: turnScope.length > 0 ? turnScope : undefined,
            at: new Date().toISOString(),
        });
        // The message retains this exact scope as history. Future prompts need
        // a new @ attachment before they can read canvas content.
        clearAIScope();
        setDraft('');
        setAskMeArmed(false);
        setReplyContext(null);
        setAttachments([]);
        setAttachError(null);

        const turnId = startAITurn(intent);
        const controller = new AbortController();
        abortRef.current = controller;

        // Documents are folded into the prompt; images travel as their own parts.
        /* History rides as real conversation turns now rather than being folded
           into the prompt string (ai-Plan.md §2.3 A2), so the cacheable prefix
           stops changing every turn and the user/assistant boundary is
           structural rather than a "User:" label inside one blob. */
        const history = buildConversationHistory(useStore.getState().aiMessages, userMessageId);

        const request = {
            model: aiModel,
            effort: aiEffort,
            history,
            images: attachmentImages(turnAttachments),
            /* Create-only. streamText destructures everything except `contexts`
               and runImage ignores ctx.request entirely, so attaching them to an
               Ask or an image turn packed and sent a field that was then
               silently dropped — a picker that appeared to do something and
               did nothing. */
            contexts: intent === 'create' && aiSelectedContexts.length > 0 ? aiSelectedContexts : undefined,
        };
        const replyPreamble = turnReplyContext
            ? `\n\n[REPLYING TO AI ${turnReplyContext.kind.toUpperCase()}]\n${turnReplyContext.text}\n[END REPLY CONTEXT]\n\n`
            : '';
        // The clarify answers qualify the request; they never replace it.
        const promptWithFiles = `${options?.brief ?? ''}${attachmentPreamble(turnAttachments)}${replyPreamble}${query}`;
        // The prompt is now just this turn's own message; the rest is `history`.
        const conversationPrompt = promptWithFiles;

        const resolved = resolveScope(turnScope, useStore.getState().nodes, selectedCanvasNodeIds, query);
        const context = buildCanvasContext(resolved);
        /* `[N1] -> node` for this turn. Built from the same walk that numbered
           the cards in the prompt, so a ref the model emits resolves to exactly
           the card it was shown (ai-Plan.md §5.4). */
        const scopeRefs = buildScopeRefs(resolved);

        /* The receipt every node this turn places will carry. Assembled here
           because only the panel knows the turn id, the request as typed, and
           which cards were actually in scope (ai-Plan.md §5.4). */
        const provenance: AIProvenance = {
            turnId,
            createdAt: new Date().toISOString(),
            model: aiModel,
            effort: aiEffort,
            prompt: query.length > 400 ? `${query.slice(0, 400)}…` : query,
            sources: [...resolved.focus, ...resolved.ambient].map((n) => ({
                kind: 'node' as const,
                id: n.id,
                title: nodeTitle(n),
            })),
        };

        /* Filled by `runEdit` as it overwrites cards, so the turn can offer a
           targeted "put those back" instead of relying on Ctrl+Z. */
        const edits: AIEditSnapshot[] = [];

        const base = runnerContext();
        const ctx: RunnerContext = {
            ...base,
            signal: controller.signal,
            request,
            provenance,
            edits,
            step: (kind, text, status, extra) => {
                const id = uuidv4();
                pushAIStep(turnId, { id, kind, text, status, startedAt: Date.now(), ...extra } as AIStep);
                return id;
            },
            settle: (id, status, text, extra) => {
                /* `pushAIStep` merges onto an existing id, so `startedAt` set
                   when the step opened survives and the two together give the
                   trace its per-line duration. */
                pushAIStep(turnId, {
                    id,
                    kind: status === 'failed' ? 'error' : 'result',
                    text: text ?? '',
                    status,
                    endedAt: Date.now(),
                    ...extra,
                } as AIStep);
            },
        };


        /* Say what was read before anything else happens. On a 31-card canvas
           this is the difference between "it saw my canvas" and "it read these
           six cards, and here they are". */
        const readCount = resolved.focus.length + resolved.ambient.length;
        if (readCount > 0) {
            ctx.step(
                'result',
                resolved.consideredCount > readCount
                    ? `Read ${readCount} of ${resolved.consideredCount} cards in scope`
                    : `Read ${readCount} card${readCount === 1 ? '' : 's'}`,
                'done',
                {
                    phase: 'gather',
                    detail: {
                        kind: 'cards',
                        nodeIds: [...resolved.focus, ...resolved.ambient].map((n) => n.id),
                        readCount,
                        totalCount: resolved.consideredCount,
                    },
                },
            );
        }

        try {
            const system = `${FREEFORM_SYSTEM_PROMPT}

${context
    ? `The user explicitly attached these canvas cards. Ground your answer in them when relevant, and say so plainly when they are not:\n\n${context}`
    : 'No canvas content was attached. Answer from the request and general knowledge only; do not claim to have read the canvas.'}`;

            /* Grounded Ask takes a different route entirely.
             *
             * Gemini runs the searches and answers in one native call, so there
             * is no result list to fold into a prompt — and no token stream
             * either, since grounding is not exposed on the streaming
             * compat endpoint. The answer therefore lands whole rather than
             * typing itself out, which is why this reports a step: without one
             * the panel would sit silent for the entire call. */
            if (intent === 'ask' && webSearch) {
                const searchStep = ctx.step('action', 'Searching the web', 'running', { phase: 'gather' });
                const { text, citations, supports, queries } = await groundedAsk(
                    conversationPrompt,
                    {
                        system,
                        model: aiModel,
                        maxTokens: effortMaxTokens(aiEffort),
                        signal: controller.signal,
                    }
                );
                /* The queries go in the detail, verbatim and all of them,
                   rather than being crammed into the label three at a time.
                   Whether it looked up the right thing is the single most
                   useful fact about a grounded run (ai-Plan.md §5.1). */
                ctx.settle(
                    searchStep,
                    'done',
                    queries.length > 0
                        ? `Searched the web · ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}`
                        : 'Searched the web',
                    {
                        phase: 'gather',
                        ...(queries.length > 0 ? { detail: { kind: 'queries' as const, queries } } : {}),
                    },
                );

                if (citations.length > 0) {
                    ctx.step('result', `Kept ${citations.length} source${citations.length === 1 ? '' : 's'}`, 'done', {
                        phase: 'attribute',
                        detail: {
                            kind: 'sources',
                            sources: citations.map((c) => ({
                                kind: 'web' as const,
                                url: c.url,
                                title: c.title || c.source,
                                host: c.source,
                            })),
                        },
                    });
                }

                /* Inline markers first, then the node chips, then the source
                   list. Order matters: `insertWebCitations` works on byte
                   offsets into the answer Gemini returned, so anything that
                   changes the string has to happen after it. */
                const cited = resolveNodeCitations(insertWebCitations(text, supports), scopeRefs);
                updateAITurn(turnId, {
                    status: 'done',
                    text: `${cited}${citationsAsMarkdown(citations)}`,
                });
            } else if (intent === 'ask') {
                // Rich answers can carry many native blocks. Batching a burst of
                // streamed tokens to one paint keeps the block renderer from
                // reparsing the whole transcript for every network chunk.
                let pendingDelta = '';
                let streamFrame: number | null = null;
                const flushStream = () => {
                    if (pendingDelta) appendAIText(turnId, pendingDelta);
                    pendingDelta = '';
                    streamFrame = null;
                };
                const streamed = await streamText(conversationPrompt, {
                    system,
                    ...request,
                    signal: controller.signal,
                    onDelta: (delta) => {
                        pendingDelta += delta;
                        if (streamFrame === null) streamFrame = window.requestAnimationFrame(flushStream);
                    },
                });
                if (streamFrame !== null) window.cancelAnimationFrame(streamFrame);
                flushStream();
                /* Node refs are resolved once the stream has finished rather
                   than per chunk: a "[N" can arrive split across two deltas,
                   and rewriting a half-written ref would corrupt it. Streaming
                   readers briefly see the raw "[N1]", which is honest — it is
                   what the model actually wrote. */
                /* An answer stopped at the token ceiling used to be
                   indistinguishable from a finished one — a sentence cut off
                   mid-word, presented as complete. The stream's terminal
                   trailer says which happened (ai-Plan.md §7), so say so, and
                   name the two things that actually fix it. */
                if (streamed.truncated) {
                    ctx.step('error', 'The answer hit its length limit and stops mid-thought', 'failed', {
                        phase: 'compose',
                        detail: {
                            kind: 'note',
                            text: aiEffort === 'smart'
                                ? 'Ask a narrower question, or split it into two.'
                                : 'Switch to a higher effort level for more room, or ask a narrower question.',
                        },
                    });
                }

                updateAITurn(turnId, {
                    status: 'done',
                    text: resolveNodeCitations(streamed.text, scopeRefs),
                    model: streamed.model ?? aiModel ?? undefined,
                    durationMs: streamed.durationMs,
                });
            } else {
                const result = intent === 'image'
                    ? await runImage(query, ctx)
                    : intent === 'edit'
                        ? await runEdit(promptWithFiles, selectedIds, ctx)
                        : await runCreate(conversationPrompt, context, ctx);
                if (result.createdNodeIds.length > 0) focusCanvasNodes(result.createdNodeIds);
                updateAITurn(turnId, {
                    status: 'done',
                    text: result.summary,
                    createdNodeIds: result.createdNodeIds,
                    ...(edits.length > 0 ? { editedNodes: edits } : {}),
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
        /* `currentParentId` is gone from here on purpose: the canvas level is
           no longer read directly by this callback (scope resolution owns it),
           and `runnerContext` already tracks it for placement. */
        draft, askMeArmed, isRunning, mode, imageMode, selectedCanvasNodeIds, selectedNodes,
        attachments, aiModel, aiEffort, aiSelectedContexts, replyContext, webSearch, effectiveScope, aiScope.length, planOrganization,
        appendAIMessage, startAITurn, pushAIStep, appendAIText, updateAITurn, setAIRunning, clearAIScope, runnerContext,
    ]);

    const cancelClarifier = useCallback(() => {
        if (!clarifier) return;
        // Return the request to the composer as an editable draft. The form
        // never entered history, so cancelling is a true change of mind.
        setDraft((current) => current || clarifier.pendingQuery);
        setAskMeArmed(true);
        setClarifier(null);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [clarifier]);

    const submitClarifier = useCallback(() => {
        if (!clarifier || clarifier.status !== 'ready') return;
        const completed = clarifier;
        appendAIMessage({
            id: uuidv4(),
            role: 'form',
            reason: completed.reason,
            questions: completed.questions,
            status: 'answered',
            answers: completed.answers,
            customAnswers: completed.customAnswers,
            additionalInfo: completed.additionalInfo,
            pendingQuery: completed.pendingQuery,
            at: new Date().toISOString(),
        });
        setClarifier(null);
        void submit(completed.pendingQuery, {
            brief: answersAsBrief(completed.questions, completed.answers, completed.customAnswers, completed.additionalInfo),
            skipClarify: true,
        });
    }, [appendAIMessage, clarifier, submit]);

    const addClarifierQuestion = useCallback(async () => {
        if (!clarifier || clarifier.questions.length >= 10 || clarifier.generatingQuestionIds.length > 0) return;
        const marker = '__new__';
        const snapshot = clarifier;
        setClarifier({ ...snapshot, generatingQuestionIds: [...snapshot.generatingQuestionIds, marker] });
        const conversation = buildConversationHistory(useStore.getState().aiMessages)
            .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content}`)
            .join('\n\n');
        const question = await planAdditionalClarificationQuestion(snapshot.pendingQuery, mode, snapshot.questions, {
            model: aiModel,
            conversation,
            canvasContext: buildCanvasContext(resolveScope(effectiveScope, useStore.getState().nodes, selectedCanvasNodeIds)),
        });
        setClarifier((current) => {
            if (!current) return current;
            const generatingQuestionIds = current.generatingQuestionIds.filter((id) => id !== marker);
            if (!question || current.questions.length >= 10) return { ...current, generatingQuestionIds };
            return {
                ...current,
                questions: [...current.questions, question],
                answers: { ...current.answers, [question.id]: [...(question.defaults ?? [])] },
                generatingQuestionIds,
            };
        });
    }, [aiModel, clarifier, effectiveScope, mode, selectedCanvasNodeIds]);

    const regenerateClarifierQuestion = useCallback(async (id: string) => {
        if (!clarifier || clarifier.generatingQuestionIds.length > 0) return;
        const existing = clarifier.questions.find((question) => question.id === id);
        if (!existing) return;
        const snapshot = clarifier;
        setClarifier({ ...snapshot, generatingQuestionIds: [...snapshot.generatingQuestionIds, id] });
        const replacement = await planAdditionalClarificationQuestion(
            snapshot.pendingQuery,
            mode,
            snapshot.questions.filter((question) => question.id !== id),
            {
                model: aiModel,
                conversation: buildConversationHistory(useStore.getState().aiMessages)
                    .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content}`)
                    .join('\n\n'),
                canvasContext: buildCanvasContext(resolveScope(effectiveScope, useStore.getState().nodes, selectedCanvasNodeIds)),
            },
        );
        setClarifier((current) => {
            if (!current) return current;
            const generatingQuestionIds = current.generatingQuestionIds.filter((questionId) => questionId !== id);
            if (!replacement) return { ...current, generatingQuestionIds };
            const next = { ...replacement, id };
            const { [id]: _custom, ...customAnswers } = current.customAnswers;
            return {
                ...current,
                questions: current.questions.map((question) => question.id === id ? next : question),
                answers: { ...current.answers, [id]: [...(next.defaults ?? [])] },
                customAnswers,
                generatingQuestionIds,
            };
        });
    }, [aiModel, clarifier, effectiveScope, mode, selectedCanvasNodeIds]);

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

    /**
     * Put rewritten cards back the way the user had them.
     *
     * The counterpart to `undoTurn`, and a different operation: that one
     * deletes what the AI made, this restores what the AI overwrote. Logged as
     * a step and cleared afterwards, so the button cannot be pressed twice and
     * silently do nothing the second time.
     */
    const revertEdits = useCallback((message: AIAssistantMessage) => {
        const edits = message.editedNodes ?? [];
        if (edits.length === 0) return;
        const { updateNodeData } = useStore.getState();
        for (const edit of edits) updateNodeData(edit.nodeId, edit.before);
        pushAIStep(message.id, {
            id: uuidv4(),
            kind: 'result',
            text: `Restored ${edits.length} card${edits.length === 1 ? '' : 's'} to what they said before`,
            status: 'done',
            phase: 'place',
        });
        updateAITurn(message.id, { editedNodes: [] });
    }, [pushAIStep, updateAITurn]);

    const locateCreatedNodes = useCallback((message: AIAssistantMessage) => {
        if (message.createdNodeIds.length === 0) return;
        focusCanvasNodes(message.createdNodeIds);
    }, []);

    /** The question this answer belongs to — not simply the newest one. */
    const questionFor = useCallback((messageId: string) => {
        const index = messages.findIndex((m) => m.id === messageId);
        if (index >= 0 && messages[index].role === 'user') return messages[index].text;
        for (let i = index - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role === 'user') return m.text;
        }
        return '';
    }, [messages]);

    const restoreBubble = useCallback((messageId: string) => {
        const prompt = questionFor(messageId);
        if (!prompt) return;
        setDraft(prompt);
        inputRef.current?.focus();
    }, [questionFor]);

    const duplicateBubble = useCallback((messageId: string) => {
        const prompt = questionFor(messageId);
        if (!prompt) return;
        setDraft((current) => current.trim() ? `${current}\n${prompt}` : prompt);
        inputRef.current?.focus();
    }, [questionFor]);

    const regenerateBubble = useCallback(async (messageId: string) => {
        if (isRunning) return;
        const messageIndex = messages.findIndex((message) => message.id === messageId);
        if (messageIndex < 0) return;

        let userIndex = messageIndex;
        if (messages[messageIndex].role === 'assistant') {
            for (let index = messageIndex - 1; index >= 0; index -= 1) {
                if (messages[index].role === 'user') {
                    userIndex = index;
                    break;
                }
            }
        }
        const candidate = messages[userIndex];
        const prompt = candidate?.role === 'user' ? candidate.text.trim() : '';
        if (!prompt) return;
        useStore.setState({ aiMessages: messages.slice(0, userIndex), aiIsRunning: false });
        await submit(prompt);
    }, [isRunning, messages, submit]);

    const keepAnswer = useCallback((message: AIAssistantMessage) => {
        const id = addAnswerToCanvas(questionFor(message.id).slice(0, 60), message.text, runnerContext());
        updateAITurn(message.id, { createdNodeIds: [...message.createdNodeIds, id] });
    }, [questionFor, runnerContext, updateAITurn]);

    /**
     * Ask mode should end in a useful decision, not a dead end. These actions
     * take the answer the user just read and deliberately re-enter the trusted
     * structured creation path — keeping all placement, history and undo
     * behaviour identical to a normal Create turn.
     */
    const createAnswerArtifact = useCallback(async (message: AIAssistantMessage, artifactId: AnswerArtifact) => {
        if (isRunning || message.status !== 'done' || !message.text) return;

        if (artifactId === 'card') {
            keepAnswer(message);
            return;
        }

        const artifact = ANSWER_ARTIFACT_REQUESTS[artifactId];
        const controller = new AbortController();
        abortRef.current = controller;
        setAIRunning(true);
        updateAITurn(message.id, { status: 'streaming' });

        const ctx: RunnerContext = {
            ...runnerContext(),
            signal: controller.signal,
            mindmapLayout: artifactId === 'mindmap' ? 'clustered' : undefined,
            request: {
                model: aiModel,
                effort: aiEffort,
                contexts: [artifact.context],
            },
            step: (kind, text, status) => {
                const id = uuidv4();
                pushAIStep(message.id, { id, kind, text, status } as AIStep);
                return id;
            },
            settle: (id, status, text) => {
                pushAIStep(message.id, {
                    id,
                    kind: status === 'failed' ? 'error' : 'result',
                    text: text ?? '',
                    status,
                } as AIStep);
            },
        };

        try {
            /* Shaping an answer already in hand: the answer IS the material,
               so this runs on the same declared scope as any other turn rather
               than quietly widening to the whole canvas. */
            const canvasContext = buildCanvasContext(
                resolveScope(effectiveScope, useStore.getState().nodes, selectedCanvasNodeIds),
            );
            const result = await runCreate(
                `${artifact.instruction}\n\n[ANSWER TO SHAPE]\n${message.text}`,
                canvasContext,
                ctx,
            );
            if (result.createdNodeIds.length > 0) focusCanvasNodes(result.createdNodeIds);
            updateAITurn(message.id, {
                status: 'done',
                createdNodeIds: [...message.createdNodeIds, ...result.createdNodeIds],
            });
        } catch (error) {
            const stopped = error instanceof DOMException && error.name === 'AbortError';
            pushAIStep(message.id, {
                id: uuidv4(),
                kind: stopped ? 'result' : 'error',
                text: stopped ? 'Stopped adding to the canvas' : 'Couldn’t create that from this answer. Try again.',
                status: stopped ? 'done' : 'failed',
            });
            updateAITurn(message.id, { status: 'done' });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setAIRunning(false);
        }
    }, [
        aiEffort, aiModel, isRunning, keepAnswer, pushAIStep, effectiveScope,
        runnerContext, selectedCanvasNodeIds, setAIRunning, updateAITurn,
    ]);

    const copy = useCallback((message: AIAssistantMessage) => {
        void navigator.clipboard?.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId((c) => (c === message.id ? null : c)), 1400);
    }, []);

    const exploreResultPart = useCallback((message: AIAssistantMessage, part: AIResultPart) => {
        if (isRunning) return;
        setAIMode('ask');
        setReplyContext({ messageId: message.id, kind: part.kind, text: part.text });
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [isRunning, setAIMode]);

    const deleteResultPart = useCallback((message: AIAssistantMessage, part: AIResultPart) => {
        if (isRunning || message.status !== 'done') return;
        const blocks = getAIResultBlocks(message.text);
        const next = [...blocks.slice(0, part.start), ...blocks.slice(part.start + part.count)];
        updateAITurn(message.id, { text: serializeAIBlocks(next) });
        pushAIStep(message.id, {
            id: uuidv4(),
            kind: 'result',
            text: `Removed ${part.kind === 'section' ? 'a section' : 'a line'} from this answer`,
            status: 'done',
        });
    }, [isRunning, pushAIStep, updateAITurn]);

    const stopRegenerateResultPart = useCallback(() => {
        regenAbortRef.current?.abort();
    }, []);

    /**
     * Redo on one line or section — ai-Plan.md §5.4.
     *
     * Both halves of this are deliberately narrow. The *content* half holds the
     * model to the fragment's shape (PART_REWRITE_SYSTEM_PROMPT plus
     * constrainReplacementBlocks): the freeform prompt asks for a structured
     * mini-document, so running it here turned a Redo on one bullet into five
     * blocks spliced into the middle of the answer. The *visual* half keeps the
     * run out of the turn: no `status: 'streaming'` on the message and no
     * global `setAIRunning`, because those light the whole panel and mark the
     * whole answer as being rewritten. The tokens stream into the target part
     * instead, and it carries its own Stop.
     */
    const regenerateResultPart = useCallback(async (
        message: AIAssistantMessage,
        part: AIResultPart,
        request: AIRegenerateRequest = { instruction: '' },
    ) => {
        if (isRunning || regeneratingPart || message.status !== 'done') return;

        const blocks = getAIResultBlocks(message.text);
        const original = blocks.slice(part.start, part.start + part.count);
        if (original.length === 0) return;

        const controller = new AbortController();
        const actionId = uuidv4();
        let regenerated = '';
        regenAbortRef.current = controller;
        setRegeneratingPart({ messageId: message.id, start: part.start, count: part.count, text: '' });
        pushAIStep(message.id, {
            id: actionId,
            kind: 'action',
            text: request.label
                ? `Regenerating this ${part.kind} — ${request.label.toLowerCase()}`
                : `Regenerating this ${part.kind}`,
            status: 'running',
        });

        try {
            const lineCount = part.text.split('\n').length;
            const shape = lineCount === 1
                ? 'a single line taken from the middle of an answer. Reply with exactly one line'
                : `${lineCount} lines taken from the middle of an answer. Reply with exactly ${lineCount} lines, in the same order and with the same markers`;
            const direction = request.instruction
                ? `HOW IT SHOULD CHANGE — this is the point of the rewrite, follow it exactly: ${request.instruction}\n\n`
                : '';
            await streamText(
                `${direction}Rewrite the fragment below. It is ${shape}. Your reply replaces the fragment in place — nothing around it changes.\n\n[FRAGMENT]\n${part.text}\n[END FRAGMENT]`,
                {
                    system: PART_REWRITE_SYSTEM_PROMPT,
                    model: aiModel,
                    effort: aiEffort,
                    signal: controller.signal,
                    onDelta: (delta) => {
                        regenerated += delta;
                        const streamed = regenerated;
                        setRegeneratingPart((current) => (
                            current && current.messageId === message.id ? { ...current, text: streamed } : current
                        ));
                    },
                },
            );
            const replacement = constrainReplacementBlocks(
                getAIResultBlocks(regenerated.trim()),
                original,
                part.kind,
            );
            if (replacement.length === 0) throw new Error('The regenerated content was empty.');

            const next = [
                ...blocks.slice(0, part.start),
                ...replacement,
                ...blocks.slice(part.start + part.count),
            ];
            updateAITurn(message.id, { text: serializeAIBlocks(next) });
            // Same id as the running step, so the log settles that row instead
            // of leaving a spinner next to a finished action.
            pushAIStep(message.id, {
                id: actionId,
                kind: 'result',
                text: request.label
                    ? `Regenerated this ${part.kind} — ${request.label.toLowerCase()}`
                    : `Regenerated this ${part.kind}`,
                status: 'done',
            });
        } catch (error) {
            const stopped = error instanceof DOMException && error.name === 'AbortError';
            pushAIStep(message.id, {
                id: actionId,
                kind: stopped ? 'result' : 'error',
                text: stopped
                    ? `Stopped regenerating this ${part.kind}`
                    : `Couldn’t regenerate this ${part.kind}. Try again.`,
                status: stopped ? 'done' : 'failed',
            });
        } finally {
            if (regenAbortRef.current === controller) regenAbortRef.current = null;
            setRegeneratingPart(null);
        }
    }, [aiEffort, aiModel, isRunning, pushAIStep, regeneratingPart, updateAITurn]);

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

    /* The empty composer is the only place `/` and `@` are discoverable, so the
       resting placeholder names both. The other states are already specific
       about what to type and should not be diluted into a syntax reference. */
    const placeholder = mode === 'ask'
        ? 'Ask about your canvas…  /ask for questions first'
        : imageMode
            ? 'Describe an image to generate…'
            : selectedNodes.length > 0
                ? `Tell AI how to change ${selectedNodes.length} selected card${selectedNodes.length === 1 ? '' : 's'}…`
                : 'Describe what to build…  @ for context, / for commands';

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

                {/* A slow warm mesh gives the whole chat surface an active
                    state while the faster beam traces its boundary. */}
                {isRunning && <span className={styles.panelMesh} aria-hidden="true" />}
                {isRunning && <span className={styles.panelLightRails} aria-hidden="true" />}
                {isRunning && (
                    <span className={styles.panelSparkles} aria-hidden="true">
                        <i /><i /><i /><i /><i /><i /><i />
                    </span>
                )}

                {/* Travelling light around the chat surface while a run is in
                    flight. Decorative only — `aria-hidden`, since the
                    transcript already announces the working state. */}
                {isRunning && <span className={styles.panelBeam} aria-hidden="true" />}

                <div className={styles.scrollContent} ref={scrollRef}>
                    {messages.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyOrb} aria-hidden="true">
                                <Sparkles size={30} strokeWidth={1.7} />
                            </div>
                            <div className={styles.emptyCopy}>
                                <p className={styles.emptyTitle}>Hi {firstName}, what would you like to build?</p>
                                <p className={styles.emptyText}>
                                    Start with a thought. I can shape it into cards, maps, or a clear answer from your canvas.
                                </p>
                            </div>
                            <div className={styles.suggestions} aria-label="Starter prompts">
                                {SUGGESTIONS.map(({ icon: SuggestionIcon, ...suggestion }) => (
                                    <button
                                        key={suggestion.label}
                                        className={styles.suggestion}
                                        onClick={() => {
                                            setAIMode(suggestion.mode);
                                            setDraft(suggestion.prompt);
                                            inputRef.current?.focus();
                                        }}
                                    >
                                        <span className={styles.suggestionIcon} aria-hidden="true"><SuggestionIcon size={16} /></span>
                                        <span className={styles.suggestionCopy}>
                                            <strong>{suggestion.label}</strong>
                                            <small>{suggestion.description}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => message.role === 'form' ? (
                            <AIClarifyForm
                                key={message.id}
                                message={message}
                                disabled={isRunning}
                                onSubmit={(answers) => {
                                    settleAIForm(message.id, 'answered', answers);
                                    void submit(message.pendingQuery, {
                                        brief: answersAsBrief(message.questions, answers),
                                        skipClarify: true,
                                    });
                                }}
                                onSkip={() => {
                                    settleAIForm(message.id, 'skipped');
                                    void submit(message.pendingQuery, { skipClarify: true });
                                }}
                            />
                        ) : message.role === 'user' ? (
                            <div key={message.id} className={styles.userTurn}>
                                {/* What the AI could see when this was asked,
                                    frozen on the message. The selection moves
                                    on and the web toggle gets flipped, so a
                                    chip row derived live would quietly rewrite
                                    history (ai-Plan.md §5.3). */}
                                {message.scope && message.scope.length > 0 && (
                                    <div className={styles.turnScope}>
                                        {message.scope.map((source) => {
                                            const key = source.kind === 'node' ? `node:${source.id}`
                                                : source.kind === 'subtree' ? `subtree:${source.rootId}`
                                                : source.kind === 'canvas' ? 'canvas' : source.kind;
                                            const label = source.kind === 'web' ? 'Web'
                                                : source.kind === 'selection' ? 'Selection'
                                                : source.kind === 'canvas' ? '@Canvas'
                                                : source.kind === 'node'
                                                    ? nodeTitle(useStore.getState().nodes.find((n) => n.id === source.id) ?? { data: {}, type: 'note' } as never)
                                                    : 'Container';
                                            return (
                                                <span
                                                    key={key}
                                                    className={`${styles.turnScopeChip} ${source.kind === 'web' ? styles.turnScopeChipWeb : ''}`}
                                                >
                                                    {source.kind === 'web' ? <Globe size={10} /> : <Layers size={10} />}
                                                    {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {message.contextLabels.length > 0 && !message.selectedNodeIds?.length && (
                                    <div className={styles.contextChips}>
                                        {message.contextLabels.slice(0, 3).map((label, i) => (
                                            <span key={i} className={styles.contextChip}>{label}</span>
                                        ))}
                                        {message.contextLabels.length > 3 && (
                                            <span className={styles.contextChip}>+{message.contextLabels.length - 3}</span>
                                        )}
                                    </div>
                                )}
                                {message.selectedNodeIds?.length ? (
                                    <SelectedNodeStrip selectedIds={message.selectedNodeIds} variant="bubble" />
                                ) : null}
                                <div className={styles.bubbleWrap}>
                                    <div className={styles.userBubble}>{message.text}</div>
                                    <div className={styles.bubbleActions} role="toolbar" aria-label="Message actions">
                                        <button className={styles.bubbleAction} onClick={() => restoreBubble(message.id)} title="Restore prompt" aria-label="Restore prompt">
                                            <MessageSquare size={12} />
                                        </button>
                                        <button className={styles.bubbleAction} onClick={() => duplicateBubble(message.id)} title="Duplicate prompt" aria-label="Duplicate prompt">
                                            <Copy size={12} />
                                        </button>
                                        <button className={styles.bubbleAction} onClick={() => void regenerateBubble(message.id)} title="Regenerate response" aria-label="Regenerate response">
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={message.id} className={styles.assistantTurn}>
                                <div className={styles.bubbleActions} role="toolbar" aria-label="Message actions">
                                    <button className={styles.bubbleAction} onClick={() => restoreBubble(message.id)} title="Restore prompt" aria-label="Restore prompt">
                                        <MessageSquare size={12} />
                                    </button>
                                    <button className={styles.bubbleAction} onClick={() => duplicateBubble(message.id)} title="Duplicate prompt" aria-label="Duplicate prompt">
                                        <Copy size={12} />
                                    </button>
                                    <button className={styles.bubbleAction} onClick={() => void regenerateBubble(message.id)} title="Regenerate response" aria-label="Regenerate response">
                                        <RotateCcw size={12} />
                                    </button>
                                    {message.createdNodeIds.length > 0 && (
                                        <>
                                            <button className={styles.bubbleAction} onClick={() => locateCreatedNodes(message)} title="Locate on canvas" aria-label="Locate on canvas">
                                                <Crosshair size={12} />
                                            </button>
                                            <button className={styles.bubbleAction} onClick={() => undoTurn(message)} title="Undo created items" aria-label="Undo created items">
                                                <Undo2 size={12} />
                                            </button>
                                        </>
                                    )}
                                    {(message.editedNodes?.length ?? 0) > 0 && (
                                        <button
                                            className={styles.bubbleAction}
                                            onClick={() => revertEdits(message)}
                                            title={`Restore ${message.editedNodes!.length} card${message.editedNodes!.length === 1 ? '' : 's'} to what they said before`}
                                            aria-label="Restore edited cards"
                                        >
                                            <Undo2 size={12} />
                                        </button>
                                    )}
                                    {message.text && (
                                        <button className={styles.bubbleAction} onClick={() => copy(message)} title={copiedId === message.id ? 'Copied' : 'Copy response'} aria-label="Copy response">
                                            <Copy size={12} />
                                        </button>
                                    )}
                                </div>
                                {/* The activity log. Replaces a flat list of icon+string rows that
                                    could say "Searching the web" but never what for — see AIRunTrace
                                    and ai-Plan.md §5.1. */}
                                {(message.steps.length > 0 || message.status === 'streaming') && (
                                    <AIRunTrace
                                        events={message.steps}
                                        running={message.status === 'streaming'}
                                        receipt={message.intent === 'ask' ? responseReceipt(message) : undefined}
                                    />
                                )}

                                {message.text && (
                                    <AIMarkdown
                                        responseId={message.id}
                                        text={message.text}
                                        actionsDisabled={isRunning || regeneratingPart !== null || message.status !== 'done'}
                                        regenerating={regeneratingPart?.messageId === message.id ? regeneratingPart : null}
                                        onExplore={(part) => exploreResultPart(message, part)}
                                        onRegenerate={(part) => setRegenerateTarget({ messageId: message.id, part })}
                                        onStopRegenerate={stopRegenerateResultPart}
                                        onDelete={(part) => deleteResultPart(message, part)}
                                    />
                                )}

                                {message.intent === 'ask' && message.status === 'done' && message.text && (
                                    <div className={styles.answerActions} role="group" aria-label="Create from this answer">
                                        {ANSWER_ARTIFACTS.map((artifact) => {
                                            const ArtifactIcon = artifact.icon;
                                            return (
                                                <button
                                                    key={artifact.id}
                                                    type="button"
                                                    className={styles.answerAction}
                                                    onClick={() => void createAnswerArtifact(message, artifact.id)}
                                                    disabled={isRunning}
                                                    aria-label={artifact.label}
                                                    title={artifact.label}
                                                >
                                                    <ArtifactIcon size={16} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

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

                                {message.status === 'done' && message.createdNodeIds.length > 0 && (
                                    <AITurnResult
                                        nodeIds={message.createdNodeIds}
                                        onLocateAll={() => locateCreatedNodes(message)}
                                        onUndo={() => undoTurn(message)}
                                    />
                                )}

                            </div>
                        ))
                    )}

                    {organization && (
                        <AICanvasOrganizationPreview
                            proposal={organization.proposal}
                            status={organization.status}
                            onApply={() => {
                                if (organization.status !== 'ready') return;
                                const snapshot = applyCanvasOrganization({
                                    positions: organization.proposal.positions,
                                    removeEdgeIds: organization.proposal.removeEdgeIds,
                                    connections: organization.proposal.connections.map(({ source, target, label }) => ({ source, target, label })),
                                });
                                setOrganization((current) => current ? { ...current, snapshot, status: 'applied' } : current);
                                updateAITurn(organization.turnId, {
                                    text: `Organized ${Object.keys(organization.proposal.positions).length} existing cards into ${organization.proposal.clusters.length} clusters. You can undo this change in one click.`,
                                });
                                focusCanvasNodes(Object.keys(organization.proposal.positions));
                            }}
                            onUndo={() => {
                                if (organization.status !== 'applied' || !organization.snapshot) return;
                                restoreCanvasOrganization(organization.snapshot);
                                setOrganization((current) => current ? { ...current, status: 'undone' } : current);
                                updateAITurn(organization.turnId, { text: 'Organization undone. Your cards and connectors are back where they were.' });
                            }}
                            onDismiss={() => setOrganization(null)}
                        />
                    )}
                </div>

                {regenerateTarget && (
                    <AIRegenerateDialog
                        kind={regenerateTarget.part.kind}
                        preview={regenerateTarget.part.text}
                        onClose={() => setRegenerateTarget(null)}
                        onSubmit={(request) => {
                            const target = messages.find(
                                (m): m is AIAssistantMessage => m.id === regenerateTarget.messageId && m.role === 'assistant',
                            );
                            setRegenerateTarget(null);
                            if (target) void regenerateResultPart(target, regenerateTarget.part, request);
                        }}
                    />
                )}

                {clarifier && (
                    <AIClarifierOverlay
                        draft={clarifier}
                        onChange={setClarifier}
                        onCancel={cancelClarifier}
                        onSubmit={submitClarifier}
                        onAddQuestion={() => void addClarifierQuestion()}
                        onRegenerateQuestion={(id) => void regenerateClarifierQuestion(id)}
                    />
                )}

                {!clarifier && <>
                {/* Cards the turn is pointed at. A sibling above the composer's
                    own border, not inside it — these qualify the message, they
                    aren't part of what gets typed. */}
                <div className={styles.selectedNodeLayer}>
                    <SelectedNodeStrip selectedIds={selectedCanvasNodeIds} />
                </div>

                {/* The `@` picker opens UPWARD out of the composer, so it is a
                    sibling above it rather than a child — a child would be
                    clipped by the composer's own rounded box. */}
                {commandQuery !== null && (
                    <div className={styles.mentionLayer}>
                        <AICommandPicker
                            query={commandQuery}
                            onPick={(command) => {
                                // Commands are intent tokens, not text the
                                // user has to remember to delete. This leaves
                                // the field ready for an optional request.
                                if (command.effect === 'force-clarify') setAskMeArmed(true);
                                setDraft('');
                                setCommandQuery(null);
                                inputRef.current?.focus();
                            }}
                            onClose={() => setCommandQuery(null)}
                        />
                    </div>
                )}

                {mentionQuery !== null && commandQuery === null && (
                    <div className={styles.mentionLayer}>
                        <AIMentionPicker
                            query={mentionQuery}
                            onPick={(source) => {
                                addAIScopeSource(source);
                                closeMention(true);
                            }}
                            onClose={() => closeMention(false)}
                        />
                    </div>
                )}

                {/* While a turn runs, the run bar takes the composer's place so
                    the panel has exactly one focus (ai-Plan.md §5.8). The
                    composer is not merely disabled: a live input inviting you
                    to type while the answer you asked for is still arriving is
                    the ambiguity this replaces. */}
                {isRunning && (
                    <div className={styles.runBar}>
                        <div className={styles.runBarTop}>
                            <span className={styles.runPulse} aria-hidden="true" />
                            <span className={styles.runLabel}>{runStatus.label}</span>
                            {runStatus.counter && <span className={styles.runCounter}>{runStatus.counter}</span>}
                            <button
                                type="button"
                                className={styles.runStop}
                                onClick={stop}
                                title="Stop — anything already placed is kept"
                            >
                                <Square size={10} /> Stop
                            </button>
                        </div>
                        <div className={styles.runBarSub}>
                            <span>{effortLabel(aiEffort)} · {modelLabel(aiModel)}</span>
                            {/* What stopping now would actually cost. "Nothing
                                placed yet" is the fact that makes Stop safe to
                                press; once items have landed, they are kept. */}
                            <span>
                                {elapsed < 1000 ? 'starting…' : `${Math.floor(elapsed / 60_000) > 0 ? `${Math.floor(elapsed / 60_000)}:${String(Math.floor((elapsed % 60_000) / 1000)).padStart(2, '0')}` : `0:${String(Math.floor(elapsed / 1000)).padStart(2, '0')}`} elapsed`}
                                {' · '}
                                {runStatus.placed > 0
                                    ? `${runStatus.placed} placed`
                                    : 'nothing placed yet'}
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
                                    onClick={() => prepareCanvasQuickAction(action.id)}
                                >
                                    <Icon size={13} />
                                    {action.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* The composer stays put while a turn runs. It was briefly
                    replaced by the run bar on a "one focus at a time"
                    argument; that traded away the ability to draft the next
                    question while waiting, which on a 25-second Smart turn is
                    the more valuable half. The run bar sits ABOVE it instead,
                    so progress and composing coexist. */}
                <div
                    className={styles.composer}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => {
                        if (e.dataTransfer.files.length === 0) return;
                        e.preventDefault();
                        void addFiles(e.dataTransfer.files);
                    }}
                >
                    {replyContext && (
                        <div className={styles.composerReply}>
                            <MessageSquare size={13} className={styles.composerReplyIcon} />
                            <div className={styles.composerReplyCopy}>
                                <span>Exploring this AI {replyContext.kind}</span>
                                <p>{replyContext.text.replace(/\s+/g, ' ').trim()}</p>
                            </div>
                            <button
                                type="button"
                                className={styles.composerReplyRemove}
                                onClick={() => setReplyContext(null)}
                                title="Remove reply context"
                                aria-label="Remove reply context"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
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

                    {!isRunning && (
                        <AIContextBar
                            scope={aiScope}
                            onRemove={removeAIScopeSource}
                        />
                    )}

                    {askMeArmed && (
                        <div className={styles.askMeChip}>
                            <Sparkles size={12} />
                            <span>Ask me first</span>
                            <button type="button" onClick={() => setAskMeArmed(false)} title="Remove Ask me"> <X size={11} /> </button>
                        </div>
                    )}

                    <textarea
                        ref={inputRef}
                        className={styles.input}
                        placeholder={replyContext ? `Ask about this ${replyContext.kind}…` : placeholder}
                        value={draft}
                        rows={1}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                            syncMention(e.target.value, e.target.selectionStart);
                            syncCommand(e.target.value, e.target.selectionStart);
                        }}
                        onKeyUp={(e) => { syncMention(e.currentTarget.value, e.currentTarget.selectionStart); syncCommand(e.currentTarget.value, e.currentTarget.selectionStart); }}
                        onClick={(e) => { syncMention(e.currentTarget.value, e.currentTarget.selectionStart); syncCommand(e.currentTarget.value, e.currentTarget.selectionStart); }}
                        onKeyDown={(e) => {
                            /* While the picker is open it owns Enter, Escape
                               and the arrows (it listens in capture). Sending
                               the message here too would fire the half-typed
                               draft the mention was meant to qualify. */
                            if ((mentionQuery !== null || commandQuery !== null) && ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
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
                        <Tabs
                            items={MODE_TABS}
                            value={mode}
                            onChange={setAIMode}
                            size="sm"
                            semantics="radio"
                            aria-label="What this turn does"
                        />

                        <button
                            className={`${styles.sendBtn} special-primary-btn`}
                            style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                            onClick={() => (isRunning ? stop() : void submit())}
                            disabled={!isRunning && !draft.trim() && attachments.length === 0 && !askMeArmed}
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
                    {/* Labelled, not bare icons (ai-Plan.md §5.8). A toggle
                        whose only description is a tooltip cannot be read at a
                        glance, and these two change what the run IS. */}
                    <button
                        className={styles.labelToggle}
                        onClick={() => fileRef.current?.click()}
                        disabled={attachments.length >= MAX_ATTACHMENTS}
                        title="Attach an image or text file"
                    >
                        <Paperclip size={13} />
                        <span>Attach</span>
                    </button>

                    <button
                        className={`${styles.labelToggle} ${webSearch ? styles.labelToggleActive : ''}`}
                        onClick={() => setAIWebSearch(!webSearch)}
                        aria-pressed={webSearch}
                        title={webSearch ? 'Answers will search the web and cite what they used' : 'Search the web for this'}
                    >
                        <Globe size={13} />
                        <span>{webSearch ? 'Web on' : 'Web'}</span>
                    </button>

                    {/* `aiImages` is off for beta, and this used to render
                        regardless — an always-failing control on the one
                        surface that is meant to be trustworthy. */}
                    {FEATURES.aiImages && mode === 'create' && (
                        <button
                            className={`${styles.labelToggle} ${imageMode ? styles.labelToggleActive : ''}`}
                            onClick={() => setAIImageMode(!imageMode)}
                            aria-pressed={imageMode}
                            title={imageMode ? 'Image generation on' : 'Generate an image instead'}
                        >
                            <ImagePlus size={13} />
                            <span>Image</span>
                        </button>
                    )}

                    {mode === 'create' && (
                        <div className={styles.contextPickerWrap} ref={contextMenuRef}>
                            <button
                                className={`${styles.labelToggle} ${aiSelectedContexts.length > 0 ? styles.labelToggleActive : ''}`}
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
                                title="What shape the AI should build — cards, a board, a timeline, a mind map or a document"
                            >
                                <Layers size={13} />
                                {/* Was a bare Layers icon with a count badge, so
                                    the row read as an unexplained number. The
                                    label states the DECISION ("Auto" — the AI
                                    picks) rather than the control's name; the
                                    inline chip row §5.8 describes needs the
                                    wider panel and comes with it. */}
                                <span>
                                    {aiSelectedContexts.length === 0
                                        ? 'Shape: Auto'
                                        : aiSelectedContexts.length === 1
                                            ? AI_CONTEXT_DEFINITIONS.find((d) => d.id === aiSelectedContexts[0])?.shortLabel ?? 'Shape'
                                            : `${aiSelectedContexts.length} shapes`}
                                </span>
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
                        {/* Effort as a segmented control rather than a dropdown
                            (ai-Plan.md §5.8): three options is too few to hide,
                            and the current level is the thing most worth being
                            able to read without clicking. The hint below states
                            the CONSEQUENCE, not the name — "Smart" tells you
                            nothing about what you are going to get. */}
                        <Tabs
                            items={effortTabs}
                            value={aiEffort}
                            onChange={setAIEffort}
                            size="sm"
                            semantics="radio"
                            aria-label="Effort"
                        />

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

                {/* What the chosen effort will actually produce. The picker's
                    own hint is only visible on hover; this is the line that
                    makes the dial mean something before you commit to it. */}
                <div className={styles.effortHint}>{EFFORT_CONSEQUENCE[aiEffort]}</div>
                </>}
            </div>
        </div>
        </>
    );
}
