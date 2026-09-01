import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FEATURES } from '../../config/featureFlags';
import { useStore } from '../../store/useStore';
import { useAuth } from '../auth/useAuth';
import { useSiteTelemetry } from '../admin/hooks/useSiteTelemetry';
import { useRecentlyViewed, useGlobalSearch } from './hooks/useDashboardData';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardList,
  Clock,
  FileText,
  Frame,
  Home,
  Image as ImageIcon,
  Link2,
  LogIn,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Search,
  Settings,
  ShoppingBag,
  Square,
  Sun,
  X,
  Zap,
} from '../../components/icons';
import type { LucideIcon } from '../../components/icons';
import styles from './LandingPage.module.css';
import { originFromEvent } from '../../utils/themeTransition';
import { Button } from '../../components/ui/Button';
import { Tabs, type TabItem } from '../../components/ui/Tabs';

const THEME_TABS: TabItem<'dark' | 'light'>[] = [
  { id: 'dark', label: 'Ink', icon: <Moon size={13} /> },
  { id: 'light', label: 'Paper', icon: <Sun size={13} /> },
];

const FEEDBACK_MAILTO =
  'mailto:wajih.souissi.ws@gmail.com?subject=chnk%20it%20beta%20%E2%80%94%20feedback';

const RAIL_COLLAPSED_KEY = 'chnk it.landingRailCollapsed';

/* ---------- static content ---------- */

const STARTERS: { name: string; desc: string; Icon: LucideIcon }[] = [
  {
    name: 'Clean sheet',
    desc: 'An empty canvas and a cursor. No structure until you ask for it.',
    Icon: Square,
  },
  {
    name: 'Brainstorm',
    desc: 'Scatter cards fast, judge nothing, connect the survivors later.',
    Icon: Zap,
  },
  {
    name: 'Research trail',
    desc: 'Collect sources and notes side by side, link the threads as you read.',
    Icon: BookOpen,
  },
];

const WORKS_TODAY = [
  'Infinite canvas — cards, connections, nesting',
  'Block editor with slash menu & markdown',
  'AI text generation (signed in, rate-limited)',
  'Local-first saves with cloud sync',
  'Sign-in: email, one-time code, or Google',
];

const ON_THE_BENCH = [
  'Live collaboration & shared cursors',
  'Kanban & board views',
  'PDF blocks',
  'Notion import',
  'AI image generation',
];

const HOUSE_RULES = [
  '50 nodes per canvas — keeps the beta fast',
  'Blocks inside cards are unlimited',
  'Cloud sync is free for the whole beta',
  'Rough edges expected — tell us about them',
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['/'], label: 'Block menu inside a card' },
  { keys: ['Ctrl', 'K'], label: 'Search from here' },
  { keys: ['K'], label: 'Shortcut panel on the canvas' },
  { keys: ['Ctrl', 'D'], label: 'Duplicate selection' },
  { keys: ['5'], label: 'Fit canvas to view' },
];

/* ---------- helpers ---------- */

function daypartGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function nodeTypeIcon(nodeType: string): LucideIcon {
  const t = nodeType.toLowerCase();
  if (t.includes('image')) return ImageIcon;
  if (t.includes('link')) return Link2;
  return FileText;
}

function SectionHead({ index, title, aside }: { index: string; title: string; aside?: string }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIndex}>{index}</span>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {aside && <span className={styles.sectionAside}>{aside}</span>}
    </div>
  );
}

/* ---------- page ---------- */

export const LandingPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const navigateToNode = useStore((state) => state.navigateToNode);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const auth = useStore((state) => state.auth);
  const { signOut } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Log a site visit row for admin analytics (deduped per browser session).
  useSiteTelemetry();

  const activeWorkspaceId =
    typeof window !== 'undefined'
      ? localStorage.getItem('chnk it.activeWorkspaceId') || undefined
      : undefined;

  const { recentNotes } = useRecentlyViewed(activeWorkspaceId);
  const { search, results, isSearching } = useGlobalSearch(activeWorkspaceId);

  useEffect(() => {
    const timer = setTimeout(() => search(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  // Ctrl/⌘+K focuses search; Escape dismisses results.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openCanvas = useCallback(() => {
    setIsDrawerOpen(false);
    setCurrentView('canvas');
  }, [setCurrentView]);

  const openNode = useCallback(
    (nodeId: string) => {
      setIsDrawerOpen(false);
      setCurrentView('canvas');
      navigateToNode(nodeId);
    },
    [setCurrentView, navigateToNode]
  );

  const handleSignOut = useCallback(async () => {
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

  const toggleRail = useCallback(() => {
    setIsRailCollapsed((collapsed) => {
      localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '0' : '1');
      return !collapsed;
    });
  }, []);

  const scrollToBetaNotes = useCallback(() => {
    setIsDrawerOpen(false);
    document.getElementById('beta-notes')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const displayName = auth.displayName || auth.email?.split('@')[0] || '';
  const firstName = displayName.split(' ')[0];
  const initial = (firstName[0] || '?').toUpperCase();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Collapsed rail shows icons only, so each target borrows the global
  // [data-tooltip] treatment from the design system to keep its name.
  const tip = (label: string) => (isRailCollapsed ? { 'data-tooltip': label } : {});

  return (
    <div className={styles.shell}>
      {isDrawerOpen && <div className={styles.overlay} onClick={() => setIsDrawerOpen(false)} />}

      {/* ── sidebar ── */}
      <aside
        className={`${styles.sidebar} ${isDrawerOpen ? styles.sidebarOpen : ''} ${
          isRailCollapsed ? styles.sidebarCollapsed : ''
        }`}
      >
        <div className={styles.brand}>
          <button
            className={styles.brandLink}
            onClick={() => {
              setIsDrawerOpen(false);
              setCurrentView('marketing');
            }}
            {...tip('chnk it — home page')}
          >
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>chnk it</span>
            <span className={styles.betaChip}>BETA</span>
          </button>
          <button
            className={styles.brandClose}
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className={styles.nav}>
          <span className={styles.navOverline}>Workspace</span>
          <button className={`${styles.navItem} ${styles.navItemActive}`} {...tip('Home')}>
            <Home size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>Home</span>
          </button>
          <button className={styles.navItem} onClick={openCanvas} {...tip('Canvas')}>
            <Frame size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>Canvas</span>
          </button>
          {FEATURES.marketplace && (
            <button
              className={styles.navItem}
              onClick={() => {
                setIsDrawerOpen(false);
                setCurrentView('marketplace');
              }}
              {...tip('Marketplace')}
            >
              <ShoppingBag size={17} className={styles.navIcon} />
              <span className={styles.navLabel}>Marketplace</span>
            </button>
          )}

          <span className={styles.navOverline}>This beta</span>
          <span className={styles.navRule} aria-hidden="true" />
          <button
            className={styles.navItem}
            onClick={scrollToBetaNotes}
            {...tip('State of the beta')}
          >
            <ClipboardList size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>State of the beta</span>
          </button>
          <a className={styles.navItem} href={FEEDBACK_MAILTO} {...tip('Send feedback')}>
            <PenLine size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>Send feedback</span>
            <ArrowUpRight size={13} className={styles.navItemExternalIcon} />
          </a>
        </nav>

        <div className={styles.railFoot}>
          {isRailCollapsed ? (
            <button
              className={styles.navItem}
              onClick={(e) => toggleTheme(originFromEvent(e))}
              {...tip(theme === 'dark' ? 'Switch to Paper' : 'Switch to Ink')}
            >
              {theme === 'dark' ? (
                <Moon size={17} className={styles.navIcon} />
              ) : (
                <Sun size={17} className={styles.navIcon} />
              )}
            </button>
          ) : (
            <Tabs
              className={styles.themeRow}
              items={THEME_TABS}
              value={theme === 'dark' ? 'dark' : 'light'}
              /* `toggleTheme` flips, so re-picking the active theme must be
                 inert rather than a second toggle back. */
              onChange={(next, trigger) => {
                if (next !== theme) toggleTheme(originFromEvent(trigger));
              }}
              radius="md"
              fullWidth
              semantics="radio"
              aria-label="Theme"
            />
          )}
          <button
            className={styles.navItem}
            onClick={() => {
              setIsDrawerOpen(false);
              setCurrentView('profile');
            }}
            {...tip('Settings')}
          >
            <Settings size={17} className={styles.navIcon} />
            <span className={styles.navLabel}>Settings</span>
          </button>
          {auth.isAuthenticated && (
            <button
              className={styles.navItem}
              onClick={handleSignOut}
              disabled={isSigningOut}
              {...tip('Sign out')}
            >
              <LogOut size={17} className={styles.navIcon} />
              <span className={styles.navLabel}>
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </span>
            </button>
          )}
          <button
            className={`${styles.navItem} ${styles.railToggle}`}
            onClick={toggleRail}
            aria-expanded={!isRailCollapsed}
            {...tip('Expand sidebar')}
          >
            {isRailCollapsed ? (
              <PanelLeftOpen size={17} className={styles.navIcon} />
            ) : (
              <PanelLeftClose size={17} className={styles.navIcon} />
            )}
            <span className={styles.navLabel}>Collapse</span>
          </button>
          <span className={styles.version}>v0.1.0-beta</span>
        </div>
      </aside>

      {/* ── stage ── */}
      <div className={styles.stage}>
        <header className={styles.topbar}>
          <button
            className={styles.hamburger}
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className={styles.crumb}>
            <span className={styles.crumbPage}>Home</span>
            <span className={styles.crumbDate}>{today}</span>
          </div>

          <div className={styles.searchWrap}>
            <div className={styles.search}>
              <Search size={15} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search your notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <kbd className={`${styles.kbd} ${styles.searchKbd}`}>Ctrl K</kbd>
            </div>
            {searchQuery && (
              <div className={styles.results}>
                <span className={styles.resultsLabel}>
                  {isSearching ? 'Searching…' : 'Results'}
                </span>
                {!isSearching && results.length === 0 && (
                  <div className={styles.resultsEmpty}>Nothing matches “{searchQuery}” yet.</div>
                )}
                {results.map((res) => (
                  <button
                    key={res.node_id}
                    className={styles.resultItem}
                    onClick={() => {
                      setSearchQuery('');
                      openNode(res.node_id);
                    }}
                  >
                    <div className={styles.resultTitle}>{res.node_title}</div>
                    <div className={styles.resultSnippet}>{res.content_snippet}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.userArea}>
            {auth.isAuthenticated ? (
              <>
                <button
                  className={styles.avatar}
                  onClick={() => setCurrentView('profile')}
                  aria-label="Open profile"
                  title={displayName}
                >
                  {initial}
                </button>
                <button
                  className={`${styles.iconBtn} icon-hover`}
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className={styles.authGhost} onClick={() => setCurrentView('login')}>
                  <LogIn size={14} />
                  <span>Log in</span>
                </Button>
                <Button variant="primary" size="sm" className={styles.authSolid} onClick={() => setCurrentView('signup')}>
                  Create account
                </Button>
              </>
            )}
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.inner}>
            {/* masthead */}
            <section className={styles.masthead}>
              <div className={styles.status}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span>Public beta — your work saves local-first</span>
              </div>
              <h1 className={styles.headline}>
                {daypartGreeting()}
                {firstName ? (
                  <>
                    , <em>{firstName}</em>
                  </>
                ) : null}
                .
              </h1>
              <p className={styles.lede}>
                Everything you put on the canvas is written to this machine first and synced
                quietly behind it. Pick up where you left off, or pull a clean sheet.
              </p>
              <div className={styles.mastActions}>
                <Button variant="primary" className={styles.btnPrimary} onClick={openCanvas}>
                  <span>Open your canvas</span>
                  <ArrowRight size={15} />
                </Button>
                <a className={styles.btnGhost} href={FEEDBACK_MAILTO}>
                  <PenLine size={14} />
                  <span>Send feedback</span>
                </a>
                <span className={styles.mastHint}>tip: press / inside any card for blocks</span>
              </div>
            </section>

            {/* 01 — recent */}
            <section>
              <SectionHead
                index="01"
                title="Pick up where you left off"
                aside={recentNotes.length > 0 ? `${recentNotes.length} recent` : undefined}
              />
              {recentNotes.length === 0 ? (
                <div className={styles.empty}>
                  <Clock size={20} className={styles.emptyIcon} />
                  <span className={styles.emptyTitle}>Nothing on the desk yet</span>
                  <span className={styles.emptyCopy}>
                    Open the canvas and drop your first card — it will be waiting here the next
                    time you sign in.
                  </span>
                </div>
              ) : (
                <div className={styles.recentList}>
                  {recentNotes.map((note) => {
                    const RowIcon = nodeTypeIcon(note.node_type);
                    return (
                      <button
                        key={note.id}
                        className={styles.recentRow}
                        onClick={() => openNode(note.node_id || note.id)}
                      >
                        <span className={styles.rowIcon}>
                          <RowIcon size={14} />
                        </span>
                        <span className={styles.rowTitle}>{note.node_title}</span>
                        <span className={styles.rowType}>{note.node_type}</span>
                        <span className={styles.rowTime}>{relativeTime(note.last_opened_at)}</span>
                        <ArrowRight size={15} className={styles.rowArrow} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 02 — starters */}
            <section>
              <SectionHead index="02" title="Start with a shape" />
              <div className={styles.starters}>
                {STARTERS.map((s, i) => (
                  <button key={s.name} className={styles.starter} onClick={openCanvas}>
                    <div className={styles.starterTop}>
                      <span className={styles.starterIcon}>
                        <s.Icon size={15} />
                      </span>
                      <span className={styles.starterIndex}>{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <span className={styles.starterName}>{s.name}</span>
                    <span className={styles.starterDesc}>{s.desc}</span>
                  </button>
                ))}
              </div>
              <p className={styles.startersNote}>
                Every starter opens the same infinite canvas — a way to begin, not a template to
                obey.
              </p>
            </section>

            {/* 03 — state of the beta */}
            <section id="beta-notes">
              <SectionHead index="03" title="The state of the beta" aside="updated July 2026" />
              <div className={styles.betaGrid}>
                <div className={styles.betaCol}>
                  <span className={`${styles.betaColTitle} ${styles.betaColTitleOk}`}>
                    Works today
                  </span>
                  {WORKS_TODAY.map((item) => (
                    <div key={item} className={styles.betaItem}>
                      <Check size={13} className={styles.betaCheck} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.betaCol}>
                  <span className={`${styles.betaColTitle} ${styles.betaColTitleNext}`}>
                    On the bench
                  </span>
                  {ON_THE_BENCH.map((item) => (
                    <div key={item} className={styles.betaItem}>
                      <span>{item}</span>
                      <span className={styles.soonTag}>NEXT</span>
                    </div>
                  ))}
                </div>
                <div className={styles.betaCol}>
                  <span className={styles.betaColTitle}>House rules</span>
                  {HOUSE_RULES.map((item) => (
                    <div key={item} className={styles.betaItem}>
                      <span className={styles.betaDash}>—</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 04 — feedback */}
            <section>
              <SectionHead index="04" title="Help shape it" />
              <div className={styles.feedback}>
                <div>
                  <div className={styles.feedbackTitle}>Built in the open.</div>
                  <p className={styles.feedbackCopy}>
                    You are one of the first people in here. If something breaks, confuses, or is
                    plainly missing — say it. Every note lands directly in the builder&rsquo;s
                    inbox and gets read.
                  </p>
                </div>
                <a className={styles.btnPrimary} href={FEEDBACK_MAILTO}>
                  <span>Write to us</span>
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </section>

            {/* shortcuts strip */}
            <footer className={styles.shortcuts}>
              <span className={styles.shortcutsLabel}>Shortcuts</span>
              {SHORTCUTS.map((s) => (
                <span key={s.label} className={styles.shortcut}>
                  {s.keys.map((k) => (
                    <kbd key={k} className={styles.kbd}>
                      {k}
                    </kbd>
                  ))}
                  <span>{s.label}</span>
                </span>
              ))}
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
};
