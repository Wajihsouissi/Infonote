import React from 'react';
import { FileText, GitBranch, Link2 } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Chip } from './scene-kit';

/**
 * "Zettelkasten" — atomic notes, interconnected.
 *
 * Idea (unchanged): small permanent notes that earn their meaning from the
 * links between them, and the emergent structure that falls out of it.
 *
 * The old scene drew a five-stage intake pipeline ending in a literal
 * slip-box with a lid and a handle — which illustrated the *method's history*
 * rather than the promise in the copy. This one shows what the copy actually
 * says: a spatial web of atomic notes with Folgezettel ids, wired
 * bidirectionally, one note focused, and a backlinks panel proving the links
 * run both ways.
 */

const ID_STYLE: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.04em',
  color: 'var(--text-faint)',
};

/** A backlink row inside the references panel. */
const Backlink: React.FC<{ id: string; w: string }> = ({ id, w }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <Link2 size={9} color="var(--accent-ink)" style={{ flexShrink: 0 }} />
    <span style={{ ...ID_STYLE, color: 'var(--accent-ink)' }}>{id}</span>
    <Line w={w} />
  </div>
);

export const ZettelkastenIllustration: React.FC = () => (
  <SceneStage>
    <Plane width={780} height={330} tiltY={-13} tiltX={5}>


      {/* depth: notes further out in the slip-box */}
      <Ghost x={106} y={236} w={124} h={54} float="ftNodeFloat2" tilt={7} tz={-80} scale={0.7} opacity={0.15} spin={-6} delay={0.2}>
        <Line w="75%" />
        <Line w="50%" />
      </Ghost>
      <Ghost x={604} y={-14} w={116} h={50} float="ftNodeFloat4" tilt={-5} tz={-70} scale={0.68} opacity={0.13} spin={5} delay={0.3}>
        <Line w="70%" />
      </Ghost>
      <Ghost x={286} y={276} w={140} h={48} float="ftNodeFloat3" tilt={4} tz={-95} scale={0.66} opacity={0.12} spin={-3} delay={0.4}>
        <Line w="60%" />
      </Ghost>

      {/* Links are bidirectional — every wire is a two-way reference. */}
      <Wires>
        <Wire d="M 156,72 C 190,72 188,158 218,166" delay={0.5} />
        <Wire d="M 300,66 C 300,104 288,120 286,138" delay={0.55} />
        <Wire d="M 300,52 C 340,52 400,50 448,54" delay={0.6} />
        <Wire d="M 372,182 C 404,182 410,216 442,222" delay={0.7} accent />
        <Wire d="M 372,164 C 406,164 418,96 448,90" delay={0.65} accent />
        <Wire d="M 596,102 C 626,102 604,166 626,174" delay={0.8} />
      </Wires>

      {/* 10a — an older note the focus grew out of */}
      <NodeCard left={8} top={30} width={148} icon={FileText} title="Emergence" delay={0.1} from={{ x: -24 }} badge={<span style={ID_STYLE}>10a</span>}>
        <Line w="88%" />
        <Line w="58%" />
      </NodeCard>

      {/* 10b — a sibling branch */}
      <NodeCard left={222} top={4} width={152} icon={FileText} title="Slip-box" delay={0.18} from={{ y: -22 }} badge={<span style={ID_STYLE}>10b</span>}>
        <Line w="80%" />
        <Line w="64%" />
      </NodeCard>

      {/* 11 — a note in a different branch entirely */}
      <NodeCard left={448} top={38} width={150} icon={FileText} title="Linking" delay={0.24} from={{ y: -22 }} badge={<span style={ID_STYLE}>11</span>}>
        <Line w="92%" />
        <Line w="52%" />
      </NodeCard>

      {/* 10b2 — the branch continuing downward */}
      <NodeCard left={442} top={196} width={150} icon={FileText} title="Atomicity" delay={0.3} from={{ y: 26 }} badge={<span style={ID_STYLE}>10b2</span>}>
        <Line w="76%" />
        <Line w="60%" />
      </NodeCard>

      {/* 10a1 — the focal atomic note */}
      <NodeCard
        left={218}
        top={138}
        width={154}
        icon={GitBranch}
        title="Feedback loops"
        accent
        z={6}
        delay={0.36}
        badge={<span style={{ ...ID_STYLE, color: 'var(--accent-ink)' }}>10a1</span>}
      >
        <Line w="100%" fill="var(--accent)" opacity={0.5} />
        <Line w="68%" fill="var(--accent)" opacity={0.32} />
      </NodeCard>

      {/* the links run both ways — here is the other direction */}
      <NodeCard left={604} top={150} width={150} icon={Link2} title="Linked references" z={5} delay={0.5} from={{ x: 26 }} badge={<Chip accent>3</Chip>}>
        <Backlink id="10a" w="58%" />
        <Backlink id="10b" w="70%" />
        <Backlink id="11" w="48%" />
      </NodeCard>
    </Plane>
  </SceneStage>
);
