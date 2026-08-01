import React from 'react';
import { Image as ImageIcon, Link2, Target, FileText } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Well, Cursor, Chip } from './scene-kit';

/**
 * "Linear notes meet infinite canvas" — the hero split visual.
 *
 * Idea (unchanged): a Notion-style linear document, with ONE block highlighted
 * as it is being chunked, sitting in front of a Milanote-style infinite canvas
 * — a field of perspective-tilted ghost blocks with the extracted block landed
 * as a real Canvas Node. A single accent journey runs from the highlighted
 * source block, along the dashed spine, to the node; everything else stays
 * neutral.
 *
 * Rebuilt on scene-kit so it shares the exact vocabulary of the other scenes.
 */
export const InfiniteCanvasIllustration: React.FC = () => (
  <SceneStage width={600} height={440}>
    {/* ── The ghost field: the canvas stretching away behind everything ── */}
    <Plane left={0} top={0} width={600} height={440} tiltY={-12} tiltX={4} z={1}>


      <Ghost x={330} y={2} w={132} h={96} float="ftNodeFloat3" tilt={-12} tz={-60} scale={0.82} opacity={0.3} pad={10} delay={0.25}>
        <Well height={62} icon={ImageIcon} />
      </Ghost>
      <Ghost x={468} y={196} w={140} h={92} float="ftNodeFloat1" tilt={-12} tz={-30} scale={0.86} opacity={0.32} pad={14} gap={9} delay={0.35}>
        <Line w="100%" />
        <Line w="85%" />
        <Line w="95%" />
        <Line w="60%" />
      </Ghost>
      <Ghost x={430} y={332} w={144} h={56} float="ftNodeFloat2" tilt={-12} tz={-10} scale={0.9} opacity={0.34} pad={12} gap={10} delay={0.45}>
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
      <Ghost x={508} y={62} w={110} h={82} float="ftNodeFloat4" tilt={-12} tz={-110} scale={0.66} opacity={0.24} pad={10} delay={0.5}>
        <Well height={44} />
        <Line w="70%" />
      </Ghost>
      <Ghost x={-34} y={330} w={168} h={72} float="ftNodeFloat3" tilt={12} tz={-40} scale={0.88} opacity={0.28} pad={12} gap={10} delay={0.4}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid var(--line-strong)' }} />
          <Line w="70%" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--block-well)', border: '1px solid var(--line-strong)' }} />
          <Line w="52%" />
        </div>
      </Ghost>
      <Ghost x={-52} y={-10} w={172} h={82} float="ftNodeFloat2" tilt={12} tz={-70} scale={0.8} opacity={0.24} pad={0} gap={0} delay={0.3}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-strong)', background: 'var(--block-well)', padding: '9px 11px', gap: 9 }}>
          <Line w="100%" />
          <Line w="100%" />
          <Line w="100%" />
        </div>
        <div style={{ display: 'flex', padding: 11, gap: 9 }}>
          <Line w="100%" h={3} />
          <Line w="100%" h={3} />
          <Line w="100%" h={3} />
        </div>
      </Ghost>
    </Plane>

    {/* the extraction journey — the one accent line in the scene */}
    <Wires z={4}>
      <Wire d="M 250,208 C 300,208 316,158 366,158" delay={0.8} accent width={1.6} />
    </Wires>

    {/* ── LEFT: the linear doc, one block mid-chunk ── */}
    <Plane left={4} top={44} width={260} height={340} tiltY={12} tiltX={4} z={5}>
      <NodeCard left={0} top={0} width={252} icon={FileText} title="Product Requirements" size="lg" ruled z={6} delay={0.1} from={{ x: -30 }}>
        <Line w="90%" />
        <Line w="62%" />

        {/* the highlighted block being chunked */}
        <div
          style={{
            position: 'relative',
            padding: '11px 13px',
            marginTop: 3,
            marginBottom: 3,
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-wash)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--r-control)',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          {/* the block handle you would actually grab */}
          <div style={{ position: 'absolute', left: -22, top: '50%', transform: 'translateY(-50%)' }}>
            <div
              style={{
                width: 13,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--block-well)',
                borderRadius: 3,
                border: '1px solid var(--line-strong)',
              }}
            >
              <svg width="4" height="10" viewBox="0 0 6 10" fill="var(--text-soft)">
                <circle cx="1" cy="1" r="1.2" />
                <circle cx="5" cy="1" r="1.2" />
                <circle cx="1" cy="5" r="1.2" />
                <circle cx="5" cy="5" r="1.2" />
                <circle cx="1" cy="9" r="1.2" />
                <circle cx="5" cy="9" r="1.2" />
              </svg>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: 'var(--block-well)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--accent)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>T</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.02em' }}>Extracted Text Block</span>
          </div>
          <Line w="90%" fill="var(--accent)" opacity={0.5} />
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <Line w="50%" fill="var(--accent)" opacity={0.3} />
            <div style={{ width: 2, height: 10, background: 'var(--accent)', borderRadius: 1 }} />
          </div>
        </div>

        <Line w="100%" />
        <Line w="42%" />
      </NodeCard>
    </Plane>

    {/* ── RIGHT: the block, landed as a real canvas node ── */}
    <Plane left={352} top={110} width={236} height={200} tiltY={-12} tiltX={4} z={6}>
      <NodeCard left={0} top={0} width={214} icon={Target} title="Canvas Node" accent z={7} delay={0.55} badge={<Chip accent>new</Chip>}>
        <Line w="100%" fill="var(--accent)" opacity={0.5} />
        <Line w="70%" fill="var(--accent)" opacity={0.32} />
      </NodeCard>
    </Plane>

    <Cursor top={168} left={286} label="Extracting…" delay={0.9} />
  </SceneStage>
);
