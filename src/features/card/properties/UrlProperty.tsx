
import { useState } from 'react';
import { Link2 } from 'lucide-react';
import styles from './Properties.module.css';
import { PropertyRow } from './PropertyRow';

interface UrlPropertyProps {
    value?: string;
    onChange: (val: string) => void;
    onHide: () => void;
}

export function UrlProperty({ value, onChange, onHide }: UrlPropertyProps) {
    const [isEditing, setIsEditing] = useState(false);

    const handleClick = () => {
        if (!value) setIsEditing(true);
    };

    return (
        <PropertyRow icon={Link2} label="URL" onHide={onHide}>
            <div className={styles.interactiveValue} onClick={handleClick}>
                {isEditing ? (
                    <input
                        autoFocus
                        className={styles.plainInput}
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={() => setIsEditing(false)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') setIsEditing(false);
                        }}
                        placeholder="https://example.com"
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none', color: 'inherit' }}
                    />
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                        {value ? (
                            <>
                                <a
                                    href={value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className={styles.linkText}
                                    style={{ textDecoration: 'underline', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}
                                >
                                    {value}
                                </a>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                                    style={{ background: 'none', border: 'none', opacity: 0.5, cursor: 'pointer', padding: 0 }}
                                >
                                    <span style={{ fontSize: '10px' }}>Edit</span>
                                </button>
                            </>
                        ) : (
                            <span className={styles.placeholder}>Empty</span>
                        )}
                    </div>
                )}
            </div>
        </PropertyRow>
    );
}
