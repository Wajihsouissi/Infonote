import { useState } from 'react';
import { LayoutGrid, User, Loader2, ArrowLeft } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import styles from './HomeButton.module.css';

export function HomeButton() {
    const setCurrentView = useStore(s => s.setCurrentView);
    const isAuthenticated = useStore(s => s.auth.isAuthenticated);
    const isAuthLoading = useStore(s => s.auth.isAuthLoading);
    const [isHovered, setIsHovered] = useState(false);

    const label = 'Back to Landing Page';

    if (isAuthenticated) {
        return (
            <button
                type="button"
                className={`${styles.homeButton} ${styles.authed}`}
                onClick={() => setCurrentView('landing')}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                aria-label={label}
                title={label}
            >
                <div className={styles.iconWrapper}>
                    {isAuthLoading ? (
                        // A loading spinner is functional feedback, not
                        // iconography — kept as a plain single-weight glyph.
                        <Loader2 size={18} className="animate-spin" />
                    ) : isHovered ? (
                        <DuotoneIcon icon={ArrowLeft} size={18} />
                    ) : (
                        <DuotoneIcon icon={User} size={18} />
                    )}
                </div>
                <span className={styles.dot} aria-hidden="true" />
            </button>
        );
    }

    return (
        <button 
            className={styles.homeButton}
            onClick={() => setCurrentView('landing')}
            title={label}
            aria-label={label}
        >
            <DuotoneIcon icon={LayoutGrid} size={18} />
        </button>
    );
}
