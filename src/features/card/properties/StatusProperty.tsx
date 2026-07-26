
import { useState, useRef, useEffect } from 'react';
import { Loader, CheckCircle, Circle, Clock, LayoutList } from 'lucide-react';
import styles from './Properties.module.css';
import { PropertyRow } from './PropertyRow';

interface StatusPropertyProps {
    value?: string;
    onChange: (val: string) => void;
    onHide: () => void;
}

const statusOptions = [
    { value: 'todo', label: 'To Do', color: 'var(--text-faint)', icon: Circle },
    { value: 'in-progress', label: 'In Progress', color: '#eab308', icon: Loader },
    { value: 'review', label: 'In Review', color: '#f95d2e', icon: Clock },
    { value: 'done', label: 'Done', color: '#22c55e', icon: CheckCircle },
];

export function StatusProperty({ value, onChange, onHide }: StatusPropertyProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const currentOption = statusOptions.find(o => o.value === value) || statusOptions[0];

    return (
        <PropertyRow icon={LayoutList} label="Status" onHide={onHide}>
            <div className={styles.interactiveValue} ref={containerRef} onClick={() => setIsOpen(!isOpen)}>
                <span
                    className={styles.statusBadge}
                    style={{
                        backgroundColor: `${currentOption.color}20`,
                        color: currentOption.color
                    }}
                >
                    <currentOption.icon size={12} />
                    {currentOption.label}
                </span>

                {isOpen && (
                    <div className={styles.popover}>
                        {statusOptions.map(option => (
                            <div
                                key={option.value}
                                className={styles.menuItem}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                            >
                                <option.icon size={14} style={{ color: option.color }} />
                                {option.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PropertyRow>
    );
}
