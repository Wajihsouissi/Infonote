import { Check, CornerDownLeft, Plus, RefreshCw, Sparkles, Trash2, X } from '../../components/icons';
import type { AIClarifyDraft, AIFormQuestion } from './aiTypes';
import styles from './AIClarifierOverlay.module.css';

type Props = {
    draft: AIClarifyDraft;
    onChange: (next: AIClarifyDraft) => void;
    onCancel: () => void;
    onSubmit: () => void;
    onAddQuestion: () => void;
    onRegenerateQuestion: (id: string) => void;
};

function questionAnswer(draft: AIClarifyDraft, question: AIFormQuestion): string[] {
    return draft.answers[question.id] ?? question.defaults ?? [];
}

/**
 * Focused Ask Me surface. It replaces the panel body temporarily instead of
 * pushing the composer down or becoming a browser-modal: chat remains present
 * underneath, and Cancel returns to it with the draft intact.
 */
export function AIClarifierOverlay({
    draft,
    onChange,
    onCancel,
    onSubmit,
    onAddQuestion,
    onRegenerateQuestion,
}: Props) {
    const updateQuestion = (id: string, patch: Partial<AIClarifyDraft>) => onChange({ ...draft, ...patch });

    const toggleOption = (question: AIFormQuestion, optionId: string) => {
        const chosen = questionAnswer(draft, question);
        const next = question.kind === 'multi'
            ? (chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : [...chosen, optionId])
            : [optionId];
        updateQuestion(question.id, { answers: { ...draft.answers, [question.id]: next } });
    };

    const removeQuestion = (id: string) => {
        const { [id]: _answer, ...answers } = draft.answers;
        const { [id]: _custom, ...customAnswers } = draft.customAnswers;
        onChange({
            ...draft,
            questions: draft.questions.filter((question) => question.id !== id),
            answers,
            customAnswers,
        });
    };

    if (draft.status === 'loading') {
        return (
            <section className={`${styles.overlay} ${styles.loading}`} aria-label="Preparing Ask Me questions" aria-busy="true">
                <div className={styles.loadingHead}>
                    <span className={styles.icon}><Sparkles size={15} /></span>
                    <div>
                        <h2>Shaping the right questions</h2>
                        <p>Using your request and any context you attached.</p>
                    </div>
                </div>
                <div className={styles.progressTrack} aria-hidden="true"><span className={styles.progressBar} /></div>
                <div className={styles.skeletonQuestion}><i /><i /><i /><i /></div>
                <div className={styles.skeletonQuestion}><i /><i /><i /></div>
                <div className={styles.skeletonQuestion}><i /><i /></div>
                <div className={styles.loadingFooter}><span /><span /></div>
            </section>
        );
    }

    const generating = draft.generatingQuestionIds.length > 0;

    return (
        <section className={styles.overlay} aria-label="Ask Me form">
            <header className={styles.head}>
                <span className={styles.icon}><Sparkles size={15} /></span>
                <div className={styles.headCopy}>
                    <h2>Shape the answer</h2>
                    <p>{draft.reason || 'Choose what matters. Leave anything open and AI will make a sensible call.'}</p>
                </div>
                <button type="button" className={styles.close} onClick={onCancel} title="Return to chat" aria-label="Return to chat">
                    <X size={15} />
                </button>
            </header>

            <div className={styles.body}>
                {draft.questions.map((question, index) => {
                    const chosen = questionAnswer(draft, question);
                    const busy = draft.generatingQuestionIds.includes(question.id);
                    return (
                        <article className={styles.question} key={question.id}>
                            <div className={styles.questionHead}>
                                <span className={styles.questionNumber}>{String(index + 1).padStart(2, '0')}</span>
                                <h3>{question.prompt}</h3>
                                <div className={styles.questionActions}>
                                    <button
                                        type="button"
                                        onClick={() => onRegenerateQuestion(question.id)}
                                        disabled={busy || generating}
                                        title="Regenerate this question"
                                        aria-label="Regenerate this question"
                                    >
                                        <RefreshCw size={13} className={busy ? styles.spinning : undefined} />
                                    </button>
                                    <button type="button" onClick={() => removeQuestion(question.id)} disabled={busy} title="Delete this question" aria-label="Delete this question">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>

                            {question.kind === 'text' ? (
                                <textarea
                                    className={styles.textAnswer}
                                    rows={2}
                                    value={chosen[0] ?? ''}
                                    placeholder="Type an answer, or leave this open for AI…"
                                    onChange={(event) => updateQuestion(question.id, { answers: { ...draft.answers, [question.id]: [event.target.value] } })}
                                />
                            ) : (
                                <div className={styles.options}>
                                    {question.options?.map((option) => {
                                        const selected = chosen.includes(option.id);
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                                                onClick={() => toggleOption(question, option.id)}
                                                aria-pressed={selected}
                                            >
                                                <span className={`${styles.mark} ${question.kind === 'multi' ? styles.markMulti : ''}`}>{selected && <Check size={10} />}</span>
                                                <span className={styles.optionCopy}>
                                                    <strong>{option.label}</strong>
                                                    {option.hint && <small>{option.hint}</small>}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        className={`${styles.decide} ${chosen.length === 0 ? styles.decideSelected : ''}`}
                                        onClick={() => updateQuestion(question.id, { answers: { ...draft.answers, [question.id]: [] } })}
                                    >
                                        Let AI decide
                                    </button>
                                </div>
                            )}

                            <input
                                className={styles.detail}
                                value={draft.customAnswers[question.id] ?? ''}
                                placeholder="Add a detail (optional)"
                                onChange={(event) => updateQuestion(question.id, { customAnswers: { ...draft.customAnswers, [question.id]: event.target.value } })}
                            />
                        </article>
                    );
                })}

                <button
                    type="button"
                    className={styles.addQuestion}
                    onClick={onAddQuestion}
                    disabled={draft.questions.length >= 10 || generating}
                >
                    <Plus size={14} />
                    {draft.questions.length >= 10 ? 'Question limit reached' : 'Add a question'}
                </button>

                <div className={styles.additional}>
                    <label htmlFor="ai-clarifier-additional">Anything else the answer should account for?</label>
                    <textarea
                        id="ai-clarifier-additional"
                        rows={3}
                        value={draft.additionalInfo}
                        placeholder="Goal, audience, level of detail, constraints, or a preference not covered above…"
                        onChange={(event) => onChange({ ...draft, additionalInfo: event.target.value })}
                    />
                </div>
            </div>

            <footer className={styles.footer}>
                <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
                <span className={styles.footerHint}>Leave anything open and AI will make a sensible choice for the answer.</span>
                <button type="button" className={styles.submit} onClick={onSubmit} disabled={generating}>
                    Generate focused answer <CornerDownLeft size={14} />
                </button>
            </footer>
        </section>
    );
}
