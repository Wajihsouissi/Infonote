import React from 'react';
import { Lightbulb, Search, PenTool, Hammer, Megaphone } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Chip } from './scene-kit';

/**
 * "Mindmapping" — one idea, radiating.
 *
 * Idea (unchanged): a central concept branching out to topics and their
 * sub-branches, laid out spatially rather than as a list.
 *
 * The old scene drew organic branches out to bare circles, so the leaves
 * carried no information. Here every branch lands on a real note card and
 * every leaf is a named sub-topic chip — the hierarchy is legible, and the
 * centre is the single accent moment.
 */

/** A sub-branch: a short stem with a named leaf at the end. */
const Leaf: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 10, height: 1, background: 'var(--line-heavy)', flexShrink: 0 }} />
    <Chip>{children}</Chip>
  </div>
);

export const MindmappingIllustration: React.FC = () => (
  <SceneStage>
    <Plane width={780} height={330} tiltY={-12} tiltX={6}>


      {/* depth: half-formed thoughts still floating loose */}
      <Ghost x={196} y={-14} w={116} h={48} float="ftNodeFloat3" tilt={6} tz={-80} scale={0.68} opacity={0.14} spin={-5} delay={0.2}>
        <Line w="70%" />
      </Ghost>
      <Ghost x={470} y={278} w={126} h={50} float="ftNodeFloat2" tilt={-6} tz={-70} scale={0.7} opacity={0.13} spin={4} delay={0.3}>
        <Line w="66%" />
      </Ghost>
      <Ghost x={352} y={-22} w={104} h={44} float="ftNodeFloat4" tilt={4} tz={-100} scale={0.62} opacity={0.11} spin={7} delay={0.4}>
        <Line w="58%" />
      </Ghost>

      <Wires>
        <Wire d="M 186,74 C 244,74 258,142 306,150" delay={0.5} />
        <Wire d="M 186,232 C 244,232 258,188 306,182" delay={0.6} />
        <Wire d="M 594,74 C 536,74 522,142 474,150" delay={0.55} />
        <Wire d="M 594,232 C 536,232 522,188 474,182" delay={0.65} />
      </Wires>

      {/* four branches off the core idea */}
      <NodeCard left={18} top={30} width={168} icon={Search} title="Research" delay={0.1} from={{ x: -28 }}>
        <Leaf>interviews</Leaf>
        <Leaf>market</Leaf>
      </NodeCard>

      <NodeCard left={18} top={188} width={168} icon={PenTool} title="Design" delay={0.2} from={{ x: -28 }}>
        <Leaf>wireframes</Leaf>
        <Leaf>tokens</Leaf>
      </NodeCard>

      <NodeCard left={582} top={30} width={168} icon={Hammer} title="Build" delay={0.15} from={{ x: 28 }}>
        <Leaf>api</Leaf>
        <Leaf>editor</Leaf>
      </NodeCard>

      <NodeCard left={582} top={188} width={168} icon={Megaphone} title="Launch" delay={0.25} from={{ x: 28 }}>
        <Leaf>beta</Leaf>
        <Leaf>docs</Leaf>
      </NodeCard>

      {/* the core idea — everything radiates from here */}
      <NodeCard left={306} top={118} width={168} icon={Lightbulb} title="Product launch" accent z={6} delay={0.4} from={{ y: 30 }}>
        <Line w="100%" fill="var(--accent)" opacity={0.5} />
        <Line w="60%" fill="var(--accent)" opacity={0.32} />
        <div style={{ display: 'flex', gap: 5, marginTop: 1 }}>
          <Chip accent>4 branches</Chip>
        </div>
      </NodeCard>
    </Plane>
  </SceneStage>
);
