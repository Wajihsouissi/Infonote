import React from 'react';
import { Image as ImageIcon, Play, Link2, CheckSquare, Type, Heading1 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TextLine } from './mock-elements';

/**
 * Reusable flat placeholder blocks shared between the linear editor and the
 * canvas/mindmap illustrations. Deliberately flat: no drop shadows, no glows,
 * no 3D transforms. Neutral by default; `accent` marks the single focal block.
 * All colors are design-system tokens.
 */

type Tone = 'card' | 'raised' | 'inset';

const toneBg: Record<Tone, string> = {
  card: 'var(--bg-card)',
  raised: 'var(--bg-rail)',
  inset: 'var(--bg-inset)',
};

/* ── Shell ─────────────────────────────────────────────────────────── */

export interface BlockShellProps {
  tone?: Tone;
  accent?: boolean;
  /** Draw a left accent spine (block-editor style). */
  spine?: boolean;
  dashed?: boolean;
  width?: number | string;
  padding?: number;
  /** Connection handle dot on the right edge (canvas-node style). */
  handle?: boolean;
  handleColor?: string;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

export const BlockShell: React.FC<BlockShellProps> = ({
  tone = 'card',
  accent = false,
  spine = false,
  dashed = false,
  width,
  padding = 14,
  handle = false,
  handleColor = 'var(--accent)',
  style,
  className,
  children,
}) => (
  <div
    className={className}
    style={{
      position: 'relative',
      width,
      padding,
      background: accent ? 'var(--accent-wash)' : toneBg[tone],
      border: `1px ${dashed ? 'dashed' : 'solid'} ${accent ? 'var(--accent-ink)' : 'var(--line-strong)'}`,
      borderLeft: spine ? '3px solid var(--accent-ink)' : undefined,
      borderRadius: 'var(--radius-lg)',
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
    {handle && (
      <span
        style={{
          position: 'absolute',
          right: -5,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'var(--bg-rail)',
          border: `2px solid ${handleColor}`,
        }}
      />
    )}
  </div>
);

/* ── Header row (icon + title) ─────────────────────────────────────── */

interface BlockHeaderProps {
  icon: LucideIcon;
  label: string;
  accent?: boolean;
  size?: number;
}

export const BlockHeader: React.FC<BlockHeaderProps> = ({ icon: Icon, label, accent = false, size = 13 }) => {
  const color = accent ? 'var(--accent)' : 'var(--text-main)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: 'var(--bg-rail)',
          border: `1px solid ${accent ? 'var(--accent-ink)' : 'var(--line-strong)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={11} color={color} />
      </span>
      <span style={{ fontSize: size, fontWeight: 600, color, fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
        {label}
      </span>
    </div>
  );
};

/* ── Line stack ────────────────────────────────────────────────────── */

interface LinesProps {
  widths: (string | number)[];
  fill?: string;
  opacity?: number;
  height?: number;
  gap?: number;
}

export const Lines: React.FC<LinesProps> = ({ widths, fill, opacity, height = 4, gap = 8 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
    {widths.map((w, i) => (
      <TextLine key={i} width={w} height={height} fill={fill} opacity={opacity} />
    ))}
  </div>
);

/* ── Framed media pane (image / video) ─────────────────────────────── */

const MediaPane: React.FC<{ icon: LucideIcon; height?: number }> = ({ icon: Icon, height = 54 }) => (
  <div
    style={{
      height,
      background: 'var(--bg-inset)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Icon size={18} color="var(--text-soft)" />
  </div>
);

/* ── Block presets (reusable node / doc-row content) ───────────────── */

export const TextBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label = 'Note', ...rest }) => (
  <BlockShell {...rest}>
    <BlockHeader icon={Type} label={label} accent={rest.accent} />
    <Lines widths={['100%', '70%']} />
  </BlockShell>
);

export const ImageBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label = 'Image', ...rest }) => (
  <BlockShell {...rest}>
    <BlockHeader icon={ImageIcon} label={label} accent={rest.accent} />
    <MediaPane icon={ImageIcon} />
  </BlockShell>
);

export const VideoBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label = 'Video', ...rest }) => (
  <BlockShell {...rest}>
    <BlockHeader icon={Play} label={label} accent={rest.accent} />
    <MediaPane icon={Play} />
  </BlockShell>
);

export const LinkBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label = 'Reference', ...rest }) => (
  <BlockShell {...rest}>
    <BlockHeader icon={Link2} label={label} accent={rest.accent} />
    <Lines widths={['100%', '55%']} height={3} />
  </BlockShell>
);

export const TodoBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label = 'Tasks', ...rest }) => (
  <BlockShell {...rest}>
    <BlockHeader icon={CheckSquare} label={label} accent={rest.accent} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[true, false, false].map((checked, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 'var(--radius-xs)',
              flexShrink: 0,
              background: checked ? 'var(--accent)' : 'transparent',
              border: checked ? 'none' : '1px solid var(--line-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {checked && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <TextLine width={i === 0 ? '70%' : i === 1 ? '85%' : '60%'} opacity={checked ? 0.5 : 1} />
        </div>
      ))}
    </div>
  </BlockShell>
);

export const TableBlock: React.FC<Omit<BlockShellProps, 'children'> & { label?: string }> = ({ label: _label, ...rest }) => (
  <BlockShell {...rest} padding={0} style={{ overflow: 'hidden', ...rest.style }}>
    {[0, 1, 2].map((r) => (
      <div
        key={r}
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 12px',
          borderBottom: r < 2 ? '1px solid var(--line)' : 'none',
          background: r === 0 ? 'var(--bg-rail)' : 'transparent',
        }}
      >
        {[0, 1, 2].map((c) => (
          <TextLine key={c} width="100%" height={r === 0 ? 4 : 3} />
        ))}
      </div>
    ))}
  </BlockShell>
);

export const HeadingBlock: React.FC<Omit<BlockShellProps, 'children'>> = (rest) => (
  <BlockShell {...rest}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: 'var(--bg-rail)',
          border: '1px solid var(--line-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Heading1 size={11} color="var(--text-soft)" />
      </span>
      <TextLine width="55%" height={6} />
    </div>
    <Lines widths={['90%', '70%']} />
  </BlockShell>
);

/* ── Mindmap node ──────────────────────────────────────────────────── */

interface MiniNodeProps {
  icon: LucideIcon;
  label: string;
  accent?: boolean;
  width?: number;
  handle?: boolean;
  lines?: (string | number)[];
  style?: React.CSSProperties;
  className?: string;
}

/** A compact card used as a node on the canvas / mindmap. */
export const MiniNode: React.FC<MiniNodeProps> = ({
  icon,
  label,
  accent = false,
  width = 150,
  handle = false,
  lines = ['100%', '65%'],
  style,
  className,
}) => (
  <BlockShell tone="raised" accent={accent} width={width} handle={handle} style={style} className={className}>
    <BlockHeader icon={icon} label={label} accent={accent} size={12} />
    <Lines widths={lines} height={3} fill={accent ? 'var(--accent)' : undefined} opacity={accent ? 0.5 : undefined} />
  </BlockShell>
);
