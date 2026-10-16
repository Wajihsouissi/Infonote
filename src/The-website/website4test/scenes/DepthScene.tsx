import type { CSSProperties } from 'react';
import { ChevronRight, Layers, Square } from 'lucide-react';
import { FileCard, MiniCard, NoteCard, PhotoCard } from '../components/ResearchCard';
import { C1, C2, C3, GROUP_TITLE, PROJECT_TITLE, question } from '../researchStory';
import styles from './Scenes.module.css';

const PIECES = [C1, C2, question, C3] as const;
const INSIDE = [C1, C2, question] as const;

/** 04 — the depth. The card's frame opens into its own canvas: the inner
 * content sits at its real size the whole time and is revealed by the growing
 * aperture, so nothing is scaled up like a screenshot. Scrolling back closes
 * it along the same path. */
export function DepthScene() {
  return (
    <div className={styles.depth}>
      <div className={styles.depthOuter}>
        <PhotoCard caption={false} className={styles.depthPhoto} />
        <FileCard className={styles.depthFile} />
        <div className={styles.depthCard}>
          <span className={styles.depthCardBg} />
          <div className={styles.depthCardHead}>
            <Layers size={15} strokeWidth={1.7} />
            <strong>{GROUP_TITLE}</strong>
            <small>4 inside</small>
          </div>
          <div className={styles.depthPieces}>
            {PIECES.map((piece, index) => (
              <MiniCard key={piece.id} id={piece.id} text={piece.lead} className={styles.depthPiece} style={{ '--i': index } as CSSProperties} />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.depthInner}>
        <div className={styles.depthCrumb}>
          <span>{PROJECT_TITLE}</span>
          <ChevronRight size={14} />
          <strong>{GROUP_TITLE}</strong>
        </div>
        <NoteCard title="Notes" className={styles.depthNote}>
          <dl className={styles.depthList}>
            <dt>Observation</dt>
            <dd>{C1.lead} {C2.lead}</dd>
            <dt>Question</dt>
            <dd>{question.lead}</dd>
            <dt>Next experiment</dt>
            <dd className={styles.depthTodo}><Square size={15} strokeWidth={1.6} />{C3.lead} Try it for one week.</dd>
          </dl>
        </NoteCard>
        <div className={styles.depthSide}>
          {INSIDE.map((piece, index) => (
            <MiniCard key={piece.id} id={piece.id} text={piece.lead} style={{ '--i': index } as CSSProperties} />
          ))}
        </div>
      </div>

      <svg className={styles.depthRing} aria-hidden="true"><rect /></svg>
    </div>
  );
}
