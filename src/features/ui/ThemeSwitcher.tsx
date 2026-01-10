import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './ThemeSwitcher.module.css';

export function ThemeSwitcher() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('infonote-theme');
        return (saved as 'light' | 'dark') || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('infonote-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <button
            className={styles.themeSwitcher}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            <div className={styles.iconWrapper}>
                {theme === 'dark' ? (
                    <Sun className={styles.icon} size={18} />
                ) : (
                    <Moon className={styles.icon} size={18} />
                )}
            </div>
        </button>
    );
}
