import { AlertTriangle, Check, Cloud } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './SaveState.module.css';

/**
 * Whether this browser has your latest change.
 *
 * In an app with a server, a save indicator is reassurance. Here it is the
 * whole safety story: nothing leaves this device, so "saved" means "saved on
 * this machine" — which is exactly what the wording says, because a badge that
 * implies a cloud copy would be a lie told once a minute.
 */
export function SaveState() {
    const { isLocalDirty, localLastSaved, localError } = useStore((s) => s.storage);

    if (localError) {
        return (
            <span className={`${styles.chip} ${styles.error}`} role="status" title={localError}>
                <AlertTriangle size={13} />
                <span className={styles.label}>Not saved</span>
            </span>
        );
    }

    if (isLocalDirty || !localLastSaved) {
        return (
            <span className={styles.chip} role="status">
                <Cloud size={13} />
                <span className={styles.label}>Saving…</span>
            </span>
        );
    }

    const at = new Date(localLastSaved);
    const time = Number.isNaN(at.getTime())
        ? ''
        : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    return (
        <span className={styles.chip} role="status" title={time ? `Last saved at ${time}, in this browser` : undefined}>
            <Check size={13} />
            <span className={styles.label}>Saved on this device</span>
        </span>
    );
}
