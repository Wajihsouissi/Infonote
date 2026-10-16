import type { CSSProperties } from 'react';
import { Scissors } from 'lucide-react';
import { SelectionCorners, Tag } from '../components/ResearchCard';
import cardStyles from '../components/ResearchCard.module.css';
import { chunks, sources } from '../researchStory';
import styles from './Scenes.module.css';

/** 02 — the cut. The paragraphs never leave the DOM or change their words:
 * each one simply gains its own shell and moves a short, deliberate distance.
 * "Chunk it" is the action's real name in the app's selection toolbar. */
export function ChunkScene() {
  return (
    <div className={styles.cut}>
      <div className={styles.cutNote}>
        <span className={styles.cutShell} />
        <span className={styles.cutTrace} />
        <span className={styles.cutWell} />
        <span className={styles.cutSelect}><SelectionCorners /></span>
        <div className={styles.cutAction}><Scissors size={14} strokeWidth={1.8} /> Chunk it</div>
        <Tag>{sources.note.id}</Tag>
        <div className={styles.cutHead}>{sources.note.title}</div>
        <div className={styles.cutBody}>
          {chunks.map((chunk, index) => (
            <div key={chunk.id} className={styles.cutChunk} style={{ '--i': index } as CSSProperties}>
              <Tag className={styles.cutTag}>{chunk.id}</Tag>
              <p>
                <span className={cardStyles.lead}>{chunk.lead}</span>
                <span className={cardStyles.rest}> {chunk.rest}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
