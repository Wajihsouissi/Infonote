import React from 'react';
import { Sparkles, Rocket, Layers, BookMarked, Archive, Link2 } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Chip, Task, Well } from './scene-kit';

/**
 * "Second Brain" — the P.A.R.A. method.
 *
 * Idea (unchanged): four method buckets — Projects, Areas, Resources,
 * Archives — all routing into one central repository.
 *
 * Told as product UI rather than a diagram: four real note cards on a tilted
 * canvas board, wired into an accented "Second Brain" hub. Each bucket shows
 * the kind of content it actually holds (a live checklist, standing areas, a
 * saved reference, cold storage), and Archives is visibly dimmed so the four
 * read as a hierarchy of attention rather than four equal boxes.
 */
export const ParaMethodIllustration: React.FC = () => (
  <SceneStage>
    <Plane width={780} height={330} tiltY={-12} tiltX={6}>


      {/* depth: stray captures drifting behind the board */}
      <Ghost x={150} y={-4} w={120} h={54} float="ftNodeFloat3" tilt={6} tz={-70} scale={0.7} opacity={0.16} spin={-5} delay={0.15}>
        <Line w="80%" />
        <Line w="55%" />
      </Ghost>
      <Ghost x={500} y={262} w={132} h={56} float="ftNodeFloat2" tilt={-6} tz={-60} scale={0.72} opacity={0.14} spin={4} delay={0.25}>
        <Line w="70%" />
        <Line w="45%" />
      </Ghost>
      <Ghost x={330} y={-18} w={110} h={48} float="ftNodeFloat4" tilt={4} tz={-90} scale={0.65} opacity={0.12} spin={6} delay={0.35}>
        <Line w="65%" />
      </Ghost>

      <Wires>
        <Wire d="M 190,66 C 250,66 254,146 302,150" delay={0.55} />
        <Wire d="M 190,226 C 250,226 254,186 302,182" delay={0.65} />
        <Wire d="M 590,66 C 530,66 526,146 478,150" delay={0.6} />
        <Wire d="M 590,226 C 530,226 526,186 478,182" delay={0.7} />
      </Wires>

      {/* [P] Projects — short-horizon, has a live checklist */}
      <NodeCard left={22} top={22} width={168} icon={Rocket} title="Projects" delay={0.1} from={{ x: -30 }} badge={<Chip accent>3 active</Chip>}>
        <Task w="78%" done />
        <Task w="62%" />
      </NodeCard>

      {/* [A] Areas — standing responsibilities, no end date */}
      <NodeCard left={22} top={182} width={168} icon={Layers} title="Areas" delay={0.2} from={{ x: -30 }} badge={<Chip>ongoing</Chip>}>
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ width: 3, borderRadius: 2, background: 'var(--line-heavy)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Line w="90%" />
            <Line w="70%" />
          </div>
        </div>
      </NodeCard>

      {/* [R] Resources — saved reference material */}
      <NodeCard left={578} top={22} width={168} icon={BookMarked} title="Resources" delay={0.15} from={{ x: 30 }} badge={<Chip>ref</Chip>}>
        <Well height={26} icon={Link2} />
        <Line w="72%" />
      </NodeCard>

      {/* [A] Archives — cold storage, deliberately faded */}
      <NodeCard left={578} top={182} width={168} icon={Archive} title="Archives" muted delay={0.25} from={{ x: 30 }} badge={<Chip muted>cold</Chip>}>
        <Line w="85%" opacity={0.45} />
        <Line w="60%" opacity={0.45} />
      </NodeCard>

      {/* the one focal element: everything resolves here */}
      <NodeCard left={302} top={118} width={176} icon={Sparkles} title="Second Brain" accent z={6} delay={0.4} from={{ y: 34 }}>
        <Line w="100%" fill="var(--accent)" opacity={0.5} />
        <Line w="64%" fill="var(--accent)" opacity={0.32} />
        <div style={{ display: 'flex', gap: 5, marginTop: 1 }}>
          <Chip accent>P</Chip>
          <Chip accent>A</Chip>
          <Chip accent>R</Chip>
          <Chip accent>A</Chip>
        </div>
      </NodeCard>
    </Plane>
  </SceneStage>
);
