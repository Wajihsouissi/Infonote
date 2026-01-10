import styles from './SelectionPopover.module.css';

export function SelectionPopover({ x, y, onLink }: { x: number, y: number, onLink: () => void }) {
    return (
        <div
            className={styles.popover}
            style={{ top: y, left: x }}
            onMouseDown={(e) => { e.preventDefault(); onLink(); }}
        >
            Link to New Card
        </div>
    );
}
