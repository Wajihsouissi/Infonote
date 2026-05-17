import { User, LogIn, Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './AuthButton.module.css';

/**
 * Round icon button anchored under the ThemeSwitcher (top-right of the canvas
 * workspace). Opens <AuthModal />. Shows a different icon when authenticated.
 */
export function AuthButton() {
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const isAuthLoading = useStore((s) => s.auth.isAuthLoading);
    const setAuthModalOpen = useStore((s) => s.setAuthModalOpen);

    const label = isAuthenticated ? 'Manage account' : 'Sign in or create an account';

    return (
        <button
            type="button"
            className={`${styles.authButton} ${isAuthenticated ? styles.authed : ''}`}
            onClick={() => setAuthModalOpen(true)}
            aria-label={label}
            title={label}
        >
            <div className={styles.iconWrapper}>
                {isAuthLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                ) : isAuthenticated ? (
                    <User size={18} />
                ) : (
                    <LogIn size={18} />
                )}
            </div>
            {isAuthenticated && <span className={styles.dot} aria-hidden="true" />}
        </button>
    );
}
