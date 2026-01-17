import { ChevronRight, Home } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HistoryControls } from '../ui/HistoryControls';
import styles from './Breadcrumbs.module.css';

export function Breadcrumbs() {
    const breadcrumbs = useStore(s => s.breadcrumbs);
    const navigateToNode = useStore(s => s.navigateToNode);

    return (
        <div className={styles.container}>
            <div className={styles.controlsWrapper}>
                <HistoryControls />
            </div>
            <div className={styles.divider} />

            {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                    <div key={crumb.id || 'root'} className={styles.item}>
                        {index > 0 && <ChevronRight size={14} className={styles.separator} />}

                        <button
                            className={`${styles.crumb} ${isLast ? styles.active : ''}`}
                            onClick={() => !isLast && navigateToNode(crumb.id)}
                            disabled={isLast}
                        >
                            {index === 0 ? <Home size={14} /> : crumb.label}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
