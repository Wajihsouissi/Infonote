/**
 * Slash commands in the AI composer.
 *
 * `/` was reserved for this in ai-Plan.md §5.8. The first command exists
 * because the clarifying form's gate (`shouldClarify`) is deliberately
 * conservative — it suppresses far more often than it fires, since a form on an
 * already-clear request is worse than no form. That is the right default and
 * the wrong ceiling: it leaves no way to say "I know this is vague, ask me".
 * `/ask` is that way.
 *
 * A registry rather than a string check in `submit`, because the second command
 * always arrives, and because the picker and the parser have to agree on what
 * exists — deriving both from one list is what stops them drifting.
 */

export interface AICommand {
    /** Canonical name, without the slash. */
    name: string;
    /** Other spellings that resolve here. Never shown in the picker. */
    aliases?: string[];
    label: string;
    hint: string;
    /** What the command changes about the run. */
    effect: 'force-clarify';
}

export const AI_COMMANDS: AICommand[] = [
    {
        name: 'ask',
        /* `/clarify` reads more precisely — "Ask" is already the name of the
           mode pill that means "answer here, do not touch the canvas", so
           `/ask` and Ask mode are two different things wearing one word. Both
           spellings work; the picker shows only the one the user asked for. */
        aliases: ['clarify', 'questions'],
        label: '/ask',
        hint: 'Answer a few questions first, so the response focuses on what you need',
        effect: 'force-clarify',
    },
];

export interface ParsedCommand {
    command: AICommand;
    /** The request with the command token removed. */
    query: string;
}

/**
 * Pull a leading `/command` off a draft.
 *
 * Only leading, and only when followed by a space or the end of the line: a URL
 * path or a date typed mid-sentence must never be read as a command. Returns
 * `null` for anything unrecognised, which leaves an unknown `/whatever` as
 * ordinary text rather than silently eating it.
 */
export function parseCommand(draft: string): ParsedCommand | null {
    const match = /^\/([a-z][a-z-]*)(?:\s+([\s\S]*))?$/i.exec(draft.trim());
    if (!match) return null;

    const typed = match[1].toLowerCase();
    const command = AI_COMMANDS.find(
        (c) => c.name === typed || c.aliases?.includes(typed),
    );
    if (!command) return null;

    return { command, query: (match[2] ?? '').trim() };
}

/** Commands matching what has been typed after the `/`, for the picker. */
export function matchCommands(query: string): AICommand[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return AI_COMMANDS;
    return AI_COMMANDS.filter(
        (c) => c.name.startsWith(needle) || c.aliases?.some((a) => a.startsWith(needle)),
    );
}
