import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block } from '../types';

/** Typing is committed to the store this long after the last keystroke. */
const COMMIT_DELAY_MS = 300;

const emptyDocument = (text = ''): Block[] => [{ id: uuidv4(), type: 'text', content: text }];

const asBlocks = (content: string | Block[] | undefined): Block[] | null =>
    (Array.isArray(content) ? content : null);

/** Same blocks, same order, same objects — the common case after our own save. */
const sameBlocks = (a: Block[], b: Block[]) => a.length === b.length && a.every((block, i) => block === b[i]);

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
    const [blocks, setBlocks] = useState<Block[]>(() => {
        const given = asBlocks(initialContent);
        if (given && given.length > 0) return given;
        return emptyDocument(typeof initialContent === 'string' ? initialContent : '');
    });

    /* The blocks as of this instant. Handlers read it instead of `blocks` so
       they do not have to be rebuilt on every edit, and `updateBlock` writes it
       synchronously: two edits batched into one tick would otherwise make the
       second read stale types and take the wrong branch. */
    const blocksRef = useRef(blocks);
    useLayoutEffect(() => {
        blocksRef.current = blocks;
    });

    const onUpdateRef = useRef(onUpdate);
    useLayoutEffect(() => {
        onUpdateRef.current = onUpdate;
    });

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Hand `next` to the owner, debounced unless this editor syncs eagerly. */
    const commit = useCallback((next: Block[]) => {
        if (syncUpdate) {
            onUpdateRef.current?.(next);
            return;
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            onUpdateRef.current?.(blocksRef.current);
        }, COMMIT_DELAY_MS);
    }, [syncUpdate]);

    /**
     * Push the pending edit through now.
     *
     * A card can be selected, entered or deleted before the typing debounce
     * expires, so anything that inspects the document — navigation, the
     * delete confirmation — must see what the person just typed.
     */
    const flush = useCallback(() => {
        if (!timerRef.current) return;
        clearTimeout(timerRef.current);
        timerRef.current = null;
        onUpdateRef.current?.(blocksRef.current);
    }, []);

    // Unmounting mid-edit must not lose the edit.
    useEffect(() => flush, [flush]);

    /** The document `initialContent` describes, reusing ids where it can. */
    const externalDocument = useCallback((prev: Block[]): Block[] => {
        const given = asBlocks(initialContent);
        if (given) {
            if (given.length > 0) return given;
            const isAlreadyEmpty = prev.length === 1 && prev[0].type === 'text' && prev[0].content === '';
            return isAlreadyEmpty ? prev : emptyDocument();
        }
        const text = typeof initialContent === 'string' ? initialContent : '';
        const matches = prev.length === 1 && prev[0].type === 'text' && prev[0].content === text;
        return matches ? prev : emptyDocument(text);
    }, [initialContent]);

    /**
     * Takes the owner's content as the truth, except for the line being typed
     * in: an external write landing mid-keystroke would otherwise overwrite the
     * text under the caret. Blocks made here that the owner has not seen yet
     * are kept too.
     *
     * The cheap identity check comes first, because the common case is the
     * owner handing back the very array this editor just saved.
     */
    const syncFromOwner = useCallback((blockRefs: Record<string, HTMLElement | null>) => {
        setBlocks((prev) => {
            const incoming = externalDocument(prev);
            if (sameBlocks(prev, incoming)) return prev;

            if (!timerRef.current) {
                return JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming;
            }

            const active = document.activeElement;
            const activeBlockId = active
                ? Object.entries(blockRefs).find(([, el]) => el === active || el?.contains(active))?.[0] ?? null
                : null;

            const local = new Map(prev.map((block) => [block.id, block]));
            const merged = incoming.map((block) => (
                block.id === activeBlockId ? local.get(block.id) ?? block : block
            ));
            const incomingIds = new Set(incoming.map((block) => block.id));
            merged.push(...prev.filter((block) => !incomingIds.has(block.id)));

            if (sameBlocks(prev, merged)) return prev;
            return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
        });
    }, [externalDocument]);

    return { blocks, setBlocks, blocksRef, commit, flush, syncFromOwner };
}
