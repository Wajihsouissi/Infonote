import { LayoutGrid } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './HomeButton.module.css';

export function HomeButton() {
    const setCurrentView = useStore(s => s.setCurrentView);

    return (
        <button 
            className={styles.homeButton}
            onClick={() => setCurrentView('landing')}
            title="Back to Landing Page"
            aria-label="Back to Landing Page"
        >
            <LayoutGrid size={18} />
        </button>
    );
}
