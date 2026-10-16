import { Lock, Sparkles } from 'lucide-react';
import { ChunkCard, SelectionCorners } from '../components/ResearchCard';
import { assist, C3 } from '../researchStory';
import { useWires, type WireSpec } from './useWires';
import styles from './Scenes.module.css';

const WIRES: readonly WireSpec[] = [{ from: 'C3', to: 'AI', sides: ['right', 'left'], compactSides: ['bottom', 'top'] }];

/** 05 — the thinking partner. The response arrives as one readable block:
 * no typing effect and no invented processing time. It is labelled as an
 * example, and the sign-in requirement is stated where the panel is. */
export function AssistScene() {
  const { ref, wires } = useWires(WIRES);

  return (
    <div ref={ref} className={styles.assist}>
      <svg className={styles.wires} aria-hidden="true">
        {wires[0] && <path d={wires[0].d} pathLength={1} className={styles.wireSoft} />}
      </svg>
      <div className={styles.assistSource} data-node="C3">
        <ChunkCard chunk={C3} full />
        <span className={styles.assistSelect}><SelectionCorners /></span>
      </div>
      <div className={styles.assistPanel} data-node="AI">
        <div className={styles.assistHead}><Sparkles size={15} strokeWidth={1.7} /> AI assistance</div>
        <p className={styles.assistPrompt}>{assist.prompt}</p>
        <ol className={styles.assistAnswer}>
          {assist.answers.map(answer => <li key={answer}>{answer}</li>)}
        </ol>
        <div className={styles.assistFoot}><Lock size={12} strokeWidth={1.8} /> {assist.disclaimer}</div>
      </div>
    </div>
  );
}
