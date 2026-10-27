import { useLayoutEffect, useRef } from 'react';
import { renderContentWithLinks } from '../../text/pasteUtils';
import { serializeInline } from '../../text/inlineFormat';
import { handleInlineLinkClick } from '../../text/inlineNavigation';
import { toSafeHttpUrl } from '../../text/safeLink';
import type { BlockMetadata } from '../../types';
import type { EditOptions } from '../types';

/** Edits a contentEditable without cursor jumps or broken IME composition. */
export const useContentEditable = (
    content: string,
    domRef?: (el: HTMLDivElement | null) => void,
    renderLinks = true,
    /**
     * Passing onChange in lets the hook own `onInput`, which is the only way to
     * apply the composition guard consistently. It used to be re-implemented at
     * eight call sites, none of which checked `isComposing` — so typing with a
     * Chinese/Japanese/Korean keyboard fired an edit for every intermediate
     * candidate, and markdown shortcuts could convert a block mid-word.
     */
    onChange?: (content: string, metadata?: BlockMetadata, opts?: EditOptions) => void,
) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);
    const isComposing = useRef(false);
    const contentRef = useRef(content);

    // Sync contentRef to avoid stale closures in callbacks
    useLayoutEffect(() => {
        contentRef.current = content;
    });

    // Sync internal ref with parent ref (useLayoutEffect ensures refs are available before focus effects)
    useLayoutEffect(() => {
        if (!domRef) return;

        domRef(internalRef.current);
        return () => domRef(null);
    }, [domRef]);

    // Only update DOM if content truly differs AND we are not actively typing
    useLayoutEffect(() => {
        if (!internalRef.current || isFocused.current || isComposing.current) return;
        if (renderLinks) {
            const expectedHTML = renderContentWithLinks(content);
            if (internalRef.current.innerHTML !== expectedHTML) {
                internalRef.current.innerHTML = expectedHTML;
            }
        } else if (serializeInline(internalRef.current, !renderLinks) !== content) {
            // DOM serialization understands browser-created <br>/<div>
            // without asking the layout engine to calculate innerText.
            internalRef.current.textContent = content;
        }
    }, [content, renderLinks]);

    const handlers = {
        onFocus: () => {
            isFocused.current = true;
            // Notion-style live editing: the block stays visually formatted while
            // you edit (real <strong>/<em>/… remain in the DOM). No source-mode
            // marker swap — onInput serializes the HTML back to markdown instead.
        },
        onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
            // Focusing an atomic chip is still focus inside this paragraph.
            // Replacing innerHTML here would destroy the newly focused link.
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            isFocused.current = false; 
            if (isComposing.current) return;
            if (internalRef.current) {
                const currentContent = contentRef.current;
                if (renderLinks) {
                    const expectedHTML = renderContentWithLinks(currentContent);
                    if (internalRef.current.innerHTML !== expectedHTML) {
                        internalRef.current.innerHTML = expectedHTML;
                    }
                } else {
                    if (serializeInline(internalRef.current, !renderLinks) !== currentContent) {
                        internalRef.current.textContent = currentContent;
                    }
                }
            }
        },
        onCompositionStart: () => { isComposing.current = true; },
        onCompositionEnd: (e: React.CompositionEvent<HTMLDivElement>) => {
            // Clear the flag BEFORE re-reading, then push the finished text
            // through: some browsers do not fire a final `input` event after a
            // composition ends, and the guarded onInput below would have
            // dropped every event that came during it.
            isComposing.current = false;
            onChange?.(serializeInline(e.currentTarget, !renderLinks), undefined, { inputType: 'insertCompositionText' });
        },
        onInput: (e: React.FormEvent<HTMLDivElement>) => {
            if (isComposing.current) return;
            onChange?.(serializeInline(e.currentTarget, !renderLinks), undefined, {
                inputType: (e.nativeEvent as InputEvent).inputType,
            });
        },
        onClick: (e: React.MouseEvent) => {
            if (!renderLinks) return;
            if (handleInlineLinkClick(e)) return;
            const target = (e.target as HTMLElement).closest('a');
            if (!target) return;

            /* An AI node citation is a plain click, not Ctrl-click.
               It navigates nothing and edits nothing — it selects the card the
               answer leaned on and flies the canvas to it. Making the one
               affordance whose whole job is "show me your source" require a
               modifier would bury it (ai-Plan.md §5.4). Checked before the
               modifier gate below for exactly that reason. */
            // Only follow links if Ctrl (Windows/Linux) or Cmd (Mac) is held
            if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); return; }
            const href = toSafeHttpUrl(target.getAttribute('href') ?? '');
            if (href) {
                window.open(href, '_blank', 'noopener,noreferrer');
                e.preventDefault();
                e.stopPropagation();
            }
        }
    };

    return { ref: internalRef, handlers, isComposing };
};
