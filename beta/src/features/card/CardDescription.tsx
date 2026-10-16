import { useLayoutEffect, useRef } from 'react';
import styles from './CardDescription.module.css';

interface CardDescriptionProps {
    value: string;
    onChange: (value: string) => void;
    onCommit: () => void;
    readOnly?: boolean;
}

/**
 * The line under a card's title.
 *
 * It is a textarea that grows with its text rather than an input, because a
 * description is a sentence or two and a one-line box that scrolls sideways
 * hides half of what was written. With nothing in it and nothing hovering, it
 * is invisible: an empty grey line under every title on the board would be
 * noise on a canvas of forty cards.
 */
export function CardDescription({ value, onChange, onCommit, readOnly }: CardDescriptionProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // Height follows the text. Measured after every change, because the width
    // this sits in changes with the card.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    if (readOnly) {
        return value ? <p className={styles.readOnly}>{value}</p> : null;
    }

    return (
        <textarea
            ref={ref}
            className={`${styles.description} nodrag`}
            value={value}
            rows={1}
            placeholder="Add a description…"
            aria-label="Card description"
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            /* The card and the canvas both listen for these; inside a text
               field they mean "I am typing", not "drag me" or "select me". */
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation();
                // Enter ends the description rather than growing it: this is a
                // line about the card, and the body below is where prose goes.
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
                if (e.key === 'Escape') e.currentTarget.blur();
            }}
            onWheelCapture={(e) => e.stopPropagation()}
        />
    );
}
