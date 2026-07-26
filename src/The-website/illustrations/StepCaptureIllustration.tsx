import React from 'react';
import { Clock, Hash } from 'lucide-react';
import styles from '../MarketingPage.module.css';
import {
  IllustrationStage,
  STAGE_TILT,
  SharedTitleMock,
  SharedVideoMock,
  TextLine,
  FloatingChip,
  PulseDot,
} from './mock-elements';

interface StepCaptureIllustrationProps {
  activeStep: number;
}

export function StepCaptureIllustration({ activeStep }: StepCaptureIllustrationProps) {
  return (
    <IllustrationStage>
      {/* The Linear Document Card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '500px',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--line-strong)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          transform: STAGE_TILT,
          transformStyle: 'preserve-3d',
          zIndex: 1,
        }}
      >
        {/* Top Metadata Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--line-strong)' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-soft)', letterSpacing: '0.05em' }}>
              <Clock size={12} /> LAST EDITED: 2M AGO
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-soft)', letterSpacing: '0.05em' }}>
              <Hash size={12} /> WORD COUNT: 1,402
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-rail)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--line-strong)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-main)' }}>STATUS: DRAFT</span>
          </div>
        </div>

        {/* Editor Content Area */}
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflow: 'hidden' }}>
          {/* H1 Typed Title */}
          <div style={{ display: 'flex', alignItems: 'center', minHeight: '36px' }}>
            {activeStep === 0 && (
              <SharedTitleMock fontSize={28}>
                <span className={styles.wtTypeText}>How to Master AI in 2026</span>
              </SharedTitleMock>
            )}
          </div>

          {/* Embedded Video Player */}
          <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative', marginTop: '8px' }}>
            {activeStep === 0 && <SharedVideoMock size="lg" />}
          </div>

          {/* Text Blocks Mockup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <TextLine width="100%" />
            <TextLine width="92%" />
            <TextLine width="85%" />
            <TextLine width="40%" />
          </div>
        </div>
      </div>

      {/* Floating UI status chip */}
      <FloatingChip
        leading={<PulseDot />}
        title="AI ASSISTANT"
        subtitle="Transcribing video..."
        style={{ top: '8%', right: '5%' }}
      />
    </IllustrationStage>
  );
}
