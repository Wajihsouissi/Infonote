import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles } from '../../components/icons';
import { matchCommands, type AICommand } from './aiCommands';
/* Shares the mention picker's stylesheet rather than cloning it: `/` and `@`
   are the same gesture in the same slot, and they should not be able to drift
   apart visually. */
import styles from './AIMentionPicker.module.css';

/**
 * The `/` command picker.
 *
 * Exists for discoverability more than for input: `/ask` is quick to type once
 * you know it, and impossible to guess before that. Mirrors the `@` picker's
 * keyboard handling exactly so the two feel like one mechanism.
 */
export function AICommandPicker({
    query,
    onPick,
    onClose,
}: {
    query: string;
    onPick: (command: AICommand) => void;
    onClose: () => void;
}) {
    const commands = useMemo(() => matchCommands(query), [query]);

    // Stored with the query it belongs to so a new query resets the cursor
    // during render rather than in an effect that fires a second pass.
    const [activeState, setActiveState] = useState<{ query: string; index: number }>({ query, index: 0 });
    const active = activeState.query === query
        ? Math.min(activeState.index, Math.max(0, commands.length - 1))
        : 0;
    const setActive = (next: number | ((current: number) => number)) =>
        setActiveState({ query, index: typeof next === 'function' ? next(active) : next });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(commands.length - 1, i + 1)); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const command = commands[active];
                if (!command) return;
                event.preventDefault();
                // Stops the composer's own Enter from also sending the draft.
                event.stopPropagation();
                onPick(command);
            }
        };
        // Capture, so this wins the race against the textarea's own handler.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    if (commands.length === 0) {
        return (
            <div className={styles.picker}>
                <div className={styles.empty}>
                    <Search size={13} />
                    <span>No command called “{query}”.</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.picker} role="listbox" aria-label="Commands">
            <div className={styles.heading}>Commands</div>
            {commands.map((command, index) => (
                <button
                    key={command.name}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    className={`${styles.row} ${index === active ? styles.rowActive : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => onPick(command)}
                >
                    <span className={styles.icon}><Sparkles size={13} /></span>
                    <span className={styles.body}>
                        <span className={styles.title}>{command.label}</span>
                        <span className={styles.detail}>{command.hint}</span>
                    </span>
                    {index === active && <span className={styles.key}>↵</span>}
                </button>
            ))}
        </div>
    );
}
