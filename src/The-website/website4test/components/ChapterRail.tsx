import { motion } from 'motion/react';
import { spring } from '../physics';
import { chapters } from '../researchStory';
import styles from '../Website4TestPage.module.css';

const STEP = 26; // px between ticks; matches .rail li in the stylesheet

/** The living margin: where you are in the story, and a way to jump. Ticks
 * only until it is hovered or focused, then every chapter is named. */
export function ChapterRail({ active }: { active: number }) {
  const current = chapters[active];
  return (
    <div className={styles.railDock}>
      <nav className={styles.rail} aria-label="Chapters">
        <ol>
          {chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <a href={`#${chapter.id}`} aria-current={index === active ? 'step' : undefined}>
                <span className={styles.railTick} aria-hidden="true" />
                <span className={styles.railLabel}><b>{chapter.number}</b>{chapter.name}</span>
              </a>
            </li>
          ))}
        </ol>
        {/* One marker that travels, rather than eight that blink on and off. */}
        <motion.span className={styles.railMarker} animate={{ y: active * STEP }} transition={spring(0.35)} aria-hidden="true" />
        <span className={styles.railNow} aria-hidden="true">{current.number} — {current.name}</span>
      </nav>
    </div>
  );
}
