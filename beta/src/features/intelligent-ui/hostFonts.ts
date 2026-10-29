import regularUrl from '@fontsource/outfit/files/outfit-latin-400-normal.woff2?url';
import semiboldUrl from '@fontsource/outfit/files/outfit-latin-600-normal.woff2?url';

let fontCSS: Promise<string> | undefined;

/** Load bundled public font assets in the host; the sandbox needs no network access. */
export function loadUIFonts(): Promise<string> {
    fontCSS ??= Promise.all([[regularUrl, 400], [semiboldUrl, 600]].map(async ([url, weight]) => {
        const response = await fetch(String(url), { credentials: 'omit' });
        if (!response.ok) throw new Error('Font unavailable');
        const data = await response.blob();
        const encoded = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(data);
        });
        return `@font-face{font-family:Outfit;src:url("${encoded}") format("woff2");font-style:normal;font-weight:${weight};font-display:swap;}`;
    })).then(fonts => fonts.join('')).catch(() => '');
    return fontCSS;
}
