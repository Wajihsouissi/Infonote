import React from 'react';
import { motion } from 'motion/react';
import { Clock, Hash, FileText } from 'lucide-react';
import styles from '../MarketingPage.module.css';
import { SceneStage, Plane, Board, NodeCard, Ghost, Line, Chip, FloatingPanel, PulseDot } from './scene-kit';
import { SharedTitleMock, SharedVideoMock } from './mock-elements';

interface StepCaptureIllustrationProps {
  activeStep: number;
}

/**
 * Step 1 — CAPTURE. Idea unchanged: a linear document being written, with the
 * title typing itself and a video embedded mid-note.
 *
 * `reveal={false}`: this scene is driven by `activeStep`, and the title/video
 * hand off to the next step via `layoutId` — a viewport reveal would fight it.
 */
export function StepCaptureIllustration({ activeStep }: StepCaptureIllustrationProps) {
  return (
    <SceneStage width={470} height={500} reveal={false}>
      <Plane left={0} top={0} width={470} height={500} tiltY={-8} tiltX={5}>


        <Ghost x={-30} y={410} w={150} h={60} float="ftNodeFloat3" tilt={6} tz={-70} scale={0.76} opacity={0.16} spin={-4}>
          <Line w="70%" />
          <Line w="45%" />
        </Ghost>
        <Ghost x={360} y={-8} w={130} h={54} float="ftNodeFloat4" tilt={-5} tz={-80} scale={0.72} opacity={0.14} spin={5}>
          <Line w="62%" />
        </Ghost>

        <NodeCard
          left={16}
          top={44}
          width={422}
          icon={FileText}
          title="Untitled note"
          size="lg"
          ruled
          z={5}
          badge={
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Chip accent>draft</Chip>
            </span>
          }
        >
          {/* metadata strip — the note's own footer stats, moved up top */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, letterSpacing: '0.06em', color: 'var(--node-meta)' }}>
              <Clock size={10} /> EDITED 2M AGO
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, letterSpacing: '0.06em', color: 'var(--node-meta)' }}>
              <Hash size={10} /> 1,402 WORDS
            </span>
          </div>

          {/* the title types itself, then travels to step 2 */}
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
            {activeStep === 0 && (
              <SharedTitleMock fontSize={24}>
                <span className={styles.wtTypeText}>How to Master AI in 2026</span>
              </SharedTitleMock>
            )}
          </div>

          {/* the embedded video, which also travels */}
          <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', marginTop: 2 }}>
            {activeStep === 0 && <SharedVideoMock size="lg" />}
          </div>

          <Line w="100%" />
          <Line w="92%" />
          <Line w="84%" />
          <Line w="40%" />
        </NodeCard>
        <FloatingPanel
          leading={<div style={{ width: 8, height: 8, borderRadius: 2, border: '1px solid var(--accent)', background: 'var(--accent-wash)' }}><motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} style={{ width: '100%', height: '100%', background: 'var(--accent)', borderRadius: 1 }} /></div>}
          title="AI assistant"
          subtitle="Transcribing video…"
          style={{ top: 22, left: 320, zIndex: 4, transform: 'translateZ(-10px)' }}
        />
      </Plane>
    </SceneStage>
  );
}
