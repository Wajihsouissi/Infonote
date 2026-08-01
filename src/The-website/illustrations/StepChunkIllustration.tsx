import React from 'react';
import { motion } from 'motion/react';
import { Scissors, Expand, FileText, Clock, Hash } from 'lucide-react';
import { SceneStage, Plane, NodeCard, Ghost, Line, FloatingPanel, Chip } from './scene-kit';
import { SharedTitleMock, SharedVideoMock } from './mock-elements';

interface StepChunkIllustrationProps {
  activeStep: number;
}

/**
 * Step 2 — CHUNK. Idea unchanged: the surrounding note dims while one block
 * lifts off the page, scissors badge attached, ready to become its own node.
 *
 * `reveal={false}` — see StepCaptureIllustration.
 */
export function StepChunkIllustration({ activeStep }: StepChunkIllustrationProps) {
  const lifted = activeStep === 1;
  return (
    <SceneStage width={470} height={500} reveal={false}>
      <Plane left={0} top={0} width={470} height={500} tiltY={-8} tiltX={5}>


        <Ghost x={-34} y={22} w={138} h={56} float="ftNodeFloat2" tilt={7} tz={-80} scale={0.74} opacity={0.15} spin={-5}>
          <Line w="66%" />
          <Line w="44%" />
        </Ghost>
        <Ghost x={370} y={392} w={128} h={54} float="ftNodeFloat4" tilt={-6} tz={-70} scale={0.72} opacity={0.14} spin={4}>
          <Line w="58%" />
        </Ghost>

        <NodeCard 
          left={26} 
          top={70} 
          width={404} 
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

          {/* context above — dimmed, because the focus is the chunk */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.4 }}>
            <Line w="85%" />
          </div>

          {/* THE CHUNK — lifts off the page while step 2 is active */}
          <motion.div
            animate={{ z: lifted ? 50 : 0, scale: lifted ? 1.04 : 1 }}
            transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            style={{
              position: 'relative',
              background: 'var(--node-bg)',
              padding: 14,
              border: '1px solid var(--accent)',
              borderLeft: '3px solid var(--accent)',
              borderRadius: 'var(--r-md)',
              zIndex: 10,
              transformStyle: 'preserve-3d',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* the extract affordance */}
            <div
              style={{
                position: 'absolute',
                top: -11,
                right: -11,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                padding: 5,
                borderRadius: 'var(--r-control)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 15,
              }}
            >
              <Scissors size={12} />
            </div>

            <div style={{ minHeight: 28, display: 'flex', alignItems: 'center' }}>
              {activeStep === 1 && <SharedTitleMock fontSize={18}>How to Master AI in 2026</SharedTitleMock>}
            </div>

            <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative' }}>
              {activeStep === 1 && <SharedVideoMock size="sm" />}
            </div>
          </motion.div>

          {/* context below — also dimmed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.4 }}>
            <Line w="100%" />
            <Line w="40%" />
          </div>
        </NodeCard>
      </Plane>

      <FloatingPanel
        leading={
          <div style={{ padding: 5, borderRadius: 'var(--r-control)', background: 'var(--block-well)', display: 'flex' }}>
            <Expand size={12} color="var(--accent-ink)" />
          </div>
        }
        title="Extracting to canvas"
        style={{ bottom: 10, left: -14 }}
      />
    </SceneStage>
  );
}
