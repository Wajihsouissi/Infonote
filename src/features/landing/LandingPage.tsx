import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ProfileMenu } from '../auth/ProfileMenu';
import { useSiteTelemetry } from '../admin/hooks/useSiteTelemetry';
import { useRecentlyViewed, useGlobalSearch } from './hooks/useDashboardData';
import {
  Layout,
  ShoppingBag,
  LogIn,
  Search,
  Settings,
  Clock,
  Star,
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  Command,
  Grid3X3,
  Zap,
  BookOpen
} from 'lucide-react';
import styles from './LandingPage.module.css';

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);

  // Log a site visit row for admin analytics (deduped per browser session).
  useSiteTelemetry();

  const activeWorkspaceId = typeof window !== 'undefined'
    ? localStorage.getItem('chnk it.activeWorkspaceId') || undefined
    : undefined;

  const { recentNotes } = useRecentlyViewed(activeWorkspaceId);
  const { search, results, isSearching } = useGlobalSearch(activeWorkspaceId);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => search(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  return (
    <div className={styles.container}>

      <div className={styles.orbPrimary} />
      <div className={styles.orbSecondary} />
      <div className={styles.orbAccent} />

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
              width: p.size, height: p.size,
              top: p.top, left: p.left, opacity: p.opacity,
              '--dur': p.dur, '--delay': p.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {isMobileMenuOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 28}} />
            <span>Chnk it</span>
          </div>
          <button
            className={styles.drawerCloseButton}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.sidebarSearch}>
          <Search size={14} />
          <input type="text" placeholder="Search..." />
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <button
              className={`${styles.navItem} ${currentView === 'canvas' ? styles.active : ''}`}
              onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
            >
              <Layout size={18} />
              <span>Canvas</span>
            </button>
            <button
              className={`${styles.navItem} ${currentView === 'marketplace' ? styles.active : ''}`}
              onClick={() => { setCurrentView('marketplace'); setIsMobileMenuOpen(false); }}
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
                  onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
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
          <button className={styles.settingsButton} onClick={() => { setCurrentView('profile'); setIsMobileMenuOpen(false); }}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topBar}>
          <div className={styles.topBarDecor} />

          <div className={styles.mobileHeaderLeft}>
            <button
              className={styles.hamburgerButton}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className={styles.mobileLogo} onClick={() => setCurrentView('landing')}>
              <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 22}} />
              <span>Chnk it</span>
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
              <ProfileMenu onOpenCanvas={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }} />
            ) : (
              <>
                <button className={styles.loginButton} onClick={() => { setCurrentView('login'); setIsMobileMenuOpen(false); }}>
                  <LogIn size={15} />
                  <span>Log in</span>
                </button>
                <button className={styles.signupButton} onClick={() => { setCurrentView('signup'); setIsMobileMenuOpen(false); }}>
                  <span>Sign up free</span>
                </button>
              </>
            )}
          </div>
        </header>

        <main className={styles.content}>
          {/* Hero Section */}
          <section className={styles.heroSection}>
            <div className={styles.heroBadge}>
              <Zap size={12} />
              <span>v2.0 — Now with AI-powered canvases</span>
            </div>
            <h1 className={styles.heroTitle}>
              Your ideas
              <br />
              <span className={styles.heroGradient}>have a new home.</span>
            </h1>
            <p className={styles.heroSubtitle}>
              A spatial canvas for thinking, creating, and organizing.
              Drop in notes, images, PDFs — watch your ideas connect.
            </p>
            <div className={styles.heroActions}>
              <button
                className={styles.primaryButton}
                onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
              >
                <Layout size={18} />
                <span>Open Canvas</span>
                <ArrowRight size={16} className={styles.btnArrow} />
              </button>
              <button className={styles.ghostButton}>
                <BookOpen size={16} />
                <span>Quick Tour</span>
              </button>
            </div>
          </section>

          {/* Quick Start Cards */}
          {recentNotes.length === 0 && (
            <section className={styles.quickStartSection}>
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelDot} />
                Get started
              </div>
              <div className={styles.cardGrid}>
                <button
                  className={styles.actionCard}
                  onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
                >
                  <div className={styles.cardIcon} data-accent="primary">
                    <Layout size={22} />
                  </div>
                  <div className={styles.cardBody}>
                    <h3>Start a Canvas</h3>
                    <p>Open a blank spatial canvas and drop in your first idea.</p>
                  </div>
                  <ArrowRight size={16} className={styles.cardArrow} />
                </button>
                <button
                  className={styles.actionCard}
                  onClick={() => { setCurrentView('marketplace'); setIsMobileMenuOpen(false); }}
                >
                  <div className={styles.cardIcon} data-accent="secondary">
                    <ShoppingBag size={22} />
                  </div>
                  <div className={styles.cardBody}>
                    <h3>Browse Marketplace</h3>
                    <p>Discover templates, plugins, and community canvases.</p>
                  </div>
                  <ArrowRight size={16} className={styles.cardArrow} />
                </button>
                <button
                  className={styles.actionCard}
                  onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
                >
                  <div className={styles.cardIcon} data-accent="amber">
                    <Grid3X3 size={22} />
                  </div>
                  <div className={styles.cardBody}>
                    <h3>Import Your Work</h3>
                    <p>Drag in Markdown, images, or PDFs to populate your canvas.</p>
                  </div>
                  <ArrowRight size={16} className={styles.cardArrow} />
                </button>
              </div>
            </section>
          )}

          {/* Recent Notes Grid */}
          {recentNotes.length > 0 && (
            <section className={styles.recentSection}>
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelDot} />
                Continue where you left off
              </div>
              <div className={styles.noteGrid}>
                {recentNotes.slice(0, 6).map((note, i) => (
                  <button
                    key={note.id}
                    className={styles.noteCard}
                    onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <div className={styles.noteCardDot} />
                    <span className={styles.noteCardTitle}>{note.node_title}</span>
                    <Clock size={12} className={styles.noteCardTime} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Keyboard Shortcuts Hint */}
          <footer className={styles.shortcutsFooter}>
            <div className={styles.shortcut}>
              <kbd className={styles.kbd}><Command size={12} /></kbd>
              <kbd className={styles.kbd}>K</kbd>
              <span>Search</span>
            </div>
            <div className={styles.shortcut}>
              <kbd className={styles.kbd}>⌘</kbd>
              <kbd className={styles.kbd}>B</kbd>
              <span>Toggle sidebar</span>
            </div>
            <div className={styles.shortcut}>
              <kbd className={styles.kbd}>?</kbd>
              <span>View shortcuts</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};
