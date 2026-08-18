
import { useRef } from 'react';
import { Calendar } from '../../../components/icons';
import styles from './Properties.module.css';
import { PropertyRow } from './PropertyRow';

interface DatePropertyProps {
    value?: string;
    onChange: (val: string) => void;
    onHide: () => void;
}

export function DateProperty({ value, onChange, onHide }: DatePropertyProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'Empty';
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: new Date().getFullYear() !== new Date(dateStr).getFullYear() ? 'numeric' : undefined
        });
    };

    return (
        <PropertyRow icon={Calendar} label="Due Date" onHide={onHide}>
            <div
                className={styles.interactiveValue}
                onClick={() => inputRef.current?.showPicker()}
                style={{ position: 'relative' }}
            >
                <span className={!value ? styles.placeholder : ''}>
                    {value ? formatDate(value) : 'Empty'}
                </span>

                <input
                    ref={inputRef}
                    type="date"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        cursor: 'pointer'
                    }}
                />
            </div>
        </PropertyRow>
    );
}
