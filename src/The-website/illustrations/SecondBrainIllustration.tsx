import React from 'react';
import { FileText, Sparkles, CheckSquare, Image as ImageIcon, List, Link2 } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Task, Well, Cursor, Chip } from './scene-kit';

/**
 * Hero "second brain" scene — the drill-in story.
 *
 * Idea (unchanged): LEFT, an ordinary linear note with its blocks stacked in a
 * card. RIGHT, entering that card lays those same blocks out on the infinite
 * canvas — Agenda / Action Items / Reference now free-floating around the live
 * "Meeting Notes" node. A cursor hints at the gesture that gets you there.
 *
 * Rebuilt on scene-kit so it speaks the same vocabulary as every other scene:
 * two tilted planes, `NodeCard`s on a dotted board, ghosts for depth, dotted
 * wires, one accent moment (the hub).
 */
export const SecondBrainIllustration: React.FC = () => (
  <SceneStage width={1000} height={460}>
    {/* ── LEFT: the linear note, blocks stacked in a document card ── */}
    <Plane left={0} top={0} width={330} height={460} tiltY={14} tiltX={4} z={5}>
      {/* stray captures drifting behind the note */}
      <Ghost x={-70} y={-34} w={140} h={62} float="ftNodeFloat2" tilt={8} tz={-80} scale={0.7} opacity={0.13} spin={-5} delay={0.2}>
        <Line w="70%" />
        <Line w="45%" />
      </Ghost>
      <Ghost x={196} y={82} w={132} h={70} float="ftNodeFloat1" tilt={-8} tz={-70} scale={0.75} opacity={0.14} spin={4} delay={0.3}>
        <Line w="80%" />
        <Line w="60%" />
        <Line w="40%" />
      </Ghost>
      <Ghost x={-56} y={330} w={150} h={56} float="ftNodeFloat4" tilt={-12} tz={-60} scale={0.78} opacity={0.15} spin={5} delay={0.4}>
        <Line w="55%" />
        <Line w="75%" />
      </Ghost>

      <NodeCard left={6} top={38} width={272} icon={FileText} title="Meeting Notes" size="lg" ruled z={6} delay={0.05} from={{ x: -34 }}>
        {/* heading block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: 'var(--block-well)',
              border: '1px solid var(--line-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-soft)' }}>H</span>
          </div>
          <Line w="70%" h={7} />
        </div>
        <Line w="100%" />
        <Line w="86%" />

        {/* checklist block */}
        <Task w="74%" done />
        <Task w="66%" />

        {/* quoted block with a rail */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 3, borderRadius: 2, background: 'var(--accent)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Line w="90%" />
            <Line w="58%" />
          </div>
        </div>

        {/* reference image block */}
        <Well height={62} icon={ImageIcon} />
      </NodeCard>
    </Plane>

    {/* ── RIGHT: the same blocks, exploded onto the canvas ── */}
    <Plane left={396} top={6} width={604} height={450} tiltY={-17} tiltX={7} z={3}>
      <Board left={-40} top={-6} width={690} height={452} />

      <Wires>
        <Wire d="M 300,214 C 300,168 208,168 208,128" delay={0.75} />
        <Wire d="M 420,248 C 452,248 448,190 476,190" delay={0.85} />
        <Wire d="M 300,300 C 300,344 268,344 268,378" delay={0.95} />
      </Wires>

      {/* ghost blocks scattered across the board */}
      <Ghost x={-6} y={22} w={150} h={92} float="ftNodeFloat3" tilt={-5} tz={40} scale={0.85} opacity={0.28} delay={0.35}>
        <Line w="100%" />
        <Line w="80%" />
        <Line w="92%" />
        <Line w="58%" />
      </Ghost>
      <Ghost x={412} y={4} w={140} h={90} float="ftNodeFloat4" tilt={5} tz={20} scale={0.72} opacity={0.28} pad={10} delay={0.45}>
        <Well height={58} icon={ImageIcon} />
      </Ghost>
      <Ghost x={452} y={278} w={148} h={104} float="ftNodeFloat3" tilt={8} tz={60} scale={0.8} opacity={0.24} delay={0.55}>
        <Line w="100%" />
        <Line w="72%" />
        <Line w="88%" />
      </Ghost>
      <Ghost x={-14} y={368} w={162} h={58} float="ftNodeFloat4" tilt={-8} tz={30} scale={0.88} opacity={0.3} pad={12} gap={10} delay={0.6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'var(--block-well)', border: '1px solid var(--line-strong)', padding: 5, borderRadius: 'var(--r-control)' }}>
            <Link2 size={11} color="var(--text-soft)" />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Line w="100%" />
            <Line w="58%" />
          </div>
        </div>
      </Ghost>
      <Ghost x={214} y={82} w={122} h={64} float="ftNodeFloat2" tilt={6} tz={-10} scale={0.78} opacity={0.26} delay={0.5}>
        <Line w="100%" />
        <Line w="60%" />
      </Ghost>

      {/* the block nodes */}
      <NodeCard left={128} top={44} width={156} icon={List} title="Agenda" delay={0.6}>
        <Line w="100%" />
        <Line w="70%" />
      </NodeCard>

      <NodeCard left={476} top={140} width={158} icon={CheckSquare} title="Action Items" delay={0.7}>
        <Task w="70%" done />
        <Task w="54%" />
      </NodeCard>

      <NodeCard left={190} top={378} width={156} icon={ImageIcon} title="Reference" delay={0.8}>
        <Well height={40} icon={ImageIcon} />
      </NodeCard>

      {/* the same note, now a live canvas node — the one accent moment */}
      <NodeCard
        left={196}
        top={214}
        width={182}
        icon={Sparkles}
        title="Meeting Notes"
        accent
        z={6}
        delay={0.45}
        badge={<Chip accent>live</Chip>}
      >
        <Line w="100%" fill="var(--accent)" opacity={0.5} />
        <Line w="62%" fill="var(--accent)" opacity={0.32} />
      </NodeCard>
    </Plane>

    {/* the gesture that connects the two halves */}
    <Cursor top={196} left={252} label="Double-click to open" delay={0.95} />
  </SceneStage>
);
