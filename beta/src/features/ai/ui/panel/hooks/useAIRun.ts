import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../../../store/useStore';
import type { AIProvenance } from '../../../../../types';
import { FREEFORM_SYSTEM_PROMPT } from '../../../../../services/ai/prompts';
import { streamText } from '../../../../../services/ai/text';
import { resolveNodeCitations } from '../../../aiCitations';
import { buildCanvasContext, buildScopeRefs, nodeTitle } from '../../../canvasContext';
import { resolveScope } from '../../../aiScope';
import { parseCommand } from '../../../aiCommands';
import { answersAsBrief, planAdditionalClarificationQuestion, planClarification } from '../../../aiRouter';
import { buildConversationHistory } from '../../../aiPrompt';
import { routeLabel, routeRequest, type RouteDecision, type RouteInput } from '../../../aiStrategy';
import { attachmentImages, attachmentPreamble } from '../../../attachments';
import { runCreate } from '../../../runner/runCreate';
import { runEdit } from '../../../runner/runEdit';
import type { AIEditSnapshot, RunnerContext } from '../../../runner/context';
import type { AIClarifyDraft, AIFormQuestion, AIIntent, AIPhase, AIStep } from '../../../aiTypes';
import { focusCanvasNodes } from '../constants';
import type { ComposerDraft } from './useComposerDraft';
import { subscribeUIFollowUps, takeUIFollowUp } from '../../../../intelligent-ui/followUp';

/** How a turn is started, and everything it needs from the composer. */
export interface SubmitOptions {
    /** The user's answers to a clarifying form, folded in ahead of the request. */
    brief?: string;
    skipClarify?: boolean;
    forceClarify?: boolean;
    /** A clicked visual supplies its own scenario; preserve the unsent composer. */
    fromUI?: boolean;
}

/**
 * Running a turn.
 *
 * One entry point — `submit` — and the two things that can interrupt it: the
 * clarifying form it may open first, and Stop. Everything about a turn that the
 * user can see (the trace, the streamed answer, the cards landing) is written
 * through the store from here, so the components below stay renderers.
 */
export function useAIRun(composer: ComposerDraft) {
    const { screenToFlowPosition, getViewport } = useReactFlow();

    const mode = useStore((s) => s.aiMode);
    const isRunning = useStore((s) => s.aiIsRunning);
    const aiModel = useStore((s) => s.aiModel);
    const aiEffort = useStore((s) => s.aiEffort);
    const aiScope = useStore((s) => s.aiScope);
    const aiSelectedContexts = useStore((s) => s.aiSelectedContexts);
    const selectedCanvasNodeIds = useStore((s) => s.selectedCanvasNodeIds);
    const currentParentId = useStore((s) => s.currentParentId);
    const messages = useStore((s) => s.aiMessages);

    const setAIRunning = useStore((s) => s.setAIRunning);
    const appendAIMessage = useStore((s) => s.appendAIMessage);
    const startAITurn = useStore((s) => s.startAITurn);
    const updateAITurn = useStore((s) => s.updateAITurn);
    const pushAIStep = useStore((s) => s.pushAIStep);
    const appendAIText = useStore((s) => s.appendAIText);
    const clearAIScope = useStore((s) => s.clearAIScope);

    const abortRef = useRef<AbortController | null>(null);
    /** Wall-clock start of the running turn, for the run bar's elapsed readout. */
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    /* Building the clarifying form is its own short wait, before any turn
       exists to hang a trace off. Tracked separately from `isRunning` so it
       does not swap the composer for a run bar that has nothing to report. */
    const [clarifier, setClarifier] = useState<AIClarifyDraft | null>(null);

    /* Elapsed time for the run bar. A second's granularity is all this needs,
       and ticking on an interval rather than an animation frame keeps a long
       run from re-rendering the transcript 60 times a second. The clock ticks;
       the elapsed figure is derived from it, so nothing has to be reset when a
       run starts or stops. */
    useEffect(() => {
        if (!isRunning || runStartedAt === null) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isRunning, runStartedAt]);

    const elapsed = isRunning && runStartedAt !== null ? Math.max(0, now - runStartedAt) : 0;

    /**
     * The line the run bar shows: the newest still-running step.
     *
     * Reading it off the trace rather than tracking a separate "current phase"
     * means the bar can never claim something the transcript disagrees with —
     * they are literally the same data.
     */
    const runStatus = ((): { label: string; counter: string | null; placed: number; phase: AIPhase | undefined } => {
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

            return { label, counter, placed: message.createdNodeIds.length, phase: running?.phase ?? last?.phase };
        }
        return { label: 'Working', counter: null, placed: 0, phase: undefined };
    })();

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

    /** The canvas as this turn is allowed to see it. */
    const scopeContext = useCallback((question = '') => {
        const resolved = resolveScope(aiScope, useStore.getState().nodes, selectedCanvasNodeIds, question);
        return { resolved, context: buildCanvasContext(resolved) };
    }, [aiScope, selectedCanvasNodeIds]);

    /**
     * Open the Ask Me form for `query`.
     *
     * Shared by `/ask` and by the router's "clarify" decision, so both produce
     * the same form.
     */
    const openClarifier = useCallback(async (query: string) => {
        composer.setDraft('');
        composer.setAskMeArmed(false);
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
                canvasContext: scopeContext().context,
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
        } finally {
            // A successful plan or fallback replaces this loading shell.
            setClarifier((current) => current?.status === 'loading' ? null : current);
        }
    }, [aiModel, composer, mode, scopeContext]);

    const submit = useCallback(async (rawQuery?: string, options?: SubmitOptions) => {
        const raw = (rawQuery ?? composer.draft).trim();
        if ((!raw && !composer.askMeArmed) || isRunning) return;

        /* A leading slash command is an instruction about HOW to run, not part
           of the request, so it is stripped before anything sees the text. */
        const parsed = parseCommand(raw);
        const requestedQuery = parsed ? parsed.query : raw;
        const forceClarify = Boolean(options?.forceClarify || composer.askMeArmed || parsed?.command.effect === 'force-clarify');
        // An empty Ask Me chip is still a valid request: conversation and any
        // explicitly attached context are enough to help frame the question.
        const query = requestedQuery || (forceClarify ? 'Help me define the question I need answered and the guidance I need.' : '');
        if (!query) return;

        const selectedIds = options?.fromUI ? [] : Array.from(selectedCanvasNodeIds);

        /* A clarifying form is an explicit interaction, not a surprise pause.
           `/ask` is the sole way to request it; ordinary prompts run directly. */
        if (!options?.skipClarify && !options?.brief && forceClarify) {
            await openClarifier(query);
            return;
        }

        /* ---- Route & decide strategy ----
           One fast flash-lite call reads the request and picks how to handle
           it: answer directly, reason it through, ask first, create, or edit
           the selected cards (see aiStrategy.ts). Fast effort skips the call
           and keeps the rules this panel always used. The controller exists
           before routing so Stop cancels it too. */
        const controller = new AbortController();
        abortRef.current = controller;
        const routeInput: RouteInput = {
            query,
            mode,
            effort: aiEffort,
            hasSelection: selectedIds.length > 0,
            hasScope: !options?.fromUI && aiScope.length > 0,
            hasAttachments: !options?.fromUI && composer.attachments.length > 0,
            isFollowUp: useStore.getState().aiMessages.some((message) => message.role === 'assistant'),
            allowClarify: !options?.brief && !options?.skipClarify,
            recentConversation: buildConversationHistory(useStore.getState().aiMessages)
                .slice(-2)
                .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content.slice(0, 300)}`)
                .join('\n'),
        };
        setAIRunning(true);
        const route: RouteDecision = await routeRequest(routeInput, controller.signal);
        // Stopped while routing: stop() already cleared the running state.
        if (controller.signal.aborted) return;
        if (route.strategy === 'clarify') {
            abortRef.current = null;
            setAIRunning(false);
            await openClarifier(query);
            return;
        }

        const intent: AIIntent = mode === 'ask' ? 'ask' : route.strategy === 'edit' ? 'edit' : 'create';
        const turnScope = options?.fromUI ? [] : aiScope;
        setRunStartedAt(Date.now());

        const turnAttachments = options?.fromUI ? [] : composer.attachments;
        const turnReplyContext = options?.fromUI ? null : composer.replyContext;
        const selectedNodes = options?.fromUI ? [] : useStore.getState().nodes.filter((n) => selectedCanvasNodeIds.has(n.id));
        const userMessageId = uuidv4();
        appendAIMessage({
            id: userMessageId,
            role: 'user',
            text: query,
            intent,
            contextLabels: [...selectedNodes.map(nodeTitle), ...turnAttachments.map((a) => a.name)],
            selectedNodeIds: selectedIds.length > 0 ? selectedIds : undefined,
            selectedContexts: intent === 'create' && aiSelectedContexts.length > 0 ? [...aiSelectedContexts] : undefined,
            // Frozen onto the message: the selection moves on, but "what could
            // it see when I asked this" has to stay answerable afterwards.
            scope: turnScope.length > 0 ? turnScope : undefined,
            at: new Date().toISOString(),
        });
        // The message retains this exact scope as history. Future prompts need
        // a new @ attachment before they can read canvas content.
        if (!options?.fromUI) { clearAIScope(); composer.clearAfterSend(); }

        const turnId = startAITurn(intent);

        /* How the request was read is the first line of the trace — the answer
           to "why did it think longer / build a map / edit my cards?" Only
           model decisions are shown: the rules are the silent default and
           narrating them would be noise. */
        if (route.source === 'model') {
            const now = Date.now();
            pushAIStep(turnId, {
                id: uuidv4(),
                kind: 'result',
                text: routeLabel(route),
                status: 'done',
                phase: 'route',
                startedAt: now,
                endedAt: now,
                ...(route.reason ? { detail: { kind: 'note' as const, text: route.reason } } : {}),
            });
        }

        /* History rides as real conversation turns rather than being folded
           into the prompt string, so the cacheable prefix stops changing every
           turn and the user/assistant boundary is structural. */
        const history = buildConversationHistory(useStore.getState().aiMessages, userMessageId);

        const request = {
            model: aiModel,
            effort: aiEffort,
            history,
            images: attachmentImages(turnAttachments),
            /* Create-only: an Ask turn ignores `contexts` entirely, so sending
               them there is a picker that appears to do something and does
               nothing. */
            contexts: intent === 'create' && aiSelectedContexts.length > 0 ? aiSelectedContexts : undefined,
        };
        const replyPreamble = turnReplyContext
            ? `\n\n[REPLYING TO AI ${turnReplyContext.kind.toUpperCase()}]\n${turnReplyContext.text}\n[END REPLY CONTEXT]\n\n`
            : '';
        // The clarify answers qualify the request; they never replace it.
        const prompt = `${options?.brief ?? ''}${attachmentPreamble(turnAttachments)}${replyPreamble}${query}`;

        const { resolved, context } = options?.fromUI ? { resolved: resolveScope([], [], new Set()), context: '' } : scopeContext(query);
        /* `[N1] -> node` for this turn. Built from the same walk that numbered
           the cards in the prompt, so a ref the model emits resolves to exactly
           the card it was shown. */
        const scopeRefs = buildScopeRefs(resolved);

        /* The receipt every node this turn places will carry. Assembled here
           because only the panel knows the turn id, the request as typed, and
           which cards were actually in scope. */
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

        updateAITurn(turnId, { provenance });

        /* Filled by `runEdit` as it overwrites cards, so the turn can offer a
           targeted "put those back" instead of relying on Ctrl+Z. */
        const edits: AIEditSnapshot[] = [];

        const ctx: RunnerContext = {
            ...runnerContext(),
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

            if (route.presentation === 'intelligent-ui' && intent !== 'edit' && !request.contexts?.length) {
                const step = ctx.step('action', 'Generating the interactive interface', 'running', { phase: 'compose' });
                try {
                    const { generateIntelligentUI } = await import('../../../../intelligent-ui/generate');
                    const artifact = await generateIntelligentUI(prompt, { ...request, context, signal: controller.signal,
                        onPreview: preview => { if (!controller.signal.aborted) updateAITurn(turnId, { intelligentUIPreview: preview }); },
                    });
                    const createdNodeIds: string[] = [];
                    if (intent === 'create') {
                        const { placeIntelligentUI } = await import('../../../../intelligent-ui/placeIntelligentUI');
                        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
                        createdNodeIds.push(placeIntelligentUI(artifact, ctx));
                        focusCanvasNodes(createdNodeIds);
                    }
                    ctx.settle(step, 'done', 'Interactive interface ready', { phase: 'compose' });
                    updateAITurn(turnId, {
                        status: 'done',
                        text: artifact.summary,
                        intelligentUI: intent === 'ask' ? artifact : undefined,
                        intelligentUIPreview: undefined,
                        createdNodeIds,
                        model: artifact.model,
                    });
                } catch (error) {
                    updateAITurn(turnId, { intelligentUIPreview: undefined });
                    ctx.settle(step, 'failed', 'Interface generation did not complete', { phase: 'compose' });
                    throw error;
                }
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
                const streamed = await streamText(prompt, {
                    system,
                    ...request,
                    /* The router's "reason" strategy: a real reasoning budget for
                       maths, debugging and trade-off decisions. Otherwise the
                       effort default applies (light on Smart, off below). */
                    ...(route.strategy === 'reason' ? { thinking: 'deep' as const } : {}),
                    signal: controller.signal,
                    onDelta: (delta) => {
                        pendingDelta += delta;
                        if (streamFrame === null) streamFrame = window.requestAnimationFrame(flushStream);
                    },
                });
                if (streamFrame !== null) window.cancelAnimationFrame(streamFrame);
                flushStream();

                /* An answer stopped at the token ceiling used to be
                   indistinguishable from a finished one — a sentence cut off
                   mid-word, presented as complete. The stream's terminal
                   trailer says which happened, so say so, and name the two
                   things that actually fix it. */
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

                /* Node refs are resolved once the stream has finished rather
                   than per chunk: a "[N" can arrive split across two deltas,
                   and rewriting a half-written ref would corrupt it. */
                updateAITurn(turnId, {
                    status: 'done',
                    text: resolveNodeCitations(streamed.text, scopeRefs),
                    model: streamed.model ?? aiModel ?? undefined,
                    durationMs: streamed.durationMs,
                });
            } else {
                /* Create places its (still empty) artifacts first and streams the
                   bodies into them, so the canvas is focused the moment they land
                   and the ids are recorded then too — Undo and Stop work mid-run
                   instead of only after every body has been written. */
                const createCtx: RunnerContext = {
                    ...ctx,
                    request: route.shapes.length > 0 ? { ...request, shapeHint: route.shapes } : request,
                    onPlaced: (nodeIds) => {
                        updateAITurn(turnId, { createdNodeIds: nodeIds });
                        if (nodeIds.length > 0) focusCanvasNodes(nodeIds);
                    },
                };
                const result = intent === 'edit'
                    ? await runEdit(prompt, selectedIds, ctx)
                    : await runCreate(prompt, context, createCtx);
                // Create already focused on placement; re-focusing now would yank
                // the view away from wherever the user moved while it wrote.
                if (intent !== 'create' && result.createdNodeIds.length > 0) focusCanvasNodes(result.createdNodeIds);
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
        aiEffort, aiModel, aiScope, aiSelectedContexts, appendAIMessage, appendAIText, clearAIScope,
        composer, isRunning, mode, openClarifier, pushAIStep, runnerContext, scopeContext,
        selectedCanvasNodeIds, setAIRunning, startAITurn, updateAITurn,
    ]);

    const cancelClarifier = useCallback(() => {
        if (!clarifier) return;
        // Return the request to the composer as an editable draft. The form
        // never entered history, so cancelling is a true change of mind.
        composer.setDraft((current) => current || clarifier.pendingQuery);
        composer.setAskMeArmed(true);
        setClarifier(null);
        composer.focusInput();
    }, [clarifier, composer]);

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

    /** Context every clarifier call shares: the conversation and the scope. */
    const clarifierContext = useCallback(() => ({
        model: aiModel,
        conversation: buildConversationHistory(useStore.getState().aiMessages)
            .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'You'}: ${turn.content}`)
            .join('\n\n'),
        canvasContext: scopeContext().context,
    }), [aiModel, scopeContext]);

    const addClarifierQuestion = useCallback(async () => {
        if (!clarifier || clarifier.questions.length >= 10 || clarifier.generatingQuestionIds.length > 0) return;
        const marker = '__new__';
        const snapshot = clarifier;
        setClarifier({ ...snapshot, generatingQuestionIds: [...snapshot.generatingQuestionIds, marker] });
        const question = await planAdditionalClarificationQuestion(snapshot.pendingQuery, mode, snapshot.questions, clarifierContext());
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
    }, [clarifier, clarifierContext, mode]);

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
            clarifierContext(),
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
    }, [clarifier, clarifierContext, mode]);

    /**
     * Claim the panel's Stop button for a run started elsewhere — shaping an
     * answer into cards, for instance. Handing out the controller rather than
     * the ref keeps "what Stop cancels" decided in one place.
     */
    const startExternalRun = useCallback(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        return {
            signal: controller.signal,
            finish: () => { if (abortRef.current === controller) abortRef.current = null; },
        };
    }, []);

    useEffect(() => {
        const drain = () => {
            if (mode !== 'ask' || isRunning) return;
            const request = takeUIFollowUp();
            if (request) void submit(request.query, { brief: request.brief, skipClarify: true, fromUI: true });
        };
        const unsubscribe = subscribeUIFollowUps(drain);
        drain();
        return unsubscribe;
    }, [mode, isRunning, submit]);

    return {
        submit,
        stop,
        startExternalRun,
        isRunning,
        runStatus,
        elapsed,
        runnerContext,
        scopeContext,
        clarifier,
        setClarifier,
        cancelClarifier,
        submitClarifier,
        addClarifierQuestion,
        regenerateClarifierQuestion,
    };
}

export type AIRun = ReturnType<typeof useAIRun>;
