import { useState, useCallback } from 'react';
import { Plus, X, Square, CheckSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import styles from './SubtaskProperty.module.css';

import NumberTicker from '../../../components/ui/number-ticker';

interface Subtask {
    id: string;
    text: string;
    completed: boolean;
}

interface SubtaskPropertyProps {
    subtasks: Subtask[];
    onChange: (subtasks: Subtask[]) => void;
}

export const SubtaskProperty = ({ subtasks, onChange }: SubtaskPropertyProps) => {
    const [newTaskText, setNewTaskText] = useState('');

    const addSubtask = useCallback(() => {
        if (!newTaskText.trim()) return;
        const newTask: Subtask = {
            id: uuidv4(),
            text: newTaskText.trim(),
            completed: false
        };
        onChange([...subtasks, newTask]);
        setNewTaskText('');
    }, [newTaskText, subtasks, onChange]);

    const toggleSubtask = useCallback((id: string) => {
        onChange(subtasks.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
        ));
    }, [subtasks, onChange]);

    const removeSubtask = useCallback((id: string) => {
        onChange(subtasks.filter(t => t.id !== id));
    }, [subtasks, onChange]);

    const updateSubtaskText = useCallback((id: string, text: string) => {
        onChange(subtasks.map(t =>
            t.id === id ? { ...t, text } : t
        ));
    }, [subtasks, onChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSubtask();
        }
    };

    const completedCount = subtasks.filter(t => t.completed).length;
    const totalCount = subtasks.length;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.label}>Subtasks</span>
                {totalCount > 0 && (
                    <span className={styles.counter}>
                        <NumberTicker value={completedCount} />/{totalCount}
                    </span>
                )}
            </div>

            {/* Progress bar */}
            {totalCount > 0 && (
                <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${(completedCount / totalCount) * 100}%` }}
                    />
                </div>
            )}

            {/* Subtask list */}
            <div className={styles.list}>
                {subtasks.map((task) => (
                    <div key={task.id} className={styles.item}>
                        <button
                            className={styles.checkbox}
                            onClick={() => toggleSubtask(task.id)}
                        >
                            {task.completed ? (
                                <CheckSquare size={16} className={styles.checked} />
                            ) : (
                                <Square size={16} />
                            )}
                        </button>
                        <input
                            className={`${styles.text} ${task.completed ? styles.completed : ''}`}
                            value={task.text}
                            onChange={(e) => updateSubtaskText(task.id, e.target.value)}
                            placeholder="Subtask..."
                        />
                        <button
                            className={styles.remove}
                            onClick={() => removeSubtask(task.id)}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add new subtask */}
            <div className={styles.addRow}>
                <input
                    className={styles.addInput}
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add subtask..."
                />
                <button
                    className={styles.addButton}
                    onClick={addSubtask}
                    disabled={!newTaskText.trim()}
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
};
