import { useCallback, useState } from 'react';
import { getNodeBlocks, type NoteNode } from '../../types';

/**
 * Write a card's description from what the card says.
 *
 * Two lines and a few bullets, because the description is read at a glance on
 * a board of forty cards — a summary that needs its own scroll bar is the body
 * again. The result is committed straight to the card: it is a draft the user
 * can edit like anything else they typed, and an approval step for one line of
 * text would cost more attention than reading it.
 */
export function useAutoSummary(id: string, data: NoteNode['data'], onUpdate: (id: string, patch: Partial<NoteNode['data']>) => void) {
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const blocks = getNodeBlocks(data) ?? [];
    const text = blocks.map((b) => (typeof b.content === 'string' ? b.content : '')).join('\n').trim();
    const canSummarize = text.length > 0;

    const summarize = useCallback(async () => {
        if (!canSummarize || isSummarizing) return;
        setIsSummarizing(true);
        setError(null);
        try {
            // Loaded on use — see the note in editor/blocks/AIBlock.tsx.
            const { generateText } = await import('../../services/ai/text');
            const summary = await generateText(
                `Summarize the following content in exactly two lines, followed by a few bullet points:\n\n${text}`,
            );
            onUpdate(id, { description: summary.trim() });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not summarize this card.');
        } finally {
            setIsSummarizing(false);
        }
    }, [canSummarize, id, isSummarizing, onUpdate, text]);

    return { summarize, isSummarizing, canSummarize, error };
}
