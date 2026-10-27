import type { AIMessage } from './aiTypes';

/** How many prior turns to carry. Enough to iterate, short enough to stay cheap. */
const HISTORY_TURNS = 8;
const REPLY_EXCERPT_CHARS = 900;

/** One prior turn, in the shape the gateway's messages array wants. */
export interface AIHistoryTurn {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * The transcript as real conversation turns.
 *
 * This used to fold the whole history into one `prompt` string, because the
 * route accepted nothing else (ai-Plan.md §2.3 A2). That cost two things: the
 * prompt prefix changed on every turn, so prompt caching never hit, and the
 * boundary between "the user said" and "you said" was a `User:` / `Assistant:`
 * label inside one blob rather than a structural fact the model could rely on.
 * Planning is iterative by nature — "expand phase 3" only resolves against a
 * real previous turn — so the transcript is the feature.
 *
 * Assistant replies are still excerpted: a long answer carried in full would
 * dominate the window within a few turns, and the opening is where the shape of
 * an answer lives.
 */
export function buildConversationHistory(messages: AIMessage[], excludeMessageId?: string): AIHistoryTurn[] {
    return messages
        .filter((m) => m.id !== excludeMessageId)
        .filter((m): m is Extract<AIMessage, { role: 'user' | 'assistant' | 'form' }> =>
            m.role === 'user'
            || (m.role === 'assistant' && m.status !== 'streaming' && m.text.trim().length > 0)
            || (m.role === 'form' && m.status === 'answered'))
        .slice(-HISTORY_TURNS * 2)
        .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.role === 'user'
                ? m.text
                : m.role === 'assistant'
                    ? m.text.length > REPLY_EXCERPT_CHARS ? `${m.text.slice(0, REPLY_EXCERPT_CHARS)}…` : m.text
                    : [
                        '[ASK ME ANSWERS]',
                        ...m.questions.map((question) => {
                            const selected = (m.answers?.[question.id] ?? [])
                                .map((id) => question.kind === 'text' ? id : question.options?.find((option) => option.id === id)?.label ?? id)
                                .filter(Boolean)
                                .join(', ');
                            const custom = m.customAnswers?.[question.id]?.trim();
                            return selected || custom ? `- ${question.prompt}: ${[selected, custom].filter(Boolean).join('; ')}` : '';
                        }).filter(Boolean),
                        m.additionalInfo?.trim() ? `- Additional information: ${m.additionalInfo.trim()}` : '',
                    ].filter(Boolean).join('\n'),
        }));
}
