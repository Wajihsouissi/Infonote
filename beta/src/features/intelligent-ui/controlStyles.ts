/** Shared by the working frame, inert preview and standalone export. */
export const UI_CONTROL_STYLES = `
:root{color-scheme:var(--ui-color-scheme,dark)}
*{scrollbar-width:thin;scrollbar-color:var(--ui-border) transparent}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:var(--ui-border);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:var(--ui-scroll-hover)}
:where(select){min-inline-size:0;max-inline-size:100%;min-block-size:36px;padding:6px 10px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-surface);color:var(--ui-text);font:inherit}
:where(select:disabled){color:var(--ui-muted);cursor:not-allowed}
@supports(appearance:base-select){
  select:not([multiple]):not([size]),select:not([multiple])[size="1"],select::picker(select){appearance:base-select}
  select::picker-icon{color:var(--ui-muted);margin-inline-start:auto;padding-inline-start:12px}
  select:open{border-color:var(--ui-accent)}
  select::picker(select){
    position:fixed;position-area:none;position-try-fallbacks:none;inset:auto;top:var(--ui-picker-top,auto);left:var(--ui-picker-left,auto);
    margin:0;padding:4px;box-sizing:border-box;inline-size:var(--ui-picker-width,anchor-size(width));min-inline-size:0;
    max-inline-size:calc(100vw - 16px);max-block-size:var(--ui-picker-height,min(240px,calc(100dvh - 16px)));
    overflow:auto;overscroll-behavior:contain;border:1px solid var(--ui-border);border-radius:12px;
    background:var(--ui-menu);color:var(--ui-text);font:inherit;
    scrollbar-width:thin;scrollbar-color:var(--ui-border) transparent;
  }
  select option{min-block-size:36px;gap:8px;padding:6px 8px;border-radius:8px;white-space:normal;overflow-wrap:anywhere}
  select option:not(:disabled):is(:hover,:focus-visible){background:var(--ui-hover)}
  select option:checked{background:var(--ui-hover)}
  select option:disabled{color:var(--ui-muted);opacity:.55}
  select option::checkmark{color:var(--ui-accent)}
  select optgroup{padding:4px}
}
`;

/** Keep native select semantics and keyboard behavior; only position its picker. */
export const UI_SELECT_SETUP = `
let pickerExtraSpace = 0;
if (CSS.supports('appearance','base-select')) {
    let watchedPicker = null;
    const positionPicker = select => {
        if (!(select instanceof HTMLSelectElement) || select.multiple || select.size > 1) return;
        const rect = select.getBoundingClientRect();
        const below = Math.max(0, innerHeight - rect.bottom - 8);
        const preferred = Math.min(240, select.options.length * 36 + 10);
        const width = Math.min(Math.max(rect.width, 120), Math.max(0, innerWidth - 16));
        select.style.setProperty('--ui-picker-top', (rect.bottom + 4) + 'px');
        select.style.setProperty('--ui-picker-left', Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px');
        select.style.setProperty('--ui-picker-width', width + 'px');
        select.style.setProperty('--ui-picker-height', Math.min(240, below) + 'px');
        return Math.max(0, preferred - below);
    };
    const preparePicker = event => {
        const select = event.target;
        const extra = positionPicker(select);
        if (extra === undefined) return;
        requestAnimationFrame(() => {
            if (watchedPicker === select || !select.matches(':open')) return;
            watchedPicker = select;
            pickerExtraSpace = extra;
            reportHeight();
            const watch = () => {
                if (watchedPicker !== select) return;
                if (select.isConnected && select.matches(':open')) requestAnimationFrame(watch);
                else { watchedPicker = null; pickerExtraSpace = 0; reportHeight(); }
            };
            requestAnimationFrame(watch);
        });
    };
    for (const type of ['pointerdown','focusin','keydown']) document.addEventListener(type, preparePicker, true);
    const reposition = () => document.querySelectorAll('select:open').forEach(positionPicker);
    document.addEventListener('scroll', reposition, true);
    addEventListener('resize', reposition);
}
`;
