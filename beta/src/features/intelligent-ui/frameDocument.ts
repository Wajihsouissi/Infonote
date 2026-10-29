import type { IntelligentUIArtifact, UIControlState } from './types';
import type { UILibraryAssets } from './libraries';
import { UI_CONTROL_STYLES, UI_SELECT_SETUP } from './controlStyles';

/** No same-origin privilege; resource requests, popups and form submission are blocked. */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const scriptJSON = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** The outer document, CSP and bridge are host-owned. Generated code runs only inside it. */
export function buildFrameDocument(artifact: IntelligentUIArtifact, state: UIControlState | undefined, theme: Record<string, string>, fontCSS = '', assets: UILibraryAssets = { scripts: [], css: '' }, bridgeToken = ''): string {
    const payload = scriptJSON({ id: artifact.id, css: artifact.css, html: artifact.html, jsFunctions: artifact.jsFunctions, jsExpressions: artifact.jsExpressions, state, theme, fontCSS, assets, bridgeToken });
    const policy = artifact.libraries?.includes('leaflet') ? CSP.replace('img-src data: blob:', 'img-src data: blob: https://basemap.nationalmap.gov') : CSP;
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script>
(() => {
    const artifact = ${payload};
    // Keep the action capability in this closure, absent from generated DOM.
    // Generated scripts cannot forge the host's button-activation messages.
    document.currentScript.remove();
    const post = parent.postMessage.bind(parent);
    const send = (type, value) => post({ channel: 'chnk-intelligent-ui', id: artifact.id, type, value,
        ...(type === 'resize' ? { pickerSpace: pickerExtraSpace, token: artifact.bridgeToken } : {}) }, '*');
    addEventListener('error', event => send('error', String(event.message).slice(0, 400)));
    addEventListener('unhandledrejection', () => send('error', 'An interactive control failed. Try resetting this interface.'));
    const css = document.createElement('style');
    css.textContent = artifact.assets.css + '*{box-sizing:border-box}html,body{margin:0;min-height:0}html{font:14px/1.5 var(--ui-font,sans-serif)}body{padding:16px;background:var(--ui-bg);color:var(--ui-text);font:inherit;overflow-wrap:anywhere}main{display:flow-root}img,svg,canvas{max-width:100%}input,select,textarea,button{font:inherit;max-width:100%}button{cursor:pointer}a{color:var(--ui-accent)}:focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}' + artifact.css;
    // The host owns the enclosing tool surface. Keep functional groups, grids,
    // diagrams and control borders; flatten only a lone outer tool wrapper.
    css.textContent += 'main>:is(div,section,article):only-child:has(input,select,textarea,button):not([role="grid"],[role="img"],[role="application"]){border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important}';
    document.head.appendChild(css);
    const controlsCSS = document.createElement('style');
    controlsCSS.textContent = ${scriptJSON(UI_CONTROL_STYLES)};
    document.head.appendChild(controlsCSS);
    const fonts = document.createElement('style');
    fonts.textContent = artifact.fontCSS;
    document.head.appendChild(fonts);
    for (const [key, value] of Object.entries(artifact.theme)) document.documentElement.style.setProperty(key, value);
    const content = document.createElement('main');
    // innerHTML does not execute script tags. Strip document/embedding elements
    // and handlers as well; behavior has a single explicit JS channel.
    const parsed = new DOMParser().parseFromString(artifact.html, 'text/html');
    parsed.querySelectorAll('script,meta,base,iframe,object,embed,link').forEach(el => el.remove());
    parsed.querySelectorAll('*').forEach(el => {
        for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || attr.name === 'srcdoc') el.removeAttribute(attr.name);
    });
    content.append(...parsed.body.childNodes);
    document.body.appendChild(content);
    ${UI_SELECT_SETUP}
    document.addEventListener('submit', event => event.preventDefault());
    document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('a')) event.preventDefault(); });
    const controls = () => [...content.querySelectorAll('input[id],select[id],textarea[id]')].filter(el => !['password','file','hidden'].includes(el.type)).slice(0,100);
    const values = () => {
        const state = Object.create(null);
        for (const el of controls()) state[el.id] = ['checkbox','radio'].includes(el.type) ? el.checked : el.value;
        return state;
    };
    const capture = () => send('state', values());
    let activated = false;
    let activeRequest = null;
    document.addEventListener('click', event => {
        if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest('button,[role="button"]')) return;
        activated = true;
        setTimeout(() => { activated = false; }, 0);
    }, true);
    Object.defineProperty(window, 'chnkUI', { value: Object.freeze({ sendPrompt: request => new Promise((resolve, reject) => {
        if (!artifact.bridgeToken) return reject(new Error('AI follow-ups are available inside Chnk it.'));
        if (!activated || activeRequest) return reject(new Error('Use an AI button to send this scenario.'));
        activated = false;
        if (!request || typeof request.text !== 'string' || !request.text.trim() || request.text.length > 4000) return reject(new Error('The AI question is invalid.'));
        const extra = request.values && typeof request.values === 'object' && !Array.isArray(request.values) ? request.values : {};
        const selected = { ...values(), ...extra };
        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => { activeRequest = null; reject(new Error('The AI did not respond. Try again.')); }, 15000);
        activeRequest = { id: requestId, resolve, reject, timeout };
        post({ channel: 'chnk-intelligent-ui', id: artifact.id, type: 'prompt', token: artifact.bridgeToken,
            requestId, value: { text: request.text, values: selected } }, '*');
    }) }), writable: false, configurable: false });
    addEventListener('message', event => {
        if (!activeRequest || event.source !== parent || event.data?.channel !== 'chnk-intelligent-ui-reply' || event.data?.id !== activeRequest.id) return;
        const pending = activeRequest; activeRequest = null; clearTimeout(pending.timeout);
        event.data.error ? pending.reject(new Error(event.data.error)) : pending.resolve();
    });
    const reportHeight = () => {
        const style = getComputedStyle(document.body);
        const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        send('resize', Math.ceil(content.getBoundingClientRect().height + padding));
    };
    let scheduled = false;
    new ResizeObserver(() => {
        if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; reportHeight(); }); }
    }).observe(content);
    document.addEventListener('input', capture);
    document.addEventListener('change', capture);
    for (const source of artifact.assets.scripts) {
        const library = document.createElement('script'); library.textContent = source; document.body.appendChild(library);
    }
    if (window.Chart) {
        Chart.defaults.color = artifact.theme['--ui-text'];
        Chart.defaults.borderColor = artifact.theme['--ui-border'];
        Chart.defaults.font.family = artifact.theme['--ui-font'];
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;
    }
    const code = document.createElement('script');
    code.textContent = artifact.jsFunctions + '\\n' + artifact.jsExpressions.join('\\n');
    document.body.appendChild(code);
    // Restore only after the generated event handlers exist so outputs recompute.
    for (const el of controls()) {
        const value = artifact.state?.[el.id];
        if (value === undefined) continue;
        if (['checkbox','radio'].includes(el.type) && typeof value === 'boolean') el.checked = value;
        else if (typeof value === 'string' || typeof value === 'number') el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    send('ready', true);
    reportHeight();
})();
</script></body></html>`;
}
