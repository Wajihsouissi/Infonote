import { useEffect, useRef, useState } from 'react';
import { Globe, RefreshCw, Scissors, Sparkles, Type, X, Maximize2 } from '../../components/icons';
import styles from './AIRegenerateDialog.module.css';

export type AIRegenerateRequest = {
    /** Free-text direction for the rewrite. Empty means "just do it better". */
    instruction: string;
    /** Short name for the activity log, when a quick action was used. */
    label?: string;
};

type QuickAction = {
    id: string;
    label: string;
    hint: string;
    icon: React.FC<{ size?: number }>;
    /** Runs immediately. */
    instruction?: string;
    /** Needs one more word from the user, so it fills the field instead. */
    prefill?: string;
};

/**
 * Five directions that cover what people actually redo a line for. Each one is
 * written as an instruction to the model rather than a keyword, because
 * "shorter" alone reliably produces a fragment, not a tighter sentence.
 */
const QUICK_ACTIONS: QuickAction[] = [
    {
        id: 'shorter',
        label: 'Shorter',
        hint: 'Cut it down',
        icon: Scissors,
        instruction: 'Tighten it. Say the same thing in noticeably fewer words — cut hedging, filler and repetition, and keep every fact.',
    },
    {
        id: 'longer',
        label: 'Longer',
        hint: 'Add the detail',
        icon: Maximize2,
        instruction: 'Expand it. Add the concrete detail, reason or example that is missing — no padding and no repetition.',
    },
    {
        id: 'simpler',
        label: 'Simpler',
        hint: 'Plain language',
        icon: Sparkles,
        instruction: 'Rewrite it in plain language someone new to the topic would follow on the first read. No jargon, no abstraction, same meaning.',
    },
    {
        id: 'formal',
        label: 'More formal',
        hint: 'Professional tone',
        icon: Type,
        instruction: 'Raise the register: precise, professional wording. No contractions, no slang, no exclamations, same meaning.',
    },
    {
        id: 'translate',
        label: 'Translate',
        hint: 'Name the language',
        icon: Globe,
        prefill: 'Translate it to ',
    },
];

/**
 * Redo asks a question before it spends a request: *what* should change?
 *
 * The old button rewrote blind, so the only way to steer it was to run it
 * again and hope. The quick actions are one click each; the field below them
 * takes anything they don't cover, and both run the same scoped rewrite that
 * replaces this fragment and nothing else.
 */
export function AIRegenerateDialog({
    kind,
    preview,
    onSubmit,
    onClose,
}: {
    kind: 'line' | 'section';
    preview: string;
    onSubmit: (request: AIRegenerateRequest) => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const noun = kind === 'section' ? 'section' : 'line';

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    /* Escape is claimed by the canvas: a window-level capture listener blurs
       whatever editable field has focus and stops the event there, so a plain
       onKeyDown on this dialog never sees it. Taking Escape in the same phase
       is what the mention and command pickers do for the same reason. */
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const run = (request: AIRegenerateRequest) => {
        onSubmit({ ...request, instruction: request.instruction.trim() });
    };

    const pick = (action: QuickAction) => {
        if (action.prefill) {
            setDraft(action.prefill);
            const input = inputRef.current;
            input?.focus();
            // Caret after the prefix, so the next keystroke is the language.
            window.requestAnimationFrame(() => input?.setSelectionRange(input.value.length, input.value.length));
            return;
        }
        run({ instruction: action.instruction ?? '', label: action.label });
    };

    return (
        <div
            className={styles.backdrop}
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label={`Regenerate this ${noun}`}
            >
                <div className={styles.head}>
                    <span className={styles.icon} aria-hidden="true"><RefreshCw size={15} /></span>
                    <div className={styles.headCopy}>
                        <h2>Regenerate this {noun}</h2>
                        <p>Only this {noun} changes — the rest of the answer stays as it is.</p>
                    </div>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Cancel">
                        <X size={15} />
                    </button>
                </div>

                <p className={styles.preview} title={preview}>{preview}</p>

                <div className={styles.actions} role="group" aria-label="Quick rewrites">
                    {QUICK_ACTIONS.map((action) => {
                        const ActionIcon = action.icon;
                        return (
                            <button
                                key={action.id}
                                type="button"
                                className={styles.action}
                                onClick={() => pick(action)}
                                title={action.hint}
                            >
                                <ActionIcon size={13} />
                                <span className={styles.actionLabel}>{action.label}</span>
                                <span className={styles.actionHint}>{action.hint}</span>
                            </button>
                        );
                    })}
                </div>

                <textarea
                    ref={inputRef}
                    className={styles.input}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            run({ instruction: draft });
                        }
                    }}
                    rows={2}
                    placeholder={`Or say how this ${noun} should change…`}
                    aria-label={`How this ${noun} should change`}
                />

                <div className={styles.foot}>
                    <span className={styles.footHint}>Enter to run · Esc to cancel</span>
                    <button type="button" className={styles.submit} onClick={() => run({ instruction: draft })}>
                        <RefreshCw size={13} />
                        {draft.trim() ? 'Rewrite' : 'Regenerate'}
                    </button>
                </div>
            </div>
        </div>
    );
}
