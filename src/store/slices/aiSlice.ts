import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, AISlice } from '../types';
import type { AIAssistantMessage, AIMessage, AIStep } from '../../features/ai/aiTypes';
import { isKnownModel } from '../../config/aiModels';
import { DEFAULT_AI_EFFORT, isKnownEffort, type AIEffort } from '../../config/aiEffort';
import { addScopeSource, removeScopeSource } from '../../features/ai/aiScope';
import {
    deleteChat,
    deriveChatTitle,
    listChats,
    loadChat,
    pruneChats,
    saveChat,
} from '../../services/storage/AIChatStore';
import {
    deleteCloudChat,
    listCloudChats,
    loadCloudChat,
    saveChatToCloud,
} from '../../services/storage/AIChatCloudStore';
import type { AIChatSession } from '../../services/storage/AIChatStore';

const AI_MODEL_STORAGE_KEY = 'chnk-it-ai-model';
const AI_EFFORT_STORAGE_KEY = 'chnk-it-ai-effort';
const AI_PANEL_WIDTH_STORAGE_KEY = 'chnk-it-ai-panel-width';
const AI_WEB_SEARCH_STORAGE_KEY = 'chnk-it-ai-web-search';

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

function asSummary(session: AIChatSession) {
    const { messages, ...meta } = session;
    return { ...meta, messageCount: messages.length };
}

/** Same id means the copies are the same conversation. The newest transcript
 * wins, whether it was written offline or on another signed-in device. */
function newestSession(a: AIChatSession | undefined, b: AIChatSession | undefined): AIChatSession | undefined {
    if (!a) return b;
    if (!b) return a;
    return a.updatedAt >= b.updatedAt ? a : b;
}

function logCloudSyncError(action: string, error: unknown) {
    // Cloud history enriches local chat; it must never make the composer or
    // IndexedDB cache unusable. Keep the diagnostic available in development.
    if (import.meta.env.DEV) console.warn(`[AI] Cloud chat ${action} failed; using local history.`, error);
}

/**
 * The AI panel's session state. Deliberately outside the undo history and
 * outside the saved document: the transcript is a record of a working session,
 * not part of the canvas, and undoing a card the AI made shouldn't rewrite what
 * it said. It resets on reload.
 */
export const createAISlice: StateCreator<AppState, [], [], AISlice> = (set, get) => ({
    isAIPanelOpen: false,
    aiPresentation: 'side',
    setAIPresentation: (presentation) => set({ aiPresentation: presentation, aiHistoryRailOpen: presentation === 'fullscreen' }),
    aiHistoryRailOpen: true,
    setAIHistoryRailOpen: (isOpen) => set({ aiHistoryRailOpen: isOpen }),
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
        isMetadataOpen: false,
        isTOCOpen: false,
        isShortcutsPanelOpen: false,
    }),

    toggleAIPanel: () => (get().isAIPanelOpen ? set({ isAIPanelOpen: false }) : get().openAIPanel()),

    setAIMode: (mode) => set({ aiMode: mode }),
    setAIImageMode: (on) => set({ aiImageMode: on }),

    // Sticky across turns like the model/effort prefs: "I'm researching now" is
    // a mode you stay in for a few questions, not a per-message decision.
    aiWebSearch: localStorage.getItem(AI_WEB_SEARCH_STORAGE_KEY) === '1',

    setAIWebSearch: (on) => {
        if (on) localStorage.setItem(AI_WEB_SEARCH_STORAGE_KEY, '1');
        else localStorage.removeItem(AI_WEB_SEARCH_STORAGE_KEY);
        set({ aiWebSearch: on });
    },
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
       to a receipt in place (ai-Plan.md §5.2). */
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
            const local = (await listChats()).filter((chat) =>
                // Pre-cloud records have no owner and remain available as an
                // offline cache. Account-bound records never bleed into a
                // different account's history list on a shared browser.
                chat.ownerId == null || chat.ownerId === userId,
            );
            let cloud: AIChatSession[] = [];
            try {
                cloud = await listCloudChats(userId);
            } catch (error) {
                logCloudSyncError('read', error);
            }

            // IndexedDB reads run in parallel. A populated history should feel
            // instant, not incur one round-trip per saved chat before drawing.
            const localSessions = (await Promise.all(local.map((summary) => loadChat(summary.id).catch(() => null))))
                .filter((session): session is AIChatSession => session !== null);
            const localById = new Map(localSessions.map((session) => [session.id, session]));
            const cloudById = new Map(cloud.map((session) => [session.id, session]));
            const ids = new Set([...localById.keys(), ...cloudById.keys()]);
            const merged: AIChatSession[] = [];

            for (const id of ids) {
                const localSession = localById.get(id) ?? null;
                const remoteSession = cloudById.get(id);
                const winner = newestSession(localSession ?? undefined, remoteSession);
                if (!winner) continue;
                const ownedWinner = { ...winner, ownerId: winner.ownerId ?? userId };
                merged.push(ownedWinner);

                // Seed a fresh device and repair an out-of-date cache in the
                // background. The history list must not wait on either write.
                if (!localSession || winner.updatedAt > localSession.updatedAt) {
                    void saveChat(ownedWinner).catch((error) => console.error('[AI] Could not cache cloud chat:', error));
                }
                if (userId && (!remoteSession || winner.updatedAt > remoteSession.updatedAt)) {
                    void saveChatToCloud(ownedWinner, userId, get().auth.activeWorkspaceId).catch((error) => logCloudSyncError('merge', error));
                }
            }

            set({ aiChats: merged.sort((a, b) => b.updatedAt - a.updatedAt).map(asSummary) });
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
    persistAIChat: async (boardId) => {
        const { aiMessages, aiChatId, auth, currentParentId } = get();
        if (aiMessages.length === 0) return;

        const id = aiChatId ?? uuidv4();
        const now = Date.now();
        const existing = aiChatId ? get().aiChats.find((c) => c.id === aiChatId) : undefined;

        try {
            const session: AIChatSession = {
                id,
                title: deriveChatTitle(aiMessages),
                messages: aiMessages,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                boardId: boardId ?? currentParentId,
                ownerId: auth.userId,
            };
            await saveChat(session);
            if (!aiChatId) set({ aiChatId: id });
            await pruneChats();
            try {
                await saveChatToCloud(session, auth.userId, auth.activeWorkspaceId);
            } catch (error) {
                logCloudSyncError('write', error);
            }
        } catch (error) {
            console.error('[AI] Could not save this chat:', error);
        }
    },

    openAIChat: async (id) => {
        // Don't lose the transcript that is on screen to open another one.
        await get().persistAIChat();
        try {
            // Local-first means the click opens instantly when a cache exists;
            // the cloud response may then replace it only if it is newer.
            const local = await loadChat(id);
            if (local) set({ aiMessages: local.messages, aiChatId: local.id, aiIsRunning: false });

            let remote: AIChatSession | null = null;
            try {
                remote = await loadCloudChat(id, get().auth.userId);
            } catch (error) {
                logCloudSyncError('open', error);
            }
            const winner = newestSession(local ?? undefined, remote ?? undefined);
            if (!winner) return;
            set({ aiMessages: winner.messages, aiChatId: winner.id, aiIsRunning: false });
            if (!local || winner.updatedAt > local.updatedAt) await saveChat({ ...winner, ownerId: winner.ownerId ?? get().auth.userId });
            if (get().auth.userId && (!remote || winner.updatedAt > remote.updatedAt)) {
                void saveChatToCloud(winner, get().auth.userId, get().auth.activeWorkspaceId).catch((error) => logCloudSyncError('open merge', error));
            }
        } catch (error) {
            console.error('[AI] Could not open that chat:', error);
        }
        await get().refreshAIChats();
    },

    duplicateAIChat: async (id) => {
        await get().persistAIChat();
        try {
            const session = await loadChat(id) ?? await loadCloudChat(id, get().auth.userId);
            if (!session) return;
            const now = Date.now();
            const copyId = uuidv4();
            const copy: AIChatSession = {
                ...session,
                id: copyId,
                title: `${session.title} · copy`,
                createdAt: now,
                updatedAt: now,
                boardId: get().currentParentId,
                ownerId: get().auth.userId,
            };
            await saveChat(copy);
            try {
                await saveChatToCloud(copy, get().auth.userId, get().auth.activeWorkspaceId);
            } catch (error) {
                logCloudSyncError('duplicate', error);
            }
            set({ aiMessages: session.messages, aiChatId: copyId, aiIsRunning: false });
        } catch (error) {
            console.error('[AI] Could not duplicate that chat:', error);
        }
        await get().refreshAIChats();
    },

    regenerateAIChat: async (id) => {
        await get().persistAIChat();
        try {
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
            // The message union now includes clarifying forms, which carry
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
            await deleteChat(id);
        } catch (error) {
            console.error('[AI] Could not delete that chat:', error);
        }
        try {
            await deleteCloudChat(id, get().auth.userId);
        } catch (error) {
            logCloudSyncError('delete', error);
        }
        // Deleting the open session leaves the transcript on screen but detached,
        // so the next save starts a fresh row rather than resurrecting this one.
        if (get().aiChatId === id) set({ aiChatId: null });
        await get().refreshAIChats();
    },
});
