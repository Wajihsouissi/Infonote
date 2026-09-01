/**
 * AIChatStore — IndexedDB persistence for AI panel conversations.
 *
 * The transcript was session-only: a reload, or a stray click on "New chat",
 * destroyed it with no way back. That is fine for a scratch prompt box and
 * wrong for something people plan work in — the panel's own comment calls the
 * transcript "the feature", and it was the one part of the app that kept
 * nothing.
 *
 * Its own database rather than a new store inside the canvas data database:
 * adding a store there would couple chat schema upgrades to graph storage.
 * These are independent concerns and they fail independently.
 */
import type { AIMessage } from '../../features/ai/aiTypes';

const DB_NAME = 'chnk-it-ai-chats';
const DB_VERSION = 1;
const STORE_NAME = 'chats';

/** Keeps the list browsable and the database small; oldest are pruned. */
export const MAX_STORED_CHATS = 50;

export interface AIChatSession {
    id: string;
    /** Derived from the opening question — see `deriveChatTitle`. */
    title: string;
    messages: AIMessage[];
    createdAt: number;
    updatedAt: number;
    /** Canvas/board this conversation belongs to. `null` is the root canvas. */
    boardId?: string | null;
    /** Null only for pre-cloud local chats. New sessions are account-scoped. */
    ownerId?: string | null;
}

/** What the history list renders. Excludes `messages` so opening the list
 *  doesn't pull every transcript into memory. */
export type AIChatSummary = Omit<AIChatSession, 'messages'> & { messageCount: number };

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open the chat database.'));
    });
}

/** First line of the opening question, clipped to something list-sized. */
export function deriveChatTitle(messages: AIMessage[]): string {
    // The narrowing predicate matters: the union now includes 'form' messages,
    // which carry questions rather than text.
    const first = messages.find((m): m is Extract<AIMessage, { role: 'user' }> => m.role === 'user' && m.text.trim().length > 0);
    if (!first) return 'New chat';
    const line = first.text.trim().split('\n')[0].trim();
    return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

export async function saveChat(session: AIChatSession): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            /* JSON round-trip detaches from the live store so serialization can't observe a
               concurrent mutation, and drop anything structured-clone would
               reject. */
            tx.objectStore(STORE_NAME).put(JSON.parse(JSON.stringify(session)) as AIChatSession);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Chat write failed.'));
            tx.onabort = () => reject(tx.error ?? new Error('Chat write aborted.'));
        });
    } finally {
        db.close();
    }
}

/** Summaries, newest first. */
export async function listChats(boardId?: string | null): Promise<AIChatSummary[]> {
    const db = await openDb();
    try {
        const all = await new Promise<AIChatSession[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve((request.result as AIChatSession[]) ?? []);
            request.onerror = () => reject(request.error ?? new Error('Chat read failed.'));
        });

        return all
            .filter((c) => c && Array.isArray(c.messages) && (boardId === undefined || (c.boardId ?? null) === boardId))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length }));
    } finally {
        db.close();
    }
}

export async function loadChat(id: string): Promise<AIChatSession | null> {
    const db = await openDb();
    try {
        return await new Promise<AIChatSession | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(id);
            request.onsuccess = () => {
                const value = request.result as AIChatSession | undefined;
                resolve(value && Array.isArray(value.messages) ? value : null);
            };
            request.onerror = () => reject(request.error ?? new Error('Chat read failed.'));
        });
    } finally {
        db.close();
    }
}

export async function deleteChat(id: string): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Chat delete failed.'));
        });
    } finally {
        db.close();
    }
}

/** Drop the oldest sessions once the cap is exceeded. */
export async function pruneChats(keep = MAX_STORED_CHATS): Promise<void> {
    const summaries = await listChats();
    if (summaries.length <= keep) return;
    for (const stale of summaries.slice(keep)) {
        await deleteChat(stale.id);
    }
}
