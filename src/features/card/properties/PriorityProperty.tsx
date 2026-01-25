import { useState, useRef, useEffect } from 'react';
import { Flag } from 'lucide-react';
import styles from './Properties.module.css';
import { PropertyRow } from './PropertyRow';

interface PriorityPropertyProps {
    value?: string;
    onChange: (val: string | undefined) => void;
    onHide: () => void;
}

const priorityOptions = [
    { value: undefined, label: 'None', color: '#6b7280' },
    { value: 'low', label: 'Low', color: '#22c55e' },
    { value: 'medium', label: 'Medium', color: '#eab308' },
    { value: 'high', label: 'High', color: '#f97316' },
    { value: 'urgent', label: 'Urgent', color: '#ef4444' },
];

export function PriorityProperty({ value, onChange, onHide }: PriorityPropertyProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const currentOption = priorityOptions.find(o => o.value === value) || priorityOptions[0];

    return (
        <PropertyRow icon={Flag} label="Priority" onHide={onHide}>
            <div className={styles.interactiveValue} ref={containerRef} onClick={() => setIsOpen(!isOpen)}>
                <span
                    className={styles.statusBadge}
                    style={{
                        backgroundColor: `${currentOption.color}20`,
                        color: currentOption.color
                    }}
                >
                    <span
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: currentOption.color,
                            display: 'inline-block'
                        }}
                    />
                    {currentOption.label}
                </span>

                {isOpen && (
                    <div className={styles.popover}>
                        {priorityOptions.map(option => (
                            <div
                                key={option.value ?? 'none'}
                                className={styles.menuItem}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                            >
                                <span
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: option.color,
                                        display: 'inline-block'
                                    }}
                                />
                                {option.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PropertyRow>
    );
}
