import React from 'react';
import { motion } from 'framer-motion';

/**
 * Shared DOM mock elements for the "How it works" step illustrations.
 *
 * The three steps tell one continuous story: the same note title and the
 * same video block travel from the editor (capture), through extraction
 * (chunk), onto the canvas (connect). The travel effect relies on
 * framer-motion `layoutId`s, so every step must render the exact same
 * elements — which is why they live here, once.
 */

export const SHARED_SPRING = { type: 'spring', bounce: 0, duration: 0.6 } as const;

/* ── The traveling note title ──────────────────────────────────────── */

interface SharedTitleMockProps {
  fontSize: number;
  children: React.ReactNode;
}

export const SharedTitleMock: React.FC<SharedTitleMockProps> = ({ fontSize, children }) => (
  <motion.div
    layoutId="shared-title"
    transition={SHARED_SPRING}
    style={{
      fontSize,
      fontWeight: 800,
      color: 'var(--text-main)',
      letterSpacing: '-0.02em',
      fontFamily: 'var(--font-sans)',
    }}
  >
    {children}
  </motion.div>
);

/* ── The traveling video block ─────────────────────────────────────── */

interface SharedVideoMockProps {
  size?: 'lg' | 'sm';
}

export const SharedVideoMock: React.FC<SharedVideoMockProps> = ({ size = 'sm' }) => {
  const lg = size === 'lg';
  return (
    <motion.div
      layoutId="shared-video"
      transition={SHARED_SPRING}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-rail)',
        overflow: 'hidden',
        border: '1px solid var(--line-strong)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: lg ? 48 : 40,
            height: lg ? 48 : 40,
            borderRadius: '50%',
            background: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <svg width={lg ? 18 : 14} height={lg ? 18 : 14} viewBox="0 0 24 24" fill="var(--bg-base)" style={{ marginLeft: lg ? 4 : 2 }}>
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </div>
      </div>

      <div
        style={{
          height: lg ? 36 : 24,
          borderTop: '1px solid var(--line-strong)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          padding: lg ? '0 12px' : '0 8px',
          gap: lg ? 12 : 8,
        }}
      >
        <span style={{ fontSize: lg ? 10 : 8, color: 'var(--text-main)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>03:14</span>
        <div style={{ flex: 1, height: 2, background: 'var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '35%', background: 'var(--accent)' }} />
          {lg && (
            <div
              style={{
                position: 'absolute',
                left: '35%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
          )}
        </div>
        {lg && <span style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>12:45</span>}
      </div>
    </motion.div>
  );
};

/* ── Skeleton text line (DOM flavor) ───────────────────────────────── */

interface TextLineProps {
  width: string | number;
  height?: number;
  fill?: string;
  opacity?: number;
}

export const TextLine: React.FC<TextLineProps> = ({ width, height = 4, fill = 'var(--line-strong)', opacity }) => (
  <div style={{ width, height, background: fill, borderRadius: height / 2, opacity }} />
);

/* ── Floating status chip ──────────────────────────────────────────── */

interface FloatingChipProps {
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
  style?: React.CSSProperties;
}

export const FloatingChip: React.FC<FloatingChipProps> = ({ leading, title, subtitle, style }) => (
  <div
    style={{
      position: 'absolute',
      background: 'var(--bg-card)',
      padding: '12px 16px',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--line-strong)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}
  >
    {leading}
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.05em' }}>{title}</span>
      {subtitle && <span style={{ fontSize: 9, color: 'var(--text-soft)' }}>{subtitle}</span>}
    </div>
  </div>
);

export const PulseDot: React.FC = () => (
  <div
    style={{
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: 'var(--accent-dim)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'wtPulse 2s infinite' }} />
  </div>
);

/* ── Stage wrapper with shared 3D tilt ─────────────────────────────── */

interface IllustrationStageProps {
  minHeight?: number;
  children: React.ReactNode;
}

export const IllustrationStage: React.FC<IllustrationStageProps> = ({ minHeight = 520, children }) => (
  <div
    style={{
      position: 'relative',
      width: '100%',
      minHeight,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      perspective: '1200px',
    }}
  >
    {children}
  </div>
);

/** The one tilt used by every step visual — keep them on the same plane. */
export const STAGE_TILT = 'rotateX(8deg) rotateY(-8deg) scale(1.02)';
