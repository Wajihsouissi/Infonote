import { Cloud, HardDrive } from 'lucide-react';
import styles from '../Website4TestPage.module.css';

/* Mode names match the app's own storage choice. These cards only explain:
   nothing here changes a setting. */
const MODES = [
  {
    icon: HardDrive,
    name: 'This device',
    body: 'Your work is saved in this browser. No account needed.',
    points: ['Works without signing in', 'Stays on this device'],
  },
  {
    icon: Cloud,
    name: 'This device + cloud',
    body: 'The same local save, plus a cloud copy once you sign in.',
    points: ['Needs an account', 'Follows you to other devices'],
  },
] as const;

export function StorageExplainer() {
  return (
    <div className={styles.storage}>
      <ul className={styles.storageModes}>
        {MODES.map(mode => (
          <li key={mode.name} className={styles.storageMode}>
            <mode.icon size={22} strokeWidth={1.6} aria-hidden="true" />
            <h3>{mode.name}</h3>
            <p>{mode.body}</p>
            <ul>{mode.points.map(point => <li key={point}>{point}</li>)}</ul>
          </li>
        ))}
      </ul>
      <p className={styles.storageNote}>
        Browser-only work stays on this device and can be lost if browser data is cleared.
      </p>
    </div>
  );
}
