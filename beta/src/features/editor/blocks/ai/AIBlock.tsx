import { memo, useState } from 'react';
import { Loader2, Sparkles } from '../../../../shared/icons';
import type { BlockProps } from '../types';
import styles from './AIBlock.module.css';

/**
 * "Generate with AI" — a block that replaces itself with what it writes.
 *
 * Deliberately not a chat: the answer is not shown for approval, it becomes
 * real blocks in the note where the prompt was typed. That is why the request
 * goes out as plain markdown with no wrapper — anything the model fences would
 * land in the note as a literal code block.
 */
export const AIBlock = memo(({ block, readOnly }: BlockProps) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generate = async () => {
        if (!prompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setError(null);
        try {
            /* The AI service is loaded when someone actually asks for writing,
               not with the canvas: three small features reach for it (this
               block, the card summary, Chunk it's split suggestion) and none of
               them is on the path to a first paint. It costs one await inside a
               handler that was already async, and keeps ~10 kB of prompts and
               transport out of every canvas load. */
            const [{ FREEFORM_SYSTEM_PROMPT }, { generateText }] = await Promise.all([
                import('../../../../services/ai/prompts'),
                import('../../../../services/ai/text'),
            ]);
            // The shared assistant persona, plus the one thing that differs
            // about writing inline: no wrapper around the answer.
            const system = `${FREEFORM_SYSTEM_PROMPT}\n\nYou are writing inline inside the user's note. Respond with raw markdown only — do not wrap the whole answer in a code block.`;
            const content = await generateText(prompt, system);
            /* The editor owns the block list, so the finished text is announced
               rather than written from here: this block is about to stop
               existing, and a component that has replaced itself cannot also be
               the thing holding the new blocks. */
            window.dispatchEvent(new CustomEvent('chnk-it-ai-generate', { detail: { id: block.id, content } }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not generate that. Try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className={styles.block} contentEditable={false}>
            <div className={styles.head}>
                <Sparkles size={16} />
                <span>Generate with AI</span>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.row}>
                <input
                    autoFocus
                    className={styles.input}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void generate();
                        }
                    }}
                    placeholder="Tell AI what to write…"
                    disabled={isGenerating || readOnly}
                />
                {isGenerating && <Loader2 size={16} className={styles.spinner} />}
            </div>
        </div>
    );
});
