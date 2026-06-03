/**
 * ProfileMenu — authenticated user avatar + dropdown.
 * Rewritten for maximum robustness. Uses a transparent fixed overlay
 * to handle outside clicks securely.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { LogOut, User as UserIcon, Layout } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from './useAuth';
import styles from './ProfileMenu.module.css';

type ProfileMenuProps = {
    showGreeting?: boolean;
    onOpenCanvas?: () => void;
};

function deriveInitials(name: string | null, email: string | null): string {
    const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
    if (!source) return 'U';
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return source.slice(0, 1).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ showGreeting = true, onOpenCanvas }) => {
    const auth = useStore((s) => s.auth);
    const { signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    const displayLabel = useMemo(() => {
        return auth.displayName || auth.email || 'Account';
    }, [auth.displayName, auth.email]);

    const initials = useMemo(
        () => deriveInitials(auth.displayName, auth.email),
        [auth.displayName, auth.email]
    );

    const handleSignOut = useCallback(async () => {
        if (isSigningOut) return;
        setIsSigningOut(true);
        setOpen(false);
        try {
            await signOut();
        } finally {
            window.history.replaceState({}, '', '/');
            useStore.getState().setCurrentView('marketing');
            setIsSigningOut(false);
        }
    }, [isSigningOut, signOut]);

    const navigateTo = useCallback((path: string, view: 'profile' | 'canvas') => {
        setOpen(false);
        window.history.pushState({}, '', path);
        useStore.getState().setCurrentView(view);
    }, []);

    if (!auth.isAuthenticated) return null;

    return (
        <div className={styles.wrapper}>
            {showGreeting && (
                <span className={styles.greeting}>
                    Welcome back, {displayLabel}
                </span>
            )}
            <button
                type="button"
                className={styles.avatar}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open profile menu"
                onClick={() => setOpen((v) => !v)}
            >
                {initials}
            </button>

            {open && (
                <>
                    {/* Robust click-outside overlay */}
                    <div 
                        className={styles.overlay} 
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                        }} 
                        aria-hidden="true" 
                    />
                    
                    <div role="menu" className={styles.dropdown}>
                        <div className={styles.profileHeader}>
                            <span className={styles.profileName}>
                                {auth.displayName || 'Signed in'}
                            </span>
                            {auth.email && (
                                <span className={styles.profileEmail}>{auth.email}</span>
                            )}
                        </div>

                        <button
                            type="button"
                            role="menuitem"
                            className={styles.menuItem}
                            onClick={(e) => {
                                e.stopPropagation();
                                navigateTo('/profile', 'profile');
                            }}
                        >
                            <UserIcon size={15} />
                            <span>Profile</span>
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            className={styles.menuItem}
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                window.history.pushState({}, '', '/canvas');
                                if (onOpenCanvas) {
                                    onOpenCanvas();
                                } else {
                                    useStore.getState().setCurrentView('canvas');
                                }
                            }}
                        >
                            <Layout size={15} />
                            <span>Open Canvas</span>
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                            disabled={isSigningOut}
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleSignOut();
                            }}
                        >
                            <LogOut size={15} />
                            <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ProfileMenu;
