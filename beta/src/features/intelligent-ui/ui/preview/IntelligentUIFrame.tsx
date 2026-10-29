import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFrameDocument } from '../../frameDocument';
import { loadUIFonts } from '../../hostFonts';
import { clampUIHeight, isIntelligentUIArtifact, validateControlState, type IntelligentUIArtifact, type UIControlState, type UIFollowUp } from '../../types';
import { loadUILibraries, type UILibraryAssets } from '../../libraries';
import { readUITheme } from '../../theme';
import styles from '../styles/IntelligentUI.module.css';

export function IntelligentUIFrame({ artifact, onState, onPrompt }: { artifact: IntelligentUIArtifact; onState?: (state: UIControlState, artifactId: string) => void; onPrompt?: (request: UIFollowUp) => void }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const onStateRef = useRef(onState);
    const onPromptRef = useRef(onPrompt);
    const [bridgeToken] = useState(() => crypto.randomUUID());
    const lastPromptAt = useRef(0);
    const pending = useRef<UIControlState | undefined>(undefined);
    const [height, setHeight] = useState(artifact.initialHeight);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [readyId, setReadyId] = useState('');
    const revision = `${artifact.id}:${attempt}`;
    const [theme, setTheme] = useState(readUITheme);
    const [fonts, setFonts] = useState<string | null>(null);
    const [mountedArtifact, setMountedArtifact] = useState(artifact);
    if (mountedArtifact.id !== artifact.id) setMountedArtifact(artifact);
    const valid = isIntelligentUIArtifact(artifact);
    const librariesKey = JSON.stringify(mountedArtifact.libraries ?? []);
    const [assets, setAssets] = useState<{ key: string; value?: UILibraryAssets; error?: string }>();

    useEffect(() => { onStateRef.current = onState; }, [onState]);
    useEffect(() => { onPromptRef.current = onPrompt; }, [onPrompt]);
    useEffect(() => {
        if (!valid) return;
        let live = true;
        void loadUILibraries(JSON.parse(librariesKey)).then(value => { if (live) setAssets({ key: librariesKey, value }); })
            .catch(error => { if (live) setAssets({ key: librariesKey, error: String(error.message ?? error) }); });
        return () => { live = false; };
    }, [librariesKey, valid, attempt]);
    useEffect(() => {
        let live = true;
        void loadUIFonts().then(css => { if (live) setFonts(css); });
        return () => { live = false; };
    }, []);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(readUITheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
        return () => observer.disconnect();
    }, []);
    // Control writes must not reload the iframe. A revision/reset owns its lifecycle.
    const source = useMemo(() => valid && fonts !== null && assets?.key === librariesKey && assets.value
        ? buildFrameDocument(mountedArtifact, mountedArtifact.state, theme, fonts, assets.value, bridgeToken) : '',
    [mountedArtifact, valid, theme, fonts, assets, librariesKey, bridgeToken]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let ready = false;
        const flush = () => {
            if (pending.current) onStateRef.current?.(pending.current, artifact.id);
            pending.current = undefined;
        };
        const receive = (event: MessageEvent) => {
            if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'chnk-intelligent-ui' || event.data?.id !== artifact.id) return;
            const { type, value } = event.data;
            if (type === 'resize') {
                const next = clampUIHeight(value);
                const space = event.data.token === bridgeToken && typeof event.data.pickerSpace === 'number' && Number.isFinite(event.data.pickerSpace)
                    ? Math.max(0, Math.min(240, event.data.pickerSpace)) : 0;
                if (next !== null) setHeight(next + space);
            } else if (type === 'state') {
                const state = validateControlState(value);
                if (!state) return;
                pending.current = state;
                clearTimeout(timer);
                timer = setTimeout(flush, 250);
            } else if (type === 'prompt' && event.data.token === bridgeToken && typeof event.data.requestId === 'string') {
                const requestId = event.data.requestId;
                let failure: string | undefined;
                try {
                    const values = validateControlState(value?.values);
                    if (!onPromptRef.current) throw new Error('AI follow-ups are unavailable here.');
                    if (!values || typeof value?.text !== 'string' || !value.text.trim() || value.text.length > 4000 || requestId.length > 100)
                        throw new Error('This AI question is invalid.');
                    if (Date.now() - lastPromptAt.current < 1500) throw new Error('Wait a moment before sending another question.');
                    lastPromptAt.current = Date.now();
                    onPromptRef.current({ text: value.text.trim(), values });
                } catch (error) { failure = error instanceof Error ? error.message : 'Could not send the AI question.'; }
                frame.current?.contentWindow?.postMessage({ channel: 'chnk-intelligent-ui-reply', id: requestId, error: failure }, '*');
            } else if (type === 'error' && typeof value === 'string') setError(value.slice(0, 400));
            else if (type === 'ready') { ready = true; setReadyId(revision); }
        };
        window.addEventListener('message', receive);
        const timeout = source ? setTimeout(() => { if (!ready) setError('This interface did not start. Try reloading it.'); }, 10_000) : undefined;
        return () => {
            window.removeEventListener('message', receive);
            clearTimeout(timer);
            clearTimeout(timeout);
            flush();
        };
    }, [artifact.id, source, attempt, bridgeToken, revision]);

    return <div className={styles.frameHost} aria-busy={valid && readyId !== revision}>
        {valid && source ? <iframe ref={frame} key={`${artifact.id}:${attempt}`} title={artifact.title} className={`${styles.frame} nodrag nowheel`}
            sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} style={{ height }} data-ui-ready={readyId === revision ? 'true' : undefined} />
            : valid ? <p className={styles.summary} role="status">Loading interface…</p>
                : <p role="alert">This saved interface is unsupported or incomplete. Generate a new revision to continue.</p>}
        {(error || assets?.error) && <div className={styles.error} role="alert"><span>{error || assets?.error}</span><button type="button" onClick={() => { setError(null); setMountedArtifact(artifact); setAttempt(v => v + 1); }}>Reload interface</button></div>}
    </div>;
}
