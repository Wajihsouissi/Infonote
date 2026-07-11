import React, { useState, useEffect } from 'react';
import { FEATURES } from '../../config/featureFlags';
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
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  Command,
  Zap,
  BookOpen,
  Play,
  ChevronRight,
  Sparkles,
  Infinity as InfinityIcon,
  Workflow,
  FileText,
  Image as ImageIcon,
  Link2,
  Check,
} from 'lucide-react';
import styles from './LandingPage.module.css';

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const navigateToNode = useStore((state) => state.navigateToNode);
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const auth = useStore((state) => state.auth);
  const isAuthenticated = auth.isAuthenticated;
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
            {FEATURES.marketplace && (
              <button
                className={`${styles.navItem} ${currentView === 'marketplace' ? styles.active : ''}`}
                onClick={() => { setCurrentView('marketplace'); setIsMobileMenuOpen(false); }}
              >
                <ShoppingBag size={18} />
                <span>Marketplace</span>
              </button>
            )}
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

          <div className={styles.userSection} style={{ display: 'flex', alignItems: 'center' }}>
            {isAuthenticated ? (
              <>
                <span style={{ marginRight: '16px', fontSize: '14px', fontWeight: 500, opacity: 0.9 }}>
                  Welcome, {auth.displayName || auth.email?.split('@')[0] || 'User'}
                </span>
                <button
                  className={styles.logoutButton}
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                aria-label="Log out"
                style={{ opacity: isSigningOut ? 0.5 : 1 }}
              >
                <LogOut size={20} />
              </button>
              </>
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
          {/* ── Hero: split copy + live canvas preview ── */}
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <div className={styles.heroBadge}>
                <Sparkles size={12} />
                <span>AI-native canvas · v2.0</span>
              </div>
              <h1 className={styles.heroTitle}>
                Think in <span className={styles.heroGradient}>space</span>,
                <br />
                not in stacks.
              </h1>
              <p className={styles.heroSubtitle}>
                Chnk it turns the blank page into an infinite canvas. Drop notes, images,
                PDFs and links anywhere — then let AI find the threads between them and
                shape the chaos into clarity.
              </p>
              <div className={styles.heroActions}>
                <button
                  className={styles.primaryButton}
                  onClick={() => { setCurrentView('canvas'); setIsMobileMenuOpen(false); }}
                >
                  <Layout size={18} />
                  <span>Open your canvas</span>
                  <ArrowRight size={16} className={styles.btnArrow} />
                </button>
                <button className={styles.ghostButton}>
                  <Play size={15} />
                  <span>Watch the 60s tour</span>
                </button>
              </div>
              <div className={styles.heroMeta}>
                <span className={styles.heroMetaItem}><Check size={13} /> No credit card</span>
                <span className={styles.heroMetaItem}><Check size={13} /> Free forever plan</span>
                <span className={styles.heroMetaItem}><Check size={13} /> Yours in 10 seconds</span>
              </div>
            </div>

            {/* Decorative "live canvas" — pure CSS/SVG, non-interactive */}
            <div className={styles.heroPreview} aria-hidden="true">
              <div className={styles.previewCanvas}>
                <div className={styles.previewToolbar}>
                  <span className={styles.previewDot} data-c="r" />
                  <span className={styles.previewDot} data-c="y" />
                  <span className={styles.previewDot} data-c="g" />
                  <span className={styles.previewToolbarLabel}>untitled canvas</span>
                </div>

                <svg className={styles.previewWires} viewBox="0 0 320 240" preserveAspectRatio="none">
                  <path d="M86 70 C 150 70, 150 150, 214 150" />
                  <path d="M86 70 C 120 130, 60 150, 96 196" />
                  <path d="M214 150 C 250 110, 200 70, 234 64" />
                </svg>

                <div className={`${styles.previewNode} ${styles.nodeA}`}>
                  <FileText size={13} />
                  <span>Research notes</span>
                </div>
                <div className={`${styles.previewNode} ${styles.nodeB}`}>
                  <ImageIcon size={13} />
                  <span>Moodboard.png</span>
                </div>
                <div className={`${styles.previewNode} ${styles.nodeC}`}>
                  <Link2 size={13} />
                  <span>Source link</span>
                </div>
                <div className={`${styles.previewNode} ${styles.nodeAi}`}>
                  <Sparkles size={13} />
                  <span>AI grouped 3 ideas</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Value props ── */}
          <section className={styles.features}>
            {[
              {
                icon: <InfinityIcon size={20} />,
                color: 'primary',
                title: 'An infinite canvas',
                copy: 'Pan, zoom and place anything anywhere. No folders, no margins — just room to think.',
              },
              {
                icon: <Sparkles size={20} />,
                color: 'secondary',
                title: 'AI that connects the dots',
                copy: 'Ask it to summarize, cluster or expand. Watch loose notes resolve into structure.',
              },
              {
                icon: <Workflow size={20} />,
                color: 'amber',
                title: 'Drop in anything',
                copy: 'Notes, images, PDFs and links become living nodes you can link and rearrange.',
              },
            ].map((f, idx) => (
              <div key={idx} className={styles.featureCard} style={{ '--i': idx } as React.CSSProperties}>
                <div className={styles.featureIcon} data-color={f.color}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.copy}</p>
              </div>
            ))}
          </section>

          {/* ── Guided hub: blueprints + recent activity ── */}
          <div className={styles.hubGrid}>
            <div className={styles.hubMain}>
              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>Start from a blueprint</h2>
                    <p>Skip the blank page — drop in a ready-made structure.</p>
                  </div>
                </div>
                <div className={styles.templateGrid}>
                  {[
                    { title: "Brainstorm", desc: "Diverge fast, cluster later", icon: <Zap size={20} />, color: "primary" },
                    { title: "Weekly planner", desc: "Map the week at a glance", icon: <Layout size={20} />, color: "secondary" },
                    { title: "Research hub", desc: "Sources, notes & synthesis", icon: <BookOpen size={20} />, color: "amber" }
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
                        <p>{template.desc}</p>
                      </div>
                      <ChevronRight size={16} className={styles.templateArrow} />
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>Learn the moves</h2>
                    <p>Two minutes to your first connected canvas.</p>
                  </div>
                  <button className={styles.textButton}>View all</button>
                </div>
                <div className={styles.tutorialGrid}>
                  {[
                    { title: "Connecting nodes", duration: "1:20", color: "blue" },
                    { title: "Organizing with AI", duration: "2:45", color: "purple" },
                    { title: "Spatial workflows", duration: "3:10", color: "amber" }
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
            </div>

            <div className={styles.hubSidebar}>
              <section className={styles.hubSection}>
                <div className={styles.sectionHeader}>
                  <div><h2>Jump back in</h2></div>
                </div>
                <div className={styles.activityFeed}>
                  {recentNotes.length === 0 ? (
                    <div className={styles.emptyActivity}>
                      <Clock size={24} className={styles.emptyActivityIcon} />
                      <p>Nothing here yet.</p>
                      <span>Your recent canvases will appear here.</span>
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

          {/* ── Shortcuts ── */}
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
