import { useEffect, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, Layers, MoreHorizontal, Pencil } from 'lucide-react';
import { ButtonLink } from '../../components/ui/Button';
import cardStyles from '../../features/card/NoteCard.module.css';
import { BlockHandle, CanvasToolbar, CoffeeGallery, ReferenceLink, TaskLine } from './JourneyPrimitives';
import { SceneContent } from './JourneyScenes';
import { useJourneyMotion, type TravelerMotion } from './useJourneyMotion';
import { journeyChapters, LAST_CHAPTER, sampleTraveler } from './journeyData';
import styles from './JourneyPage.module.css';

/* THESIS: One real-looking block carries a complete scroll-led product story.
 * OWN-WORLD: The app's Charcoal & Signal tokens, Outfit, node shells, inset wells.
 * STORY: Collect → compose → open → connect → act → begin your own idea.
 * FIRST VIEWPORT: Centered headline, one selected text block, quiet canvas tools.
 * FORM: User-pinned direction (no seed roll). Native-flow website; one traveling block.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */

function Traveler({ stage, index, travel }: { stage: MotionValue<number>; index: number; travel: TravelerMotion }) {
  const documentOpacity = useTransform(stage, [2.5, 3, 3.4, 3.5], [0, 1, 1, 0]);
  const cardOpacity = useTransform(stage, [3.5, 3.9, 4.4, 4.5], [0, 1, 1, 0]);
  const form = index === 3 ? 'note' : index === 4 ? 'card' : index >= 5 && index < 18 ? 'compact' : 'block';
  return <motion.article data-testid="journey-traveler" data-form={form} data-step={index} className={`${cardStyles.card} ${styles.traveler}`} style={{ ...travel, x: '-50%', y: '-50%' }} aria-label="The original Business idea block">
    <div className={styles.travelerBar}><span><BlockHandle /><span>Business idea</span></span><MoreHorizontal size={17} /></div>
    <div className={styles.seedContent}><p>A neighborhood<br className={styles.seedBreak} /> coffee club.</p><span className={styles.seedDescription}>A place to meet. A reason to return.</span></div>
    <motion.div className={styles.documentContent} style={{ opacity: documentOpacity }} aria-hidden={index !== 3}>
      <CoffeeGallery compact /><h3>The experience</h3><p>A coffee. A conversation.</p><ReferenceLink /><h3>The first pop-up</h3><TaskLine /><span className={styles.editCue}><Pencil size={12} /> Shaping the outline</span>
    </motion.div>
    <motion.div className={styles.cardContent} style={{ opacity: cardOpacity }} aria-hidden={index !== 4}><CoffeeGallery /><div className={styles.cardFooter}><Layers size={14} /> References, notes, and a first step <ChevronRight size={15} /></div></motion.div>
    <span className={styles.selectionCorner} aria-hidden="true" />
    <div className={styles.travelerTag} aria-hidden="true">{index === 0 ? 'Your first block' : index === 3 ? 'Bring it together' : index === 4 ? 'Converted to a card' : index === 9 ? 'In progress' : index === 18 ? 'It all started here.' : 'The same idea'}</div>
  </motion.article>;
}

function ChapterCopy({ index }: { index: number }) {
  const chapter = journeyChapters[index];
  return <div className={`${styles.chapterCopy} ${index === 0 ? styles.heroCopy : ''} ${index === LAST_CHAPTER ? styles.endCopy : ''}`}>
    {index === 0 ? <h1>Big ideas<br />start <em>small.</em></h1> : <h2 key={chapter.id}>{chapter.title.split('\n').map((line, i) => <span key={line}>{line}{i === 0 && <br />}</span>)}</h2>}
    <p>{chapter.copy}</p>
    {index >= 10 && index <= 17 && <span className={styles.audienceLabel}>{chapter.act}</span>}
  </div>;
}

export function JourneyPage() {
  const reduced = Boolean(useReducedMotion());
  const { scrollRef, trackRef, stage, compact, ready, travel } = useJourneyMotion(reduced);
  const [index, setIndex] = useState(0);
  useMotionValueEvent(stage, 'change', value => setIndex(Math.min(LAST_CHAPTER, Math.round(value))));

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'chnk it — Big ideas start small';
    return () => { document.title = previousTitle; };
  }, []);

  return <main ref={scrollRef} className={styles.page} data-testid="journey-scroll" aria-label="The journey of an idea" tabIndex={0}>
    <a href="#journey-start" className={styles.skip}>Skip the story — start creating</a>
    <header className={styles.navigation}>
      <a href="/" className={styles.logo} aria-label="chnk it home">chnk <span>it</span><i /></a>
      <div><a className={styles.storyLink} href="#journey-collect">The journey</a><a className={styles.login} href="/login">Sign in</a><ButtonLink className={styles.primaryAction} href="/signup" variant="primary" trailingIcon={<ArrowUpRight size={16} />}>Start creating</ButtonLink></div>
    </header>
    <div className={styles.track} ref={trackRef}>
      <div className={styles.travelerDock} data-chapter={journeyChapters[index].id} data-testid="journey-stage" style={{ visibility: ready ? 'visible' : 'hidden' }}><div className={styles.travelerStage}><Traveler stage={stage} index={index} travel={travel} /></div></div>
      {journeyChapters.map((chapter, sectionIndex) => {
        const position = sampleTraveler(sectionIndex, compact, reduced);
        const side = sectionIndex > 0 && sectionIndex % 2 === 0 && sectionIndex !== 4 && sectionIndex !== LAST_CHAPTER ? 'left' : 'right';
        return <section key={chapter.id} id={sectionIndex === LAST_CHAPTER ? 'journey-invitation' : `journey-${chapter.id}`} data-journey-section={sectionIndex} data-side={side} data-section={chapter.id} className={styles.flowSection} aria-label={chapter.act}>
          <div className={styles.sectionGround} aria-hidden="true" />
          <ChapterCopy index={sectionIndex} />
          <div data-traveler-anchor className={styles.travelerAnchor} style={{ left: `${position[0]}%`, top: `${position[1]}%`, width: position[2], height: position[3] }} aria-hidden="true" />
          <div className={styles.sceneContent}><SceneContent index={sectionIndex} /></div>
          {sectionIndex === 0 && <div className={styles.heroBottom}><CanvasToolbar /><span>One thought. Let’s see where it goes. <ArrowDown size={14} /></span></div>}
          {sectionIndex === 3 && <span className={styles.gestureHint}><Check size={14} /> Collected blocks. One composed note.</span>}
          {sectionIndex === 4 && <span className={styles.gestureHint}>There is more inside. <ArrowDown size={14} /></span>}
          {sectionIndex === LAST_CHAPTER && <div className={styles.finalActions}><ButtonLink className={styles.primaryAction} id="journey-start" href="/signup" variant="primary" size="lg" trailingIcon={<ArrowRight size={18} />}>Start your first idea</ButtonLink><a href="/canvas">Try the canvas <ArrowUpRight size={15} /></a><span>Your next idea is waiting.</span></div>}
        </section>;
      })}
    </div>
    <footer className={styles.footer}><a className={styles.logo} href="/">chnk <span>it</span><i /></a><p>A little space for your next big thing.</p><div><a href="/canvas">Open canvas</a><a href="/login">Sign in</a><a href="/features">Explore features</a></div></footer>
  </main>;
}
