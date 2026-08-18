import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, AISlice } from '../types';
import type { AIAssistantMessage, AIMessage, AIStep } from '../../features/ai/aiTypes';
import { isKnownModel } from '../../config/aiModels';
import { DEFAULT_AI_EFFORT, isKnownEffort, type AIEffort } from '../../config/aiEffort';

const AI_MODEL_STORAGE_KEY = 'chnk-it-ai-model';
const AI_EFFORT_STORAGE_KEY = 'chnk-it-ai-effort';
const AI_PANEL_WIDTH_STORAGE_KEY = 'chnk-it-ai-panel-width';

export const AI_PANEL_MIN_WIDTH = 320;
export const AI_PANEL_MAX_WIDTH = 720;
export const AI_PANEL_DEFAULT_WIDTH = 380;

export function clampAIPanelWidth(width: number): number {
    // Also bounded by half the viewport at drag time (AIPanel.tsx) so the
    // panel can never crowd the canvas out entirely on a narrow window; these
    // two are the resize-independent floor/ceiling.
    return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)));
}

function readSavedPanelWidth(): number {
    const saved = Number(localStorage.getItem(AI_PANEL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) return clampAIPanelWidth(saved);
    return AI_PANEL_DEFAULT_WIDTH;
}

function readSavedModel(): string | null {
    const saved = localStorage.getItem(AI_MODEL_STORAGE_KEY);
    if (!saved) return null;
    if (isKnownModel(saved)) return saved;
    localStorage.removeItem(AI_MODEL_STORAGE_KEY);
    return null;
}

function readSavedEffort(): AIEffort {
    const saved = localStorage.getItem(AI_EFFORT_STORAGE_KEY);
    if (saved && isKnownEffort(saved)) return saved;
    if (saved) localStorage.removeItem(AI_EFFORT_STORAGE_KEY);
    return DEFAULT_AI_EFFORT;
}

/**
 * The AI panel's session state. Deliberately outside the undo history and
 * outside the saved document: the transcript is a record of a working session,
 * not part of the canvas, and undoing a card the AI made shouldn't rewrite what
 * it said. It resets on reload.
 */
export const createAISlice: StateCreator<AppState, [], [], AISlice> = (set, get) => ({
    isAIPanelOpen: false,
    aiMode: 'create',
    aiImageMode: false,
    aiMessages: [],
    aiIsRunning: false,
    // Survives reloads like the theme does: the model is a working preference,
    // not part of the document. A saved id the current build no longer offers
    // (the provider changed under it) falls back to Auto, so the picker never
    // shows "Auto" while quietly sending a dead model id.
    aiModel: readSavedModel(),

    setAIModel: (model) => {
        if (model) localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
        else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
        set({ aiModel: model });
    },

    // Persisted alongside the model — both are working preferences the user
    // sets once and expects to still be there tomorrow.
    aiEffort: readSavedEffort(),

    setAIEffort: (effort) => {
        localStorage.setItem(AI_EFFORT_STORAGE_KEY, effort);
        set({ aiEffort: effort });
    },

    // Same treatment: a working preference, not document state, so it lives in
    // localStorage rather than the saved workspace.
    aiPanelWidth: readSavedPanelWidth(),

    setAIPanelWidth: (width) => {
        const clamped = clampAIPanelWidth(width);
        localStorage.setItem(AI_PANEL_WIDTH_STORAGE_KEY, String(clamped));
        set({ aiPanelWidth: clamped });
    },

    setAIPanelOpen: (isOpen) => set({ isAIPanelOpen: isOpen }),

    // Opening AI is a "put it beside my work" gesture, so it takes the side
    // slot from whatever else was in it rather than stacking two panels.
    openAIPanel: (mode) => set({
        isAIPanelOpen: true,
        ...(mode ? { aiMode: mode } : {}),
        isMetadataOpen: false,
        isTOCOpen: false,
        isShortcutsPanelOpen: false,
    }),

    toggleAIPanel: () => (get().isAIPanelOpen ? set({ isAIPanelOpen: false }) : get().openAIPanel()),

    setAIMode: (mode) => set({ aiMode: mode }),
    setAIImageMode: (on) => set({ aiImageMode: on }),
    setAIRunning: (running) => set({ aiIsRunning: running }),

    aiSelectedContexts: [],

    toggleAIContext: (type) => set((state) => {
        const has = state.aiSelectedContexts.includes(type);
        return { aiSelectedContexts: has ? state.aiSelectedContexts.filter((t) => t !== type) : [...state.aiSelectedContexts, type] };
    }),

    clearAIContexts: () => set({ aiSelectedContexts: [] }),

    appendAIMessage: (message) => set((state) => ({ aiMessages: [...state.aiMessages, message] })),

    /**
     * Start an assistant turn and hand back its id. Every mutation below is
     * keyed by that id so a turn can keep updating itself while the user reads
     * (or sends) something else.
     */
    startAITurn: (intent) => {
        const id = uuidv4();
        const message: AIAssistantMessage = {
            id,
            role: 'assistant',
            text: '',
            steps: [],
            intent,
            status: 'streaming',
            createdNodeIds: [],
            at: new Date().toISOString(),
        };
        set((state) => ({ aiMessages: [...state.aiMessages, message], aiIsRunning: true }));
        return id;
    },

    updateAITurn: (id, patch) => set((state) => ({
        aiMessages: state.aiMessages.map((m) =>
            m.id === id && m.role === 'assistant' ? { ...m, ...patch } : m
        ),
    })),

    /** Append a step, or replace one already logged under `step.id`. */
    pushAIStep: (id, step) => set((state) => ({
        aiMessages: state.aiMessages.map((m) => {
            if (m.id !== id || m.role !== 'assistant') return m;
            const existing = m.steps.findIndex((s) => s.id === step.id);
            if (existing === -1) return { ...m, steps: [...m.steps, step] };
            const steps = m.steps.slice();
            steps[existing] = { ...steps[existing], ...step } as AIStep;
            return { ...m, steps };
        }),
    })),

    /** Streaming appends token-by-token, so this never re-renders the whole list. */
    appendAIText: (id, delta) => set((state) => ({
        aiMessages: state.aiMessages.map((m) =>
            m.id === id && m.role === 'assistant' ? { ...m, text: m.text + delta } : m
        ),
    })),

    newAIChat: () => set({ aiMessages: [], aiIsRunning: false }),

    removeAIMessages: (ids) => set((state) => ({
        aiMessages: state.aiMessages.filter((m: AIMessage) => !ids.includes(m.id)),
    })),
});
