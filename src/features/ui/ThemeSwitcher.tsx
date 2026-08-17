import { Sun, Moon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DuotoneIcon } from '../../components/ui/DuotoneIcon';
import styles from './ThemeSwitcher.module.css';

export function ThemeSwitcher() {
    const theme = useStore(s => s.theme);
    const toggleTheme = useStore(s => s.toggleTheme);

    return (
        <button
            className={styles.themeSwitcher}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            data-tooltip={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            <div className={styles.iconWrapper}>
                {theme === 'dark' ? (
                    <DuotoneIcon icon={Sun} className={styles.icon} size={18} />
                ) : (
                    <DuotoneIcon icon={Moon} className={styles.icon} size={18} />
                )}
            </div>
        </button>
    );
}
