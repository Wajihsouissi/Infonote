import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ProfileMenu } from '../auth/ProfileMenu';
import { useSiteTelemetry } from '../admin/hooks/useSiteTelemetry';
import { useRecentlyViewed, useGlobalSearch } from './hooks/useDashboardData';
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
  Moon,
  Menu,
  X
} from 'lucide-react';
import styles from './LandingPage.module.css';

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Read auth straight from the global store so the header reacts the
  // instant Supabase fires onAuthStateChange (login, logout, refresh).
  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);

  // Log a site visit row for admin analytics (deduped per browser session).
  useSiteTelemetry();
  
  // Try to grab the last active workspace ID from local storage
  const activeWorkspaceId = typeof window !== 'undefined' 
    ? localStorage.getItem('infonote.activeWorkspaceId') || undefined 
    : undefined;

  const { recentNotes } = useRecentlyViewed(activeWorkspaceId);
  const { search, results, isSearching } = useGlobalSearch(activeWorkspaceId);
  const [searchQuery, setSearchQuery] = useState('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  return (
    <div className={styles.container}>

      {/* ── Decorative ambient layer ── */}
      <div className={styles.orbPrimary} />
      <div className={styles.orbSecondary} />
      <div className={styles.orbAccent} />

      {/* Floating micro-particles */}
      <div className={styles.particles} aria-hidden="true">
        {([
          { size: 3, top: '12%', left: '18%', dur: '7s', delay: '0s', opacity: 0.45 },
          { size: 2, top: '34%', left: '8%', dur: '9s', delay: '1.2s', opacity: 0.3 },
          { size: 4, top: '58%', left: '22%', dur: '6s', delay: '2.5s', opacity: 0.4 },
          { size: 2, top: '78%', left: '12%', dur: '11s', delay: '0.8s', opacity: 0.25 },
          { size: 3, top: '20%', left: '72%', dur: '8s', delay: '3.1s', opacity: 0.35 },
          { size: 2, top: '45%', left: '88%', dur: '10s', delay: '1.7s', opacity: 0.3 },
          { size: 3, top: '70%', left: '65%', dur: '7s', delay: '4.2s', opacity: 0.4 },
          { size: 2, top: '88%', left: '80%', dur: '12s', delay: '2s', opacity: 0.2 },
        ] as const).map((p, i) => (
          <div
            key={i}
            className={styles.particle}
            style={{
              width: p.size,
              height: p.size,
              top: p.top,
              left: p.left,
              opacity: p.opacity,
              '--dur': p.dur,
              '--delay': p.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Mobile drawer overlay */}
      {isMobileMenuOpen && (
        <div 
          className={styles.drawerOverlay} 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}

      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <Rocket className={styles.logoIcon} />
            <span>Infonote</span>
          </div>
          <button 
            className={styles.drawerCloseButton}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mobile Search - only visible on mobile inside drawer */}
        <div className={styles.sidebarSearch}>
          <Search size={14} />
          <input type="text" placeholder="Search..." />
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <button
              className={`${styles.navItem} ${currentView === 'canvas' ? styles.active : ''}`}
              onClick={() => {
                setCurrentView('canvas');
                setIsMobileMenuOpen(false);
              }}
            >
              <Layout size={18} />
              <span>Canvas</span>
            </button>
            <button
              className={`${styles.navItem} ${currentView === 'marketplace' ? styles.active : ''}`}
              onClick={() => {
                setCurrentView('marketplace');
                setIsMobileMenuOpen(false);
              }}
            >
              <ShoppingBag size={18} />
              <span>Marketplace</span>
            </button>
          </div>

          <div className={styles.navDivider} />

          <div className={styles.navGroup}>
            <div className={styles.navLabel}>Recently viewed</div>
            {recentNotes.length === 0 ? (
              <div style={{ padding: '4px 12px', fontSize: '12px', opacity: 0.5 }}>No recent notes</div>
            ) : (
              recentNotes.map((note) => (
                <button 
                  key={note.id} 
                  className={styles.navItemSecondary} 
                  onClick={() => {
                    setCurrentView('canvas');
                    setIsMobileMenuOpen(false);
                  }}
                >
                  <Clock size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.node_title}</span>
                </button>
              ))
            )}
          </div>

          <div className={styles.navDivider} />

          <div className={styles.navGroup}>
            <div className={styles.navLabel}>Favorites</div>
            <button className={styles.navItemSecondary} onClick={() => setIsMobileMenuOpen(false)}>
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
          <button className={styles.settingsButton} onClick={() => setIsMobileMenuOpen(false)}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainArea}>
        <header className={styles.topBar}>
          <div className={styles.topBarDecor} />
          
          {/* Mobile Menu Toggle & Logo */}
          <div className={styles.mobileHeaderLeft}>
            <button 
              className={styles.hamburgerButton} 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className={styles.mobileLogo} onClick={() => setCurrentView('landing')}>
              <Rocket className={styles.logoIcon} size={18} />
              <span>Infonote</span>
            </div>
          </div>

          <div className={styles.searchSection} style={{ position: 'relative' }}>
            <div className={styles.searchBar}>
              <Search size={16} />
              <input 
                type="text" 
                placeholder="Search notes and content..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--glass-bg, #ffffff)', border: '1px solid var(--color-border)', borderRadius: '8px', marginTop: '8px', padding: '8px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {isSearching ? (
                  <div style={{ padding: '8px', fontSize: '13px', opacity: 0.7 }}>Searching...</div>
                ) : results.length > 0 ? (
                  results.map((res) => (
                    <div key={res.node_id} style={{ padding: '8px', cursor: 'pointer', borderRadius: '4px' }} onClick={() => setCurrentView('canvas')}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{res.node_title}</div>
                      <div style={{ fontSize: '11px', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.content_snippet}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '8px', fontSize: '13px', opacity: 0.7 }}>No results found</div>
                )}
              </div>
            )}
          </div>

          <div className={styles.userSection}>
            {isAuthenticated ? (
              <ProfileMenu onOpenCanvas={() => {
                setCurrentView('canvas');
                setIsMobileMenuOpen(false);
              }} />
            ) : (
              <>
                <button className={styles.loginButton} onClick={() => {
                  setCurrentView('login');
                  setIsMobileMenuOpen(false);
                }}>
                  <LogIn size={15} />
                  <span>Log in</span>
                </button>
                <button className={styles.signupButton} onClick={() => {
                  setCurrentView('signup');
                  setIsMobileMenuOpen(false);
                }}>
                  <span>Sign up free</span>
                </button>
              </>
            )}
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
              onClick={() => {
                setCurrentView('canvas');
                setIsMobileMenuOpen(false);
              }}
            >
              <Layout size={18} />
              <span>Open Canvas</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};
