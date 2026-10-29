import { buildFrameDocument } from './frameDocument';
import { loadUIFonts } from './hostFonts';
import { loadUILibraries } from './libraries';
import { nativeUIContent } from './nativeBlocks';
import { readUITheme } from './theme';
import { UI_CONTROL_STYLES } from './controlStyles';
import type { IntelligentUIArtifact, UINativeTextBlock } from './types';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function prose(blocks: UINativeTextBlock[]): string {
    return blocks.map(block => {
        const tag = ({ heading1: 'h1', heading2: 'h2', heading3: 'h3', quote: 'blockquote' } as Record<string, string>)[block.type] ?? 'p';
        return `<${tag}>${escape(block.content)}</${tag}>`;
    }).join('\n');
}

/** A single self-contained download; it carries public libraries and values, never AI access. */
export async function buildStandaloneUI(artifact: IntelligentUIArtifact): Promise<string> {
    const [fontCSS, assets] = await Promise.all([loadUIFonts(), loadUILibraries(artifact.libraries)]);
    const theme = readUITheme();
    const content = nativeUIContent(artifact);
    const frame = buildFrameDocument(artifact, artifact.state, theme, fontCSS, assets);
    // The exported iframe owns a 1px border; reported content height excludes it.
    const frameBorder = 2;
    const styles = fontCSS + UI_CONTROL_STYLES;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(artifact.title)}</title><style>${styles}*{box-sizing:border-box}:root{${Object.entries(theme).map(([key, value]) => `${key}:${value}`).join(';')}}body{margin:0;padding:24px;background:var(--ui-bg);color:var(--ui-text);font:16px/1.6 var(--ui-font,sans-serif)}main{max-width:800px;margin:auto}iframe{display:block;width:100%;border:1px solid var(--ui-border);border-radius:12px}h1,h2,h3{line-height:1.25}p,blockquote{white-space:pre-wrap}</style></head><body><main>${prose(content.before)}<iframe title="${escape(artifact.title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" style="height:${artifact.initialHeight}px" srcdoc="${escape(frame)}"></iframe>${prose(content.after)}</main><script>const frame=document.querySelector('iframe');addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.channel!=='chnk-intelligent-ui'||event.data?.id!==${JSON.stringify(artifact.id).replace(/</g, '\\u003c')})return;const height=event.data.value;const space=typeof event.data.pickerSpace==='number'&&Number.isFinite(event.data.pickerSpace)?Math.max(0,Math.min(240,event.data.pickerSpace)):0;if(event.data.type==='resize'&&typeof height==='number'&&Number.isFinite(height))frame.style.height=(Math.max(160,Math.min(1600,height))+space+${frameBorder})+'px';});</script></body></html>`;
}

export async function downloadUI(artifact: IntelligentUIArtifact): Promise<void> {
    const html = await buildStandaloneUI(artifact);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${artifact.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'intelligent-ui'}.html`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
