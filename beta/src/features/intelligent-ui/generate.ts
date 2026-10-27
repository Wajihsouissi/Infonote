import { streamText } from '../../services/ai/text';
import { extractJsonFromString } from '../../services/ai/structured';
import type { AIRequestOptions } from '../../services/ai/types';
import { clampUIHeight, isIntelligentUIArtifact, type IntelligentUIArtifact, type UIStreamPreview } from './types';
import { parseNativeUIBlocks, splitUIProse } from './nativeBlocks';
import { readUIStreamPreview } from './streamPreview';

// Ordered CSS/HTML/function/expression contract adapted from CopilotKit/OpenIntelligentUI.
// Transport and persistence belong to Chnk it; no CopilotKit or Python service is required.
const SYSTEM = `You build useful interactive answers inside Chnk it notes.
Return ONLY one JSON object in this order:
{"title":"short descriptive title","summary":"brief metadata summary","before":[{"type":"heading2","content":"Native heading"}],"libraries":[],"initialHeight":360,"css":"visual CSS","html":"ONLY the visual/interactive part","jsFunctions":"named functions and event wiring","jsExpressions":["setup();"],"after":[]}

TEXT IS NATIVE CONTENT: put all ordinary titles, headers, descriptions,
introductions, explanations and conclusions into before/after as native editor
blocks, NEVER inside html. Allowed types: text, heading1, heading2, heading3,
bullet, numbered, quote; content is plain text with optional inline markdown.
Keep prose short and only when useful. No repeated descriptions or UI narration.
html contains ONLY the SVG/canvas/diagram or interactive controls, their labels,
legends, dynamic values and validation feedback. These functional labels/results
stay with the visual. No static h1-h6 or explanatory paragraphs in html.
The host supplies the outer block. Do not add another card around the visual.
Use one compact native heading in before; after may be empty. summary is metadata
for search/context and is not a second visible description.

Choose the useful interface yourself: chart, diagram, calculator, comparison,
explainer or simulation. All enabled controls must actually work. Prefer a
simple clear SVG/HTML diagram to decoration. Use the language of the request.
Use browser JavaScript, inline SVG, HTML and CSS. Optional preinstalled libraries:
- libraries:["three"] exposes THREE (3D), ["d3"] exposes d3,
  ["chart.js"] exposes Chart (all controllers registered), ["gsap"] exposes gsap,
  ["leaflet"] exposes L and Leaflet CSS. Declare ONLY the libraries you need.
All are loaded locally before setup; use their globals, no import/require/CDN.
For Three use WebGLRenderer and custom pointer controls; no unbundled addons.
Give charts/canvas an explicit responsive height and accessible alternative.
For Canvas/WebGL colors, resolve --ui-* with getComputedStyle before passing
them to a drawing API; canvas colors do not understand CSS var() strings.
Use ResizeObserver for render sizes; dispose old charts/3D resources on reset.
GSAP motion must honor matchMedia('(prefers-reduced-motion: reduce)').
For maps use L.circleMarker, not image markers. Tiles may ONLY use
https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}
with visible USGS attribution; all other remote resources remain blocked.
Tile maps need internet; coordinates/connections must be sourced or labelled
illustrative, never invented driving directions. No destination photo URLs.
No external imports, arbitrary network requests, credentials, forms that submit,
iframes, navigation, storage, parent DOM, or invented backend APIs. The iframe
has an opaque origin. Host data is available ONLY as source material below.
Use addEventListener in jsFunctions, not inline on* attributes. Every input,
select and textarea must have a unique stable id and associated label.
Use native select/option for dropdown choices, not a custom positioned listbox.
The host supplies themed scrollbars, select fields and viewport-aware pickers.
Keep wide diagrams/tables in a local overflow:auto region; never hide needed scrolling.
jsExpressions are synchronous entry-point calls. No top-level await.
Controls, calculations, filters and reset run locally, without AI requests.
Only an explicitly labelled user-clicked button (e.g. "Ask AI about this scenario")
may call await chnkUI.sendPrompt({text:"a concise question",values:{computedResult:42}}).
The host automatically includes current input values; optional values are flat
strings/numbers/booleans. Use try/catch to show concise failures. This starts a
new AI chat turn and preserves this visual. NEVER call on load, input, timers
or animations. The bridge requires a real button click or keyboard activation.
Validate blank/non-finite values, bounds and zero divisors. Show units, formulas,
and explicit assumptions. Never show NaN, Infinity or stale calculated results.
Distinguish user values, sourced facts, calculated results and illustrative data.
Do not invent current data; label example data inside the interface.
Your initial HTML must be understandable without executing JS. Include a text
alternative for charts. Respect keyboard focus and prefers-reduced-motion.
Make it responsive down to 280px. No fixed widths or horizontal page overflow.
Use inherited theme variables: --ui-bg, --ui-surface, --ui-text, --ui-muted,
--ui-border, --ui-accent. Font is the host's existing font family.
Keep code concise. Never include markdown fences or a complete HTML document.`;

export function parseGeneratedUI(text: string, prompt: string, model?: string): IntelligentUIArtifact {
    const json = extractJsonFromString(text, 'object');
    if (!json) throw new Error('The AI returned an incomplete interface. Try a smaller request.');
    const raw = JSON.parse(json) as Record<string, unknown>;
    const nativeBefore = parseNativeUIBlocks(raw.before);
    const nativeAfter = parseNativeUIBlocks(raw.after);
    const visual = typeof raw.html === 'string' ? splitUIProse(raw.html,
        `${raw.jsFunctions ?? ''}\n${Array.isArray(raw.jsExpressions) ? raw.jsExpressions.join('\n') : ''}`, nativeBefore) : undefined;
    const before = visual?.before.length ? visual.before : typeof raw.title === 'string'
        ? [{ id: crypto.randomUUID(), type: 'heading2' as const, content: raw.title }] : [];
    const artifact = {
        title: raw.title,
        summary: raw.summary,
        html: visual?.html,
        before,
        after: nativeAfter,
        version: 1,
        id: crypto.randomUUID(),
        prompt: prompt.slice(0, 20_000),
        createdAt: new Date().toISOString(),
        model,
        initialHeight: clampUIHeight(raw.initialHeight) ?? 420,
        css: raw.css ?? '',
        jsFunctions: raw.jsFunctions ?? '',
        jsExpressions: raw.jsExpressions ?? [],
        libraries: raw.libraries ?? [],
        // Provider output never chooses persisted control values.
        state: undefined,
    };
    if (!isIntelligentUIArtifact(artifact)) throw new Error('The AI returned an invalid interface. Try again with one focused tool or diagram.');
    return artifact;
}

export async function generateIntelligentUI(
    prompt: string,
    options: AIRequestOptions & { signal?: AbortSignal; context?: string; previous?: IntelligentUIArtifact; onPreview?: (preview: UIStreamPreview) => void } = {},
): Promise<IntelligentUIArtifact> {
    if (!prompt.trim()) throw new Error('Describe the interface you want to create.');
    const previous = options.previous;
    const source = [
        options.context ? `[ATTACHED SOURCE MATERIAL]\n${options.context.slice(0, 30_000)}` : '',
        previous ? `[PREVIOUS INTERFACE TO REVISE]\n${JSON.stringify({ title: previous.title, summary: previous.summary, libraries: previous.libraries, html: previous.html, css: previous.css, jsFunctions: previous.jsFunctions, jsExpressions: previous.jsExpressions, state: previous.state }).slice(0, 100_000)}` : '',
        `[USER REQUEST]\n${prompt.slice(0, 20_000)}`,
    ].filter(Boolean).join('\n\n');
    let partial = '';
    let lastPreview = 0;
    let previewTimer: ReturnType<typeof setTimeout> | undefined;
    const publishPreview = () => {
        previewTimer = undefined;
        if (options.signal?.aborted || !options.onPreview) return;
        lastPreview = Date.now();
        const preview = readUIStreamPreview(partial);
        if (preview) options.onPreview(preview);
    };
    const result = await streamText(source, {
        system: SYSTEM,
        model: options.model,
        images: options.images,
        history: options.history,
        phase: 'body',
        maxTokensOverride: 12_000,
        thinking: 'off',
        temperature: 0.4,
        signal: options.signal,
        continueOnTruncation: false,
        onDelta: delta => {
            if (!options.onPreview || options.signal?.aborted) return;
            if (partial.length > 250_000) return;
            partial += delta;
            if (Date.now() - lastPreview >= 200) { clearTimeout(previewTimer); publishPreview(); }
            else previewTimer ??= setTimeout(publishPreview, 200 - (Date.now() - lastPreview));
        },
    }).finally(() => clearTimeout(previewTimer));
    if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    if (result.truncated) throw new Error('The interface exceeded the generation limit. Try one smaller tool or diagram.');
    return parseGeneratedUI(result.text, prompt, result.model ?? options.model ?? undefined);
}
