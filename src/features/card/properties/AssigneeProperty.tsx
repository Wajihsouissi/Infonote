import { useState, useRef, useEffect } from 'react';
import { User } from '../../../components/icons';
import styles from './Properties.module.css';
import { PropertyRow } from './PropertyRow';

interface AssigneePropertyProps {
    value?: string;
    onChange: (val: string) => void;
    onHide: () => void;
}

export function AssigneeProperty({ value, onChange, onHide }: AssigneePropertyProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    const handleSave = () => {
        onChange(inputValue.trim());
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setInputValue(value || '');
            setIsEditing(false);
        }
    };

    // Get initials for avatar
    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <PropertyRow icon={User} label="Assignee" onHide={onHide}>
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter name..."
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: '0.85rem',
                        color: 'var(--color-text-main)',
                        outline: 'none',
                        width: '100%',
                        maxWidth: 200
                    }}
                />
            ) : (
                <div
                    className={styles.interactiveValue}
                    onClick={() => setIsEditing(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                    {value ? (
                        <>
                            <span
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    color: '#fff'
                                }}
                            >
                                {getInitials(value)}
                            </span>
                            <span>{value}</span>
                        </>
                    ) : (
                        <span className={styles.placeholder}>Add assignee...</span>
                    )}
                </div>
            )}
        </PropertyRow>
    );
}
