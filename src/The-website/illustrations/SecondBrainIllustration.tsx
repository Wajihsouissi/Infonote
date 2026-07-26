import React from 'react';
import { motion } from 'motion/react';
import { FileText, Sparkles, CheckSquare, Image as ImageIcon, List, Link2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from '../MarketingPage.module.css';

/**
 * Hero "second brain" scene — the drill-in story, told in the same DOM /
 * wireframe language as InfiniteCanvasIllustration (card + ftUiLine +
 * ftGhostBlock, tilted cards, floating cursor). Flat and static by design:
 * no connectors, no drop shadows, no glows, no hover — colors are tokens only.
 *
 * LEFT: a normal linear note — blocks stacked in a card ("Meeting Notes"),
 * with a cursor hinting "double-click to open".
 * RIGHT: entering that card lays its blocks out on an infinite canvas — the
 * same blocks (Agenda / Action Items / Reference) now free-floating around
 * the live "Meeting Notes" node on a tilted, dotted board.
 */

type FloatClass = 'ftNodeFloat1' | 'ftNodeFloat2' | 'ftNodeFloat3' | 'ftNodeFloat4';

/** Base card box — replicates the flat card look without the shared class's hover. */
const cardBase: React.CSSProperties = {
  position: 'absolute',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  flexDirection: 'column',
};

/** A skeleton text row (finer than the 6px default .ftUiLine). */
const Line: React.FC<{ w: string; h?: number; fill?: string; opacity?: number }> = ({
  w,
  h = 4,
  fill = 'var(--line-strong)',
  opacity,
}) => <div className={styles.ftUiLine} style={{ width: w, height: h, background: fill, opacity }} />;

/** The shared image-block placeholder — reused from InfiniteCanvasIllustration. */
const ImagePlaceholder: React.FC<{ height: number }> = ({ height }) => (
  <div
    style={{
      height,
      background: 'var(--bg-rail)',
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <ImageIcon size={18} color="var(--text-soft)" />
  </div>
);

/** A faint background ghost block for the infinite-canvas backdrop. */
const Ghost: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  float: FloatClass;
  tilt: number;
  tz: number;
  scale: number;
  opacity: number;
  spin?: number;
  pad?: number;
  gap?: number;
  delay?: number;
  children?: React.ReactNode;
}> = ({ x, y, w, h, float, tilt, tz, scale, opacity, spin = 0, pad = 12, gap = 8, delay = 0, children }) => (
  <motion.div
    initial={{ opacity: 0, z: tz - 60, rotateY: tilt, rotateX: 4, rotateZ: spin, scale: scale }}
    whileInView={{ opacity, z: tz, rotateY: tilt, rotateX: 4, rotateZ: spin, scale: scale }}
    transition={{ duration: 1.2, delay: delay, type: "spring", bounce: 0.2 }}
    viewport={{ once: true, margin: "-50px" }}
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
      zIndex: 2,
    }}
  >
    {children}
  </motion.div>
);

/** A canvas node built from the shared primitives. Static, no hover; the
 * parent group supplies the 3D tilt. The accent hub is fully opaque. */
const MindNode: React.FC<{
  left: number;
  top: number;
  width: number;
  icon: LucideIcon;
  title: string;
  accent?: boolean;
  z?: number;
  delay?: number;
  children: React.ReactNode;
}> = ({ left, top, width, icon: Icon, title, accent = false, z = 4, delay = 0, children }) => {
  const edge = accent ? 'var(--accent)' : 'var(--line-strong)';
  const ink = accent ? 'var(--accent)' : 'var(--text-main)';
  return (
    <motion.div
      initial={{ opacity: 0, x: -200, y: 40, scale: 0.6 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: delay, type: "spring", bounce: 0.35 }}
      viewport={{ once: true, margin: "-50px" }}
      style={{
        ...cardBase,
        left,
        top,
        width,
        gap: 10,
        padding: 14,
        zIndex: z,
        // Opaque fill for the hub
        background: 'var(--bg-card)',
        border: `1px solid ${edge}`,
      }}
    >
      <div className={styles.ftUiCardHeader}>
        <div
          className={styles.ftUiIconBox}
          style={{ width: 20, height: 20, background: 'var(--bg-rail)', border: `1px solid ${edge}`, color: ink }}
        >
          <Icon size={12} />
        </div>
        <span className={styles.ftUiCardTitle} style={{ fontSize: 12, color: ink, fontWeight: accent ? 700 : 500 }}>
          {title}
        </span>
      </div>
      <div className={styles.ftUiCardBody} style={{ gap: 8 }}>
        {children}
      </div>
    </motion.div>
  );
};

export const SecondBrainIllustration: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: '1500px' }}>
      <div style={{ position: 'relative', width: 840, maxWidth: '100%', height: 460, transformStyle: 'preserve-3d' }}>

        {/* ── LEFT BACKGROUND PLANE: For the ghost metadata ── */}
        <div
          style={{
            position: 'absolute',
            left: -10,
            top: 25,
            width: 280,
            height: 400,
            transformStyle: 'preserve-3d',
            transform: 'perspective(1100px) rotateY(14deg) rotateX(4deg)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {/* Background: ghost metadata placeholders scattered behind the left linear note */}
          <Ghost x={-80} y={-60} w={150} h={70} float="ftNodeFloat2" tilt={8} tz={-80} scale={0.7} opacity={0.12} spin={-4} pad={12} gap={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, border: '1.5px solid var(--text-soft)' }} />
              <Line w="60%" h={4} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <div style={{ width: 36, height: 12, borderRadius: 6, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)' }} />
              <div style={{ width: 48, height: 12, borderRadius: 6, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)' }} />
            </div>
          </Ghost>

          <Ghost x={160} y={-50} w={160} h={86} float="ftNodeFloat4" tilt={-5} tz={-110} scale={0.65} opacity={0.1} spin={6} pad={14} gap={10}>
             <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-soft)', letterSpacing: 1 }}>PROPERTIES</div>
             <Line w="100%" h={3} opacity={0.5} />
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <Line w="30%" h={4} />
               <Line w="40%" h={4} />
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <Line w="20%" h={4} />
               <Line w="50%" h={4} />
             </div>
          </Ghost>

          <Ghost x={-100} y={130} w={140} h={80} float="ftNodeFloat3" tilt={12} tz={-130} scale={0.75} opacity={0.11} spin={-8} pad={14} gap={10}>
            <Line w="80%" h={4} />
            <Line w="50%" h={4} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
               <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-soft)' }} />
               <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-soft)' }} />
               <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-soft)' }} />
            </div>
          </Ghost>

          <Ghost x={230} y={100} w={150} h={90} float="ftNodeFloat1" tilt={-8} tz={-70} scale={0.8} opacity={0.14} spin={4} pad={14} gap={8}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <Link2 size={12} color="var(--text-soft)" />
              <Line w="60%" h={4} />
            </div>
            <Line w="100%" h={3} opacity={0.5} />
            <Line w="70%" h={4} />
            <Line w="85%" h={4} />
          </Ghost>

          <Ghost x={190} y={240} w={130} h={110} float="ftNodeFloat2" tilt={6} tz={-90} scale={0.7} opacity={0.12} spin={-3} pad={12} gap={8}>
            <Line w="100%" h={4} />
            <Line w="90%" h={4} />
            <Line w="70%" h={4} />
            <Line w="40%" h={4} />
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--text-soft)' }} />
            </div>
          </Ghost>

          <Ghost x={-70} y={280} w={160} h={60} float="ftNodeFloat4" tilt={-12} tz={-60} scale={0.8} opacity={0.15} spin={5} pad={10} gap={6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
               <div style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--text-soft)' }} />
               <Line w="50%" h={4} />
            </div>
            <Line w="80%" h={4} />
          </Ghost>
          
          <Ghost x={60} y={370} w={180} h={70} float="ftNodeFloat3" tilt={10} tz={-120} scale={0.65} opacity={0.1} spin={-6} pad={12} gap={8}>
             <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-soft)', letterSpacing: 1, textTransform: 'uppercase' }}>Tags</div>
             <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
               <div style={{ width: 40, height: 14, borderRadius: 8, border: '1px solid var(--text-soft)' }} />
               <div style={{ width: 50, height: 14, borderRadius: 8, border: '1px solid var(--text-soft)' }} />
               <div style={{ width: 30, height: 14, borderRadius: 8, border: '1px solid var(--text-soft)' }} />
             </div>
          </Ghost>
        </div>        {/* ── LEFT: the linear note (blocks stacked in a card) ── */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, type: "spring", bounce: 0.2 }}
          viewport={{ once: true, margin: "-50px" }}
          style={{
            position: 'absolute',
            left: -10,
            top: 25,
            zIndex: 6,
          }}
        >
          <div
            style={{
              ...cardBase,
              width: 280,
              padding: 20,
              gap: 16,
              transform: 'perspective(1100px) rotateY(14deg) rotateX(4deg)',
              background: 'var(--bg-card)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--line-strong)', marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={16} />
            </div>
            <span style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>Meeting Notes</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Block: Heading */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-soft)' }}>H</span>
                </div>
                <Line w="70%" h={8} />
              </div>
              <Line w="100%" h={4} />
              <Line w="85%" h={4} />
            </div>

            {/* Block: Action Items checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <Line w="75%" h={4} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--line-strong)', background: 'transparent' }} />
                <Line w="75%" h={4} />
              </div>
            </div>

            {/* Extra block to make it long */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 3, height: 24, background: 'var(--accent)', borderRadius: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                  <Line w="90%" h={4} />
                  <Line w="60%" h={4} />
                </div>
              </div>
            </div>

            {/* Block: Reference image */}
            <div
              style={{
                height: 80,
                background: 'var(--bg-rail)',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4
              }}
            >
              <ImageIcon size={20} color="var(--text-soft)" />
            </div>
          </div>
        </div>
        </motion.div>

        {/* ── RIGHT: the blocks laid out on a tilted infinite-canvas board ── */}
        <div
          style={{
            position: 'absolute',
            left: 356,
            top: 12,
            width: 470,
            height: 440,
            transformStyle: 'preserve-3d',
            transform: 'perspective(1600px) rotateY(-17deg) rotateX(7deg)',
            zIndex: 3,
          }}
        >
          {/* Edge-faded 16:9 infinite-canvas board */}
          <div
            style={{
              position: 'absolute',
              left: -44,
              top: 4,
              width: 724,
              height: 407,
              borderRadius: 22,
              background: 'var(--bg-inset)',
              backgroundImage: 'radial-gradient(circle, var(--dot) 1.4px, transparent 1.4px)',
              backgroundSize: '26px 26px',
              border: '1px solid var(--line-strong)',
              opacity: 0.30,
              WebkitMaskImage: 'radial-gradient(ellipse 74% 80% at 42% 50%, #000 68%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 74% 80% at 42% 50%, #000 68%, transparent 100%)',
              zIndex: 0,
            }}
          />

          {/* Dotted connecting lines */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}>
            {/* To Agenda */}
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.6, ease: "easeOut" }}
              d="M 236,168 C 236,130 150,130 150,98"
              fill="none"
              stroke="var(--text-soft)"
              strokeOpacity={0.2}
              strokeWidth="1.2"
              strokeDasharray="4 5"
            />
            {/* To Action Items */}
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.7, ease: "easeOut" }}
              d="M 322,204 C 334,204 330,148 344,148"
              fill="none"
              stroke="var(--text-soft)"
              strokeOpacity={0.2}
              strokeWidth="1.2"
              strokeDasharray="4 5"
            />
            {/* To Reference */}
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
              d="M 236,240 C 236,280 206,280 206,312"
              fill="none"
              stroke="var(--text-soft)"
              strokeOpacity={0.2}
              strokeWidth="1.2"
              strokeDasharray="4 5"
            />
          </svg>

          {/* Ghost Blocks floating over the canvas */}
          <Ghost x={-20} y={10} w={150} h={96} float="ftNodeFloat3" tilt={-5} tz={40} scale={0.85} opacity={0.3} delay={0.2}>
            <Line w="100%" /><Line w="80%" /><Line w="92%" /><Line w="60%" />
          </Ghost>
          
          <Ghost x={300} y={-10} w={140} h={96} float="ftNodeFloat4" tilt={5} tz={20} scale={0.7} opacity={0.3} pad={10} delay={0.4}>
            <div style={{ flex: 1, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImageIcon size={16} color="var(--text-soft)" />
            </div>
          </Ghost>

          <Ghost x={380} y={220} w={150} h={112} float="ftNodeFloat3" tilt={8} tz={60} scale={0.8} opacity={0.25} pad={0} delay={0.5}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line-strong)', background: 'var(--bg-rail)', padding: '10px 12px', gap: 10 }}>
              <Line w="100%" /><Line w="100%" /><Line w="100%" />
            </div>
            <div style={{ display: 'flex', padding: 12, gap: 10 }}>
              <Line w="100%" h={3} /><Line w="100%" h={3} /><Line w="100%" h={3} />
            </div>
            <div style={{ display: 'flex', padding: '0 12px', gap: 10 }}>
              <Line w="100%" h={3} /><Line w="100%" h={3} /><Line w="100%" h={3} />
            </div>
          </Ghost>

          <Ghost x={-10} y={320} w={165} h={58} float="ftNodeFloat4" tilt={-8} tz={30} scale={0.9} opacity={0.35} pad={12} gap={12} delay={0.6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', padding: 6, borderRadius: 'var(--radius-sm)' }}>
                <Link2 size={12} color="var(--text-soft)" />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Line w="100%" /><Line w="60%" />
              </div>
            </div>
          </Ghost>

          <Ghost x={220} y={370} w={195} h={82} float="ftNodeFloat1" tilt={-4} tz={50} scale={0.72} opacity={0.25} pad={16} gap={12} delay={0.7}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-soft)', fontWeight: 700 }}>H1</span>
              </div>
              <Line w="60%" h={6} />
            </div>
            <Line w="90%" /><Line w="70%" />
          </Ghost>

          <Ghost x={180} y={60} w={125} h={70} float="ftNodeFloat2" tilt={6} tz={-10} scale={0.8} opacity={0.3} delay={0.3}>
            <Line w="100%" /><Line w="60%" />
          </Ghost>

          {/* Central hub — the same note, now the live canvas node (opaque) */}
          <MindNode left={150} top={168} width={172} icon={Sparkles} title="Meeting Notes" accent z={5} delay={0.3}>
            <Line w="100%" fill="var(--accent)" opacity={0.5} />
            <Line w="62%" fill="var(--accent)" opacity={0.32} />
          </MindNode>

          {/* Block: Agenda */}
          <MindNode left={72} top={26} width={156} icon={List} title="Agenda" delay={0.45}>
            <Line w="100%" />
            <Line w="72%" />
          </MindNode>

          {/* Block: Action Items */}
          <MindNode left={344} top={104} width={156} icon={CheckSquare} title="Action Items" delay={0.55}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <Line w="70%" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid var(--line-strong)' }} />
              <Line w="55%" />
            </div>
          </MindNode>

          {/* Block: Reference (shared image placeholder) */}
          <MindNode left={128} top={312} width={156} icon={ImageIcon} title="Reference" delay={0.65}>
            <ImagePlaceholder height={46} />
          </MindNode>
        </div>

        {/* Cursor: the "enter the card" gesture */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          viewport={{ once: true, margin: "-50px" }}
          className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`} 
          style={{ top: 152, left: 194, zIndex: 100 }}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="var(--text-main)" stroke="var(--bg-rail)" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M0,0 L6,16 L9.5,9.5 L16,6 Z" />
          </svg>
          <div className={styles.ftUiCursorLabel} style={{ background: 'var(--bg-rail)', color: 'var(--text-main)', border: '1px solid var(--line-strong)' }}>Double-click to open</div>
        </motion.div>
      </div>
    </div>
  );
};
