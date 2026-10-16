import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUpRight, ChevronDown } from 'lucide-react';
import { ButtonLink } from '../../components/ui/Button';
import { useStore } from '../../store/useStore';
import type { AppView } from '../../store/types';
import { ChapterRail } from './components/ChapterRail';
import { ConnectionDemo } from './components/ConnectionDemo';
import { Faq } from './components/Faq';
import { FileCard, PhotoCard } from './components/ResearchCard';
import { StorageExplainer } from './components/StorageExplainer';
import { spring } from './physics';
import { chapters, story, type ChapterId } from './researchStory';
import { AssistScene } from './scenes/AssistScene';
import { ChunkScene } from './scenes/ChunkScene';
import { ClosingScene } from './scenes/ClosingScene';
import { CollectionScene } from './scenes/CollectionScene';
import { ConnectionScene } from './scenes/ConnectionScene';
import { DepthScene } from './scenes/DepthScene';
import { PlanScene } from './scenes/PlanScene';
import { useResearchStoryMotion } from './useResearchStoryMotion';
import styles from './Website4TestPage.module.css';

/* Chunked — Website 4 / The Research Cut.
 * One research example is followed from collected notes to a plan:
 * select → separate → arrange → connect → focus → act.
 * The page scrolls natively; each chapter owns a local demonstration whose
 * motion is driven by that chapter's scroll progress and runs backwards the
 * same way. Scenes are read-only fixtures and never mount the canvas store. */

type MotionPreference = 'system' | 'full' | 'reduced';
type Pose = 'before' | 'after';
const MOTION_KEY = 'chunked.w4.motion';

function readMotionPreference(): MotionPreference {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    return saved === 'full' || saved === 'reduced' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function LogoMark() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="1" y="3" width="15" height="7" rx="2.2" fill="currentColor" />
      <rect x="6" y="12" width="15" height="7" rx="2.2" fill="currentColor" />
    </svg>
  );
}

function CropMarks() {
  return <span className={styles.crop} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function MotionToggle({ reduced, onChange, className }: { reduced: boolean; onChange: (next: 'full' | 'reduced') => void; className?: string }) {
  return (
    <div className={`${styles.motionToggle} ${className ?? ''}`} role="group" aria-label="Motion">
      <span aria-hidden="true">Motion</span>
      <span className={styles.segmented}>
        <button type="button" aria-pressed={!reduced} onClick={() => onChange('full')}>Full</button>
        <button type="button" aria-pressed={reduced} onClick={() => onChange('reduced')}>Reduced</button>
      </span>
    </div>
  );
}

function ChapterIndex({ id }: { id: ChapterId }) {
  const chapter = chapters.find(entry => entry.id === id) ?? chapters[0];
  return <p className={styles.index}><b>{chapter.number}</b>{chapter.name}</p>;
}

/** A scrubbed chapter: copy beside (or above) a stage that holds while its
 * scene plays. With motion reduced the scene shows its result, and a
 * Before / After control cross-fades between the two still compositions. */
function Chapter({ id, layout, reduced, children, after }: {
  id: keyof typeof story;
  layout: 'left' | 'right' | 'stack';
  reduced: boolean;
  children: ReactNode;
  after?: ReactNode;
}) {
  const copy = story[id];
  const [pose, setPose] = useState<Pose>('after');
  const [swapping, setSwapping] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (next: Pose) => {
    if (next === pose) return;
    setSwapping(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPose(next);
      setSwapping(false);
    }, 140);
  };

  const copyBlock = (
    <div className={styles.copy} data-reveal>
      <ChapterIndex id={id} />
      <h2 id={`${id}-title`} className={styles.title}>{copy.title}</h2>
      <div className={styles.copyBody}>
        <p className={styles.lead}>{copy.body}</p>
        <ul className={styles.proof} aria-label="What this uses">
          {copy.proof.map(item => <li key={item}>{item}</li>)}
        </ul>
        {copy.footnote && <p className={styles.footnote}>{copy.footnote}</p>}
      </div>
    </div>
  );

  return (
    <section
      id={id}
      className={styles.chapter}
      aria-labelledby={`${id}-title`}
      data-chapter
      data-scene={id}
      data-layout={layout}
      data-pose={reduced ? pose : undefined}
      data-swapping={swapping || undefined}
    >
      {layout !== 'stack' && copyBlock}
      <div className={styles.track} data-track>
        <div className={styles.sticky} data-stage>
          {layout === 'stack' && copyBlock}
          <figure className={styles.figure}>
            <div className={styles.stage} role="img" aria-label={copy.alt}>
              <CropMarks />
              {children}
            </div>
            <figcaption className={styles.caption}>
              <span>{copy.caption}</span>
              {reduced && (
                <span className={styles.segmented} role="group" aria-label="Composition shown">
                  <button type="button" aria-pressed={pose === 'before'} onClick={() => show('before')}>Before</button>
                  <button type="button" aria-pressed={pose === 'after'} onClick={() => show('after')}>After</button>
                </span>
              )}
            </figcaption>
          </figure>
          {after}
        </div>
      </div>
    </section>
  );
}

export function Website4TestPage() {
  const systemReduced = useReducedMotion();
  const [preference, setPreference] = useState<MotionPreference>(readMotionPreference);
  const reduced = preference === 'reduced' || (preference === 'system' && Boolean(systemReduced));
  const { scrollRef, active, scrolled } = useResearchStoryMotion(reduced);
  const setCurrentView = useStore(state => state.setCurrentView);
  const [menuOpen, setMenuOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = chapters[active];

  const chooseMotion = (next: 'full' | 'reduced') => {
    setPreference(next);
    try { localStorage.setItem(MOTION_KEY, next); } catch { /* a private window: the choice lasts for this visit */ }
  };

  /* Links keep their real href; a plain click stays inside the app shell. */
  const go = (view: AppView) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setCurrentView(view);
  };

  useEffect(() => {
    const previous = document.title;
    document.title = 'Chunked — Turn scattered research into connected thinking';
    // The scroller is the page here; focusing it lets the keyboard scroll at once.
    scrollRef.current?.focus({ preventScroll: true });
    return () => { document.title = previous; };
  }, [scrollRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      chipRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !chipRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  const startLink = (label: string, size: 'md' | 'lg' = 'lg') => (
    <ButtonLink href="/canvas" onClick={go('canvas')} className={styles.cta} variant="primary" size={size} trailingIcon={<ArrowUpRight size={size === 'lg' ? 18 : 16} />}>
      {label}
    </ButtonLink>
  );

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div
        ref={scrollRef}
        className={styles.page}
        data-motion={reduced ? 'reduced' : 'full'}
        data-scrolled={scrolled || undefined}
        data-testid="w4-scroll"
        tabIndex={-1}
      >
        <a href="#w4-main" className={styles.skip}>Skip to the story</a>

        <header className={styles.nav}>
          <a href="#collection" className={styles.logo} aria-label="Chunked — back to the top">
            <LogoMark />
            <span>Chunked</span>
          </a>
          <nav className={styles.navLinks} aria-label="Page">
            <a href="#cut">The story</a>
            <a href="#your-turn">Explore</a>
            <a href="#faq">FAQ</a>
          </nav>
          <button
            ref={chipRef}
            type="button"
            className={styles.chapterChip}
            aria-expanded={menuOpen}
            aria-controls="w4-menu"
            aria-label={`Chapter ${current.number}, ${current.name}. Open the page menu`}
            onClick={() => setMenuOpen(open => !open)}
          >
            <b>{current.number}</b>
            <span>{current.name}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div className={styles.navTools}>
            <MotionToggle reduced={reduced} onChange={chooseMotion} className={styles.navMotion} />
            <a href="/login" onClick={go('login')} className={styles.signIn}>Sign in</a>
            {startLink('Start your canvas', 'md')}
          </div>

          <AnimatePresence>
            {menuOpen && (
              // Materializes from the control that opened it and leaves the same way.
              <motion.div
                ref={menuRef}
                id="w4-menu"
                className={styles.menu}
                initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)', transition: { duration: 0.16, ease: 'easeIn' } }}
                transition={spring(0.3)}
              >
                <ol>
                  {chapters.map((chapter, index) => (
                    <li key={chapter.id}>
                      <a href={`#${chapter.id}`} aria-current={index === active ? 'step' : undefined} onClick={() => setMenuOpen(false)}>
                        <b>{chapter.number}</b>{chapter.name}
                      </a>
                    </li>
                  ))}
                </ol>
                <div className={styles.menuFoot}>
                  <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
                  <a href="/login" onClick={go('login')}>Sign in</a>
                  <MotionToggle reduced={reduced} onChange={chooseMotion} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <ChapterRail active={active} />

        <main id="w4-main" tabIndex={-1}>
          <section id="collection" className={styles.hero} aria-labelledby="w4-headline" data-chapter data-scene="collection">
            <p className={styles.eyebrow}>For people who collect ideas</p>
            <h1 id="w4-headline" className={styles.display}>
              <span>You saved everything.</span> <br />Now make something of it.
            </h1>
            <div className={styles.heroBody}>
              <div className={styles.heroCopy}>
                <p className={styles.lead}>
                  Chunked is a visual workspace for research, notes, and project planning. Break ideas into useful pieces, connect what matters, and shape your next step.
                </p>
                <div className={styles.actions}>
                  {startLink('Start your canvas')}
                  <a href="#cut" className={styles.textLink}>See how it comes together <ArrowDown size={16} aria-hidden="true" /></a>
                </div>
              </div>
              <div className={styles.heroScene}><CollectionScene reduced={reduced} /></div>
            </div>
            <div className={styles.heroFoot}>
              <p className={styles.heroCaption}>Collected does not always mean connected.</p>
              <p className={styles.heroPath} aria-hidden="true"><span>Research</span><i /><span>Connection</span><i /><span>Plan</span></p>
            </div>
          </section>

          <Chapter id="cut" layout="left" reduced={reduced}><ChunkScene /></Chapter>

          <Chapter
            id="connection"
            layout="right"
            reduced={reduced}
            after={(
              <details className={styles.sources}>
                <summary>Sources kept nearby</summary>
                <div><PhotoCard tag={false} /><FileCard tag={false} /></div>
              </details>
            )}
          >
            <ConnectionScene />
          </Chapter>

          <Chapter id="depth" layout="left" reduced={reduced}><DepthScene /></Chapter>
          <Chapter id="assist" layout="right" reduced={reduced}><AssistScene /></Chapter>
          <Chapter id="plan" layout="stack" reduced={reduced}><PlanScene /></Chapter>

          <section id="your-turn" className={styles.plain} aria-labelledby="your-turn-title" data-chapter>
            <div className={styles.plainHead} data-reveal>
              <ChapterIndex id="your-turn" />
              <h2 id="your-turn-title" className={styles.title}>Try one small connection.</h2>
              <p className={styles.lead}>Pick two ideas, then connect them. With a mouse you can also move the cards around.</p>
            </div>
            <div className={styles.plainBody} data-reveal>
              <ConnectionDemo reduced={reduced} />
              <div className={styles.demoFoot}>
                <p>A small demo of connecting ideas. Changes stay in this demo.</p>
                <ButtonLink href="/canvas" onClick={go('canvas')} variant="secondary" trailingIcon={<ArrowUpRight size={16} />}>Start your own canvas</ButtonLink>
              </div>
            </div>
          </section>

          <section id="ownership" className={styles.plain} aria-labelledby="ownership-title" data-chapter>
            <div className={styles.plainHead} data-reveal>
              <ChapterIndex id="ownership" />
              <h2 id="ownership-title" className={styles.title}>Choose where your work lives.</h2>
              <p className={styles.lead}>Keep working in this browser, or sign in to add cloud sync. You choose your storage mode.</p>
            </div>
            <div className={styles.plainBody} data-reveal><StorageExplainer /></div>
          </section>

          <section id="faq" className={styles.plain} aria-labelledby="faq-title">
            <div className={styles.plainHead} data-reveal>
              <p className={styles.index}>FAQ</p>
              <h2 id="faq-title" className={styles.title}>Before you start.</h2>
            </div>
            <div className={styles.plainBody} data-reveal><Faq /></div>
          </section>

          <section id="start" className={styles.closing} aria-labelledby="start-title">
            <div data-reveal>
              <h2 id="start-title" className={styles.closingTitle}>Your next idea is already in your notes.</h2>
              <p className={styles.lead}>Give it room to become something.</p>
              <div className={styles.actions}>{startLink('Start your canvas')}</div>
            </div>
            <div className={styles.closingStrip} data-reveal><ClosingScene /></div>
          </section>
        </main>

        <footer className={styles.footer}>
          <a href="#collection" className={styles.logo} aria-label="Chunked — back to the top"><LogoMark /><span>Chunked</span></a>
          <p>Notes, cards and AI responses shown on this page are illustrative.</p>
          <nav aria-label="Footer">
            <a href="/canvas" onClick={go('canvas')}>Open the canvas</a>
            <a href="/features" onClick={go('features')}>Explore features</a>
            <a href="/login" onClick={go('login')}>Sign in</a>
          </nav>
          <MotionToggle reduced={reduced} onChange={chooseMotion} />
        </footer>
      </div>
    </MotionConfig>
  );
}
