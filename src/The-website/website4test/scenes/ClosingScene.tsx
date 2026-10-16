import { Plus } from 'lucide-react';
import styles from './Scenes.module.css';

/* Each frame is a diagram of a stage, not a shrunken screenshot: shapes stand
   in for content so no text is reduced to decoration. */
const FRAMES = [
  {
    name: 'Collected',
    art: (
      <>
        <rect className="shape" x="18" y="16" width="52" height="60" rx="5" />
        <path className="ink" d="M27 30h34M27 40h28M27 50h34M27 60h20" />
        <rect className="photo" x="62" y="34" width="42" height="32" rx="4" transform="rotate(6 83 50)" />
      </>
    ),
  },
  {
    name: 'Cut',
    art: (
      <>
        <rect className="shape" x="16" y="14" width="62" height="18" rx="4" />
        <rect className="shape" x="42" y="37" width="62" height="18" rx="4" />
        <rect className="shape" x="24" y="60" width="62" height="18" rx="4" />
        <path className="ink" d="M24 23h34M50 46h38M32 69h30" />
      </>
    ),
  },
  {
    name: 'Connected',
    art: (
      <>
        <rect className="shape" x="10" y="20" width="42" height="18" rx="4" />
        <rect className="shape" x="68" y="34" width="42" height="18" rx="4" />
        <rect className="shape" x="34" y="62" width="46" height="16" rx="4" />
        <path className="signal" d="M52 29c10 0 6 14 16 14" />
        <path className="ink" d="M34 70c-12 0-8-22-3-32M80 70c12 0 12-10 9-18" />
      </>
    ),
  },
  {
    name: 'Planned',
    art: (
      <>
        <path className="ink" d="M12 24h28M12 36h22M12 48h28M12 60h18" />
        <rect className="shape" x="52" y="16" width="58" height="60" rx="5" />
        <path className="ink" d="M71 22v48M91 22v48" />
        <rect className="shape" x="56" y="24" width="11" height="9" rx="2" />
        <rect className="shape" x="56" y="37" width="11" height="9" rx="2" />
        <rect className="signal" x="75" y="24" width="12" height="9" rx="2" />
      </>
    ),
  },
] as const;

/** The closing strip: the same research as an edit timeline, ending on an
 * empty frame that belongs to the visitor. */
export function ClosingScene() {
  return (
    <ol className={styles.strip} aria-label="The story so far: collected, cut, connected, planned. The last frame is empty.">
      {FRAMES.map((frame, index) => (
        <li key={frame.name} className={styles.frame}>
          <div className={styles.frameArt} aria-hidden="true">
            <svg viewBox="0 0 120 92" focusable="false">{frame.art}</svg>
          </div>
          <span className={styles.frameName}><b>0{index + 1}</b>{frame.name}</span>
        </li>
      ))}
      <li className={`${styles.frame} ${styles.frameOpen}`}>
        <div className={styles.frameArt} aria-hidden="true"><Plus strokeWidth={1.6} /></div>
        <span className={styles.frameName}>Your next idea</span>
      </li>
    </ol>
  );
}
