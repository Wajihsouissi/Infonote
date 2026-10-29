import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { BlockProps } from '../../../editor/blocks/types';
import { ArrowUp, Download, Loader2, RotateCcw, Sparkles, Square } from '../../../../shared/icons';
import { useStore } from '../../../../store/useStore';
import { IntelligentUIFrame } from '../preview/IntelligentUIFrame';
import type { IntelligentUIData, UIControlState, UIStreamPreview } from '../../types';
import { StreamingUI } from './StreamingUI';
import { requestUIFollowUp } from '../../followUp';
import { materializeUIBlocks, UI_GENERATED_EVENT, type UIGeneratedRequest } from '../../nativeBlocks';
import styles from '../styles/IntelligentUI.module.css';

export const IntelligentUIBlock = memo(function IntelligentUIBlock({ block, onChange, readOnly, passive = false }: BlockProps & { passive?: boolean }) {
    const data: IntelligentUIData = block.metadata?.intelligentUI ?? {};
    const artifact = data.artifact;
    const [prompt, setPrompt] = useState(data.draft ?? '');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<UIStreamPreview>();
    const abort = useRef<AbortController | null>(null);
    const latest = useRef({ block, onChange, data });
    useEffect(() => { latest.current = { block, onChange, data }; });
    useEffect(() => () => abort.current?.abort(), []);

    const save = useCallback((patch: Partial<IntelligentUIData>, title?: string) => {
        const current = latest.current;
        const next = { ...current.data, ...patch };
        latest.current = { ...current, data: next };
        current.onChange(title ?? current.block.content, { ...current.block.metadata, intelligentUI: next });
    }, []);
    const saveState = useCallback((state: UIControlState, artifactId: string) => {
        const current = latest.current.data.artifact;
        if (current?.id === artifactId && JSON.stringify(current.state ?? {}) !== JSON.stringify(state)) save({ artifact: { ...current, state } });
    }, [save]);

    const generate = async () => {
        if (!prompt.trim() || running || readOnly || passive) return;
        const controller = new AbortController();
        abort.current = controller;
        setRunning(true);
        setError(null);
        setPreview(undefined);
        try {
            const { generateIntelligentUI } = await import('../../generate');
            const next = await generateIntelligentUI(prompt, {
                model: useStore.getState().aiModel,
                signal: controller.signal,
                previous: latest.current.data.artifact,
                onPreview: next => { if (!controller.signal.aborted) setPreview(next); },
            });
            if (controller.signal.aborted) return;
            const current = latest.current;
            const nextData = { ...current.data, previous: current.data.artifact, artifact: next, draft: '', nativeTextPlaced: true };
            if (!current.data.nativeTextPlaced) {
                const request: UIGeneratedRequest = { id: block.id, blocks: materializeUIBlocks(next, current.block, nextData), handled: false };
                window.dispatchEvent(new CustomEvent(UI_GENERATED_EVENT, { detail: request }));
                if (!request.handled) throw new Error('Keep the note open while generating, then try again.');
            } else save(nextData, next.title);
            setPrompt('');
        } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not generate the interface. Try again.');
        } finally {
            if (abort.current === controller) { abort.current = null; setRunning(false); setPreview(undefined); }
        }
    };

    return <div className={`${styles.block} nodrag nowheel`} contentEditable={false} data-intelligent-ui-block={block.id}
        inert={passive || undefined} data-intelligent-ui-preview={passive ? '' : undefined}
        onKeyDown={event => event.stopPropagation()}>
        {artifact && <div hidden={Boolean(preview)}><IntelligentUIFrame artifact={artifact} onState={readOnly || passive ? undefined : saveState}
            onPrompt={readOnly || passive ? undefined : request => requestUIFollowUp(latest.current.data.artifact ?? artifact, request)} /></div>}
        {preview && <StreamingUI preview={preview} />}
        {!readOnly && <form className={`${styles.composer} ${artifact ? styles.refine : ''}`} onSubmit={event => { event.preventDefault(); void generate(); }}>
            {!artifact && <Sparkles size={16} className={styles.composerIcon} aria-hidden="true" />}
            <label className={styles.srOnly} htmlFor={`ui-prompt-${block.id}`}>{artifact ? 'Refine this interface' : 'What would you like to explore?'}</label>
            <textarea id={`ui-prompt-${block.id}`} value={prompt} rows={1} maxLength={4000} disabled={running}
                onChange={event => { setPrompt(event.target.value); save({ draft: event.target.value }); }}
                placeholder={artifact ? 'Refine this visual…' : 'Create a chart, tool or diagram…'}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void generate(); } }} />
            {artifact && !running && <button type="button" className={styles.iconButton} aria-label="Download interface" title="Download HTML" onClick={() => {
                void import('../../exportUI').then(({ downloadUI }) => downloadUI(latest.current.data.artifact ?? artifact)).catch(err => setError(String(err.message ?? err)));
            }}><Download size={15} aria-hidden="true" /></button>}
            {data.previous && !running && <button type="button" className={styles.iconButton} title="Restore previous revision" aria-label="Restore previous revision" onClick={() => {
                if (data.previous) save({ artifact: data.previous, previous: artifact }, data.previous.title);
            }}><RotateCcw size={15} aria-hidden="true" /></button>}
            {running ? <button key="stop" type="button" className={styles.iconButton} aria-label="Stop" title="Stop generating" onClick={event => { event.preventDefault(); abort.current?.abort(); abort.current = null; setRunning(false); setPreview(undefined); }}><Square size={13} aria-hidden="true" /></button>
                : <button key="generate" type="submit" className={`${styles.iconButton} ${styles.primary}`} disabled={!prompt.trim()} aria-label={artifact ? 'Update interface' : 'Generate interface'} title={artifact ? 'Update interface' : 'Generate interface'}><ArrowUp size={16} aria-hidden="true" /></button>}
            {running && <span className={styles.running} role="status"><Loader2 size={13} aria-hidden="true" /><span className={styles.srOnly}>Generating interface…</span></span>}
        </form>}
        {error && <p className={styles.error} role="alert">{error}</p>}
    </div>;
});
