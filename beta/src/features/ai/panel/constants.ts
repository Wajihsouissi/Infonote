import { FileText, Layers, ListTodo, MessageSquare, Network, RotateCcw, Search } from '../../../components/icons';
import { AI_EFFORT_LEVELS, type AIEffort } from '../../../config/aiEffort';
import { modelLabel } from '../../../config/aiModels';
import type { TabItem } from '../../../components/ui/Tabs';
import type { AIAssistantMessage, AIContextType } from '../aiTypes';

/**
 * The panel's fixed vocabulary: its starter prompts, its quick actions, and the
 * wording of the two settings a turn is run with.
 *
 * Kept out of the component because none of it is state — it is copy, and copy
 * is easier to review when it is not interleaved with hooks.
 */

export const SUGGESTIONS: { label: string; description: string; prompt: string; mode: 'create' | 'ask'; icon: React.FC<{ size?: number }> }[] = [
    { label: 'Create cards', description: 'Break a topic into useful pieces.', prompt: 'Create 4 cards breaking down ', mode: 'create', icon: Layers },
    { label: 'Build a mindmap', description: 'Explore the important connections.', prompt: 'Mindmap of ', mode: 'create', icon: Network },
    { label: 'Summarise canvas', description: 'Find the signal across your work.', prompt: 'Summarise what is on this canvas and what is missing.', mode: 'ask', icon: MessageSquare },
    { label: 'Rewrite selection', description: 'Make selected ideas clearer.', prompt: 'Rewrite this more clearly and tighten the wording.', mode: 'create', icon: RotateCcw },
];

export type CanvasQuickActionId = 'summary' | 'actions' | 'gaps' | 'translate';

export const CANVAS_QUICK_ACTIONS: Array<{
    id: CanvasQuickActionId;
    label: string;
    mode: 'create' | 'ask';
    icon: React.FC<{ size?: number }>;
}> = [
    { id: 'summary', label: 'Summary', mode: 'ask', icon: FileText },
    { id: 'actions', label: 'Action items', mode: 'create', icon: ListTodo },
    { id: 'gaps', label: 'Find gaps', mode: 'ask', icon: Search },
    { id: 'translate', label: 'Translate', mode: 'ask', icon: Network },
];

/** What each quick action actually asks for, once a target is known. */
export function quickActionPrompt(id: CanvasQuickActionId, target: string): string {
    switch (id) {
        case 'summary': return `Summarize ${target}. Identify the main ideas, their relationships, and the most useful next question.`;
        case 'actions': return `Extract action items from ${target}. Create concise todo chunks only; preserve the source cards unchanged.`;
        case 'gaps': return `Find gaps and contradictions in ${target}. Cite the specific cards that support each observation.`;
        case 'translate': return `Translate ${target} into [language]. Preserve its hierarchy, formatting, and meaning.`;
    }
}

/** What an answer can be turned into, once it has been read. */
export type AnswerArtifact = 'card' | 'mindmap' | 'document';

export const ANSWER_ARTIFACTS: Array<{
    id: AnswerArtifact;
    label: string;
    icon: React.FC<{ size?: number }>;
}> = [
    { id: 'card', label: 'Create card', icon: Layers },
    { id: 'mindmap', label: 'Add as mind map', icon: Network },
    { id: 'document', label: 'Write it up', icon: FileText },
];

export const ANSWER_ARTIFACT_REQUESTS: Record<Exclude<AnswerArtifact, 'card'>, {
    context: AIContextType;
    instruction: string;
}> = {
    mindmap: {
        context: 'mindmap',
        instruction: 'Turn this answer into one connected clustered mindmap. Use the central idea as one root. Convert each major ## or ### answer section into a first-level section node, then put its related points as children below it. Keep every point connected to its direct parent; no disconnected nodes. Use 3–6 section clusters with 2–5 concise elements per section where the answer supports it.',
    },
    document: {
        context: 'fusednodes',
        instruction: 'Turn this answer into one written document with a clear structure: sections, the detail under each, and a short close. Keep every fact the answer already established.',
    },
};

/**
 * What each effort level buys, in outcomes rather than adjectives.
 *
 * `AI_EFFORT_LEVELS[].hint` describes the writing ("Long, deep and richly
 * formatted"); this describes what lands. Kept beside the segmented control so
 * the dial can be understood without being operated.
 */
export const EFFORT_CONSEQUENCE: Record<AIEffort, string> = {
    fast: 'Fast · short answers, fewest items — quickest',
    efficient: 'Efficient · a scannable page per card — usually a few seconds',
    /* The time matters as much as the depth. Smart asks for a long answer and
       allows an 8000-token ceiling, so a simple question can still take half a
       minute; saying only what it produces let people pick it for quality and
       then be surprised by the wait. */
    smart: 'Smart · deep bodies, tables and checklists — slowest, often 20–40s',
};

/* The effort dial as tab items. Derived from the config rather than written
   out, so adding a level in aiEffort.ts still only takes one edit. Radio
   semantics, not tabs: this picks a setting, it does not switch a panel. */
export const EFFORT_TABS: TabItem<AIEffort>[] = AI_EFFORT_LEVELS.map((option) => ({
    id: option.id,
    label: option.label,
    hint: option.hint,
}));

/* Create vs Ask is the composer's one real fork — whether the turn writes on
   the canvas or answers in the panel — so it is a setting the user rests in,
   not a panel switch: radio semantics, neutral colour, same as effort above. */
export const MODE_TABS: TabItem<'create' | 'ask'>[] = [
    { id: 'create', label: 'Create', hint: 'Put things on the canvas' },
    { id: 'ask', label: 'Ask', hint: 'Answer here, leave the canvas alone' },
];

/* Keys must match the `icon` field in AI_CONTEXT_DEFINITIONS. A definition
   naming an icon that is missing here resolves to `undefined` and React throws
   on render, so the two lists have to move together. */
export const CONTEXT_ICONS: Record<string, React.FC<{ size?: number }>> = {
    Network,
    Layers,
    FileText,
};

/**
 * Ask the canvas to bring these nodes into view.
 *
 * A window event rather than a direct call: the canvas owns the viewport, and
 * the panel should not need a handle on it to say "look here".
 */
export function focusCanvasNodes(ids: readonly string[]) {
    if (ids.length === 0) return;
    window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [...ids] } }));
    });
}

/** Who answered and how long it took, for the line under an answer. */
export function responseReceipt(message: AIAssistantMessage): string {
    const parts = [modelLabel(message.model ?? null)];
    if (typeof message.durationMs === 'number') {
        parts.push(message.durationMs < 1_000 ? '<1s' : `${(message.durationMs / 1_000).toFixed(message.durationMs < 10_000 ? 1 : 0)}s`);
    }
    return parts.join(' · ');
}
