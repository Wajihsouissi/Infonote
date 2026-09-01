/**
 * How far through its tasks a card is.
 *
 * Two shapes of the same fact, because the two places it appears have very
 * different room. A board card has a lane's width and gets the bar; a calendar
 * chip is about 190px in a month cell and gets the count alone. Both are
 * buttons: the whole point is that the number is the way into the list.
 */

import { memo } from 'react';
import { CheckSquare } from '../../../components/icons';

import type { TaskProgress as Progress } from '../cardTasks';
import styles from './CardTasks.module.css';

export interface TaskProgressProps {
    progress: Progress;
    /** 'bar' for a card, 'badge' for a calendar chip. */
    variant?: 'bar' | 'badge';
    /** Opens the card's task list. Omitted where there is nothing to open into. */
    onOpen?: () => void;
}

export const TaskProgressMeter = memo(({ progress, variant = 'bar', onOpen }: TaskProgressProps) => {
    if (progress.total === 0) return null;

    const label = `${progress.done} of ${progress.total} tasks done`;
    const complete = progress.done === progress.total;

    if (variant === 'badge') {
        return (
            <button
                type="button"
                className={`${styles.badge} nodrag`}
                data-complete={complete || undefined}
                title={label}
                aria-label={label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                }}
            >
                <CheckSquare size={10} strokeWidth={2.5} />
                {progress.done}/{progress.total}
            </button>
        );
    }

    return (
        <button
            type="button"
            className={`${styles.meter} nodrag`}
            data-complete={complete || undefined}
            title={`${label} — open the task list`}
            aria-label={`${label}. Open the task list`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                onOpen?.();
            }}
        >
            <span className={styles.meterTrack}>
                <span className={styles.meterFill} style={{ width: `${progress.percent ?? 0}%` }} />
            </span>
            <span className={styles.meterValue}>
                {progress.done}/{progress.total}
            </span>
        </button>
    );
});

TaskProgressMeter.displayName = 'TaskProgressMeter';
