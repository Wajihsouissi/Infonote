import { useState } from 'react';
import { Check, CornerDownLeft, Sparkles } from '../../components/icons';
import type { AIFormMessage } from './aiTypes';
import styles from './AIClarifyForm.module.css';

/**
 * The clarifying form — ai-Plan.md §5.2 (W2).
 *
 * Rendered inline in the transcript, never as a modal: the canvas stays live
 * and the form scrolls away with the conversation once answered.
 *
 * Two exits, and the secondary one matters as much as the primary. **Continue**
 * runs with whatever is selected — every question arrives pre-answered, so that
 * is always valid. **Just answer** skips the whole thing and runs the request
 * exactly as typed. Without that second door the form is a toll gate, and a
 * toll gate on a note-taking app is how a good idea becomes an annoyance.
 */
export function AIClarifyForm({
    message,
    onSubmit,
    onSkip,
    disabled,
}: {
    message: AIFormMessage;
    onSubmit: (answers: Record<string, string[]>) => void;
    onSkip: () => void;
    disabled?: boolean;
}) {
    const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
        const seed: Record<string, string[]> = {};
        for (const question of message.questions) seed[question.id] = [...(question.defaults ?? [])];
        return seed;
    });

    const settled = message.status !== 'open';

    const toggle = (questionId: string, optionId: string, multi: boolean) => {
        setAnswers((current) => {
            const chosen = current[questionId] ?? [];
            if (!multi) return { ...current, [questionId]: [optionId] };
            return {
                ...current,
                [questionId]: chosen.includes(optionId)
                    ? chosen.filter((id) => id !== optionId)
                    : [...chosen, optionId],
            };
        });
    };

    // Answered forms collapse to a receipt: the questions have served their
    // purpose, but what was chosen has to stay visible on the turn.
    if (settled) {
        const chips = message.questions.flatMap((question) => {
            const chosen = (message.answers ?? answers)[question.id] ?? [];
            const selected = chosen
                .map((id) => question.kind === 'text' ? id : question.options?.find((o) => o.id === id)?.label)
                .filter((label): label is string => Boolean(label));
            const custom = message.customAnswers?.[question.id]?.trim();
            return custom ? [...selected, custom] : selected;
        });
        if (message.additionalInfo?.trim()) chips.push(message.additionalInfo.trim());
        return (
            <div className={styles.receipt}>
                <Sparkles size={11} />
                <span>{message.status === 'skipped' ? 'Answered as asked' : 'Shaped by your answers'}</span>
                {chips.slice(0, 4).map((label, index) => (
                    <span key={`${label}-${index}`} className={styles.receiptChip}>{label}</span>
                ))}
                {chips.length > 4 && <span className={styles.receiptMore}>+{chips.length - 4}</span>}
            </div>
        );
    }

    return (
        <div className={styles.form}>
            <div className={styles.head}>
                <span className={styles.headIcon}><Sparkles size={13} /></span>
                <div>
                    <div className={styles.headTitle}>
                        {message.questions.length} quick answer{message.questions.length === 1 ? '' : 's'} and I’ll shape a useful answer
                    </div>
                    <p className={styles.headReason}>{message.reason}</p>
                </div>
            </div>

            <div className={styles.questions}>
                {message.questions.map((question, index) => (
                    <div key={question.id} className={styles.question}>
                        <div className={styles.questionTop}>
                            <span className={styles.questionNum}>{index + 1}</span>
                            <span className={styles.questionLabel}>{question.prompt}</span>
                            <span className={styles.questionKind}>
                                {question.kind === 'single' ? 'Pick one' : question.kind === 'multi' ? 'Pick any' : 'Optional'}
                            </span>
                        </div>

                        {question.kind === 'text' ? (
                            <textarea
                                className={styles.field}
                                rows={2}
                                placeholder="Anything that should guide the answer — audience, detail, constraints…"
                                value={answers[question.id]?.[0] ?? ''}
                                onChange={(event) => setAnswers((c) => ({ ...c, [question.id]: [event.target.value] }))}
                                disabled={disabled}
                            />
                        ) : (
                            <div className={styles.options}>
                                {question.options?.map((option) => {
                                    const on = (answers[question.id] ?? []).includes(option.id);
                                    const isDefault = (question.defaults ?? []).includes(option.id);
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`${styles.option} ${on ? styles.optionOn : ''}`}
                                            onClick={() => toggle(question.id, option.id, question.kind === 'multi')}
                                            aria-pressed={on}
                                            disabled={disabled}
                                        >
                                            <span className={`${styles.mark} ${question.kind === 'multi' ? styles.markSquare : ''}`}>
                                                {on && <Check size={9} />}
                                            </span>
                                            <span className={styles.optionBody}>
                                                <span className={styles.optionLabel}>{option.label}</span>
                                                {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
                                            </span>
                                            {isDefault && <span className={styles.defaultTag}>Default</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className={styles.foot}>
                <button type="button" className={styles.go} onClick={() => onSubmit(answers)} disabled={disabled}>
                    Continue <CornerDownLeft size={12} />
                </button>
                <button type="button" className={styles.skip} onClick={onSkip} disabled={disabled}>
                    Just answer
                </button>
            </div>
        </div>
    );
}
