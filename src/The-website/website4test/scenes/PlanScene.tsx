import type { CSSProperties } from 'react';
import { MiniCard, NoteCard } from '../components/ResearchCard';
import { C1, C2, C3, lanes, outline, PROJECT_TITLE, question, tasks } from '../researchStory';
import styles from './Scenes.module.css';

const RESEARCH = [C1, C2, C3, question] as const;
const [T1, T2, T3] = tasks;

function Task({ task, className }: { task: typeof tasks[number]; className?: string }) {
  return (
    <div className={`${styles.task} ${className ?? ''}`}>
      <span className={styles.taskId}>{task.id}</span>
      <span>{task.title}</span>
    </div>
  );
}

/** 06 — the plan. The same pieces redistribute into research, outline and
 * board. The outline and tasks are things a person writes; the only change
 * shown on the board is one task being moved to the next lane. */
export function PlanScene() {
  return (
    <div className={styles.plan}>
      <div className={`${styles.planZone} ${styles.planResearch}`}>
        <span className={styles.zoneLabel}>Research</span>
        <div className={styles.planStack}>
          {RESEARCH.map(piece => <MiniCard key={piece.id} id={piece.id} text={piece.lead} />)}
        </div>
      </div>

      <div className={`${styles.planZone} ${styles.planOutline}`}>
        <span className={styles.zoneLabel}>Outline</span>
        <NoteCard title={`${outline.title} · ${PROJECT_TITLE}`}>
          <ol className={styles.outlineParts}>
            {outline.parts.map((part, index) => (
              <li key={part.name} style={{ '--i': index } as CSSProperties}>
                <span className={styles.partIndex}>{index + 1}</span>
                <span className={styles.partText}>
                  <strong>{part.name}</strong>
                  <span>{part.line}</span>
                </span>
                <span className={styles.partRefs}>{part.refs.map(id => <i key={id}>{id}</i>)}</span>
              </li>
            ))}
          </ol>
        </NoteCard>
      </div>

      <div className={`${styles.planZone} ${styles.planBoard}`}>
        <span className={styles.zoneLabel}>Board</span>
        <div className={styles.board}>
          <div className={styles.lane}>
            <div className={styles.laneHead}><i />{lanes[0]}</div>
            <span className={styles.taskSlot} />
            <Task task={T2} className={styles.taskShift} />
            <Task task={T3} className={styles.taskShift} />
          </div>
          <div className={styles.lane} data-lane="progress">
            <div className={styles.laneHead}><i />{lanes[1]}</div>
            <Task task={T1} className={styles.taskMoving} />
          </div>
          <div className={styles.lane} data-lane="done">
            <div className={styles.laneHead}><i />{lanes[2]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
