import { motion } from 'motion/react';
import { ChunkCard, NoteCard, PhotoCard, QuestionCard } from '../components/ResearchCard';
import cardStyles from '../components/ResearchCard.module.css';
import { spring } from '../physics';
import { C1, chunks, sources } from '../researchStory';
import { useWires, type WireSpec } from './useWires';
import styles from './Scenes.module.css';

const WIRES: readonly WireSpec[] = [{ from: 'S1', to: 'C1', sides: ['bottom', 'top'] }];

/** 01 — the opening composition: a long note, a reference and a question,
 * with one sentence already lifting out as its own block. The entrance plays
 * once; after that the scene only drifts with the first scroll. */
export function CollectionScene({ reduced }: { reduced: boolean }) {
  const { ref, wires } = useWires(WIRES);
  const arrive = (order: number) => ({
    initial: reduced ? false : { opacity: 0, y: 18, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...spring(0.55), delay: 0.06 + order * 0.07 },
  });

  return (
    <div
      className={styles.collection}
      role="img"
      aria-label="A long note called Desk observations, a desk reference photo and a question sit side by side. One sentence of the note is selected and lifts out as its own block."
    >
      <div ref={ref} className={`${styles.collectMain} ${styles.drift}`}>
        <svg className={styles.wires} aria-hidden="true">
          {wires[0] && (
            <motion.path
              d={wires[0].d}
              className={styles.wireAccent}
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ ...spring(0.5), delay: 0.6 }}
            />
          )}
        </svg>
        <motion.div {...arrive(0)}>
          <NoteCard tag={sources.note.id} title={sources.note.title} node="S1" wellClassName={styles.collectWell}>
            {chunks.map((chunk, index) => (
              <p key={chunk.id}>
                <span className={index === 0 ? styles.pick : cardStyles.lead}>{chunk.lead}</span>
                <span className={cardStyles.rest}> {chunk.rest}</span>
              </p>
            ))}
          </NoteCard>
        </motion.div>
        {/* The block rises from the sentence it was cut from. */}
        <motion.div
          className={styles.collectChunk}
          initial={reduced ? false : { opacity: 0, x: -30, y: -84, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          transition={{ ...spring(0.5), delay: 0.46 }}
        >
          <ChunkCard chunk={C1} node="C1" selected />
        </motion.div>
      </div>

      <div className={styles.collectSide}>
        <div className={`${styles.collectPhoto} ${styles.drift}`}>
          <motion.div {...arrive(1)}><PhotoCard /></motion.div>
        </div>
        <div className={`${styles.collectQuestion} ${styles.drift}`}>
          <motion.div {...arrive(2)}><QuestionCard /></motion.div>
        </div>
      </div>
    </div>
  );
}
