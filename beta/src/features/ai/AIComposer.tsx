import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChevronDown, FileText, Layers, MessageSquare, Paperclip, Send, Square, Sparkles, X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { Tabs } from '../../components/ui/Tabs';
import { AI_MODELS, modelLabel } from '../../config/aiModels';
import { formatBytes } from '../editor/mediaTypes';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS } from './attachments';
import { AIContextBar } from './AIContextBar';
import { AI_CONTEXT_DEFINITIONS } from './aiTypes';
import { CONTEXT_ICONS, EFFORT_CONSEQUENCE, EFFORT_TABS, MODE_TABS } from './panel/constants';
import type { ComposerDraft } from './panel/useComposerDraft';
import type { AIRun } from './panel/useAIRun';
import styles from './AIComposer.module.css';

/**
 * Where a turn is written.
 *
 * The composer stays put while a turn runs. It was once replaced by the run bar
 * on a "one focus at a time" argument; that traded away the ability to draft
 * the next question while waiting, which on a 25-second Smart turn is the more
 * valuable half. The run bar sits above it instead, so progress and composing
 * coexist.
 */
export function AIComposer({ composer, run }: { composer: ComposerDraft; run: AIRun }) {
    const mode = useStore((s) => s.aiMode);
    const setAIMode = useStore((s) => s.setAIMode);
    const aiModel = useStore((s) => s.aiModel);
    const setAIModel = useStore((s) => s.setAIModel);
    const aiEffort = useStore((s) => s.aiEffort);
    const setAIEffort = useStore((s) => s.setAIEffort);
    const aiScope = useStore((s) => s.aiScope);
    const removeAIScopeSource = useStore((s) => s.removeAIScopeSource);
    const aiSelectedContexts = useStore((s) => s.aiSelectedContexts);
    const toggleAIContext = useStore((s) => s.toggleAIContext);
    const clearAIContexts = useStore((s) => s.clearAIContexts);
    const setAIPanelOpen = useStore((s) => s.setAIPanelOpen);
    const selectedCount = useStore((s) => s.selectedCanvasNodeIds.size);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const { isRunning } = run;
    const { attachments, attachError, draft, focusToken, replyContext, askMeArmed } = composer;

    // Someone elsewhere asked for the caret back — a restored prompt, a
    // cancelled form, a quick action. The token only ever goes up.
    useEffect(() => {
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [focusToken]);

    // Close the model menu on any click outside it.
    useEffect(() => {
        if (!modelMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [modelMenuOpen]);

    // The context picker is portalled into the body, so check both the anchor
    // and the portal wrapper (tagged with data-context-popover).
    useEffect(() => {
        if (!contextMenuOpen) return;
        const close = (e: MouseEvent) => {
            const target = e.target as Node;
            if (contextMenuRef.current?.contains(target)) return;
            if ((target as HTMLElement)?.closest?.('[data-context-popover]')) return;
            setContextMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [contextMenuOpen]);

    /* The empty composer is the only place `/` and `@` are discoverable, so the
       resting placeholder names both. The other states are already specific
       about what to type and should not be diluted into a syntax reference. */
    const placeholder = mode === 'ask'
        ? 'Ask about your canvas…  /ask for questions first'
        : selectedCount > 0
            ? `Tell AI how to change ${selectedCount} selected card${selectedCount === 1 ? '' : 's'}…`
            : 'Describe what to build…  @ for context, / for commands';

    return (
        <>
            <div
                className={styles.composer}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => {
                    if (e.dataTransfer.files.length === 0) return;
                    e.preventDefault();
                    void composer.addFiles(e.dataTransfer.files);
                }}
            >
                {replyContext && (
                    <div className={styles.composerReply}>
                        <MessageSquare size={13} className={styles.composerReplyIcon} />
                        <div className={styles.composerReplyCopy}>
                            <span>Exploring this AI {replyContext.kind}</span>
                            <p>{replyContext.text.replace(/\s+/g, ' ').trim()}</p>
                        </div>
                        <button
                            type="button"
                            className={styles.composerReplyRemove}
                            onClick={() => composer.setReplyContext(null)}
                            title="Remove reply context"
                            aria-label="Remove reply context"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div className={styles.attachments}>
                        {attachments.map((file) => (
                            <span key={file.id} className={styles.attachment}>
                                {file.kind === 'image'
                                    ? <img src={file.payload} alt="" className={styles.attachmentThumb} />
                                    : <FileText size={12} className={styles.attachmentIcon} />}
                                <span className={styles.attachmentName}>{file.name}</span>
                                <span className={styles.attachmentSize}>{formatBytes(file.size)}</span>
                                <button
                                    className={styles.attachmentRemove}
                                    onClick={() => composer.removeAttachment(file.id)}
                                    title={`Remove ${file.name}`}
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {attachError && (
                    <div className={styles.attachError}>
                        <AlertCircle size={12} />
                        <span>{attachError}</span>
                    </div>
                )}

                {!isRunning && <AIContextBar scope={aiScope} onRemove={removeAIScopeSource} />}

                {askMeArmed && (
                    <div className={styles.askMeChip}>
                        <Sparkles size={12} />
                        <span>Ask me first</span>
                        <button type="button" onClick={() => composer.setAskMeArmed(false)} title="Remove Ask me"> <X size={11} /> </button>
                    </div>
                )}

                <textarea
                    ref={inputRef}
                    className={styles.input}
                    aria-label="Ask AI"
                    placeholder={replyContext ? `Ask about this ${replyContext.kind}…` : placeholder}
                    value={draft}
                    rows={1}
                    onChange={(e) => {
                        composer.setDraft(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                        composer.syncTokens(e.target.value, e.target.selectionStart);
                    }}
                    onKeyUp={(e) => composer.syncTokens(e.currentTarget.value, e.currentTarget.selectionStart)}
                    onClick={(e) => composer.syncTokens(e.currentTarget.value, e.currentTarget.selectionStart)}
                    onKeyDown={(e) => {
                        /* While a picker is open it owns Enter, Escape and the
                           arrows (it listens in capture). Sending the message
                           here too would fire the half-typed draft the mention
                           was meant to qualify. */
                        if ((composer.mentionQuery !== null || composer.commandQuery !== null)
                            && ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void run.submit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setAIPanelOpen(false);
                        }
                    }}
                    onPaste={(e) => {
                        const files = Array.from(e.clipboardData.files);
                        if (files.length === 0) return;
                        e.preventDefault();
                        void composer.addFiles(files);
                    }}
                />

                <div className={styles.composerRow}>
                    <Tabs
                        items={MODE_TABS}
                        value={mode}
                        onChange={setAIMode}
                        size="sm"
                        semantics="radio"
                        aria-label="What this turn does"
                    />

                    <button
                        className={`${styles.sendBtn} special-primary-btn`}
                        style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
                        onClick={() => (isRunning ? run.stop() : void run.submit())}
                        disabled={!isRunning && !draft.trim() && attachments.length === 0 && !askMeArmed}
                        title={isRunning ? 'Stop' : 'Send'}
                    >
                        {isRunning ? <Square size={13} color="#fff" /> : <Send size={14} color="#fff" />}
                    </button>
                </div>
            </div>

            {/* Attach and the shape/effort/model pickers live below the input box
                rather than inside its border — they are per-turn settings, not
                part of the composer surface itself. */}
            <div className={styles.composerToolbar}>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className={styles.fileInput}
                    onChange={(e) => {
                        if (e.target.files) void composer.addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
                {/* Labelled, not bare icons. A toggle whose only description is
                    a tooltip cannot be read at a glance. */}
                <button
                    className={styles.labelToggle}
                    onClick={() => fileRef.current?.click()}
                    disabled={attachments.length >= MAX_ATTACHMENTS}
                    title="Attach an image or text file"
                >
                    <Paperclip size={13} />
                    <span>Attach</span>
                </button>

                {mode === 'create' && (
                    <div className={styles.contextPickerWrap} ref={contextMenuRef}>
                        <button
                            className={`${styles.labelToggle} ${aiSelectedContexts.length > 0 ? styles.labelToggleActive : ''}`}
                            onClick={() => {
                                if (!contextMenuOpen) {
                                    const btn = contextMenuRef.current?.querySelector('button');
                                    if (btn) {
                                        const r = btn.getBoundingClientRect();
                                        setContextMenuPos({ top: r.top - 8, left: r.left + r.width / 2 });
                                    }
                                }
                                setContextMenuOpen((o) => !o);
                            }}
                            title="What shape the AI should build — cards, a mind map or a document"
                        >
                            <Layers size={13} />
                            {/* The label states the DECISION ("Auto" — the AI
                                picks) rather than the control's name. */}
                            <span>
                                {aiSelectedContexts.length === 0
                                    ? 'Shape: Auto'
                                    : aiSelectedContexts.length === 1
                                        ? AI_CONTEXT_DEFINITIONS.find((d) => d.id === aiSelectedContexts[0])?.shortLabel ?? 'Shape'
                                        : `${aiSelectedContexts.length} shapes`}
                            </span>
                        </button>
                        {contextMenuOpen && createPortal(
                            <div data-context-popover>
                                <div className={styles.contextPopoverBackdrop} onClick={() => setContextMenuOpen(false)} />
                                <div
                                    className={styles.contextPopover}
                                    style={{ top: contextMenuPos.top, left: contextMenuPos.left }}
                                >
                                    <div className={styles.contextPopoverArrow} />
                                    <div className={styles.contextPopoverHeader}>
                                        <span className={styles.contextPopoverTitle}>Content types</span>
                                        {aiSelectedContexts.length > 0 && (
                                            <button className={styles.contextClearSmall} onClick={clearAIContexts} type="button">
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                    <div className={styles.contextPopoverGrid}>
                                        {AI_CONTEXT_DEFINITIONS.map((ctx) => {
                                            const Icon = CONTEXT_ICONS[ctx.icon];
                                            const active = aiSelectedContexts.includes(ctx.id);
                                            return (
                                                <button
                                                    key={ctx.id}
                                                    className={`${styles.contextPopoverChip} ${active ? styles.contextPopoverChipActive : ''}`}
                                                    style={active ? { '--chip-rgb': ctx.accentRgb, '--chip-color': ctx.color } as React.CSSProperties : undefined}
                                                    onClick={() => toggleAIContext(ctx.id)}
                                                    title={ctx.description}
                                                    type="button"
                                                >
                                                    {Icon && <Icon size={13} />}
                                                    <span>{ctx.shortLabel}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>,
                            document.body,
                        )}
                    </div>
                )}

                <div className={styles.pickers}>
                    {/* Effort as a segmented control rather than a dropdown:
                        three options is too few to hide, and the current level
                        is the thing most worth reading without clicking. */}
                    <Tabs
                        items={EFFORT_TABS}
                        value={aiEffort}
                        onChange={setAIEffort}
                        size="sm"
                        semantics="radio"
                        aria-label="Effort"
                    />

                    <div className={styles.modelPicker} ref={modelMenuRef}>
                        <button className={styles.modelBtn} onClick={() => setModelMenuOpen((open) => !open)} title="Model">
                            {modelLabel(aiModel)}
                            <ChevronDown size={12} />
                        </button>
                        {modelMenuOpen && (
                            <div className={styles.modelMenu}>
                                {AI_MODELS.map((option) => (
                                    <button
                                        key={option.label}
                                        className={`${styles.modelOption} ${option.id === aiModel ? styles.modelOptionActive : ''}`}
                                        onClick={() => {
                                            setAIModel(option.id);
                                            setModelMenuOpen(false);
                                        }}
                                    >
                                        <span className={styles.modelOptionLabel}>
                                            {option.label}
                                            {option.id === aiModel && <Check size={12} />}
                                        </span>
                                        <span className={styles.modelOptionHint}>{option.hint}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* What the chosen effort will actually produce. The picker's own
                hint is only visible on hover; this is the line that makes the
                dial mean something before you commit to it. */}
            <div className={styles.effortHint}>{EFFORT_CONSEQUENCE[aiEffort]}</div>
        </>
    );
}
