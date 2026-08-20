import { useEffect } from 'react';
import { MessageSquare, Trash2, X } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './AIChatHistory.module.css';

/** "just now" / "14m" / "3h" / "2d" / a date once it stops being recent. */
function relativeTime(ms: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Saved conversations, as an overlay inside the panel body.
 *
 * An overlay rather than a route or a second column: the panel is ~380px by
 * default, so a persistent sidebar would leave neither list nor transcript
 * readable. Opening history is a brief detour — pick a chat, come back.
 */
export function AIChatHistory({ onClose }: {
    onClose: () => void;
}) {
    const chats = useStore((s) => s.aiChats);
    const loading = useStore((s) => s.aiChatsLoading);
    const currentId = useStore((s) => s.aiChatId);
    const refreshAIChats = useStore((s) => s.refreshAIChats);
    const openAIChat = useStore((s) => s.openAIChat);
    const deleteAIChat = useStore((s) => s.deleteAIChat);

    // Re-read on open: another tab may have written since this one last looked.
    useEffect(() => {
        void refreshAIChats();
    }, [refreshAIChats]);

    return (
        <div className={styles.overlay}>
            <div className={styles.head}>
                <span className={styles.title}>Chat history</span>
                <button className={styles.closeBtn} onClick={onClose} title="Back to this chat">
                    <X size={15} />
                </button>
            </div>

            {loading && chats.length === 0 ? (
                <p className={styles.empty}>Loading…</p>
            ) : chats.length === 0 ? (
                <p className={styles.empty}>
                    No saved chats yet. Conversations are kept automatically once you send a message.
                </p>
            ) : (
                <ul className={styles.list}>
                    {chats.map((chat) => (
                        <li key={chat.id} className={styles.row}>
                            <button
                                className={`${styles.open} ${chat.id === currentId ? styles.openCurrent : ''}`}
                                onClick={() => {
                                    void openAIChat(chat.id);
                                    onClose();
                                }}
                                title={chat.title}
                            >
                                <MessageSquare size={13} className={styles.rowIcon} />
                                <span className={styles.rowText}>
                                    <span className={styles.rowTitle}>{chat.title}</span>
                                    <span className={styles.rowMeta}>
                                        {relativeTime(chat.updatedAt)} · {chat.messageCount} message{chat.messageCount === 1 ? '' : 's'}
                                        {chat.id === currentId ? ' · open' : ''}
                                    </span>
                                </span>
                            </button>

                            <button
                                className={styles.deleteBtn}
                                onClick={() => void deleteAIChat(chat.id)}
                                title={`Delete “${chat.title}”`}
                            >
                                <Trash2 size={13} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
