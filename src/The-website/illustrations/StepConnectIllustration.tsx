import React from 'react';
import { Share2, CheckCircle2, Link2, FileText, Image as ImageIcon } from 'lucide-react';
import { SceneStage, Plane, Board, Wires, Wire, NodeCard, Ghost, Line, Chip, Task, Well } from './scene-kit';
import { SharedTitleMock, SharedVideoMock } from './mock-elements';

interface StepConnectIllustrationProps {
  activeStep: number;
}

/**
 * Step 3 — CONNECT. Idea unchanged: the extracted chunk has landed on the
 * canvas as its own node and is now wired to the satellites it spawned —
 * script draft, references, action items, assets.
 *
 * `reveal={false}` — see StepCaptureIllustration.
 */
export function StepConnectIllustration({ activeStep }: StepConnectIllustrationProps) {
  return (
    <SceneStage width={470} height={520} reveal={false}>
      <Plane left={0} top={0} width={470} height={520} tiltY={-9} tiltX={6}>


        <Ghost x={-30} y={244} w={122} h={52} float="ftNodeFloat3" tilt={6} tz={-80} scale={0.72} opacity={0.14} spin={-5}>
          <Line w="64%" />
        </Ghost>
        <Ghost x={388} y={232} w={118} h={50} float="ftNodeFloat2" tilt={-6} tz={-70} scale={0.7} opacity={0.13} spin={4}>
          <Line w="58%" />
        </Ghost>

        <Wires>
          <Wire d="M 162,180 C 142,180 134,158 122,142" delay={0} />
          <Wire d="M 308,180 C 328,180 338,158 350,142" delay={0} />
          <Wire d="M 162,348 C 142,348 134,368 122,384" delay={0} accent />
          <Wire d="M 308,348 C 328,348 338,362 350,376" delay={0} accent />
        </Wires>

        {/* the chunk from step 2, now a node in its own right */}
        <NodeCard
          left={145}
          top={172}
          width={180}
          icon={Share2}
          title="Source chunk"
          accent
          ruled
          z={6}
          badge={<Chip accent>node</Chip>}
        >
          <div style={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
            {activeStep >= 2 && <SharedTitleMock fontSize={15}>How to Master AI in 2026</SharedTitleMock>}
          </div>
          <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative' }}>
            {activeStep >= 2 && <SharedVideoMock size="sm" />}
          </div>
        </NodeCard>

        {/* satellites it spawned */}
        <NodeCard left={0} top={58} width={140} icon={FileText} title="Script draft">
          <Line w="100%" />
          <Line w="84%" />
          <Line w="62%" />
        </NodeCard>

        <NodeCard left={338} top={58} width={132} icon={ImageIcon} title="Assets">
          <div style={{ display: 'flex', gap: 7 }}>
            <div style={{ flex: 1 }}>
              <Well height={30} icon={ImageIcon} />
            </div>
            <div style={{ flex: 1 }}>
              <Well height={30} />
            </div>
          </div>
        </NodeCard>

        <NodeCard left={0} top={378} width={140} icon={CheckCircle2} title="Action items">
          <Task w="72%" done />
          <Task w="58%" />
        </NodeCard>

        <NodeCard left={338} top={370} width={132} icon={Link2} title="References" badge={<Chip accent>2</Chip>}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--block-well)',
              padding: 7,
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--line)',
            }}
          >
            <Link2 size={10} color="var(--accent-ink)" style={{ flexShrink: 0 }} />
            <Line w="70%" />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--block-well)',
              padding: 7,
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--line)',
            }}
          >
            <Link2 size={10} color="var(--accent-ink)" style={{ flexShrink: 0 }} />
            <Line w="52%" />
          </div>
        </NodeCard>
      </Plane>
    </SceneStage>
  );
}
