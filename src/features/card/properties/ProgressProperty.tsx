import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { PropertyRow } from './PropertyRow';

interface ProgressPropertyProps {
    value?: number;
    onChange: (val: number) => void;
    onHide: () => void;
}

export function ProgressProperty({ value = 0, onChange, onHide }: ProgressPropertyProps) {
    const [localValue, setLocalValue] = useState(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseInt(e.target.value, 10);
        setLocalValue(newValue);
    };

    const handleCommit = () => {
        onChange(localValue);
    };

    // Color based on progress
    const getProgressColor = (progress: number) => {
        if (progress >= 100) return '#22c55e';
        if (progress >= 75) return '#84cc16';
        if (progress >= 50) return '#eab308';
        if (progress >= 25) return '#f97316';
        return 'var(--text-faint)';
    };

    const color = getProgressColor(localValue);

    return (
        <PropertyRow icon={BarChart3} label="Progress" onHide={onHide}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <div
                    style={{
                        flex: 1,
                        height: 6,
                        background: 'rgba(0,0,0,0.1)',
                        borderRadius: 3,
                        overflow: 'hidden',
                        maxWidth: 120
                    }}
                >
                    <div
                        style={{
                            width: `${localValue}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                            borderRadius: 3,
                            transition: 'width 0.2s ease, background 0.2s ease'
                        }}
                    />
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={localValue}
                    onChange={handleChange}
                    onMouseUp={handleCommit}
                    onTouchEnd={handleCommit}
                    style={{
                        flex: 1,
                        maxWidth: 100,
                        accentColor: color,
                        cursor: 'pointer'
                    }}
                />
                <span
                    style={{
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color,
                        minWidth: 40,
                        textAlign: 'right'
                    }}
                >
                    {localValue}%
                </span>
            </div>
        </PropertyRow>
    );
}
