import { useCallback, useState } from 'react';
import { MAX_ATTACHMENTS, readAttachment, type AIAttachment } from '../attachments';
import type { AIResultPart } from '../aiResultUtils';

/**
 * Everything the composer holds before a turn is sent.
 *
 * Drafting is its own concern: the text, the `@` and `/` tokens being typed,
 * the files attached, and the two intent markers (Ask-me, reply context) that
 * qualify the request. The run hook reads this, sends it, and clears it — it
 * never has to know how any of it got there.
 */

export type AIReplyContext = {
    messageId: string;
    kind: AIResultPart['kind'];
    text: string;
};

export function useComposerDraft() {
    const [draft, setDraft] = useState('');
    const [attachments, setAttachments] = useState<AIAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [replyContext, setReplyContext] = useState<AIReplyContext | null>(null);
    /** `/ask` becomes a visible, removable intent token rather than text the
        user has to keep editing around. */
    const [askMeArmed, setAskMeArmed] = useState(false);

    /* The `@` picker. `null` is closed; a string is the text typed after the
       `@` that opened it. `mentionAt` is where that `@` sits in the draft, so
       accepting a mention can replace the token it was typed as rather than
       leaving it behind. */
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionAt, setMentionAt] = useState<number | null>(null);
    /** Text typed after a leading `/`; null when the command picker is closed. */
    const [commandQuery, setCommandQuery] = useState<string | null>(null);

    /* A counter rather than a ref passed down to the composer: the input
       belongs to the component that renders it, and "put the caret back in the
       box" is an event, which a number that only ever goes up expresses
       without anyone reaching into anyone else's DOM. */
    const [focusToken, setFocusToken] = useState(0);
    const focusInput = useCallback(() => setFocusToken((n) => n + 1), []);

    /**
     * Close the picker, optionally removing the `@token` that opened it.
     *
     * The token is scaffolding for choosing a source, not content: once the
     * chip exists in the context bar, leaving "@pri" in the sentence would send
     * the model a fragment of a word it has no way to resolve.
     */
    const closeMention = useCallback((consumeToken: boolean) => {
        if (consumeToken && mentionAt !== null) {
            setDraft((current) => {
                const after = current.slice(mentionAt).search(/\s/);
                const end = after === -1 ? current.length : mentionAt + after;
                return `${current.slice(0, mentionAt)}${current.slice(end)}`.replace(/\s{2,}/g, ' ');
            });
        }
        setMentionQuery(null);
        setMentionAt(null);
    }, [mentionAt]);

    /**
     * Watch the caret for an `@word` it is sitting inside.
     *
     * Deliberately caret-driven rather than fired once on the `@` keystroke:
     * clicking back into a mention you already typed should reopen the picker,
     * and moving away from it should close it. The token has to start at a word
     * boundary so an email address in the prompt does not open a card search.
     */
    const syncMention = useCallback((value: string, caret: number | null) => {
        if (caret === null) return;
        const before = value.slice(0, caret);
        const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
        if (!match) {
            setMentionQuery((current) => (current === null ? current : null));
            setMentionAt((current) => (current === null ? current : null));
            return;
        }
        setMentionQuery(match[1]);
        setMentionAt(caret - match[1].length - 1);
    }, []);

    /**
     * Watch for a `/command` the caret is inside.
     *
     * Only at the very start of the draft, unlike `@` which can appear
     * anywhere: a command changes how the whole turn runs, and a slash
     * mid-sentence is far more likely to be a date or a path than an
     * instruction. Anchoring it removes that ambiguity entirely.
     */
    const syncCommand = useCallback((value: string, caret: number | null) => {
        if (caret === null) return;
        const match = /^\/([a-z-]*)$/i.exec(value.slice(0, caret));
        if (!match) {
            setCommandQuery((current) => (current === null ? current : null));
            return;
        }
        setCommandQuery(match[1]);
    }, []);

    /** Keep both pickers in step with wherever the caret just landed. */
    const syncTokens = useCallback((value: string, caret: number | null) => {
        syncMention(value, caret);
        syncCommand(value, caret);
    }, [syncCommand, syncMention]);

    /**
     * Take files from the picker, a drop, or a paste. Each is read on its own so
     * one unreadable file (a video, an oversized image) reports its reason
     * without discarding the ones that were fine.
     */
    const addFiles = useCallback(async (files: FileList | File[]) => {
        const incoming = Array.from(files);
        if (incoming.length === 0) return;
        setAttachError(null);

        const accepted: AIAttachment[] = [];
        const refused: string[] = [];

        for (const file of incoming) {
            if (attachments.length + accepted.length >= MAX_ATTACHMENTS) {
                refused.push(`Only ${MAX_ATTACHMENTS} attachments per message.`);
                break;
            }
            try {
                accepted.push(await readAttachment(file));
            } catch (err) {
                refused.push(err instanceof Error ? err.message : `Could not read ${file.name}.`);
            }
        }

        if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
        if (refused.length > 0) setAttachError(refused[0]);
    }, [attachments.length]);

    const removeAttachment = useCallback((id: string) => {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    /** Everything a sent turn takes with it, cleared in one call. */
    const clearAfterSend = useCallback(() => {
        setDraft('');
        setAskMeArmed(false);
        setReplyContext(null);
        setAttachments([]);
        setAttachError(null);
    }, []);

    return {
        focusToken,
        focusInput,
        draft,
        setDraft,
        attachments,
        addFiles,
        removeAttachment,
        attachError,
        setAttachError,
        replyContext,
        setReplyContext,
        askMeArmed,
        setAskMeArmed,
        mentionQuery,
        closeMention,
        commandQuery,
        setCommandQuery,
        syncTokens,
        clearAfterSend,
    };
}

export type ComposerDraft = ReturnType<typeof useComposerDraft>;
