import React from 'react';
import { useStore } from '../../store/useStore';
import {
  Layout,
  ShoppingBag,
  LogIn,
  Plus,
  Search,
  Settings,
  Clock,
  Star,
  MoreHorizontal,
  Rocket,
  Sun,
  Moon
} from 'lucide-react';
import styles from './LandingPage.module.css';

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <Rocket className={styles.logoIcon} />
            <span>Infonote</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <button
              className={`${styles.navItem} ${currentView === 'canvas' ? styles.active : ''}`}
              onClick={() => setCurrentView('canvas')}
            >
              <Layout size={18} />
              <span>Canvas</span>
            </button>
            <button
              className={`${styles.navItem} ${currentView === 'marketplace' ? styles.active : ''}`}
              onClick={() => setCurrentView('marketplace')}
            >
              <ShoppingBag size={18} />
              <span>Marketplace</span>
            </button>
          </div>

          <div className={styles.navDivider} />

          <div className={styles.navGroup}>
            <div className={styles.navLabel}>Recently viewed</div>
            <button className={styles.navItemSecondary}>
              <Clock size={16} />
              <span>Project Roadmap</span>
            </button>
            <button className={styles.navItemSecondary}>
              <Clock size={16} />
              <span>Meeting Notes</span>
            </button>
          </div>

          <div className={styles.navDivider} />

          <div className={styles.navGroup}>
            <div className={styles.navLabel}>Favorites</div>
            <button className={styles.navItemSecondary}>
              <Star size={16} />
              <span>Personal Brain</span>
            </button>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.settingsButton} onClick={toggleTheme}>
            <div className={styles.pillSwitch}>
              <div className={`${styles.pillThumb} ${theme === 'light' ? styles.thumbLight : styles.thumbDark}`} />
              <Moon size={12} className={`${styles.pillIcon} ${theme === 'dark' ? styles.iconActive : styles.iconInactive}`} />
              <Sun size={12} className={`${styles.pillIcon} ${theme === 'light' ? styles.iconActive : styles.iconInactive}`} />
            </div>
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          <button className={styles.settingsButton}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainArea}>
        <header className={styles.topBar}>
          <div className={styles.searchSection}>
            <div className={styles.searchBar}>
              <Search size={16} />
              <input type="text" placeholder="Search files, teams, and more..." />
            </div>
          </div>

          <div className={styles.userSection}>
            <button className={styles.loginButton} onClick={() => setCurrentView('login')}>
              <LogIn size={15} />
              <span>Log in</span>
            </button>
            <button className={styles.signupButton} onClick={() => setCurrentView('signup')}>
              <span>Sign up free</span>
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <h1>Home</h1>
            <div className={styles.contentActions}>
              <button className={styles.viewToggle}>
                <Layout size={16} />
              </button>
              <button className={styles.moreButton}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>

          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration}>
              <Plus size={48} />
            </div>
            <h2>No files yet</h2>
            <p>Create a new canvas or browse the marketplace to get started.</p>
            <button
              className={styles.primaryButton}
              onClick={() => setCurrentView('canvas')}
            >
              < Layout size={18} />
              <span>Open Canvas</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};
