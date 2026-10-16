import { BlockCard, ChunkCard, PhotoCard, QuestionCard } from '../components/ResearchCard';
import { angle, C1, C2, C3 } from '../researchStory';
import { useWires, type WireSpec } from './useWires';
import styles from './Scenes.module.css';

const WIRES: readonly WireSpec[] = [
  { from: 'C1', to: 'C2', sides: ['right', 'left'], compactSides: ['bottom', 'top'] },
  { from: 'Q1', to: 'C1', sides: ['left', 'bottom'] },
  { from: 'Q1', to: 'C2', sides: ['right', 'bottom'], compactSides: ['top', 'bottom'] },
  { from: 'S2', to: 'C2', sides: ['bottom', 'top'] },
];

/** 03 — the connection. The pieces move first and the line is drawn after, so
 * the scene never suggests the canvas arranges or links anything by itself. */
export function ConnectionScene() {
  const { ref, wires } = useWires(WIRES);
  const [main, toC1, toC2, thread] = wires;

  return (
    <div ref={ref} className={styles.net}>
      <svg className={styles.wires} aria-hidden="true">
        {thread && <path d={thread.d} className={styles.wireThread} />}
        {toC1 && <path d={toC1.d} pathLength={1} className={`${styles.wireSoft} ${styles.netWireLeft}`} />}
        {toC2 && <path d={toC2.d} pathLength={1} className={styles.wireSoft} />}
        {main && (
          <>
            <path d={main.d} pathLength={1} className={styles.wireAccent} />
            <circle cx={main.from.x} cy={main.from.y} r={4.5} className={`${styles.handle} ${styles.handleFrom}`} />
            <circle cx={main.to.x} cy={main.to.y} r={4.5} className={`${styles.handle} ${styles.handleTo}`} />
          </>
        )}
      </svg>
      <PhotoCard node="S2" className={styles.netPhoto} />
      <ChunkCard chunk={C1} node="C1" className={`${styles.netC1} ${styles.netPicked}`} />
      <ChunkCard chunk={C2} node="C2" className={`${styles.netC2} ${styles.netPicked}`} />
      <QuestionCard node="Q1" className={styles.netQ1} />
      <ChunkCard chunk={C3} node="C3" className={styles.netC3} />
      <BlockCard tag="YOUR NOTE" className={styles.netAngle}><p>{angle}</p></BlockCard>
    </div>
  );
}
