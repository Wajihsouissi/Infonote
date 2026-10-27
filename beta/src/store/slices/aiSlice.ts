import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, AISlice } from '../types';
import type { AIAssistantMessage, AIMessage, AIStep } from '../../features/ai/aiTypes';
import { isKnownModel } from '../../config/aiModels';
import { DEFAULT_AI_EFFORT, isKnownEffort, type AIEffort } from '../../config/aiEffort';
import { addScopeSource, removeScopeSource } from '../../features/ai/aiScope';
/* The chat database is loaded with the first conversation, not with the
   canvas. Every caller below is already async, so the import costs nothing
   extra — and a canvas that is never asked a question never opens a second
   IndexedDB connection or downloads the code that would. */
const chatStore = () => import('../../services/storage/chat/AIChatStore');

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
 * it said. Conversations themselves are kept in their own IndexedDB database
 * (AIChatStore), on this device only.
 */
export const createAISlice: StateCreator<AppState, [], [], AISlice> = (set, get) => ({
    isAIPanelOpen: false,
    aiPresentation: 'side',
    setAIPresentation: (presentation) => set({ aiPresentation: presentation, aiHistoryRailOpen: presentation === 'fullscreen' }),
    aiHistoryRailOpen: true,
    setAIHistoryRailOpen: (isOpen) => set({ aiHistoryRailOpen: isOpen }),
    aiMode: 'create',
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

    setAIPanelOpen: (isOpen) => set({
        isAIPanelOpen: isOpen,
        // Closing the panel should not leave an invisible fullscreen layer in
        // the shell. Draft and scroll live in AIPanel, so returning to side
        // keeps both intact.
        ...(!isOpen ? { aiPresentation: 'side' as const, aiHistoryRailOpen: true } : {}),
    }),

    // Opening AI is a "put it beside my work" gesture, so it takes the side
    // slot from whatever else was in it rather than stacking two panels.
    openAIPanel: (mode) => set({
        isAIPanelOpen: true,
        aiPresentation: 'side',
        ...(mode ? { aiMode: mode } : {}),
        isTOCOpen: false,
    }),

    toggleAIPanel: () => (get().isAIPanelOpen ? set({ isAIPanelOpen: false }) : get().openAIPanel()),

    setAIMode: (mode) => set({ aiMode: mode }),
    setAIRunning: (running) => set({ aiIsRunning: running }),

    aiSelectedContexts: [],

    toggleAIContext: (type) => set((state) => {
        const has = state.aiSelectedContexts.includes(type);
        return { aiSelectedContexts: has ? state.aiSelectedContexts.filter((t) => t !== type) : [...state.aiSelectedContexts, type] };
    }),

    clearAIContexts: () => set({ aiSelectedContexts: [] }),

    /* Scope is per-turn permission. AIPanel freezes it onto the sent message,
       then clears it so later requests need a fresh @ attachment. */
    aiScope: [],

    addAIScopeSource: (source) => set((state) => ({
        aiScope: addScopeSource(state.aiScope, source),
    })),

    removeAIScopeSource: (key) => set((state) => ({
        aiScope: removeScopeSource(state.aiScope, key),
    })),

    clearAIScope: () => set({ aiScope: [] }),

    /* Settling a form is a `role: 'form'` message update, not a new message:
       the questions stay where they were asked in the transcript and collapse
       to a receipt in place. */
    settleAIForm: (id, status, answers) => set((state) => ({
        aiMessages: state.aiMessages.map((m) =>
            m.id === id && m.role === 'form' ? { ...m, status, answers: answers ?? m.answers } : m
        ),
    })),

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

    /* Archives before clearing. This used to drop the transcript on the floor —
       one misclick on the header pencil and the session was gone with no undo. */
    newAIChat: () => {
        void get().persistAIChat().then(() => get().refreshAIChats());
        // Scope goes with the conversation, not the app: a new chat starts with
        // the AI seeing nothing again, which is the documented default.
        set({ aiMessages: [], aiIsRunning: false, aiChatId: null, aiScope: [] });
    },

    removeAIMessages: (ids) => set((state) => ({
        aiMessages: state.aiMessages.filter((m: AIMessage) => !ids.includes(m.id)),
    })),

    // ---------- Saved conversations ----------

    aiChatId: null,
    aiChats: [],
    aiChatsLoading: false,

    refreshAIChats: async () => {
        set({ aiChatsLoading: true });
        try {
            const userId = get().auth.userId;
            // Chats written before anyone signed in have no owner and stay
            // available; account-bound ones never bleed into a different
            // account's history on a shared browser.
            const { listChats } = await chatStore();
            const summaries = (await listChats()).filter((chat) => chat.ownerId == null || chat.ownerId === userId);
            set({ aiChats: summaries });
        } catch (error) {
            // A blocked or unavailable IndexedDB must not take the panel down;
            // history simply reads as empty.
            console.error('[AI] Could not read chat history:', error);
            set({ aiChats: [] });
        } finally {
            set({ aiChatsLoading: false });
        }
    },

    /**
     * Write the transcript to its session, creating one on first save.
     *
     * Called on a debounce while a turn streams, so it has to be cheap and
     * idempotent. A transcript with no completed exchange is not worth a row —
     * otherwise every panel open would leave an empty "New chat" behind.
     */
    persistAIChat: async () => {
        const { aiMessages, aiChatId, auth, currentParentId } = get();
        if (aiMessages.length === 0) return;

        const id = aiChatId ?? uuidv4();
        const now = Date.now();
        const existing = aiChatId ? get().aiChats.find((c) => c.id === aiChatId) : undefined;

        try {
            const { deriveChatTitle, pruneChats, saveChat } = await chatStore();
            await saveChat({
                id,
                title: deriveChatTitle(aiMessages),
                messages: aiMessages.map(message => message.role === 'assistant' && message.intelligentUIPreview
                    ? { ...message, intelligentUIPreview: undefined } : message),
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                boardId: currentParentId,
                ownerId: auth.userId,
            });
            if (!aiChatId) set({ aiChatId: id });
            await pruneChats();
        } catch (error) {
            console.error('[AI] Could not save this chat:', error);
        }
    },

    openAIChat: async (id) => {
        // Don't lose the transcript that is on screen to open another one.
        await get().persistAIChat();
        try {
            const { loadChat } = await chatStore();
            const session = await loadChat(id);
            if (session) set({ aiMessages: session.messages, aiChatId: session.id, aiIsRunning: false });
        } catch (error) {
            console.error('[AI] Could not open that chat:', error);
        }
        await get().refreshAIChats();
    },

    duplicateAIChat: async (id) => {
        await get().persistAIChat();
        try {
            const { loadChat, saveChat } = await chatStore();
            const session = await loadChat(id);
            if (!session) return;
            const now = Date.now();
            const copyId = uuidv4();
            await saveChat({
                ...session,
                id: copyId,
                title: `${session.title} · copy`,
                createdAt: now,
                updatedAt: now,
                boardId: get().currentParentId,
                ownerId: get().auth.userId,
            });
            set({ aiMessages: session.messages, aiChatId: copyId, aiIsRunning: false });
        } catch (error) {
            console.error('[AI] Could not duplicate that chat:', error);
        }
        await get().refreshAIChats();
    },

    regenerateAIChat: async (id) => {
        await get().persistAIChat();
        try {
            const { loadChat } = await chatStore();
            const session = await loadChat(id);
            if (!session) return null;
            let lastUserIndex = -1;
            for (let index = session.messages.length - 1; index >= 0; index -= 1) {
                if (session.messages[index].role === 'user') {
                    lastUserIndex = index;
                    break;
                }
            }
            if (lastUserIndex < 0) return null;
            // The message union includes clarifying forms, which carry
            // questions rather than text — narrow rather than assume.
            const lastUser = session.messages[lastUserIndex];
            const prompt = lastUser.role === 'user' ? lastUser.text.trim() : '';
            if (!prompt) return null;
            set({
                aiMessages: session.messages.slice(0, lastUserIndex),
                aiChatId: session.id,
                aiIsRunning: false,
            });
            await get().refreshAIChats();
            return prompt;
        } catch (error) {
            console.error('[AI] Could not prepare that chat for regeneration:', error);
            return null;
        }
    },

    deleteAIChat: async (id) => {
        try {
            const { deleteChat } = await chatStore();
            await deleteChat(id);
        } catch (error) {
            console.error('[AI] Could not delete that chat:', error);
        }
        // Deleting the open session leaves the transcript on screen but detached,
        // so the next save starts a fresh row rather than resurrecting this one.
        if (get().aiChatId === id) set({ aiChatId: null });
        await get().refreshAIChats();
    },
});
