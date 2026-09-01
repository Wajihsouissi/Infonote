
import { useState, useRef, useEffect, type ElementType } from 'react';
import { Plus, Calendar, Link2, User, LayoutList, Text, Flag, BarChart3 } from '../../../components/icons';
import styles from './Properties.module.css';

interface AddPropertyMenuProps {
    availableProperties: Array<{
        key: string;
        label: string;
        icon: ElementType;
    }>;
    onAdd: (key: string) => void;
}

export function AddPropertyMenu({ availableProperties, onAdd }: AddPropertyMenuProps) {
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

    // Always render, even if empty (show "No more properties")

    return (
        <div className={styles.addPropertyContainer} ref={containerRef} style={{ position: 'relative' }}>
            <button
                className={styles.addPropertyBtn}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Plus size={14} />
                Add Property
            </button>

            {isOpen && (
                <div className={styles.popover} style={{ width: '220px' }}>
                    <div style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Properties
                    </div>
                    {availableProperties.length > 0 ? (
                        availableProperties.map(prop => (
                            <div
                                key={prop.key}
                                className={styles.menuItem}
                                onClick={() => {
                                    onAdd(prop.key);
                                    setIsOpen(false);
                                }}
                            >
                                <prop.icon size={14} className={styles.menuIcon} style={{ opacity: 0.7 }} />
                                {prop.label}
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                            No more properties
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper to get icon for property type
export const getPropertyIcon = (key: string) => {
    switch (key) {
        case 'status': return LayoutList;
        case 'priority': return Flag;
        case 'startDate': return Calendar;
        case 'dueDate': return Calendar;
        case 'url': return Link2;
        case 'assignee': return User;
        case 'progress': return BarChart3;
        case 'tasks': return LayoutList;
        default: return Text;
    }
};
