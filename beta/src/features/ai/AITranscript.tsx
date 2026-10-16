import { AlertCircle, Copy, Crosshair, Layers, MessageSquare, RotateCcw, Sparkles, Undo2 } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { AIAssistantMessage, AIMessage } from './aiTypes';
import { answersAsBrief } from './aiRouter';
import { nodeTitle } from './canvasContext';
import { AIClarifyForm } from './AIClarifyForm';
import { AIMarkdown } from './AIMarkdown';
import { AIRunTrace } from './AIRunTrace';
import { AITurnResult } from './AITurnResult';
import { SelectedNodeStrip } from './SelectedNodeStrip';
import { ANSWER_ARTIFACTS, SUGGESTIONS, responseReceipt } from './panel/constants';
import type { AIRun } from './panel/useAIRun';
import type { TurnActions } from './panel/useTurnActions';
import type { ComposerDraft } from './panel/useComposerDraft';
import styles from './AITranscript.module.css';

/**
 * The conversation itself: what was asked, what was done about it, and what
 * can still be done with the result.
 *
 * Every turn is rendered from the stored message alone. Nothing here derives
 * state from the live canvas — a turn's scope chips, its cards and its receipt
 * describe the moment it ran, and a canvas edited since must not quietly
 * rewrite that history.
 */
export function AITranscript({
    messages,
    composer,
    run,
    actions,
}: {
    messages: AIMessage[];
    composer: ComposerDraft;
    run: AIRun;
    actions: TurnActions;
}) {
    const setAIMode = useStore((s) => s.setAIMode);
    const settleAIForm = useStore((s) => s.settleAIForm);
    const displayName = useStore((s) => s.auth.displayName);
    const isRunning = run.isRunning;
    const firstName = displayName?.trim().split(/\s+/)[0] ?? 'there';

    if (messages.length === 0) {
        return (
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
                                composer.setDraft(suggestion.prompt);
                                composer.focusInput();
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
        );
    }

    return (
        <>
            {messages.map((message) => {
                if (message.role === 'form') {
                    return (
                        <AIClarifyForm
                            key={message.id}
                            message={message}
                            disabled={isRunning}
                            onSubmit={(answers) => {
                                settleAIForm(message.id, 'answered', answers);
                                void run.submit(message.pendingQuery, {
                                    brief: answersAsBrief(message.questions, answers),
                                    skipClarify: true,
                                });
                            }}
                            onSkip={() => {
                                settleAIForm(message.id, 'skipped');
                                void run.submit(message.pendingQuery, { skipClarify: true });
                            }}
                        />
                    );
                }

                if (message.role === 'user') {
                    return <UserTurn key={message.id} message={message} actions={actions} />;
                }

                return <AssistantTurn key={message.id} message={message} run={run} actions={actions} />;
            })}
        </>
    );
}

/** The three things every bubble offers: ask again, ask twice, ask differently. */
function BubbleActions({ messageId, actions, children }: { messageId: string; actions: TurnActions; children?: React.ReactNode }) {
    return (
        <div className={styles.bubbleActions} role="toolbar" aria-label="Message actions">
            <button className={styles.bubbleAction} onClick={() => actions.restoreBubble(messageId)} title="Restore prompt" aria-label="Restore prompt">
                <MessageSquare size={12} />
            </button>
            <button className={styles.bubbleAction} onClick={() => actions.duplicateBubble(messageId)} title="Duplicate prompt" aria-label="Duplicate prompt">
                <Copy size={12} />
            </button>
            <button className={styles.bubbleAction} onClick={() => void actions.regenerateBubble(messageId)} title="Regenerate response" aria-label="Regenerate response">
                <RotateCcw size={12} />
            </button>
            {children}
        </div>
    );
}

function UserTurn({ message, actions }: { message: Extract<AIMessage, { role: 'user' }>; actions: TurnActions }) {
    const nodes = useStore((s) => s.nodes);

    return (
        <div className={styles.userTurn}>
            {/* What the AI could see when this was asked, frozen on the
                message. The selection moves on, so a chip row derived live
                would quietly rewrite history. */}
            {message.scope && message.scope.length > 0 && (
                <div className={styles.turnScope}>
                    {message.scope.map((source) => {
                        const key = source.kind === 'node' ? `node:${source.id}`
                            : source.kind === 'subtree' ? `subtree:${source.rootId}`
                            : source.kind === 'canvas' ? 'canvas' : source.kind;
                        const node = source.kind === 'node' ? nodes.find((n) => n.id === source.id) : undefined;
                        const label = source.kind === 'selection' ? 'Selection'
                            : source.kind === 'canvas' ? '@Canvas'
                            : source.kind === 'node' ? (node ? nodeTitle(node) : 'Missing card')
                            : 'Container';
                        return (
                            <span key={key} className={styles.turnScopeChip}>
                                <Layers size={10} />
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
                <BubbleActions messageId={message.id} actions={actions} />
            </div>
        </div>
    );
}

function AssistantTurn({ message, run, actions }: { message: AIAssistantMessage; run: AIRun; actions: TurnActions }) {
    const isRunning = run.isRunning;
    const { regeneratingPart } = actions;

    return (
        <div className={styles.assistantTurn}>
            <BubbleActions messageId={message.id} actions={actions}>
                {message.createdNodeIds.length > 0 && (
                    <>
                        <button className={styles.bubbleAction} onClick={() => actions.locateCreatedNodes(message)} title="Locate on canvas" aria-label="Locate on canvas">
                            <Crosshair size={12} />
                        </button>
                        <button className={styles.bubbleAction} onClick={() => actions.undoTurn(message)} title="Undo created items" aria-label="Undo created items">
                            <Undo2 size={12} />
                        </button>
                    </>
                )}
                {(message.editedNodes?.length ?? 0) > 0 && (
                    <button
                        className={styles.bubbleAction}
                        onClick={() => actions.revertEdits(message)}
                        title={`Restore ${message.editedNodes!.length} card${message.editedNodes!.length === 1 ? '' : 's'} to what they said before`}
                        aria-label="Restore edited cards"
                    >
                        <Undo2 size={12} />
                    </button>
                )}
                {message.text && (
                    <button
                        className={styles.bubbleAction}
                        onClick={() => actions.copy(message)}
                        title={actions.copiedId === message.id ? 'Copied' : 'Copy response'}
                        aria-label="Copy response"
                    >
                        <Copy size={12} />
                    </button>
                )}
            </BubbleActions>

            {/* The activity log. Replaces a flat list of icon+string rows that
                could say what it was doing but never what for — see AIRunTrace. */}
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
                    onExplore={(part) => actions.exploreResultPart(message, part)}
                    onRegenerate={(part) => actions.setRegenerateTarget({ messageId: message.id, part })}
                    onStopRegenerate={actions.stopRegenerateResultPart}
                    onDelete={(part) => actions.deleteResultPart(message, part)}
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
                                onClick={() => void actions.createAnswerArtifact(message, artifact.id)}
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

            {message.status === 'error' && (
                <div className={styles.errorBox}>
                    <AlertCircle size={13} />
                    <span>{message.error}</span>
                </div>
            )}

            {message.status === 'done' && message.createdNodeIds.length > 0 && (
                <AITurnResult
                    nodeIds={message.createdNodeIds}
                    onLocateAll={() => actions.locateCreatedNodes(message)}
                    onUndo={() => actions.undoTurn(message)}
                />
            )}
        </div>
    );
}
