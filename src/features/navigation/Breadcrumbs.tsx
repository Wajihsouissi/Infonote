import { ChevronRight, Home } from '../../components/icons';
import { useStore } from '../../store/useStore';
import styles from './Breadcrumbs.module.css';

export function Breadcrumbs() {
    const breadcrumbs = useStore(s => s.breadcrumbs);
    const navigateToNode = useStore(s => s.navigateToNode);

    return (
        <div className={styles.container}>

            {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                    <div key={crumb.id || 'root'} className={styles.item}>
                        {index > 0 && <ChevronRight size={14} className={styles.separator} />}

                        <button
                            className={`${styles.crumb} ${isLast ? styles.active : ''}`}
                            onClick={() => !isLast && navigateToNode(crumb.id)}
                            disabled={isLast}
                            aria-label={index === 0 ? 'Canvas home' : crumb.label}
                        >
                            {index === 0 ? (
                                <>
                                    <Home size={14} />
                                    <span className={styles.rootLabel}>Canvas</span>
                                </>
                            ) : (
                                <>
                                    <span className={styles.label}>{crumb.label}</span>
                                    <span className={styles.levelBadge}>{index + 1}</span>
                                </>
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
