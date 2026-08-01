import React from 'react';
import { motion } from 'motion/react';
import { FileText } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Chip, Task } from './scene-kit';

/**
 * "Agile Workflows" — insights become tasks.
 *
 * Idea (unchanged): work streams across a Kanban board from backlog through
 * in-progress into done.
 *
 * The copy's actual promise is "extract tasks directly from your notes", and
 * the old scene never showed a note — it opened on a finished board. This one
 * starts where the work starts: a real note with one checklist item lit up,
 * wired across into the To Do column, then the board carries it the rest of
 * the way. Columns are recessed wells so the cards sit on top of them.
 */

const inView = { once: true, margin: '-40px' } as const;

/** A board column: a recessed well with a header and a count. */
const Column: React.FC<{
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
  count: string;
  active?: boolean;
  delay?: number;
  children: React.ReactNode;
}> = ({ left, top, width, height, title, count, active = false, delay = 0, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 22 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.7, delay, type: 'spring', bounce: 0.25 }}
    viewport={inView}
    style={{
      position: 'absolute',
      left,
      top,
      width,
      height,
      zIndex: 4,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 9,
      borderRadius: 'var(--r-md)',
      background: 'var(--block-well)',
      border: `1px solid ${active ? 'var(--accent-wash)' : 'var(--line)'}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 7, borderBottom: '1px solid var(--line)' }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: active ? 'var(--accent-ink)' : 'var(--text-soft)',
        }}
      >
        {title}
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <Chip accent={active}>{count}</Chip>
      </span>
    </div>
    {children}
  </motion.div>
);

/** A task card on the board. */
const Card: React.FC<{
  label: string;
  accent?: boolean;
  done?: boolean;
  progress?: number;
  delay?: number;
}> = ({ label, accent = false, done = false, progress, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.85 }}
    whileInView={{ opacity: done ? 0.6 : 1, scale: 1 }}
    transition={{ duration: 0.6, delay, type: 'spring', bounce: 0.3 }}
    viewport={inView}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      padding: 9,
      borderRadius: 'var(--r-control)',
      background: 'var(--node-bg)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--line-strong)'}`,
      borderLeft: `3px solid ${accent ? 'var(--accent)' : 'var(--line-heavy)'}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Chip accent={accent}>{label}</Chip>
    </div>
    {done ? (
      <Task w="72%" done />
    ) : (
      <>
        <Line w="88%" />
        <Line w="56%" />
      </>
    )}
    {progress !== undefined && (
      <div style={{ height: 3, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${progress}%` }}
          transition={{ duration: 0.9, delay: delay + 0.25, ease: 'easeOut' }}
          viewport={inView}
          style={{ height: '100%', background: 'var(--accent)' }}
        />
      </div>
    )}
  </motion.div>
);

export const AgileWorkflowsIllustration: React.FC = () => (
  <SceneStage>
    <Plane width={780} height={330} tiltY={-11} tiltX={5}>


      {/* depth: other notes waiting to be mined for work */}
      <Ghost x={24} y={268} w={132} h={52} float="ftNodeFloat3" tilt={7} tz={-80} scale={0.7} opacity={0.14} spin={-5} delay={0.25}>
        <Line w="72%" />
        <Line w="48%" />
      </Ghost>
      <Ghost x={44} y={-18} w={120} h={46} float="ftNodeFloat4" tilt={5} tz={-90} scale={0.66} opacity={0.12} spin={5} delay={0.35}>
        <Line w="62%" />
      </Ghost>

      {/* the extraction: note → board */}
      <Wires>
        <Wire d="M 214,150 C 246,150 244,120 274,116" delay={0.55} accent width={1.4} />
      </Wires>

      {/* the source note — one item already lit up for extraction */}
      <NodeCard left={10} top={62} width={204} icon={FileText} title="Sprint notes" z={5} delay={0.1} from={{ x: -28 }}>
        <Line w="94%" />
        <Line w="70%" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            marginTop: 2,
            padding: '8px 9px',
            borderRadius: 'var(--r-control)',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-wash)',
            borderLeft: '3px solid var(--accent)',
          }}
        >
          <Task w="76%" />
          <Task w="58%" />
        </div>
      </NodeCard>

      <Column left={274} top={22} width={154} height={286} title="To do" count="2" delay={0.25}>
        <Card label="onboarding" accent delay={0.6} />
        <Card label="search" delay={0.7} />
      </Column>

      <Column left={444} top={22} width={154} height={286} title="In progress" count="1" active delay={0.32}>
        <Card label="editor" accent progress={62} delay={0.75} />
      </Column>

      <Column left={602} top={22} width={154} height={286} title="Done" count="2" delay={0.4}>
        <Card label="auth" done delay={0.8} />
        <Card label="canvas" done delay={0.88} />
      </Column>
    </Plane>
  </SceneStage>
);
