import { useEffect, useMemo, useState } from 'react';
import { loadUIFonts } from '../../hostFonts';
import { readUITheme } from '../../theme';
import type { UIStreamPreview } from '../../types';
import styles from '../styles/IntelligentUI.module.css';
import { UI_CONTROL_STYLES } from '../../controlStyles';

/** Inert progress: no scripts, navigation, host bridge, external resources or libraries. */
export function StreamingUI({ preview }: { preview: UIStreamPreview }) {
    const [fontCSS, setFontCSS] = useState('');
    useEffect(() => { let live = true; void loadUIFonts().then(css => { if (live) setFontCSS(css); }); return () => { live = false; }; }, []);
    const source = useMemo(() => {
        const parsed = new DOMParser().parseFromString(preview.html, 'text/html');
        parsed.querySelectorAll('script,meta,base,iframe,object,embed,link,style').forEach(el => el.remove());
        parsed.querySelectorAll('*').forEach(el => {
            for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || ['srcdoc', 'href', 'action', 'formaction'].includes(attr.name)) el.removeAttribute(attr.name);
        });
        parsed.querySelectorAll('input,button,select,textarea').forEach(el => el.setAttribute('disabled', ''));
        const theme = Object.entries(readUITheme()).map(([key, value]) => `${key}:${value}`).join(';');
        const css = `${fontCSS}:root{${theme}}*{box-sizing:border-box}html,body{margin:0}html{font:14px/1.5 var(--ui-font,sans-serif)}body{padding:16px;background:var(--ui-bg);color:var(--ui-text);overflow:hidden}svg,canvas,img{max-width:100%}input,button,select,textarea{font:inherit;max-width:100%}${preview.css}`.replace(/</g, '\\3c ');
        return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'none'; form-action 'none'; base-uri 'none'"><style>${css}${UI_CONTROL_STYLES}</style><body inert><main>${parsed.body.innerHTML}</main></body>`;
    }, [preview, fontCSS]);
    return <div className={styles.streaming} data-intelligent-ui-streaming aria-busy="true">
        <iframe className={styles.frame} title="Generating interface preview" sandbox="" referrerPolicy="no-referrer" srcDoc={source} style={{ height: preview.initialHeight }} />
        <span className={styles.previewLabel}>Preview</span>
    </div>;
}
