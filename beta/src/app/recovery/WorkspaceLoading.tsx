import { CrystalLoader } from '../../shared/ui/feedback/loading/CrystalLoader';
import styles from './RecoveryPage.module.css';

export function WorkspaceLoading({ error }: { error?: string | null }) {
    return <main className={styles.page}>
        <div className={styles.content}>
            {!error && <CrystalLoader />}
            <h1>{error ? 'Your workspace could not open' : 'Opening your workspace'}</h1>
            {error ? <p role="alert">{error}</p> : <p role="status">Loading your saved work. Large workspaces may take a moment.</p>}
            <a className={styles.link} href="/recovery">Open workspace recovery</a>
            <p className={styles.note}>Back up your saved work or reconnect its folder without opening the canvas.</p>
        </div>
    </main>;
}
