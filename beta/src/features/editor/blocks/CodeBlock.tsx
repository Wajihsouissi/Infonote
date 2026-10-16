import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from '../../../components/icons';
import styles from '../BlockEditor.module.css';
import codeStyles from './CodeBlock.module.css';
import type { BlockProps } from './types';
import { useContentEditable } from './useContentEditable';

/** Languages offered in the code block's header. `text` = no highlighting intent. */
const CODE_LANGUAGES = [
    'text', 'bash', 'c', 'cpp', 'csharp', 'css', 'go', 'html', 'java',
    'javascript', 'json', 'jsx', 'kotlin', 'markdown', 'php', 'python',
    'ruby', 'rust', 'sql', 'swift', 'tsx', 'typescript', 'yaml',
] as const;

const CODE_INDENT = '  '; // 2 spaces — matches the block's own source style

/**
 * Copy without depending on navigator.clipboard, which is unavailable on
 * insecure origins and can be permission-denied inside embedded webviews.
 * Falling back here keeps the copy button from being silently dead.
 */
const legacyCopy = (text: string): boolean => {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
};

export const CodeBlock = memo(({ block, readOnly, onChange, onKeyDown, onPaste, domRef }: BlockProps) => {
    const { ref, handlers } = useContentEditable(block.content, domRef, false, onChange);
    const [copied, setCopied] = useState(false);
    const copyTimer = useRef<number | undefined>(undefined);

    const language: string = block.metadata?.language || 'text';
    const isEmpty = !block.content || block.content.trim() === '';
    const lineCount = block.content ? block.content.split('\n').length : 0;

    useEffect(() => () => window.clearTimeout(copyTimer.current), []);

    const handleCopy = useCallback(async () => {
        if (!block.content) return;
        let ok = false;
        try {
            await navigator.clipboard.writeText(block.content);
            ok = true;
        } catch {
            ok = legacyCopy(block.content);
        }
        // Only confirm on a real copy — never flash "Copied" over a failure.
        if (!ok) return;
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    }, [block.content]);

    const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(block.content, { ...block.metadata, language: e.target.value });
    }, [block.content, block.metadata, onChange]);

    /**
     * Tab must indent, not escape the block. In a contentEditable, Tab is a
     * focus move by default, which makes writing code here effectively
     * impossible. Shift+Tab outdents one level from the line start.
     */
    const handleCodeKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            if (!e.shiftKey) {
                document.execCommand('insertText', false, CODE_INDENT);
            } else {
                // Outdent: drop up to CODE_INDENT worth of leading whitespace
                // before the caret on the current line.
                const range = sel.getRangeAt(0);
                const node = range.startContainer;
                const offset = range.startOffset;
                const text = node.textContent || '';
                const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
                const indent = text.slice(lineStart, offset);
                const strip = indent.endsWith(CODE_INDENT)
                    ? CODE_INDENT.length
                    : (indent.endsWith(' ') ? 1 : 0);
                if (strip > 0) {
                    const r = document.createRange();
                    r.setStart(node, offset - strip);
                    r.setEnd(node, offset);
                    sel.removeAllRanges();
                    sel.addRange(r);
                    document.execCommand('delete');
                }
            }
            return;
        }
        onKeyDown?.(e);
    }, [onKeyDown]);

    return (
        <div className={codeStyles.codeBlockWrapper}>
            <div className={codeStyles.codeHeader} contentEditable={false}>
                {readOnly ? (
                    <span className={codeStyles.codeLangStatic}>{language}</span>
                ) : (
                    <select
                        className={codeStyles.codeLangSelect}
                        value={language}
                        onChange={handleLanguageChange}
                        aria-label="Code language"
                    >
                        {CODE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                )}

                <span className={codeStyles.codeMeta}>
                    {lineCount > 0 && `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
                </span>

                <button
                    type="button"
                    className={codeStyles.codeCopyBtn}
                    onClick={handleCopy}
                    disabled={isEmpty}
                    aria-label={copied ? 'Copied' : 'Copy code'}
                    data-copied={copied ? 'true' : 'false'}
                >
                    {copied ? <Check /> : <Copy />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>

            <div
                ref={ref}
                className={`${styles.block} ${codeStyles.codeBlock}`}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onKeyDown={handleCodeKeyDown}
                onPaste={onPaste}
                spellCheck={false}
                data-placeholder="Write or paste code…"
                data-is-empty={isEmpty ? 'true' : 'false'}
                {...handlers}
            />
        </div>
    );
});
