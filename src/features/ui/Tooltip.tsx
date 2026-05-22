import { type ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
    children: ReactNode;
    label: string;
    desc?: string;
}

export function Tooltip({ children, label, desc }: TooltipProps) {
    return (
        <div className={styles.wrapper}>
            {children}
            <div className={styles.tooltip}>
                <div className={styles.label}>{label}</div>
                {desc && <div className={styles.desc}>{desc}</div>}
            </div>
        </div>
    );
}
