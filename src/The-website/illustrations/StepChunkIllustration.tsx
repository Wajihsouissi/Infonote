import React from 'react';
import { motion } from 'framer-motion';
import { Scissors, Expand } from 'lucide-react';
import {
  IllustrationStage,
  STAGE_TILT,
  SharedTitleMock,
  SharedVideoMock,
  TextLine,
  FloatingChip,
} from './mock-elements';

interface StepChunkIllustrationProps {
  activeStep: number;
}

export function StepChunkIllustration({ activeStep }: StepChunkIllustrationProps) {
  return (
    <IllustrationStage>
      {/* Editor Slice (Base layer) */}
      <div
        style={{
          position: 'relative',
          width: '420px',
          maxWidth: '100%',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--line-strong)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2,
          boxShadow: 'var(--shadow-sm)',
          transform: STAGE_TILT,
          transformStyle: 'preserve-3d',
          transformOrigin: 'center center',
        }}
      >
        {/* Editor Content Area */}
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Dimmed Context Content Top */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'wtGhostFade 2s infinite alternate ease-out' }}>
            <TextLine width="85%" />
            <TextLine width="60%" />
          </div>

          {/* THE CHUNK (Extraction Box) */}
          <div style={{ position: 'relative', marginTop: '8px', marginBottom: '8px' }}>
            {/* The Lifting Chunk Element */}
            <motion.div
              animate={{
                z: activeStep === 1 ? 50 : 0,
                scale: activeStep === 1 ? 1.05 : 1,
                boxShadow: activeStep === 1 ? '0 10px 24px rgba(0,0,0,0.15)' : '0 0 0 rgba(0,0,0,0)',
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              style={{
                position: 'relative',
                background: 'var(--bg-card)',
                padding: '16px',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-lg)',
                zIndex: 10,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Extract Badge */}
              <div style={{ position: 'absolute', top: -12, right: -12, background: 'var(--accent)', color: 'var(--bg-base)', padding: '6px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 15 }}>
                <Scissors size={14} />
              </div>

              {/* Title */}
              <div style={{ minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                {activeStep === 1 && <SharedTitleMock fontSize={20}>How to Master AI in 2026</SharedTitleMock>}
              </div>

              {/* Video Placeholder (same block as Step 1) */}
              <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', marginTop: '8px' }}>
                {activeStep === 1 && <SharedVideoMock size="sm" />}
              </div>
            </motion.div>
          </div>

          {/* Dimmed Context Content Bottom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px', animation: 'wtGhostFade 2s infinite alternate ease-out' }}>
            <TextLine width="100%" />
            <TextLine width="40%" />
          </div>
        </div>
      </div>

      {/* Floating Canvas UI status chip */}
      <FloatingChip
        leading={
          <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Expand size={14} color="var(--text-main)" />
          </div>
        }
        title="EXTRACTING TO CANVAS"
        style={{ bottom: '8%', left: '5%', padding: '12px' }}
      />
    </IllustrationStage>
  );
}
