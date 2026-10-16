import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
    children: ReactNode;
    label: string;
    desc?: string;
}

type TriggerProps = { 'aria-label'?: string; 'aria-describedby'?: string };

/**
 * Hover label for an icon button. The bubble is visual only, so the trigger
 * also gets the words: `label` becomes its accessible name (unless it already
 * has one) and `desc` its description.
 */
export function Tooltip({ children, label, desc }: TooltipProps) {
    const descId = useId();
    const trigger = isValidElement<TriggerProps>(children)
        ? cloneElement(children, {
            'aria-label': children.props['aria-label'] ?? label,
            'aria-describedby': desc ? descId : children.props['aria-describedby'],
        })
        : children;

    return (
        <div className={styles.wrapper}>
            {trigger}
            <div className={styles.tooltip} aria-hidden="true">
                <div className={styles.label}>{label}</div>
                {desc && <div id={descId} className={styles.desc}>{desc}</div>}
            </div>
        </div>
    );
}
