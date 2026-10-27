import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';
import { mergePendingDocument, sameDocument } from '../document/documentMerge';
import { normalizeBlockIds } from '../document/blockIdentity';
import { clearPendingEditorWrite, markPendingEditorWrite } from '../../../services/storage/workspace/pendingEditorWrites';

/** Typing is committed to the store this long after the last keystroke. */
const COMMIT_DELAY_MS = 300;
const MAX_COMMIT_DELAY_MS = 1500;

const emptyDocument = (text = ''): Block[] => [{ id: uuidv4(), type: 'text', content: text }];

const asBlocks = (content: string | Block[] | undefined): Block[] | null =>
    (Array.isArray(content) ? normalizeBlockIds(content) : null);

interface UseEditorDocumentOptions {
    initialContent?: string | Block[];
    onUpdate?: (blocks: Block[]) => void;
    /** Skip the debounce — for editors whose writes must land immediately. */
    syncUpdate?: boolean;
}

/**
 * The document the editor is editing: the blocks, how edits reach the store,
 * and how content changed elsewhere (fusion, the mind map, the outline) is
 * merged back in without stealing the line being typed.
 */
export function useEditorDocument({ initialContent, onUpdate, syncUpdate }: UseEditorDocumentOptions) {
    const ownerDocument = useMemo(() => asBlocks(initialContent), [initialContent]);
    const [blocks, setRenderedBlocks] = useState<Block[]>(() => {
        const given = ownerDocument;
        if (given && given.length > 0) return given;
        return emptyDocument(typeof initialContent === 'string' ? initialContent : '');
    });

    /* The blocks as of this instant. Handlers read it instead of `blocks` so
       they do not have to be rebuilt on every edit, and `updateBlock` writes it
       synchronously: two edits batched into one tick would otherwise make the
       second read stale types and take the wrong branch. */
    const blocksRef = useRef(blocks);
    const ownerBaseRef = useRef(blocks);
    const setBlocks = useCallback((update: React.SetStateAction<Block[]>) => {
        // Commands may publish/focus while building their next document.
        // Execute them in the event, not inside a React updater which React
        // can replay during rendering (especially in nested column editors).
        const next = normalizeBlockIds(typeof update === 'function' ? update(blocksRef.current) : update);
        blocksRef.current = next;
        setRenderedBlocks(next);
    }, []);

    const onUpdateRef = useRef(onUpdate);
    useLayoutEffect(() => {
        onUpdateRef.current = onUpdate;
    });

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<Block[] | null>(null);
    const pendingOwner = useRef(Symbol('editor draft'));

    const flush = useCallback(() => {
        if (!pendingRef.current) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
        timerRef.current = maxTimerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        try { onUpdateRef.current?.(next); }
        finally { clearPendingEditorWrite(pendingOwner.current); }
    }, []);

    /** Hand `next` to the owner, debounced unless this editor syncs eagerly. */
    const commit = useCallback((next: Block[]) => {
        pendingRef.current = normalizeBlockIds(next);
        if (syncUpdate) {
            flush();
            return;
        }
        markPendingEditorWrite(pendingOwner.current, flush);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, COMMIT_DELAY_MS);
        maxTimerRef.current ??= setTimeout(flush, MAX_COMMIT_DELAY_MS);
    }, [syncUpdate, flush]);

    // Unmounting mid-edit must not lose the edit.
    useEffect(() => flush, [flush]);

    useEffect(() => {
        const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
        // Capture runs before app persistence's lifecycle flush, so its graph
        // snapshot includes text still waiting in this editor's debounce.
        window.addEventListener('pagehide', flush, true);
        window.addEventListener('beforeunload', flush, true);
        document.addEventListener('visibilitychange', onHidden, true);
        return () => {
            window.removeEventListener('pagehide', flush, true);
            window.removeEventListener('beforeunload', flush, true);
            document.removeEventListener('visibilitychange', onHidden, true);
        };
    }, [flush]);

    /** The document `initialContent` describes, reusing ids where it can. */
    const externalDocument = useCallback((prev: Block[]): Block[] => {
        const given = ownerDocument;
        if (given) {
            if (given.length > 0) return given;
            const isAlreadyEmpty = prev.length === 1 && prev[0].type === 'text' && prev[0].content === '';
            return isAlreadyEmpty ? prev : emptyDocument();
        }
        const text = typeof initialContent === 'string' ? initialContent : '';
        const matches = prev.length === 1 && prev[0].type === 'text' && prev[0].content === text;
        return matches ? prev : emptyDocument(text);
    }, [initialContent, ownerDocument]);

    /**
     * Merges pending edits against the last accepted owner snapshot. Unchanged
     * fields accept owner changes; known deletions win and new local blocks
     * retain their position. Same-field conflicts preserve pending local text.
     *
     * The cheap identity check comes first, because the common case is the
     * owner handing back the very array this editor just saved.
     */
    const syncFromOwner = useCallback(() => {
        const previous = blocksRef.current;
        const incoming = externalDocument(previous);
        const base = ownerBaseRef.current;
        ownerBaseRef.current = incoming;
        if (sameDocument(previous, incoming)) return;
        const next = pendingRef.current ? mergePendingDocument(base, previous, incoming) : incoming;
        if (sameDocument(previous, next)) return;
        // The timer and event handlers must see the merged snapshot before
        // another event arrives, not only after React's next commit.
        const normalized = next.length ? next : emptyDocument();
        blocksRef.current = normalized;
        if (pendingRef.current) pendingRef.current = normalized;
        setBlocks(normalized);
    }, [externalDocument, setBlocks]);

    return { blocks, setBlocks, blocksRef, commit, flush, syncFromOwner };
}
