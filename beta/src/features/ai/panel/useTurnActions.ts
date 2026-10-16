import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../../store/useStore';
import { PART_REWRITE_SYSTEM_PROMPT } from '../../../services/ai/prompts';
import { streamText } from '../../../services/ai/text';
import { constrainReplacementBlocks, getAIResultBlocks, serializeAIBlocks, type AIResultPart } from '../aiResultUtils';
import { addAnswerToCanvas } from '../runner/placement';
import { runCreate } from '../runner/runCreate';
import type { RunnerContext } from '../runner/context';
import type { AIAssistantMessage, AIStep } from '../aiTypes';
import type { AIRegenerateRequest } from '../AIRegenerateDialog';
import { ANSWER_ARTIFACT_REQUESTS, focusCanvasNodes, type AnswerArtifact } from './constants';
import type { ComposerDraft } from './useComposerDraft';
import type { AIRun } from './useAIRun';

/**
 * What can be done to a turn after it has finished.
 *
 * Undo, revert, locate, copy, ask again, keep the answer, shape it into
 * something on the canvas, and rewrite one line of it. They are grouped here
 * because they share one property: every one of them acts on a message the user
 * is looking at, rather than on the run that is in flight.
 */
export function useTurnActions(composer: ComposerDraft, run: AIRun) {
    const messages = useStore((s) => s.aiMessages);
    const isRunning = useStore((s) => s.aiIsRunning);
    const aiModel = useStore((s) => s.aiModel);
    const aiEffort = useStore((s) => s.aiEffort);
    const setAIMode = useStore((s) => s.setAIMode);
    const setAIRunning = useStore((s) => s.setAIRunning);
    const pushAIStep = useStore((s) => s.pushAIStep);
    const updateAITurn = useStore((s) => s.updateAITurn);

    const [copiedId, setCopiedId] = useState<string | null>(null);

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
        focusCanvasNodes(message.createdNodeIds);
    }, []);

    /** The question this answer belongs to — not simply the newest one. */
    const questionFor = useCallback((messageId: string) => {
        const index = messages.findIndex((m) => m.id === messageId);
        if (index >= 0 && messages[index].role === 'user') return (messages[index] as { text: string }).text;
        for (let i = index - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role === 'user') return m.text;
        }
        return '';
    }, [messages]);

    const restoreBubble = useCallback((messageId: string) => {
        const prompt = questionFor(messageId);
        if (!prompt) return;
        composer.setDraft(prompt);
        composer.focusInput();
    }, [composer, questionFor]);

    const duplicateBubble = useCallback((messageId: string) => {
        const prompt = questionFor(messageId);
        if (!prompt) return;
        composer.setDraft((current) => current.trim() ? `${current}\n${prompt}` : prompt);
        composer.focusInput();
    }, [composer, questionFor]);

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
        await run.submit(prompt);
    }, [isRunning, messages, run]);

    const keepAnswer = useCallback((message: AIAssistantMessage) => {
        // The turn's own receipt, not a fresh one: this card came from that
        // answer, and the answer read what it read when it ran.
        const id = addAnswerToCanvas(questionFor(message.id).slice(0, 60), message.text, {
            ...run.runnerContext(),
            provenance: message.provenance,
        });
        updateAITurn(message.id, { createdNodeIds: [...message.createdNodeIds, id] });
    }, [questionFor, run, updateAITurn]);

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
        const external = run.startExternalRun();
        setAIRunning(true);
        updateAITurn(message.id, { status: 'streaming' });

        const ctx: RunnerContext = {
            ...run.runnerContext(),
            signal: external.signal,
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
            const result = await runCreate(
                `${artifact.instruction}\n\n[ANSWER TO SHAPE]\n${message.text}`,
                run.scopeContext().context,
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
            external.finish();
            setAIRunning(false);
        }
    }, [aiEffort, aiModel, isRunning, keepAnswer, pushAIStep, run, setAIRunning, updateAITurn]);

    const copy = useCallback((message: AIAssistantMessage) => {
        void navigator.clipboard?.writeText(message.text);
        setCopiedId(message.id);
        window.setTimeout(() => setCopiedId((c) => (c === message.id ? null : c)), 1400);
    }, []);

    const exploreResultPart = useCallback((message: AIAssistantMessage, part: AIResultPart) => {
        if (isRunning) return;
        setAIMode('ask');
        composer.setReplyContext({ messageId: message.id, kind: part.kind, text: part.text });
        composer.focusInput();
    }, [composer, isRunning, setAIMode]);

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
     * Redo on one line or section.
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

    return {
        copiedId,
        undoTurn,
        revertEdits,
        locateCreatedNodes,
        restoreBubble,
        duplicateBubble,
        regenerateBubble,
        createAnswerArtifact,
        copy,
        exploreResultPart,
        deleteResultPart,
        regeneratingPart,
        regenerateTarget,
        setRegenerateTarget,
        stopRegenerateResultPart,
        regenerateResultPart,
    };
}

export type TurnActions = ReturnType<typeof useTurnActions>;
