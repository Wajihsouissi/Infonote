import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../auth/useAuth';
import { useSiteTelemetry } from '../admin/hooks/useSiteTelemetry';
import { useRecentlyViewed, useGlobalSearch } from './hooks/useDashboardData';
import {
  Layout,
  ShoppingBag,
  LogIn,
  LogOut,
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
  BookOpen,
  Lightbulb,
  FileText,
  Play,
  ChevronRight
} from 'lucide-react';
import styles from './LandingPage.module.css';

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const navigateToNode = useStore((state) => state.navigateToNode);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const isAuthenticated = useStore((state) => state.auth.isAuthenticated);
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const handleSignOut = React.useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      window.history.replaceState({}, '', '/');
      setCurrentView('landing');
      setIsSigningOut(false);
    }
  }, [isSigningOut, signOut, setCurrentView]);

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
              <button
                className={styles.logoutButton}
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-label="Log out"
                style={{ opacity: isSigningOut ? 0.5 : 1 }}
              >
                <LogOut size={20} />
              </button>
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

          {/* Educational / Guided Hub Content */}
          <div className={styles.hubGrid}>
            {/* Left Column: Tutorials & Templates */}
            <div className={styles.hubMain}>
              
              {/* Mini-Tutorials */}
              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <h2>Learn the Basics</h2>
                  <button className={styles.textButton}>View all</button>
                </div>
                <div className={styles.tutorialGrid}>
                  {[
                    { title: "Connecting Nodes", duration: "1:20", color: "blue" },
                    { title: "Using AI to Organize", duration: "2:45", color: "purple" },
                    { title: "Spatial Workflows", duration: "3:10", color: "amber" }
                  ].map((tutorial, idx) => (
                    <div key={idx} className={styles.tutorialCard}>
                      <div className={styles.videoPlaceholder} data-color={tutorial.color}>
                        <Play size={24} className={styles.playIcon} />
                        <span className={styles.duration}>{tutorial.duration}</span>
                      </div>
                      <h3>{tutorial.title}</h3>
                    </div>
                  ))}
                </div>
              </section>

              {/* Inspiration Blueprints */}
              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <h2>Inspiration Blueprints</h2>
                  <p>Start with a structure designed for your workflow.</p>
                </div>
                <div className={styles.templateGrid}>
                  {[
                    { title: "Brainstorming", icon: <Zap size={20} />, color: "primary" },
                    { title: "Weekly Planner", icon: <Layout size={20} />, color: "secondary" },
                    { title: "Research Hub", icon: <BookOpen size={20} />, color: "amber" }
                  ].map((template, idx) => (
                    <button 
                      key={idx} 
                      className={styles.templateCard}
                      onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
                    >
                      <div className={styles.templateIcon} data-color={template.color}>
                        {template.icon}
                      </div>
                      <div className={styles.templateInfo}>
                        <h3>{template.title}</h3>
                        <p>1 click to inject</p>
                      </div>
                      <ChevronRight size={16} className={styles.templateArrow} />
                    </button>
                  ))}
                </div>
              </section>

            </div>

            {/* Right Column: Global Activity */}
            <div className={styles.hubSidebar}>
              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <h2>Recent Activity</h2>
                </div>
                <div className={styles.activityFeed}>
                  {recentNotes.length === 0 ? (
                    <div className={styles.emptyActivity}>
                      <Clock size={24} className={styles.emptyActivityIcon} />
                      <p>No recent activity.</p>
                    </div>
                  ) : (
                    recentNotes.map((note, i) => (
                      <div 
                        key={note.id} 
                        className={styles.noteCard} 
                        onClick={() => { 
                          setCurrentView('canvas'); 
                          navigateToNode(note.node_id || note.id);
                          setIsMobileMenuOpen(false); 
                        }}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <div className={styles.noteCardDot} />
                        <div className={styles.noteCardTitle}>{note.node_title}</div>
                        <span className={styles.noteCardTime}>Recently</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

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
