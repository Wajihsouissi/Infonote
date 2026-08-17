import type { AIMessage } from './aiTypes';

/** How many prior turns to carry. Enough to iterate, short enough to stay cheap. */
const HISTORY_TURNS = 8;
const REPLY_EXCERPT_CHARS = 900;

/**
 * Fold the transcript into the prompt.
 *
 * The gateway route takes a single `prompt` string rather than a messages
 * array, so multi-turn context has to be carried in the text. Without this an
 * Ask turn is stateless: "plan a case study" then "expand phase 3" would send
 * only the second sentence, and the answer would be about nothing. Planning is
 * iterative by nature, so the transcript is the feature.
 */
export function buildConversationPrompt(messages: AIMessage[], question: string): string {
    // Drop the turn currently streaming (it is the one we are asking for).
    const prior = messages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status !== 'streaming' && m.text.trim()))
        .slice(-HISTORY_TURNS * 2);

    if (prior.length === 0) return question;

    const transcript = prior
        .map((m) => {
            if (m.role === 'user') return `User: ${m.text}`;
            const text = m.text.length > REPLY_EXCERPT_CHARS ? `${m.text.slice(0, REPLY_EXCERPT_CHARS)}…` : m.text;
            return `Assistant: ${text}`;
        })
        .join('\n\n');

    return `[CONVERSATION SO FAR]
${transcript}

[CURRENT QUESTION]
${question}

Answer the current question. Build on the conversation above instead of repeating it — when the user says "that", "it", or "phase 3", they mean something you already wrote.`;
}
