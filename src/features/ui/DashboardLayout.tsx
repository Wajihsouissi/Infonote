import React from 'react';
import { useStore } from '../../store/useStore';
import { 
  Layout, 
  ShoppingBag, 
  LogOut, 
  LogIn, 
  Search, 
  Settings, 
  Clock, 
  Star, 
  Rocket,
  Sun,
  Moon
} from 'lucide-react';
import styles from './DashboardLayout.module.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title }) => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoSection}>
          <div className={styles.logo} onClick={() => setCurrentView('landing')}>
            <Rocket className={styles.logoIcon} />
            <span>Chnk it</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <button 
              className={`${styles.navItem} ${currentView === 'landing' ? styles.active : ''}`}
              onClick={() => setCurrentView('landing')}
            >
              <Layout size={18} />
              <span>Home</span>
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
          <div className={styles.themeToggleContainer} onClick={toggleTheme}>
            <div className={`${styles.themeToggleBg} ${theme === 'dark' ? styles.themeDark : styles.themeLight}`} />
            <div className={`${styles.themeOption} ${theme === 'light' ? styles.activeTheme : ''}`}>
              <Sun size={14} />
              <span>Light</span>
            </div>
            <div className={`${styles.themeOption} ${theme === 'dark' ? styles.activeTheme : ''}`}>
              <Moon size={14} />
              <span>Dark</span>
            </div>
          </div>

          <button className={styles.settingsButton}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className={styles.mainArea}>
        <header className={styles.topBar}>
          <div className={styles.searchSection}>
            <div className={styles.searchBar}>
              <Search size={16} />
              <input type="text" placeholder="Search files, teams, and more..." />
            </div>
          </div>

          <div className={styles.userSection}>
            <button className={styles.ghostButton}>
              <LogIn size={18} />
              <span>Login</span>
            </button>
            <button className={styles.logoutButton}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
            <div className={styles.avatar}>H</div>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.contentHeader}>
            <h1>{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};
