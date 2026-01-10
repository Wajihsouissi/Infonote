import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import styles from './ChipInput.module.css';

interface ChipInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
}

export function ChipInput({ value = [], onChange, placeholder = "Add tag..." }: ChipInputProps) {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const trimmed = inputValue.trim();
            if (trimmed && !value.includes(trimmed)) {
                onChange([...value, trimmed]);
                setInputValue('');
            }
        } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
            // Remove last tag if backspace pressed on empty input
            onChange(value.slice(0, -1));
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(value.filter(tag => tag !== tagToRemove));
    };

    return (
        <div className={styles.container}>
            <div className={styles.chips}>
                {value.map((tag) => (
                    <span key={tag} className={styles.chip}>
                        {tag}
                        <button
                            className={styles.removeBtn}
                            onClick={() => removeTag(tag)}
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <input
                    className={styles.input}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={value.length === 0 ? placeholder : ''}
                />
            </div>
        </div>
    );
}
