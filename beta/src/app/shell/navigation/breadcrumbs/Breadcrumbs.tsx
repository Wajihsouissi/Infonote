import { ChevronRight, Home } from '../../../../shared/icons';
import { useStore } from '../../../../store/useStore';
import styles from './Breadcrumbs.module.css';

export function Breadcrumbs() {
    const breadcrumbs = useStore(s => s.breadcrumbs);
    const navigateToNode = useStore(s => s.navigateToNode);

    return (
        <ol className={styles.container}>
            {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                    <li key={crumb.id || 'root'} className={styles.item}>
                        {index > 0 && <ChevronRight size={12} className={styles.separator} aria-hidden="true" />}

                        <button
                            type="button"
                            className={`${styles.crumb} ${isLast ? styles.current : ''}`}
                            onClick={() => !isLast && navigateToNode(crumb.id)}
                            disabled={isLast}
                            aria-label={index === 0 ? 'Canvas home' : crumb.label}
                            aria-current={isLast ? 'page' : undefined}
                            title={index === 0 ? 'Canvas' : crumb.label}
                        >
                            {index === 0 ? (
                                <>
                                    <Home size={12} aria-hidden="true" />
                                    <span className={styles.rootLabel}>Canvas</span>
                                </>
                            ) : (
                                <>
                                    <span className={styles.label}>{crumb.label}</span>
                                    <span className={styles.levelBadge} aria-hidden="true">{index + 1}</span>
                                </>
                            )}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}
