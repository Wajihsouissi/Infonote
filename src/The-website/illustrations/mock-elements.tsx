import React from 'react';
import { motion } from 'motion/react';

/**
 * The two elements that TRAVEL between the three walkthrough steps.
 *
 * The steps tell one continuous story — the same note title and the same video
 * block move from the editor (capture), through extraction (chunk), onto the
 * canvas (connect). The travel is framer-motion `layoutId` magic, which only
 * works if every step renders the exact same element identity. That is the one
 * reason these live outside `scene-kit.tsx`: everything else in a scene is
 * positional, but these two are a hand-off.
 *
 * Do not gate them behind a viewport reveal — see the MOTION note in scene-kit.
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
      color: 'var(--node-title)',
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
        borderRadius: 'var(--r-md)',
        background: 'var(--node-bg)',
        overflow: 'hidden',
        border: '1px solid var(--line-heavy)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* recessed media well — the note card's inner content surface */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div
          style={{
            width: lg ? 44 : 34,
            height: lg ? 34 : 26,
            borderRadius: 'var(--r-md)',
            background: 'var(--node-title)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <svg width={lg ? 16 : 13} height={lg ? 16 : 13} viewBox="0 0 24 24" fill="var(--bg-base)" style={{ marginLeft: lg ? 3 : 2 }}>
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </div>
      </div>

      <div
        style={{
          height: lg ? 32 : 22,
          borderTop: '1px solid var(--line)',
          background: 'var(--node-bg)',
          display: 'flex',
          alignItems: 'center',
          padding: lg ? '0 12px' : '0 8px',
          gap: lg ? 10 : 7,
        }}
      >
        <span style={{ fontSize: lg ? 9 : 8, color: 'var(--node-title)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>03:14</span>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', position: 'relative', borderRadius: 2 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '35%', background: 'var(--accent)', borderRadius: 2 }} />
          {lg && (
            <div
              style={{
                position: 'absolute',
                left: '35%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
          )}
        </div>
        {lg && <span style={{ fontSize: 9, color: 'var(--node-meta)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>12:45</span>}
      </div>
    </motion.div>
  );
};
