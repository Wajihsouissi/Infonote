import React from 'react';
import { motion, type TargetAndTransition, type Transition } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import styles from '../MarketingPage.module.css';

/**
 * Shared vocabulary for every marketing illustration.
 *
 * Scenes are real DOM cards on a tilted, dotted canvas board — product UI, not
 * technical diagrams. A scene is a `SceneStage` holding one or more `Plane`s;
 * a plane holds `NodeCard`s (product chrome: icon box, title, skeleton rows)
 * with `Ghost`s behind and `Wire`s between.
 *
 * Palette is the expanded note card's, straight from design-system.css:
 * `--node-bg` body, `--line-strong` edge, `--block-well` recessed wells,
 * `--text-main/soft` type, and `--accent` reserved for the ONE focal element
 * in each scene.
 *
 * MOTION — two modes, chosen per scene on `SceneStage`:
 *  - `reveal` (default): elements spring in on scroll (`whileInView`,
 *    `once: true`) and then rest. No perpetual loops.
 *  - `reveal={false}`: elements render in their final state immediately. Use
 *    this when something OUTSIDE the scene drives the motion — the three
 *    walkthrough steps are keyed to a scroll-linked `activeStep`, and their
 *    shared title/video travel between steps via framer-motion `layoutId`.
 *    A viewport-gated opacity would fight that hand-off.
 */

export type FloatClass = 'ftNodeFloat1' | 'ftNodeFloat2' | 'ftNodeFloat3' | 'ftNodeFloat4';

/** Default authoring box — the accordion pane is ~767x336. */
export const SCENE_W = 780;
export const SCENE_H = 330;

/**
 * The board bleeds past the authored box and the 3D tilt projects wider still,
 * so the fit basis adds a margin rather than using the raw scene box.
 */
const BLEED_W = 100;
const BLEED_H = 26;

const spring = (delay: number, duration = 0.8, bounce = 0.3) =>
  ({ duration, delay, type: 'spring', bounce }) as const;

const inView = { once: true, margin: '-40px' } as const;

/** Whether the scene's elements should spring in on scroll. */
const RevealContext = React.createContext(true);

/**
 * Applies the scene's motion mode to a motion-component's props. In reveal
 * mode the element springs from `from` to `to`; otherwise it just renders at
 * `to` with no animation at all.
 */
function useReveal(
  from: TargetAndTransition,
  to: TargetAndTransition,
  transition: Transition,
) {
  const reveal = React.useContext(RevealContext);
  if (!reveal) return { initial: false as const, animate: to };
  return { initial: from, whileInView: to, transition, viewport: inView };
}

/* ── Stage & planes ────────────────────────────────────────────────── */

/**
 * Scenes are authored at a fixed width x height so every element can be placed
 * absolutely. Containers are narrower on small viewports (and some clip
 * overflow), so the stage measures itself and scales the whole composition
 * down to fit instead of cropping it.
 */
export const SceneStage: React.FC<{
  width?: number;
  height?: number;
  /** See the MOTION note above. */
  reveal?: boolean;
  children: React.ReactNode;
}> = ({ width = SCENE_W, height = SCENE_H, reveal = true, children }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => {
      const box = host.getBoundingClientRect();
      if (!box.width || !box.height) return;
      setScale(Math.min(1, box.width / (width + BLEED_W), box.height / (height + BLEED_H)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [width, height]);

  return (
    <RevealContext.Provider value={reveal}>
      <div
        ref={hostRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: '1500px',
          /* the tilt projects a little past the authored box; let it spill into
             the container's padding rather than clipping a card in half */
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'relative',
            width,
            height,
            flexShrink: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
          }}
        >
          {children}
        </div>
      </div>
    </RevealContext.Provider>
  );
};

/** A 3D-tilted group. Children position themselves in the plane's own space. */
export const Plane: React.FC<{
  left?: number;
  top?: number;
  width: number;
  height: number;
  tiltY?: number;
  tiltX?: number;
  z?: number;
  children: React.ReactNode;
}> = ({ left = 0, top = 0, width, height, tiltY = -14, tiltX = 6, z = 2, children }) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
      transformStyle: 'preserve-3d',
      transform: `perspective(1500px) rotateY(${tiltY}deg) rotateX(${tiltX}deg)`,
      zIndex: z,
    }}
  >
    {children}
  </div>
);

/** The dotted infinite-canvas board, edge-faded so it melts into the page. */
export const Board: React.FC<{ left?: number; top?: number; width: number; height: number }> = ({
  left = 0,
  top = 0,
  width,
  height,
}) => (
  <div
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
      borderRadius: 22,
      background: 'var(--bg-inset)',
      backgroundImage: 'radial-gradient(circle, var(--dot) 1.4px, transparent 1.4px)',
      backgroundSize: '26px 26px',
      border: '1px solid var(--line-strong)',
      opacity: 0.3,
      WebkitMaskImage: 'radial-gradient(ellipse 76% 82% at 50% 50%, #000 66%, transparent 100%)',
      maskImage: 'radial-gradient(ellipse 76% 82% at 50% 50%, #000 66%, transparent 100%)',
      zIndex: 0,
    }}
  />
);

/* ── Atoms ─────────────────────────────────────────────────────────── */

/** A skeleton text row. */
export const Line: React.FC<{ w: string; h?: number; fill?: string; opacity?: number }> = ({
  w,
  h = 4,
  fill = 'var(--line-strong)',
  opacity,
}) => <div className={styles.ftUiLine} style={{ width: w, height: h, background: fill, opacity }} />;

/** Square icon well — the note card's icon button, shrunk. */
export const IconBox: React.FC<{ icon: LucideIcon; size?: number; edge?: string; ink?: string }> = ({
  icon: Icon,
  size = 20,
  edge = 'var(--line-strong)',
  ink = 'var(--text-main)',
}) => (
  <div
    className={styles.ftUiIconBox}
    style={{ width: size, height: size, background: 'var(--block-well)', border: `1px solid ${edge}`, color: ink }}
  >
    <Icon size={Math.round(size * 0.6)} />
  </div>
);

/** A metadata pill. */
export const Chip: React.FC<{ children: React.ReactNode; accent?: boolean; muted?: boolean }> = ({
  children,
  accent = false,
  muted = false,
}) => (
  <span
    style={{
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: 'var(--radius-pill)',
      background: accent ? 'var(--accent-dim)' : 'var(--block-well)',
      color: accent ? 'var(--accent-ink)' : muted ? 'var(--text-faint)' : 'var(--text-soft)',
      border: `1px solid ${accent ? 'var(--accent-wash)' : 'var(--line)'}`,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

/** A recessed media well. */
export const Well: React.FC<{ height: number; icon?: LucideIcon }> = ({ height, icon: Icon }) => (
  <div
    style={{
      height,
      background: 'var(--block-well)',
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--r-control)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {Icon && <Icon size={14} color="var(--text-soft)" />}
  </div>
);

/** A checklist row — checked rows carry the accent. */
export const Task: React.FC<{ w: string; done?: boolean }> = ({ w, done = false }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {done ? (
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="4">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    ) : (
      <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid var(--line-strong)', flexShrink: 0 }} />
    )}
    <Line w={w} opacity={done ? 0.5 : undefined} />
  </div>
);

/* ── Cards ─────────────────────────────────────────────────────────── */

/** A canvas node: the expanded note card's skin at illustration scale. */
export const NodeCard: React.FC<{
  left: number;
  top: number;
  width: number;
  icon?: LucideIcon;
  title: string;
  /** The one focal node in the scene. */
  accent?: boolean;
  /** Archived / de-emphasised. */
  muted?: boolean;
  badge?: React.ReactNode;
  z?: number;
  delay?: number;
  from?: { x?: number; y?: number };
  /** `lg` is for hero-scale scenes where the card is the subject, not a satellite. */
  size?: 'sm' | 'lg';
  /** Divide the header from the body, the way a note card's cover band does. */
  ruled?: boolean;
  children?: React.ReactNode;
}> = ({
  left,
  top,
  width,
  icon,
  title,
  accent = false,
  muted = false,
  badge,
  z = 4,
  delay = 0,
  from,
  size = 'sm',
  ruled = false,
  children,
}) => {
  const lg = size === 'lg';
  const edge = accent ? 'var(--accent)' : 'var(--line-strong)';
  const ink = accent ? 'var(--accent)' : 'var(--text-main)';
  const motionProps = useReveal(
    { opacity: 0, scale: 0.7, x: from?.x ?? 0, y: from?.y ?? 24 },
    { opacity: muted ? 0.55 : 1, scale: 1, x: 0, y: 0 },
    spring(delay),
  );
  return (
    <motion.div
      {...motionProps}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        zIndex: z,
        display: 'flex',
        flexDirection: 'column',
        gap: lg ? 14 : 9,
        padding: lg ? 18 : 12,
        borderRadius: 'var(--r-md)',
        background: 'var(--node-bg)',
        border: `1px solid ${edge}`,
        /* the node's left binding, exactly as a fused note wears it */
        borderLeft: accent ? '3px solid var(--accent)' : `1px solid ${edge}`,
      }}
    >
      <div
        className={styles.ftUiCardHeader}
        style={{
          gap: lg ? 10 : 7,
          paddingBottom: ruled ? (lg ? 12 : 8) : 0,
          borderBottom: ruled ? '1px solid var(--line)' : 'none',
        }}
      >
        {icon && <IconBox icon={icon} size={lg ? 26 : 18} edge={edge} ink={ink} />}
        <span
          className={styles.ftUiCardTitle}
          style={{ fontSize: lg ? 15 : 11, color: ink, fontWeight: accent ? 700 : 600, letterSpacing: '-0.01em' }}
        >
          {title}
        </span>
        {badge && <span style={{ marginLeft: 'auto', display: 'flex' }}>{badge}</span>}
      </div>
      {children && (
        <div className={styles.ftUiCardBody} style={{ gap: lg ? 11 : 7 }}>
          {children}
        </div>
      )}
    </motion.div>
  );
};

/** A faint background card that gives the board depth. */
export const Ghost: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  float?: FloatClass;
  tilt?: number;
  tz?: number;
  scale?: number;
  opacity?: number;
  spin?: number;
  pad?: number;
  gap?: number;
  delay?: number;
  children?: React.ReactNode;
}> = ({
  x,
  y,
  w,
  h,
  float = 'ftNodeFloat1',
  tilt = 0,
  tz = 0,
  scale = 0.8,
  opacity = 0.25,
  spin = 0,
  pad = 12,
  gap = 8,
  delay = 0,
  children,
}) => {
  const motionProps = useReveal(
    { opacity: 0, z: tz - 50, rotateY: tilt, rotateX: 4, rotateZ: spin, scale },
    { opacity, z: tz, rotateY: tilt, rotateX: 4, rotateZ: spin, scale },
    spring(delay, 1.1, 0.2),
  );
  return (
    <motion.div
      {...motionProps}
      className={`${styles.ftGhostBlock} ${styles[float]}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        display: 'flex',
        flexDirection: 'column',
        padding: pad,
        gap,
        zIndex: 1,
      }}
    >
      {children}
    </motion.div>
  );
};

/* ── Connectors ────────────────────────────────────────────────────── */

/** The SVG layer connectors live in. Sits between board and cards. */
export const Wires: React.FC<{ children: React.ReactNode; z?: number }> = ({ children, z = 3 }) => (
  <svg
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: z, overflow: 'visible' }}
  >
    {children}
  </svg>
);

/** A dotted link that draws itself once on scroll. */
export const Wire: React.FC<{ d: string; delay?: number; accent?: boolean; width?: number }> = ({
  d,
  delay = 0,
  accent = false,
  width = 1.2,
}) => {
  const motionProps = useReveal(
    { pathLength: 0, opacity: 0 },
    { pathLength: 1, opacity: 1 },
    { duration: 1.2, delay, ease: 'easeOut' },
  );
  return (
    <motion.path
      {...motionProps}
      d={d}
      fill="none"
      stroke={accent ? 'var(--accent)' : 'var(--text-soft)'}
      strokeOpacity={accent ? 0.6 : 0.32}
      strokeWidth={width}
      strokeDasharray="4 5"
      strokeLinecap="round"
    />
  );
};

/** Floating cursor with a label — the "someone is doing this" cue. */
export const Cursor: React.FC<{ top: number; left: number; label: string; delay?: number }> = ({
  top,
  left,
  label,
  delay = 0.8,
}) => {
  const motionProps = useReveal({ opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }, { duration: 0.5, delay });
  return (
  <motion.div
    {...motionProps}
    className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`}
    style={{ top, left, zIndex: 100 }}
  >
    <svg width="15" height="15" viewBox="0 0 16 16" fill="var(--text-main)" stroke="var(--bg-inset)" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M0,0 L6,16 L9.5,9.5 L16,6 Z" />
    </svg>
    <div
      className={styles.ftUiCursorLabel}
      style={{ background: 'var(--menu-bg)', color: 'var(--node-title)', border: '1px solid var(--menu-border)', fontSize: 9, padding: '1px 6px' }}
    >
      {label}
    </div>
  </motion.div>
  );
};

/** Small uppercase caption used to name a region of the scene. */
export const Caption: React.FC<{ left: number; top: number; children: React.ReactNode; delay?: number }> = ({
  left,
  top,
  children,
  delay = 0,
}) => {
  const motionProps = useReveal({ opacity: 0 }, { opacity: 1 }, { duration: 0.6, delay });
  return (
    <motion.div
      {...motionProps}
      style={{
        position: 'absolute',
        left,
        top,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        zIndex: 5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </motion.div>
  );
};

/* ── Floating chrome ───────────────────────────────────────────────── */

/**
 * A status chip that floats off the board — popover chrome, so it uses the
 * menu tokens rather than the node ones.
 */
export const FloatingPanel: React.FC<{
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ leading, title, subtitle, delay = 0.5, style }) => {
  const motionProps = useReveal({ opacity: 0, y: 10 }, { opacity: 1, y: 0 }, spring(delay, 0.6, 0.25));
  return (
    <motion.div
      {...motionProps}
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 13px',
        borderRadius: 'var(--r-md)',
        background: 'var(--menu-bg)',
        border: '1px solid var(--menu-border)',
        boxShadow: 'var(--menu-shadow)',
        zIndex: 40,
        ...style,
      }}
    >
      {leading}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--node-title)' }}>
          {title}
        </span>
        {subtitle && <span style={{ fontSize: 9, color: 'var(--node-meta)' }}>{subtitle}</span>}
      </div>
    </motion.div>
  );
};

/** The "something is happening" dot — the only looping motion in the kit. */
export const PulseDot: React.FC = () => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: '50%',
      background: 'var(--accent-dim)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <motion.div
      animate={{ opacity: [1, 0.25, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}
    />
  </div>
);
