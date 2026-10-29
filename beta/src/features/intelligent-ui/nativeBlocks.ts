import type { Block } from '../editor/types';
import { isNativeUITextBlocks, type IntelligentUIArtifact, type IntelligentUIData, type UINativeTextBlock } from './types';

export const UI_GENERATED_EVENT = 'chnk-it-intelligent-ui-generated';
export interface UIGeneratedRequest { id: string; blocks: Block[]; handled: boolean }

export function parseNativeUIBlocks(value: unknown): UINativeTextBlock[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error('The AI returned invalid text blocks. Try again.');
    const blocks = value.map(block => ({ ...block, id: crypto.randomUUID() }));
    if (!isNativeUITextBlocks(blocks)) throw new Error('The AI returned invalid text blocks. Try again.');
    return blocks;
}

/** Lift ordinary headings/prose out of legacy or nonconforming model HTML. */
export function splitUIProse(html: string, code: string, before: UINativeTextBlock[]): { html: string; before: UINativeTextBlock[] } {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const lifted: UINativeTextBlock[] = [];
    for (const element of parsed.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p')) {
        // Live results, form labels and diagram labels belong to the visual.
        if (element.closest('svg,canvas,button,label,output,form,[aria-live],[role="status"]')
            || element.querySelector('input,select,textarea,button,svg,canvas,output')
            || (element.id && code.includes(element.id))
            || [...element.classList].some(name => code.includes(name))) continue;
        const content = element.textContent?.trim();
        if (content && !before.some(block => block.content.trim() === content)) lifted.push({
            id: crypto.randomUUID(), type: element.tagName === 'P' ? 'text' : element.tagName === 'H1' ? 'heading1' : element.tagName === 'H2' ? 'heading2' : 'heading3', content,
        });
        element.remove();
    }
    return { html: parsed.body.innerHTML, before: [...before, ...lifted] };
}

export function nativeUIContent(artifact: IntelligentUIArtifact): { before: UINativeTextBlock[]; after: UINativeTextBlock[] } {
    return {
        before: isNativeUITextBlocks(artifact.before) ? artifact.before : [{ id: `${artifact.id}-title`, type: 'heading2', content: artifact.title }],
        after: isNativeUITextBlocks(artifact.after) ? artifact.after : [],
    };
}

/** Place visual and prose in one ordinary document, preserving native block identities. */
export function materializeUIBlocks(artifact: IntelligentUIArtifact, visual?: Block, data?: IntelligentUIData): Block[] {
    const content = nativeUIContent(artifact);
    return [
        ...content.before.map(block => ({ ...block, id: crypto.randomUUID() })),
        {
            ...visual,
            id: visual?.id ?? crypto.randomUUID(),
            type: 'intelligent-ui' as const,
            content: artifact.title,
            metadata: { ...visual?.metadata, intelligentUI: { ...data, artifact, draft: '', nativeTextPlaced: true } },
        },
        ...content.after.map(block => ({ ...block, id: crypto.randomUUID() })),
    ];
}
